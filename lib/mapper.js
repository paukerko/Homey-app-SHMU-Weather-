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
    return {
      stationId: toNumberOrNull(raw.ind_kli),
      measuredAt: raw.minuta || null,
      temperature: toNumberOrNull(raw.t),
      humidity: toNumberOrNull(raw.vlh_rel),
      pressure: toNumberOrNull(raw.tlak),
      windSpeed: toNumberOrNull(raw.vie_pr_rych),
      windGust: toNumberOrNull(raw.vie_max_rych),
      rainAmount: toNumberOrNull(raw.zra_uhrn),
      isRaining: toNumberOrNull(raw.zra_uhrn) > 0,
      sourceUrl: raw._sourceUrl || null,
      probeTimeIso: raw._probeTimeIso || null,
    };
  },
};
