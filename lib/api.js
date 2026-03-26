"use strict";

const STATION_ID = 11856;
const TIMEZONE = "Europe/Bratislava";
const SHMU_PAGE_URL =
  "https://www.shmu.sk/sk/?page=1&id=meteo_apocasie_sk&ii=11856";
const FETCH_TIMEOUT_MS = 30000;
const MAX_DATA_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_FUTURE_SKEW_MS = 0; // Do not accept future timestamps

// Enable mock data for testing (set to false for production)
const USE_MOCK_DATA = false;

/**
 * Generate mock hourly data for testing
 */
function getMockHourlyData() {
  const now = Date.now();
  // Round down to nearest hour for realistic hourly data
  const currentHour = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);

  return {
    timestamp: currentHour,
    temperature: 12.5 + Math.random() * 5, // 12.5-17.5°C
    pressure: 1010 + Math.random() * 8, // 1010-1018 hPa
    humidity: 60 + Math.random() * 20, // 60-80%
    windSpeed: 2 + Math.random() * 4, // 2-6 m/s
    windGust: 5 + Math.random() * 5, // 5-10 m/s
    rainfall: Math.random() > 0.7 ? Math.random() * 2 : 0, // 70% no rain, 30% 0-2mm
  };
}

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
 * Extract datasets array from HTML page
 * Data is embedded in HTML as: var datasets = [{...}, {...}]
 */
function extractDatasetsFromHtml(html) {
  if (!html || typeof html !== "string") {
    return null;
  }

  // Search for large JSON array in script tag
  // Pattern: find "var datasets = [" and capture everything until matching ]
  let startIdx = html.indexOf("var datasets = [");
  if (startIdx === -1) {
    startIdx = html.indexOf("window.datasets = [");
  }

  if (startIdx === -1) {
    console.log("[api] Failed to locate datasets init in HTML");
    return null;
  }

  // Find the opening [
  const bracketStart = html.indexOf("[", startIdx);
  if (bracketStart === -1) {
    return null;
  }

  // Count brackets to find matching ]
  let bracketCount = 0;
  let bracketEnd = -1;

  for (let i = bracketStart; i < html.length; i++) {
    const char = html[i];
    if (char === "[") {
      bracketCount++;
    } else if (char === "]") {
      bracketCount--;
      if (bracketCount === 0) {
        bracketEnd = i + 1;
        break;
      }
    }
  }

  if (bracketEnd === -1) {
    console.log("[api] Failed to find matching ] bracket");
    return null;
  }

  const datasetsJson = html.substring(bracketStart, bracketEnd);

  try {
    const datasets = JSON.parse(datasetsJson);
    if (Array.isArray(datasets) && datasets.length > 0) {
      console.log(
        "[api] Successfully extracted datasets array with",
        datasets.length,
        "items",
      );
      return datasets;
    }
  } catch (error) {
    console.log(
      "[api] Failed to parse as JSON, trying with function evaluation:",
      error.message,
    );

    // Try using Function to evaluate as JavaScript object (allows single quotes)
    try {
      const datasets = new Function(
        '"use strict"; return (' + datasetsJson + ")",
      )();
      if (Array.isArray(datasets) && datasets.length > 0) {
        console.log(
          "[api] Successfully extracted datasets array with Function eval, items:",
          datasets.length,
        );
        return datasets;
      }
    } catch (evalError) {
      console.log("[api] Failed with Function eval too:", evalError.message);
      console.log(
        "[api] First 400 chars of extracted data:",
        datasetsJson.substring(0, 400),
      );
    }
  }

  return null;
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

    // Ignore points too far in the future (can appear shortly before hour change)
    if (timestamp - now > MAX_FUTURE_SKEW_MS) {
      continue;
    }

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
    // Use mock data in test/development mode
    if (USE_MOCK_DATA) {
      console.log("[api] Using mock data for testing");
      const measurements = getMockHourlyData();

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
        sourceUrl: "mock://test-data",
        sourceFileName: null,
        sourceFolder: null,
      };
    }

    // Fetch SHMU page with timeout
    console.log("[api] Fetching SHMU page:", SHMU_PAGE_URL);
    const response = await fetchWithTimeout(SHMU_PAGE_URL);
    if (!response) {
      throw new Error("Failed to fetch SHMU page (HTTP 403/404)");
    }

    console.log("[api] Response received, status:", response.status);
    const html = await response.text();
    if (!html) {
      throw new Error("SHMU page returned empty HTML");
    }

    console.log("[api] HTML length:", html.length, "bytes");

    // Extract datasets from page
    const datasets = extractDatasetsFromHtml(html);
    if (!datasets) {
      throw new Error("Failed to extract window.datasets from HTML");
    }

    console.log("[api] Extracted", datasets.length, "datasets");

    // Parse all 6 measurements from datasets
    const measurements = parseHourlyDatasets(datasets);
    if (!measurements) {
      throw new Error("Failed to parse hourly measurements from datasets");
    }

    console.log("[api] Successfully parsed measurements:", {
      timestamp: measurements.timestamp,
      temperature: measurements.temperature,
      humidity: measurements.humidity,
    });

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
    console.log("[api] Fetch error:", error.message);
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
