"use strict";

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

module.exports = {
  mapStationData(raw) {
    if (!raw) {
      return null;
    }

    // Handle both old format (from JSON files) and new format (from hourly data)
    // New format has: temperature, humidity, pressure, windSpeed, windGust, rainAmount, measuredAt
    // Old format has: t, vlh_rel, tlak, vie_pr_rych, vie_max_rych, zra_uhrn, minuta

    const temperature = toNumberOrNull(raw.temperature ?? raw.t);
    const humidity = toNumberOrNull(raw.humidity ?? raw.vlh_rel);
    const pressure = toNumberOrNull(raw.pressure ?? raw.tlak);
    const windSpeed = toNumberOrNull(raw.windSpeed ?? raw.vie_pr_rych);
    const windGust = toNumberOrNull(raw.windGust ?? raw.vie_max_rych);
    const rainAmount = toNumberOrNull(raw.rainAmount ?? raw.zra_uhrn);

    // measuredAt is already ISO string from hourly, or needs conversion from minuta
    let measuredAt = raw.measuredAt || raw.minuta;
    if (measuredAt && !measuredAt.includes("T")) {
      // Try to parse if it's a timestamp
      const parsed = new Date(measuredAt);
      if (!Number.isNaN(parsed.getTime())) {
        measuredAt = parsed.toISOString();
      }
    }

    return {
      stationId: toNumberOrNull(raw.stationId ?? raw.ind_kli),
      measuredAt: measuredAt || null,
      temperature,
      humidity,
      pressure,
      windSpeed,
      windGust,
      rainAmount,
      isRaining: rainAmount !== null && rainAmount > 0,
      sourceUrl: raw.sourceUrl ?? raw._sourceUrl ?? null,
      sourceFileName: raw.sourceFileName ?? raw._sourceFileName ?? null,
      sourceFolder: raw.sourceFolder ?? raw._sourceFolder ?? null,
    };
  },
};
