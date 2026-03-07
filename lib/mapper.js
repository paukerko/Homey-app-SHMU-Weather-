"use strict";

function mapStationData(raw) {
  return {
    temperature: raw.temp,
    humidity: raw.humidity,
    pressure: raw.pressure,
    wind: raw.wind,
    rain: raw.rain,
    isRaining: raw.rain > 0,
  };
}

module.exports = {
  mapStationData,
};
