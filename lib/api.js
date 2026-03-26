"use strict";

const STATION_ID = 11856;
const TIMEZONE = "Europe/Bratislava";
const SHMU_PAGE_URL =
  "https://www.shmu.sk/sk/?page=1&id=meteo_apocasie_sk&ii=11856";
const FETCH_TIMEOUT_MS = 30000;
const MAX_DATA_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Fetch with timeout protection
 */
async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      method: "GET",
      headers: {
        "User-Agent": "Homey-Mochovce-Weather/1.0",
        ...options.headers,
      },
    });

    if (response.status === 403 || response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract window.datasets array from HTML page using regex
 */
function extractDatasetsFromHtml(html) {
  if (!html || typeof html !== "string") {
    return null;
  }

  // Match: window.datasets = [...]
  const match = html.match(/window\.datasets\s*=\s*(\[\{[\s\S]*?\}\])/);
  if (!match || !match[1]) {
    return null;
  }

  try {
    const datasetsJson = match[1];
    const datasets = JSON.parse(datasetsJson);
    return Array.isArray(datasets) ? datasets : null;
  } catch (error) {
    return null;
  }
}

/**
 * Find latest non-null measurement in a dataset array
 * Walks backwards from most recent, respecting 2-hour staleness threshold
 */
function findLatestValidMeasurement(dataArray) {
  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    return null;
  }

  const now = Date.now();
  const maxAgeMs = MAX_DATA_AGE_MS;

  // Walk backwards from most recent
  for (let i = dataArray.length - 1; i >= 0; i--) {
    const [timestamp, value] = dataArray[i];

    // Validate timestamp is within 2-hour window
    if (now - timestamp > maxAgeMs) {
      return null; // All remaining data too old
    }

    // Skip null/undefined values, continue searching
    if (value !== null && value !== undefined) {
      return { timestamp, value, index: i };
    }
  }

  return null;
}

/**
 * Parse all 6 datasets from SHMU page and extract latest valid measurements
 */
function parseHourlyDatasets(datasets) {
  if (!Array.isArray(datasets) || datasets.length < 6) {
    return null;
  }

  try {
    // Order: [ttt=temp, tlak=pressure, rh=humidity, ff=windSpeed, fm=windGust, pr1h=rainfall]
    const [
      tempDataset,
      pressureDataset,
      humidityDataset,
      windSpeedDataset,
      windGustDataset,
      rainfallDataset,
    ] = datasets;

    const temp = findLatestValidMeasurement(tempDataset.data);
    const pressure = findLatestValidMeasurement(pressureDataset.data);
    const humidity = findLatestValidMeasurement(humidityDataset.data);
    const windSpeed = findLatestValidMeasurement(windSpeedDataset.data);
    const windGust = findLatestValidMeasurement(windGustDataset.data);
    const rainfall = findLatestValidMeasurement(rainfallDataset.data);

    // Use temperature's timestamp as reference for measured time
    if (!temp || !temp.timestamp) {
      return null;
    }

    return {
      timestamp: temp.timestamp,
      temperature: temp.value,
      pressure: pressure ? pressure.value : null,
      humidity: humidity ? humidity.value : null,
      windSpeed: windSpeed ? windSpeed.value : null,
      windGust: windGust ? windGust.value : null,
      rainfall: rainfall ? rainfall.value : null,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Fetch and parse hourly data from SHMU page
 */
async function fetchAndParseHourlyData() {
  try {
    // Fetch SHMU page with timeout
    const response = await fetchWithTimeout(SHMU_PAGE_URL);
    if (!response) {
      throw new Error("Failed to fetch SHMU page (HTTP 403/404)");
    }

    const html = await response.text();
    if (!html) {
      throw new Error("SHMU page returned empty HTML");
    }

    // Extract datasets from page
    const datasets = extractDatasetsFromHtml(html);
    if (!datasets) {
      throw new Error("Failed to extract window.datasets from HTML");
    }

    // Parse all 6 measurements from datasets
    const measurements = parseHourlyDatasets(datasets);
    if (!measurements) {
      throw new Error("Failed to parse hourly measurements from datasets");
    }

    return {
      stationId: STATION_ID,
      measuredAt: new Date(measurements.timestamp).toISOString(),
      temperature: measurements.temperature,
      humidity: measurements.humidity,
      pressure: measurements.pressure,
      windSpeed: measurements.windSpeed,
      windGust: measurements.windGust,
      rainAmount: measurements.rainfall,
      isRaining: measurements.rainfall !== null && measurements.rainfall > 0,
      sourceUrl: SHMU_PAGE_URL,
      sourceFileName: null,
      sourceFolder: null,
    };
  } catch (error) {
    throw new Error(`Hourly data fetch failed: ${error.message}`);
  }
}

/**
 * Legacy function for backward compatibility
 * Now uses hourly data instead of 1-minute files
 */
async function fetchStationData() {
  return fetchAndParseHourlyData();
}

module.exports = {
  fetchStationData,
  fetchAndParseHourlyData,
};
