"use strict";

const Homey = require("homey");
const { fetchStationData } = require("./lib/api");
const { mapStationData } = require("./lib/mapper");

module.exports = class MyApp extends Homey.App {
  async onInit() {
    this.log("Mochovce Weather app started");

    this.weatherCache = null;
    this.lastDatasetTime = null;
    this.lastProbeTimeIso = null;
    this.isUpdating = false;
    this.interval = null;
    this.startupTimeout = null;

    this.startupTimeout = this.homey.setTimeout(async () => {
      await this.updateWeather();
    }, 5000);

    this.interval = this.homey.setInterval(
      async () => {
        await this.updateWeather();
      },
      10 * 60 * 1000,
    );
  }

  async onUninit() {
    if (this.startupTimeout) {
      this.homey.clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }

    if (this.interval) {
      this.homey.clearInterval(this.interval);
      this.interval = null;
    }
  }

  async updateWeather() {
    if (this.isUpdating) {
      this.log("Fetch already running, skipping");
      return;
    }

    this.isUpdating = true;

    try {
      this.log("Polling SHMU for latest dataset...");

      const raw = await fetchStationData({
        lastProbeTimeIso: this.lastProbeTimeIso,
      });

      const weather = mapStationData(raw);

      if (!weather || !weather.measuredAt) {
        this.log("Mapped weather data is invalid, skipping update");
        return;
      }

      this.lastProbeTimeIso = weather.probeTimeIso || null;

      if (this.lastDatasetTime === weather.measuredAt) {
        this.log(`Dataset unchanged, skipping update (${weather.measuredAt})`);
        return;
      }

      this.lastDatasetTime = weather.measuredAt;
      this.weatherCache = weather;

      const devices = this.getWeatherDevicesSafe();

      for (const device of devices) {
        await device.updateFromApp(weather);
      }

      this.log(
        `Weather updated: measuredAt=${weather.measuredAt}, sourceFile=${weather.sourceUrl}`,
      );
    } catch (error) {
      this.error("Weather update failed:", error);
    } finally {
      this.isUpdating = false;
    }
  }

  getWeather() {
    return this.weatherCache;
  }

  getWeatherDevicesSafe() {
    try {
      const driver = this.homey.drivers.getDriver("mochovce-weather");
      return driver.getDevices();
    } catch (error) {
      this.log("Driver not ready yet, skipping device push");
      return [];
    }
  }
};
