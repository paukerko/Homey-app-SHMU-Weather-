"use strict";

const API_URL = "https://tempestas.online/ha_station.php?ind=11856";

async function fetchStationData() {
  const response = await fetch(API_URL);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error("API returned ok=false");
  }

  return data;
}

module.exports = {
  fetchStationData,
};
