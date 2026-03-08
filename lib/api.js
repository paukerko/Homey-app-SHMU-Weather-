"use strict";

const STATION_ID = 11856;
const FULL_LOOKBACK_STEPS = 120; // 120 x 5 min = 10 hodín

function pad(value) {
  return String(value).padStart(2, "0");
}

function roundDownTo5Minutes(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
  return d;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function formatFolderDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function formatFileName(date) {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());

  return `aws1min - ${yyyy}-${mm}-${dd} ${hh}-${mi}-00.json`;
}

function buildShmuUrl(date) {
  const folder = formatFolderDate(date);
  const fileName = formatFileName(date);
  const encodedFileName = encodeURIComponent(fileName);

  // HTTP zámerne — HTTPS v Homey runtime padá na certifikáte SHMÚ
  return `http://opendata.shmu.sk/meteorology/climate/now/data/${folder}/${encodedFileName}`;
}

async function fetchJsonIfAvailable(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Homey-Mochovce-Weather/1.0",
    },
  });

  // Pre našu logiku sú toto len "nepoužiteľné kandidáty", nie fatálne chyby
  if (response.status === 403 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `SHMU request failed with status ${response.status} for ${url}`,
    );
  }

  return response.json();
}

function uniqueDatesInOrder(dates) {
  const seen = new Set();
  const result = [];

  for (const date of dates) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      continue;
    }

    const rounded = roundDownTo5Minutes(date);
    const key = rounded.toISOString();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(rounded);
  }

  return result;
}

function buildPriorityProbeTimes(lastProbeTimeIso) {
  const nowRounded = roundDownTo5Minutes(new Date());
  const candidates = [nowRounded, addMinutes(nowRounded, -5)];

  if (lastProbeTimeIso) {
    const lastProbe = roundDownTo5Minutes(new Date(lastProbeTimeIso));

    if (!Number.isNaN(lastProbe.getTime())) {
      candidates.push(
        addMinutes(lastProbe, 10),
        addMinutes(lastProbe, 5),
        lastProbe,
        addMinutes(lastProbe, -5),
        addMinutes(lastProbe, -10),
      );
    }
  }

  return uniqueDatesInOrder(candidates);
}

function findStationInDataset(data) {
  if (!Array.isArray(data)) {
    return null;
  }

  return data.find((item) => Number(item.ind_kli) === STATION_ID) || null;
}

async function tryProbeTimes(probeTimes) {
  for (const probeTime of probeTimes) {
    const url = buildShmuUrl(probeTime);
    const json = await fetchJsonIfAvailable(url);

    if (!json || !Array.isArray(json.data)) {
      continue;
    }

    if (json.data.length === 0) {
      continue;
    }

    const station = findStationInDataset(json.data);

    if (!station) {
      continue;
    }

    return {
      url,
      probeTime,
      station,
    };
  }

  return null;
}

async function fetchLatestStationDataset(lastProbeTimeIso) {
  // 1. Najprv skús najpravdepodobnejšie časy
  const priorityTimes = buildPriorityProbeTimes(lastProbeTimeIso);
  const quickHit = await tryProbeTimes(priorityTimes);

  if (quickHit) {
    return quickHit;
  }

  // 2. Potom fallback dozadu po 5 minútach
  let probeTime = roundDownTo5Minutes(new Date());

  for (let i = 0; i < FULL_LOOKBACK_STEPS; i++) {
    const url = buildShmuUrl(probeTime);
    const json = await fetchJsonIfAvailable(url);

    if (!json || !Array.isArray(json.data) || json.data.length === 0) {
      probeTime = addMinutes(probeTime, -5);
      continue;
    }

    const station = findStationInDataset(json.data);

    if (station) {
      return {
        url,
        probeTime: new Date(probeTime),
        station,
      };
    }

    probeTime = addMinutes(probeTime, -5);
  }

  throw new Error(
    `No recent SHMU dataset containing station ${STATION_ID} found in the lookback window`,
  );
}

async function fetchStationData({ lastProbeTimeIso = null } = {}) {
  const { url, probeTime, station } =
    await fetchLatestStationDataset(lastProbeTimeIso);

  return {
    ...station,
    _sourceUrl: url,
    _probeTimeIso: probeTime.toISOString(),
  };
}

module.exports = {
  fetchStationData,
};
