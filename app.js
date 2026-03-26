"use strict";

const Homey = require("homey");
const { fetchStationData } = require("./lib/api");
const { mapStationData } = require("./lib/mapper");

const INITIAL_FETCH_DELAY_MS = 5000;
const POLL_MINUTE_OF_HOUR = 5; // Fetch at 5 minutes past each hour (when SHMU data is fresh)
const POLL_OFFSET_SECONDS = 0;
const POLL_TIMEZONE = "Europe/Bratislava";

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type) => parts.find((part) => part.type === type)?.value;

  return {
    year: Number(getPart("year")),
    month: Number(getPart("month")),
    day: Number(getPart("day")),
    hour: Number(getPart("hour")),
    minute: Number(getPart("minute")),
    second: Number(getPart("second")),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const zoned = getZonedParts(date, timeZone);
  const zonedAsUtcMs = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );

  return zonedAsUtcMs - date.getTime();
}

function localZonedMsToUtcMs(localZonedMs, timeZone) {
  let utcMs = localZonedMs;

  // A few iterations are enough even around DST transitions.
  for (let i = 0; i < 4; i++) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    const nextUtcMs = localZonedMs - offsetMs;
    if (nextUtcMs === utcMs) {
      break;
    }
    utcMs = nextUtcMs;
  }

  return utcMs;
}

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
    const nowParts = getZonedParts(now, POLL_TIMEZONE);

    const targetLocalZonedMs = Date.UTC(
      nowParts.year,
      nowParts.month - 1,
      nowParts.day,
      nowParts.hour + (nowParts.minute < POLL_MINUTE_OF_HOUR ? 0 : 1),
      POLL_MINUTE_OF_HOUR,
      POLL_OFFSET_SECONDS,
      0,
    );

    const targetUtcMs = localZonedMsToUtcMs(targetLocalZonedMs, POLL_TIMEZONE);
    const delay = Math.max(targetUtcMs - now.getTime(), 1000);

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
