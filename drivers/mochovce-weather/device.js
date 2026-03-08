"use strict";

const Homey = require("homey");
const { fetchStationData } = require("../../lib/api");
const { mapStationData } = require("../../lib/mapper");

class MochovceWeatherDevice extends Homey.Device {
  async onInit() {
    this.log("Mochovce Weather device started");

    await this.updateWeather();

    this.interval = this.homey.setInterval(
      async () => {
        try {
          await this.updateWeather();
        } catch (error) {
          this.error("Weather update failed:", error);
        }
      },
      10 * 60 * 1000,
    );
  }

  async updateWeather() {
    const raw = await fetchStationData();
    const weather = mapStationData(raw);

    this.log("RAW SHMU DATA:", raw);
    this.log("Mapped weather:", weather);

    // základné meteo hodnoty
    await this.setCapabilityValue("measure_temperature", weather.temperature);
    await this.setCapabilityValue("measure_humidity", weather.humidity);
    await this.setCapabilityValue("measure_pressure", weather.pressure);
    await this.setCapabilityValue("measure_wind_strength", weather.windSpeed);

    // uloženie kompletných dát
    await this.setStoreValue("lastWeather", weather);
    await this.setStoreValue("lastMeasuredAt", weather.measuredAt);
  }

  async onDeleted() {
    if (this.interval) {
      this.homey.clearInterval(this.interval);
    }
  }
}

module.exports = MochovceWeatherDevice;
