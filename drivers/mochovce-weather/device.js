"use strict";

const Homey = require("homey");
const { fetchStationData } = require("../../lib/api");
const { mapStationData } = require("../../lib/mapper");

class MochovceWeatherDevice extends Homey.Device {
  async onInit() {
    this.log("Mochovce Weather device started");

    await this.updateWeather();

    this.interval = this.homey.setInterval(async () => {
      try {
        await this.updateWeather();
      } catch (error) {
        this.error(error);
      }
    }, 600000); // 10 min
  }

  async updateWeather() {
    const raw = await fetchStationData();
    const weather = mapStationData(raw);

    await this.setCapabilityValue("measure_temperature", weather.temperature);
    await this.setCapabilityValue("measure_humidity", weather.humidity);
    await this.setCapabilityValue("measure_pressure", weather.pressure);
    await this.setCapabilityValue("measure_wind_strength", weather.wind);
    await this.setCapabilityValue("alarm_rain", weather.isRaining);

    this.log("Weather updated", weather);
  }
}

module.exports = MochovceWeatherDevice;
