"use strict";

const STATION_ID = 11856;
const LOOKBACK_STEPS = 120; // 120 x 5 min = 10 hodin

function pad(value) {
  return String(value).padStart(2, "0");
}

function roundDownTo5Minutes(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
  return d;
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

  return `http://opendata.shmu.sk/meteorology/climate/now/data/${folder}/${encodedFileName}`;
}

async function fetchJsonIfExists(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `SHMU request failed with status ${response.status} for ${url}`,
    );
  }

  return response.json();
}

async function fetchLatestDataset() {
  let probeTime = roundDownTo5Minutes(new Date());

  for (let i = 0; i < LOOKBACK_STEPS; i++) {
    const url = buildShmuUrl(probeTime);
    const data = await fetchJsonIfExists(url);

    if (data) {
      console.log("SHMU top-level keys:", Object.keys(data));

      if (!Array.isArray(data.data)) {
        throw new Error(
          `SHMU response does not contain data array for ${url}. Keys: ${Object.keys(data).join(", ")}`,
        );
      }

      if (data.data.length > 0) {
        return {
          url,
          probeTime: new Date(probeTime),
          data: data.data,
        };
      }

      console.log(`SHMU file exists but is empty: ${url}`);
    }

    probeTime = new Date(probeTime.getTime() - 5 * 60 * 1000);
  }

  throw new Error(
    "No recent non-empty SHMU aws1min file found in the lookback window",
  );
}

async function fetchStationData() {
  const { url, probeTime, data } = await fetchLatestDataset();

  const station = data.find((item) => Number(item.ind_kli) === STATION_ID);

  if (!station) {
    throw new Error(`Station ${STATION_ID} not found in dataset ${url}`);
  }

  return {
    ...station,
    _sourceUrl: url,
    _probeTimeIso: probeTime.toISOString(),
  };
}

module.exports = {
  fetchStationData,
};
