"use strict";

const Homey = require("homey");

class MochovceWeatherDriver extends Homey.Driver {
  async onInit() {
    this.log("Mochovce Weather driver initialized");
  }

  async onPairListDevices() {
    return [
      {
        name: "Mochovce Weather",
        data: {
          id: "mochovce-weather",
        },
      },
    ];
  }
}

module.exports = MochovceWeatherDriver;
