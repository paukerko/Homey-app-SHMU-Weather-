"use strict";

const Homey = require("homey");
const { fetchStationData } = require("./lib/api");
const { mapStationData } = require("./lib/mapper");

const INITIAL_FETCH_DELAY_MS = 5000;
const POLL_OFFSET_SECONDS = 15;
const POLL_MINUTE_STEP = 5;

module.exports = class MyApp extends Homey.App {
  async onInit() {
    this.log("Mochovce Weather app started");

    this.weatherCache = null;
    this.lastDatasetTime = null;
    this.lastSuccessfulFileName = null;
    this.isUpdating = false;

    this.startupTimeout = null;
    this.pollTimeout = null;

    this.startupTimeout = this.homey.setTimeout(async () => {
      await this.updateWeather();
    }, INITIAL_FETCH_DELAY_MS);

    this.scheduleNextAlignedPoll();
  }

  scheduleNextAlignedPoll() {
    if (this.pollTimeout) {
      this.homey.clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    const delay = this.getDelayToNextAlignedPoll();
    const nextRun = new Date(Date.now() + delay);

    this.log(
      `Next aligned SHMU polling scheduled for ${nextRun.toISOString()} (in ${Math.round(delay / 1000)}s)`,
    );

    this.pollTimeout = this.homey.setTimeout(async () => {
      try {
        await this.updateWeather();
      } finally {
        this.scheduleNextAlignedPoll();
      }
    }, delay);
  }

  getDelayToNextAlignedPoll() {
    const now = new Date();
    const next = new Date(now);

    next.setSeconds(0, 0);

    let minute = next.getMinutes();
    let alignedMinute = Math.ceil(minute / POLL_MINUTE_STEP) * POLL_MINUTE_STEP;

    if (alignedMinute === minute && now.getSeconds() >= POLL_OFFSET_SECONDS) {
      alignedMinute += POLL_MINUTE_STEP;
    }

    if (alignedMinute >= 60) {
      next.setHours(next.getHours() + 1);
      next.setMinutes(0, 0, 0);
    } else {
      next.setMinutes(alignedMinute, 0, 0);
    }

    next.setSeconds(POLL_OFFSET_SECONDS, 0);

    return Math.max(next.getTime() - now.getTime(), 1000);
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
        lastSuccessfulFileName: this.lastSuccessfulFileName,
      });

      const weather = mapStationData(raw);

      if (!weather || !weather.measuredAt) {
        this.log("Mapped weather data is invalid, skipping update");
        return;
      }

      this.lastSuccessfulFileName = weather.sourceFileName || null;

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
        `Weather updated: measuredAt=${weather.measuredAt}, sourceFile=${weather.sourceFileName}`,
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
