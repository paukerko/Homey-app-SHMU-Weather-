"use strict";

const Homey = require("homey");

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

    return (
      date.getHours().toString().padStart(2, "0") +
      ":" +
      date.getMinutes().toString().padStart(2, "0")
    );
  }

  async updateCapabilityIfChanged(capability, newValue) {
    if (!this.hasCapability(capability)) {
      return;
    }

    if (newValue === undefined || newValue === null) {
      return;
    }

    const currentValue = this.getCapabilityValue(capability);

    if (currentValue === newValue) {
      return;
    }

    await this.setCapabilityValue(capability, newValue);
  }
}

module.exports = MochovceWeatherDevice;
