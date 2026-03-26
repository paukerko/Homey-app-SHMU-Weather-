"use strict";

const Homey = require("homey");
const { fetchStationData } = require("./lib/api");
const { mapStationData } = require("./lib/mapper");

const INITIAL_FETCH_DELAY_MS = 5000;
const POLL_MINUTE_OF_HOUR = 5; // Fetch at 5 minutes past each hour (when SHMU data is fresh)
const POLL_OFFSET_SECONDS = 0;

module.exports = class MyApp extends Homey.App {
  async onInit() {
    this.log("Mochovce Weather app started");

    this.weatherCache = null;
    this.lastDatasetTime = null;
    this.isUpdating = false;

    this.startupTimeout = null;
    this.pollTimeout = null;

    this.startupTimeout = this.homey.setTimeout(async () => {
      try {
        await this.updateWeather();
      } catch (error) {
        this.error("Initial weather fetch failed:", error);
      }
    }, INITIAL_FETCH_DELAY_MS);

    this.scheduleNextAlignedPoll();
  }

  async onUninit() {
    this.log("Mochovce Weather app destroying");

    if (this.startupTimeout) {
      this.homey.clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }

    if (this.pollTimeout) {
      this.homey.clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
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

    // Set to the 5-minute mark of the next hour
    const currentMinute = next.getMinutes();

    if (currentMinute < POLL_MINUTE_OF_HOUR) {
      // We haven't reached the target minute this hour yet
      next.setMinutes(POLL_MINUTE_OF_HOUR, POLL_OFFSET_SECONDS, 0);
    } else {
      // Move to next hour's target minute
      next.setHours(next.getHours() + 1);
      next.setMinutes(POLL_MINUTE_OF_HOUR, POLL_OFFSET_SECONDS, 0);
    }

    const delay = Math.max(next.getTime() - now.getTime(), 1000);
    return delay;
  }

  async updateWeather() {
    if (this.isUpdating) {
      this.log("Fetch already running, skipping");
      return;
    }

    this.isUpdating = true;

    try {
      this.log("Polling SHMU for latest hourly dataset...");

      const raw = await fetchStationData();

      const weather = mapStationData(raw);

      if (!weather || !weather.measuredAt) {
        this.log("Mapped weather data is invalid, skipping update");
        return;
      }

      if (this.lastDatasetTime === weather.measuredAt) {
        this.log(`Dataset unchanged, skipping update (${weather.measuredAt})`);
        return;
      }

      this.lastDatasetTime = weather.measuredAt;
      this.weatherCache = weather;

      const devices = this.getWeatherDevicesSafe();

      for (const device of devices) {
        try {
          await device.updateFromApp(weather);
        } catch (error) {
          this.error(
            `Failed to update device ${device.getName() || device.id}:`,
            error,
          );
        }
      }

      this.log(
        `Weather updated: measuredAt=${weather.measuredAt}, temp=${weather.temperature}°C`,
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
