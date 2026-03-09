"use strict";

const STATION_ID = 11856;
const TIMEZONE = "Europe/Bratislava";
const MAX_FILES_TO_CHECK_PER_DAY = 150;

function getLocalDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  return {
    year: parts.find((p) => p.type === "year")?.value,
    month: parts.find((p) => p.type === "month")?.value,
    day: parts.find((p) => p.type === "day")?.value,
  };
}

function getDayFolderStrings() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const today = getLocalDateParts(now, TIMEZONE);
  const prev = getLocalDateParts(yesterday, TIMEZONE);

  return [
    `${today.year}${today.month}${today.day}`,
    `${prev.year}${prev.month}${prev.day}`,
  ];
}

function buildDirectoryUrl(folder) {
  return `http://opendata.shmu.sk/meteorology/climate/now/data/${folder}/`;
}

function buildFileUrl(folder, fileName) {
  return `${buildDirectoryUrl(folder)}${encodeURIComponent(fileName)}`;
}

async function fetchText(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Homey-Mochovce-Weather/1.0",
    },
  });

  if (response.status === 403 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `SHMU directory request failed with status ${response.status} for ${url}`,
    );
  }

  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Homey-Mochovce-Weather/1.0",
    },
  });

  if (response.status === 403 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `SHMU file request failed with status ${response.status} for ${url}`,
    );
  }

  return response.json();
}

function normalizeFileNameFromHref(href) {
  if (!href) {
    return null;
  }

  let value = href.trim();

  try {
    value = decodeURIComponent(value);
  } catch (error) {
    // nechaj pôvodnú hodnotu
  }

  value = value.split("?")[0].split("#")[0];

  const parts = value.split("/");
  const fileName = parts[parts.length - 1];

  if (!/^aws1min - \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.json$/.test(fileName)) {
    return null;
  }

  return fileName;
}

function extractAwsFilesFromHtml(html) {
  if (!html) {
    return [];
  }

  const files = [];
  const seen = new Set();

  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    const fileName = normalizeFileNameFromHref(href);

    if (!fileName || seen.has(fileName)) {
      continue;
    }

    seen.add(fileName);
    files.push(fileName);
  }

  return files.sort((a, b) => b.localeCompare(a));
}

function findStationInDataset(data) {
  if (!Array.isArray(data)) {
    return null;
  }

  return data.find((item) => Number(item.ind_kli) === STATION_ID) || null;
}

async function listDirectoryFiles(folder) {
  const url = buildDirectoryUrl(folder);
  const html = await fetchText(url);

  if (!html) {
    return [];
  }

  const files = extractAwsFilesFromHtml(html).slice(
    0,
    MAX_FILES_TO_CHECK_PER_DAY,
  );

  console.log(`[api] ${folder}: found ${files.length} candidate files`);

  return files;
}

function splitFilesForPriority(files, lastSuccessfulFileName) {
  if (!lastSuccessfulFileName) {
    return {
      priorityFiles: files,
      fallbackFiles: [],
    };
  }

  const priorityFiles = [];
  const fallbackFiles = [];

  for (const fileName of files) {
    if (fileName > lastSuccessfulFileName) {
      priorityFiles.push(fileName);
    } else {
      fallbackFiles.push(fileName);
    }
  }

  return { priorityFiles, fallbackFiles };
}

async function inspectFile(folder, fileName) {
  const url = buildFileUrl(folder, fileName);
  const json = await fetchJson(url);

  if (!json || !Array.isArray(json.data)) {
    return {
      ok: false,
      reason: "invalid json.data",
      folder,
      fileName,
      url,
    };
  }

  if (json.data.length === 0) {
    return {
      ok: false,
      reason: "empty data[]",
      folder,
      fileName,
      url,
    };
  }

  const station = findStationInDataset(json.data);

  if (!station) {
    return {
      ok: false,
      reason: `station ${STATION_ID} missing`,
      folder,
      fileName,
      url,
    };
  }

  return {
    ok: true,
    folder,
    fileName,
    url,
    station,
  };
}

async function findLatestUsableFile(lastSuccessfulFileName) {
  const dayFolders = getDayFolderStrings();
  const fallbackCandidates = [];

  for (const folder of dayFolders) {
    const files = await listDirectoryFiles(folder);
    const { priorityFiles, fallbackFiles } = splitFilesForPriority(
      files,
      lastSuccessfulFileName,
    );

    for (const fileName of priorityFiles) {
      const result = await inspectFile(folder, fileName);

      console.log(
        `[api] priority ${folder}/${fileName} -> ${result.ok ? "HIT" : result.reason}`,
      );

      if (result.ok) {
        return result;
      }
    }

    for (const fileName of fallbackFiles) {
      fallbackCandidates.push({ folder, fileName });
    }
  }

  for (const candidate of fallbackCandidates) {
    const result = await inspectFile(candidate.folder, candidate.fileName);

    console.log(
      `[api] fallback ${candidate.folder}/${candidate.fileName} -> ${result.ok ? "HIT" : result.reason}`,
    );

    if (result.ok) {
      return result;
    }
  }

  throw new Error(
    `No recent SHMU dataset containing station ${STATION_ID} found in today's or yesterday's directory`,
  );
}

async function fetchStationData({ lastSuccessfulFileName = null } = {}) {
  const result = await findLatestUsableFile(lastSuccessfulFileName);

  return {
    ...result.station,
    _sourceUrl: result.url,
    _sourceFileName: result.fileName,
    _sourceFolder: result.folder,
  };
}

module.exports = {
  fetchStationData,
};
