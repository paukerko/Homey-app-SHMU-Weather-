const test = require("node:test");
const assert = require("node:assert/strict");

const { parseHourlyDatasets } = require("../lib/api");

test("parses current SHMU layout with 5 datasets", () => {
  const now = Date.now();

  const datasets = [
    { id: "ttt", data: [[now - 60_000, 17.8]] },
    { id: "tlak", data: [[now - 60_000, 1018]] },
    { id: "rh", data: [[now - 60_000, 55]] },
    { id: "ff", data: [[now - 60_000, 2.5]] },
    { id: "pr1h", data: [[now - 60_000, 0.4]] },
  ];

  const result = parseHourlyDatasets(datasets);

  assert.ok(result);
  assert.equal(result.temperature, 17.8);
  assert.equal(result.pressure, 1018);
  assert.equal(result.humidity, 55);
  assert.equal(result.windSpeed, 2.5);
  assert.equal(result.windGust, null);
  assert.equal(result.rainfall, 0.4);
});

test("falls back to the latest non-null hourly value when the newest point is null", () => {
  const now = Date.now();
  const datasets = [
    {
      id: "ttt",
      data: [
        [now - 3 * 60 * 60 * 1000, 20.1],
        [now - 2 * 60 * 60 * 1000, 21.2],
        [now - 60 * 60 * 1000, null],
        [now, null],
      ],
    },
    { id: "tlak", data: [[now - 60 * 60 * 1000, 1018]] },
    { id: "rh", data: [[now - 60 * 60 * 1000, 55]] },
    { id: "ff", data: [[now - 60 * 60 * 1000, 2.5]] },
    { id: "pr1h", data: [[now - 60 * 60 * 1000, 0.4]] },
  ];

  const result = parseHourlyDatasets(datasets);

  assert.ok(result);
  assert.equal(result.temperature, 21.2);
});
