"use strict";

module.exports = {
  async getCurrentWeather({ homey }) {
    const weather = homey.app.getWeather();

    if (!weather) {
      return {
        ok: false,
        message: "No weather data yet. The app will fetch shortly.",
      };
    }

    return {
      ok: true,
      weather,
    };
  },
};
