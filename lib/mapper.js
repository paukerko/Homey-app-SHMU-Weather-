"use strict";

function mapStationData(raw) {
  return {
    stationId: raw.ind_kli,
    measuredAt: raw.minuta,
    temperature: raw.t,
    humidity: raw.vlh_rel,
    pressure: raw.tlak,
    windSpeed: raw.vie_pr_rych,
    windGust: raw.vie_max_rych,
    rainAmount: raw.zra_uhrn,
    isRaining: raw.zra_uhrn > 0,
    sourceUrl: raw._sourceUrl,
    probeTimeIso: raw._probeTimeIso,
  };
}

module.exports = {
  mapStationData,
};
