"use strict";

const Homey = require("homey");

const DISPLAY_TIMEZONE = "Europe/Bratislava";

class MochovceWeatherDevice extends Homey.Device {
  async onInit() {
    this.log("Mochovce Weather device started");

    const weather = this.homey.app.getWeather();

    if (weather) {
      await this.updateFromApp(weather);
    }
  }

  async updateFromApp(weather) {
    if (!weather) {
      return;
    }

    await this.updateCapabilityIfChanged(
      "measure_temperature",
      weather.temperature,
    );
    await this.updateCapabilityIfChanged("measure_humidity", weather.humidity);
    await this.updateCapabilityIfChanged("measure_pressure", weather.pressure);
    await this.updateCapabilityIfChanged(
      "measure_wind_strength",
      weather.windSpeed,
    );
    await this.updateCapabilityIfChanged(
      "last_update",
      this.formatLastUpdate(weather.measuredAt),
    );

    await this.setStoreValue("lastWeather", weather);
  }

  formatLastUpdate(measuredAt) {
    if (!measuredAt) {
      return "-";
    }

    const date = new Date(measuredAt);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    const parts = new Intl.DateTimeFormat("sk-SK", {
      timeZone: DISPLAY_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;

    if (!hour || !minute) {
      return "-";
    }

    return `${hour}:${minute}`;
  }

  async updateCapabilityIfChanged(capability, newValue) {
    if (!this.hasCapability(capability)) {
      this.log(`Capability ${capability} not available on this device`);
      return;
    }

    if (newValue === undefined || newValue === null) {
      return;
    }

    const currentValue = this.getCapabilityValue(capability);

    if (currentValue === newValue) {
      return;
    }

    try {
      await this.setCapabilityValue(capability, newValue);
      this.log(`${capability}: ${currentValue} → ${newValue}`);
    } catch (error) {
      this.error(`Failed to set ${capability} to ${newValue}:`, error);
    }
  }
}

module.exports = MochovceWeatherDevice;
