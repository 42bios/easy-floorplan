import { describe, it, expect } from "vitest";
import {
  detectFloorSensors,
  calculateFloorAverage,
  computeFloorSummary,
  resolvePanelMetrics,
  resolvePanelAnchor,
  computeLeaderLinePath,
  convertTemperature,
  normalizeTempUnit,
  formatMetricValue,
} from "./floor-summary";
import type { Floor, FloorInfoPanel, FloorSummaryCardConfig, RenderHass } from "./types";
import { makeFloor } from "./types";

function mockHass(states: Record<string, any> = {}): RenderHass {
  return {
    states,
    formatEntityState: (stateObj) => {
      const u = stateObj.attributes?.unit_of_measurement;
      return u ? `${stateObj.state} ${u}` : stateObj.state;
    },
  };
}

describe("normalizeTempUnit & convertTemperature", () => {
  it("normalizes temperature unit variations", () => {
    expect(normalizeTempUnit("°C")).toBe("C");
    expect(normalizeTempUnit("celsius")).toBe("C");
    expect(normalizeTempUnit("C")).toBe("C");
    expect(normalizeTempUnit("°F")).toBe("F");
    expect(normalizeTempUnit("fahrenheit")).toBe("F");
    expect(normalizeTempUnit("F")).toBe("F");
    expect(normalizeTempUnit("K")).toBe("K");
    expect(normalizeTempUnit("kelvin")).toBe("K");
    expect(normalizeTempUnit("")).toBeUndefined();
    expect(normalizeTempUnit(undefined)).toBeUndefined();
    expect(normalizeTempUnit("lux")).toBeUndefined();
  });

  it("converts Fahrenheit to Celsius accurately", () => {
    expect(convertTemperature(32, "°F", "°C")).toBeCloseTo(0, 4);
    expect(convertTemperature(212, "°F", "°C")).toBeCloseTo(100, 4);
    expect(convertTemperature(68, "°F", "°C")).toBeCloseTo(20, 4);
  });

  it("converts Celsius to Fahrenheit accurately", () => {
    expect(convertTemperature(0, "°C", "°F")).toBeCloseTo(32, 4);
    expect(convertTemperature(100, "°C", "°F")).toBeCloseTo(212, 4);
    expect(convertTemperature(20, "°C", "°F")).toBeCloseTo(68, 4);
  });

  it("converts Kelvin to Celsius accurately", () => {
    expect(convertTemperature(273.15, "K", "°C")).toBeCloseTo(0, 4);
    expect(convertTemperature(293.15, "K", "°C")).toBeCloseTo(20, 4);
  });

  it("returns unchanged value when units match or are invalid", () => {
    expect(convertTemperature(21.5, "°C", "°C")).toBe(21.5);
    expect(convertTemperature(70, "°F", "°F")).toBe(70);
    expect(convertTemperature(21.5, "unknown", "°C")).toBe(21.5);
    expect(convertTemperature(21.5, "°C", "unknown")).toBe(21.5);
  });
});

describe("formatMetricValue", () => {
  it("formats numbers with proper decimal precision", () => {
    expect(formatMetricValue(21.456, "°C", 1)).toBe("21.5°C");
    expect(formatMetricValue(21, "°C", 1)).toBe("21.0°C");
    expect(formatMetricValue(48.2, "%", 0)).toBe("48%");
    expect(formatMetricValue(250, "W", 0)).toBe("250 W");
    expect(formatMetricValue(12.345, "kWh", 2)).toBe("12.35 kWh");
  });

  it("handles null and non-finite values", () => {
    expect(formatMetricValue(null)).toBe("");
    expect(formatMetricValue(NaN)).toBe("");
    expect(formatMetricValue(Infinity)).toBe("");
  });
});

describe("detectFloorSensors", () => {
  it("returns empty lists for floor with no entities", () => {
    const floor = makeFloor("Ground Floor");
    const hass = mockHass({});
    const res = detectFloorSensors(floor, hass);

    expect(res.temperature).toEqual([]);
    expect(res.humidity).toEqual([]);
    expect(res.presence).toEqual([]);
    expect(res.lights).toEqual([]);
    expect(res.windows).toEqual([]);
    expect(res.all).toEqual([]);
  });

  it("detects sensors across items, readings, openings, trackers, and panels", () => {
    const floor: Floor = {
      ...makeFloor("Ground Floor"),
      items: [
        {
          id: "item_1",
          kind: "sensor",
          entity: "sensor.living_room_temp",
          secondaryEntity: "sensor.living_room_humidity",
          x: 100,
          y: 100,
          readings: [{ entity: "binary_sensor.living_room_motion" }],
        },
        {
          id: "item_2",
          kind: "light",
          entity: "light.kitchen_ceiling",
          x: 200,
          y: 200,
        },
        {
          id: "item_3",
          kind: "generic",
          entity: "climate.hallway_thermostat",
          x: 300,
          y: 300,
        },
      ],
      openings: [
        {
          id: "op_1",
          type: "window",
          entity: "binary_sensor.kitchen_window",
          x: 150,
          y: 50,
          length: 40,
          angle: 0,
        },
      ],
      trackers: [
        {
          id: "tr_1",
          x: 50,
          y: 50,
          w: 100,
          h: 100,
          xSensor: { entity: "sensor.desk_distance", min: 0, max: 200 },
          ySensor: {
            entity: "sensor.desk_y",
            min: 0,
            max: 200,
            presence: { entity: "binary_sensor.desk_occupancy" },
          },
        },
      ],
      panels: [
        {
          id: "panel_1",
          x: 500,
          y: 200,
          metrics: [
            { entity: "sensor.outdoor_temperature" },
            { entity: "person.john" },
          ],
        },
      ],
    };

    const hass = mockHass({
      "sensor.living_room_temp": {
        state: "21.5",
        attributes: { device_class: "temperature", unit_of_measurement: "°C" },
      },
      "sensor.living_room_humidity": {
        state: "48",
        attributes: { device_class: "humidity", unit_of_measurement: "%" },
      },
      "binary_sensor.living_room_motion": {
        state: "off",
        attributes: { device_class: "motion" },
      },
      "light.kitchen_ceiling": {
        state: "on",
        attributes: {},
      },
      "climate.hallway_thermostat": {
        state: "heat",
        attributes: {
          current_temperature: 20.0,
          current_humidity: 50,
        },
      },
      "binary_sensor.kitchen_window": {
        state: "off",
        attributes: { device_class: "window" },
      },
      "sensor.desk_distance": {
        state: "120",
        attributes: { unit_of_measurement: "cm" },
      },
      "binary_sensor.desk_occupancy": {
        state: "on",
        attributes: { device_class: "occupancy" },
      },
      "sensor.outdoor_temperature": {
        state: "14.2",
        attributes: { device_class: "temperature", unit_of_measurement: "°C" },
      },
      "person.john": {
        state: "home",
        attributes: {},
      },
    });

    const res = detectFloorSensors(floor, hass);

    expect(res.temperature).toContain("sensor.living_room_temp");
    expect(res.temperature).toContain("climate.hallway_thermostat");
    expect(res.temperature).toContain("sensor.outdoor_temperature");

    expect(res.humidity).toContain("sensor.living_room_humidity");
    expect(res.humidity).toContain("climate.hallway_thermostat");

    expect(res.presence).toContain("binary_sensor.living_room_motion");
    expect(res.presence).toContain("binary_sensor.desk_occupancy");
    expect(res.presence).toContain("person.john");

    expect(res.lights).toContain("light.kitchen_ceiling");
    expect(res.windows).toContain("binary_sensor.kitchen_window");
  });

  it("detects sensors across floor areas, linked haArea, haFloor, and summary helpers", () => {
    const floor: Floor = {
      ...makeFloor("Upstairs"),
      haFloor: "first_floor",
      areas: [
        {
          id: "bedroom",
          name: "Bedroom",
          entity: "sensor.bedroom_temp",
          haArea: "ha_bedroom",
          points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }],
        },
      ],
      summary: {
        presenceEntity: "binary_sensor.upstairs_presence",
      },
    };

    const hass: any = {
      states: {
        "sensor.bedroom_temp": { state: "22.0", attributes: { device_class: "temperature", unit_of_measurement: "°C" } },
        "sensor.bedroom_humidity": { state: "45", attributes: { device_class: "humidity", unit_of_measurement: "%" } },
        "light.hallway": { state: "on", attributes: { device_class: "light" } },
        "binary_sensor.upstairs_presence": { state: "on", attributes: { device_class: "presence" } },
      },
      areas: {
        ha_bedroom: { area_id: "ha_bedroom", name: "Bedroom", floor_id: "first_floor" },
        ha_hallway: { area_id: "ha_hallway", name: "Hallway", floor_id: "first_floor" },
      },
      entities: {
        "sensor.bedroom_temp": { area_id: "ha_bedroom" },
        "sensor.bedroom_humidity": { area_id: "ha_bedroom" },
        "light.hallway": { area_id: "ha_hallway" },
      },
    };

    const res = detectFloorSensors(floor, hass);
    expect(res.temperature).toContain("sensor.bedroom_temp");
    expect(res.humidity).toContain("sensor.bedroom_humidity");
    expect(res.lights).toContain("light.hallway");
    expect(res.presence).toContain("binary_sensor.upstairs_presence");
  });
});

describe("calculateFloorAverage", () => {
  it("calculates average for single sensor", () => {
    const hass = mockHass({
      "sensor.living_room_temp": {
        state: "21.4",
        attributes: { unit_of_measurement: "°C" },
      },
    });

    const res = calculateFloorAverage(["sensor.living_room_temp"], undefined, hass);
    expect(res.value).toBe(21.4);
    expect(res.formatted).toBe("21.4°C");
    expect(res.unit).toBe("°C");
    expect(res.count).toBe(1);
    expect(res.entityIds).toEqual(["sensor.living_room_temp"]);
  });

  it("calculates average for multiple sensors with rounding", () => {
    const hass = mockHass({
      "sensor.temp_1": { state: "21.2", attributes: { unit_of_measurement: "°C" } },
      "sensor.temp_2": { state: "21.6", attributes: { unit_of_measurement: "°C" } },
      "sensor.temp_3": { state: "22.1", attributes: { unit_of_measurement: "°C" } },
    });

    const res = calculateFloorAverage(
      ["sensor.temp_1", "sensor.temp_2", "sensor.temp_3"],
      undefined,
      hass,
      { decimals: 1 }
    );
    // (21.2 + 21.6 + 22.1) / 3 = 64.9 / 3 = 21.6333... -> 21.6
    expect(res.value).toBe(21.6);
    expect(res.formatted).toBe("21.6°C");
    expect(res.count).toBe(3);
    expect(res.entityIds.length).toBe(3);
  });

  it("filters out excluded entities", () => {
    const hass = mockHass({
      "sensor.temp_indoor": { state: "21.0", attributes: { unit_of_measurement: "°C" } },
      "sensor.temp_garage": { state: "10.0", attributes: { unit_of_measurement: "°C" } },
    });

    const res = calculateFloorAverage(
      ["sensor.temp_indoor", "sensor.temp_garage"],
      ["sensor.temp_garage"],
      hass
    );
    expect(res.value).toBe(21.0);
    expect(res.count).toBe(1);
    expect(res.entityIds).toEqual(["sensor.temp_indoor"]);
  });

  it("skips unavailable, unknown, and non-numeric states", () => {
    const hass = mockHass({
      "sensor.valid_1": { state: "20.0", attributes: { unit_of_measurement: "°C" } },
      "sensor.unavail": { state: "unavailable", attributes: { unit_of_measurement: "°C" } },
      "sensor.unknown": { state: "unknown", attributes: { unit_of_measurement: "°C" } },
      "sensor.text_val": { state: "warm", attributes: { unit_of_measurement: "°C" } },
      "sensor.valid_2": { state: "22.0", attributes: { unit_of_measurement: "°C" } },
    });

    const res = calculateFloorAverage(
      ["sensor.valid_1", "sensor.unavail", "sensor.unknown", "sensor.text_val", "sensor.valid_2"],
      undefined,
      hass
    );
    expect(res.value).toBe(21.0);
    expect(res.count).toBe(2);
    expect(res.entityIds).toEqual(["sensor.valid_1", "sensor.valid_2"]);
  });

  it("returns null value when no valid entities are available", () => {
    const hass = mockHass({
      "sensor.unavail": { state: "unavailable" },
    });

    const res = calculateFloorAverage(["sensor.unavail"], undefined, hass);
    expect(res.value).toBeNull();
    expect(res.formatted).toBe("");
    expect(res.count).toBe(0);
    expect(res.entityIds).toEqual([]);
  });

  it("converts mixed temperature units (e.g. °F and °C) to dominant/target unit", () => {
    const hass = mockHass({
      // 20°C
      "sensor.celsius": { state: "20.0", attributes: { unit_of_measurement: "°C" } },
      // 68°F == 20°C
      "sensor.fahrenheit": { state: "68.0", attributes: { unit_of_measurement: "°F" } },
    });

    const res = calculateFloorAverage(
      ["sensor.celsius", "sensor.fahrenheit"],
      undefined,
      hass,
      { preferredUnit: "°C" }
    );
    expect(res.value).toBe(20.0);
    expect(res.formatted).toBe("20.0°C");
    expect(res.unit).toBe("°C");
    expect(res.count).toBe(2);
  });

  it("handles climate entities with current_temperature and current_humidity", () => {
    const hass = mockHass({
      "climate.thermostat": {
        state: "heat",
        attributes: {
          current_temperature: 21.0,
          current_humidity: 45,
          unit_of_measurement: "°C",
        },
      },
    });

    const tempRes = calculateFloorAverage(["climate.thermostat"], undefined, hass);
    expect(tempRes.value).toBe(21.0);
    expect(tempRes.formatted).toBe("21.0°C");

    const humidRes = calculateFloorAverage(["climate.thermostat"], undefined, hass, {
      preferredUnit: "%",
    });
    expect(humidRes.value).toBe(45);
    expect(humidRes.formatted).toBe("45.0%");
  });
});

describe("computeFloorSummary", () => {
  it("computes floor summary in auto mode", () => {
    const floor: Floor = {
      ...makeFloor("Living Floor"),
      items: [
        { id: "i1", kind: "sensor", entity: "sensor.living_temp", x: 10, y: 10 },
        { id: "i2", kind: "sensor", entity: "sensor.kitchen_temp", x: 20, y: 20 },
        { id: "i3", kind: "sensor", entity: "sensor.living_humidity", x: 30, y: 30 },
        { id: "i4", kind: "sensor", entity: "binary_sensor.motion", x: 40, y: 40 },
        { id: "i5", kind: "light", entity: "light.ceiling", x: 50, y: 50 },
      ],
      openings: [
        { id: "o1", type: "window", entity: "binary_sensor.front_window", x: 60, y: 60, length: 20, angle: 0 },
      ],
    };

    const hass = mockHass({
      "sensor.living_temp": { state: "21.0", attributes: { unit_of_measurement: "°C" } },
      "sensor.kitchen_temp": { state: "22.0", attributes: { unit_of_measurement: "°C" } },
      "sensor.living_humidity": { state: "50", attributes: { device_class: "humidity", unit_of_measurement: "%" } },
      "binary_sensor.motion": { state: "on", attributes: { device_class: "motion" } },
      "light.ceiling": { state: "on", attributes: {} },
      "binary_sensor.front_window": { state: "on", attributes: { device_class: "window" } },
    });

    const config: FloorSummaryCardConfig = {
      enabled: true,
      metrics: ["temperature", "humidity", "presence", "lights", "windows"],
    };

    const summary = computeFloorSummary(floor, hass, config);

    expect(summary.enabled).toBe(true);
    expect(summary.temperature.value).toBe(21.5);
    expect(summary.temperature.formatted).toBe("21.5°C");
    expect(summary.humidity.value).toBe(50);
    expect(summary.humidity.formatted).toBe("50%");
    expect(summary.presence.active).toBe(true);
    expect(summary.lights.onCount).toBe(1);
    expect(summary.windows.openCount).toBe(1);

    expect(summary.badgeText).toBe("21.5°C · 50% · 👤 · 💡 1 · 🪟 1");
    expect(summary.tooltip).toContain("Living Floor: Average Temp 21.5°C, Humidity 50%");
  });

  it("ignores a probe's battery sensor whose name contains 'temperature'", () => {
    const floor: Floor = {
      ...makeFloor("Ground"),
      items: [
        { id: "a", kind: "sensor", entity: "sensor.living_temperature", x: 10, y: 10 },
        { id: "b", kind: "sensor", entity: "sensor.living_temperature_battery", x: 20, y: 10 },
      ],
    };
    const hass = mockHass({
      "sensor.living_temperature": { state: "21", attributes: { device_class: "temperature", unit_of_measurement: "°C" } },
      "sensor.living_temperature_battery": {
        state: "85",
        attributes: { device_class: "battery", unit_of_measurement: "%", friendly_name: "Living Temperature Battery" },
      },
    });
    const summary = computeFloorSummary(floor, hass, { enabled: true });
    expect(summary.temperature.formatted).toBe("21.0°C");
    expect(summary.temperature.entityIds).toEqual(["sensor.living_temperature"]);
    expect(summary.humidity.count).toBe(0);
  });

  it("does not treat name matches as humidity or presence", () => {
    const floor: Floor = {
      ...makeFloor("Ground"),
      items: [
        { id: "a", kind: "sensor", entity: "sensor.dehumidifier_tank_level", x: 10, y: 10 },
        { id: "b", kind: "sensor", entity: "binary_sensor.motion_sensor_tamper", x: 20, y: 10 },
        { id: "c", kind: "sensor", entity: "sensor.office_humidity", x: 30, y: 10 },
      ],
    };
    const hass = mockHass({
      "sensor.dehumidifier_tank_level": { state: "90", attributes: { unit_of_measurement: "%" } },
      "binary_sensor.motion_sensor_tamper": { state: "on", attributes: { device_class: "tamper" } },
      "sensor.office_humidity": { state: "40", attributes: { device_class: "humidity", unit_of_measurement: "%" } },
    });
    const detected = detectFloorSensors(floor, hass);
    expect(detected.humidity).toEqual(["sensor.office_humidity"]);
    expect(detected.presence).toEqual([]);
    expect(detected.temperature).toEqual([]);
  });

  it("honors explicit entity overrides", () => {
    const floor: Floor = {
      ...makeFloor("First Floor"),
      summary: {
        enabled: true,
        temperatureEntity: "sensor.custom_temp_helper",
        humidityEntity: "sensor.custom_humidity_helper",
        presenceEntity: "binary_sensor.floor_presence",
      },
      items: [
        { id: "i1", kind: "sensor", entity: "sensor.ignored_temp", x: 10, y: 10 },
      ],
    };

    const hass = mockHass({
      "sensor.custom_temp_helper": { state: "19.5", attributes: { unit_of_measurement: "°C" } },
      "sensor.custom_humidity_helper": { state: "55", attributes: { unit_of_measurement: "%" } },
      "binary_sensor.floor_presence": { state: "on" },
      "sensor.ignored_temp": { state: "30.0", attributes: { unit_of_measurement: "°C" } },
    });

    const summary = computeFloorSummary(floor, hass);

    expect(summary.temperature.value).toBe(19.5);
    expect(summary.temperature.formatted).toBe("19.5°C");
    expect(summary.humidity.value).toBe(55);
    expect(summary.humidity.formatted).toBe("55%");
    expect(summary.presence.active).toBe(true);
  });

  it("supports custom template text in floor summary", () => {
    const floor: Floor = {
      ...makeFloor("Attic"),
      summary: {
        enabled: true,
        temperatureEntity: "sensor.attic_temp",
        customText: "{temp} | Climate OK",
      },
    };

    const hass = mockHass({
      "sensor.attic_temp": { state: "18.2", attributes: { unit_of_measurement: "°C" } },
    });

    const summary = computeFloorSummary(floor, hass);
    expect(summary.badgeText).toBe("18.2°C | Climate OK");
  });

  it("handles excludeEntities properly", () => {
    const floor: Floor = {
      ...makeFloor("Ground"),
      summary: {
        enabled: true,
        excludeEntities: ["sensor.patio_temp"],
      },
      items: [
        { id: "i1", kind: "sensor", entity: "sensor.living_temp", x: 10, y: 10 },
        { id: "i2", kind: "sensor", entity: "sensor.patio_temp", x: 20, y: 20 },
      ],
    };

    const hass = mockHass({
      "sensor.living_temp": { state: "21.0", attributes: { unit_of_measurement: "°C" } },
      "sensor.patio_temp": { state: "5.0", attributes: { unit_of_measurement: "°C" } },
    });

    const summary = computeFloorSummary(floor, hass);
    expect(summary.temperature.value).toBe(21.0);
    expect(summary.temperature.entityIds).toEqual(["sensor.living_temp"]);
  });
});

describe("resolvePanelMetrics", () => {
  it("resolves panel metrics with entity states, units, and friendly names", () => {
    const panel: FloorInfoPanel = {
      id: "panel_hud",
      x: 100,
      y: 100,
      metrics: [
        { entity: "sensor.workstation_power", label: "Power Draw", icon: "mdi:flash" },
        { entity: "sensor.workstation_temp" },
        { entity: "sensor.offline_device" },
      ],
    };

    const hass = mockHass({
      "sensor.workstation_power": {
        state: "285",
        attributes: { unit_of_measurement: "W", friendly_name: "Workstation Power" },
      },
      "sensor.workstation_temp": {
        state: "23.2",
        attributes: { unit_of_measurement: "°C", friendly_name: "Workstation Ambient", icon: "mdi:thermometer" },
      },
      "sensor.offline_device": {
        state: "unavailable",
        attributes: {},
      },
    });

    const metrics = resolvePanelMetrics(panel, hass);
    expect(metrics.length).toBe(3);

    expect(metrics[0]!).toEqual({
      entity: "sensor.workstation_power",
      label: "Power Draw",
      state: "285",
      value: "285 W",
      unit: "W",
      icon: "mdi:flash",
      unavailable: false,
    });

    expect(metrics[1]!).toEqual({
      entity: "sensor.workstation_temp",
      label: "Workstation Ambient",
      state: "23.2",
      value: "23.2 °C",
      unit: "°C",
      icon: "mdi:thermometer",
      unavailable: false,
    });

    expect(metrics[2]!.unavailable).toBe(true);
    expect(metrics[2]!.value).toBe("unavailable");
  });

  it("reads custom attributes when attribute is configured", () => {
    const panel: FloorInfoPanel = {
      id: "panel_ac",
      x: 100,
      y: 100,
      metrics: [
        { entity: "climate.ac", attribute: "current_temperature", label: "Current Temp", unit: "°C" },
      ],
    };

    const hass = mockHass({
      "climate.ac": {
        state: "cool",
        attributes: { current_temperature: 22.5 },
      },
    });

    const metrics = resolvePanelMetrics(panel, hass);
    expect(metrics[0]!.value).toBe("22.5");
    expect(metrics[0]!.unit).toBe("°C");
  });
});

describe("resolvePanelAnchor", () => {
  const floor: Floor = {
    ...makeFloor("Test Floor"),
    areas: [
      {
        id: "living_room",
        name: "Living Room",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      },
    ],
    furniture: [
      {
        id: "sofa_1",
        type: "sofa",
        x: 50,
        y: 60,
        w: 40,
        h: 20,
        angle: 0,
      },
    ],
    roofs: [
      {
        id: "roof_main",
        type: "gable",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        height: 35,
      },
    ],
  };

  it("returns explicit anchor coordinate when specified", () => {
    const panel: FloorInfoPanel = {
      id: "p1",
      x: 150,
      y: 150,
      anchor: { x: 42, y: 77 },
    };
    expect(resolvePanelAnchor(panel, floor)).toEqual({ x: 42, y: 77 });
  });

  it("resolves area centroid when targetId points to an area", () => {
    const panel: FloorInfoPanel = {
      id: "p1",
      x: 150,
      y: 150,
      targetId: "living_room",
    };
    const anchor = resolvePanelAnchor(panel, floor);
    expect(anchor).toBeDefined();
    expect(anchor?.x).toBe(50);
    expect(anchor?.y).toBe(50);
  });

  it("resolves furniture position when targetId points to a furniture item", () => {
    const panel: FloorInfoPanel = {
      id: "p1",
      x: 150,
      y: 150,
      targetId: "sofa_1",
    };
    const anchor = resolvePanelAnchor(panel, floor);
    expect(anchor).toEqual({ x: 50, y: 60 });
  });

  it("resolves enclosing area centroid when targetType is area", () => {
    const panel: FloorInfoPanel = {
      id: "p1",
      x: 30,
      y: 40,
      targetType: "area",
    };
    const anchor = resolvePanelAnchor(panel, floor);
    expect(anchor).toBeDefined();
    expect(anchor?.x).toBe(50);
    expect(anchor?.y).toBe(50);
  });

  it("falls back to the nearest room when an area panel sits outside every room", () => {
    const twoRooms: Floor = {
      ...floor,
      areas: [
        ...(floor.areas ?? []),
        { id: "study", name: "Study", points: [{ x: 300, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 100 }, { x: 300, y: 100 }] },
      ],
    };
    const panel: FloorInfoPanel = { id: "p1", x: 280, y: 160, targetType: "area" };
    expect(resolvePanelAnchor(panel, twoRooms)).toEqual({ x: 350, y: 50 });
    expect(resolvePanelAnchor(panel, { ...twoRooms, areas: [] })).toBeUndefined();
  });

  it("resolves roof centroid when targetId points to a roof", () => {
    const panel: FloorInfoPanel = {
      id: "p1",
      x: 150,
      y: 150,
      targetId: "roof_main",
    };
    const anchor = resolvePanelAnchor(panel, floor);
    expect(anchor).toBeDefined();
    expect(anchor?.x).toBe(50);
    expect(anchor?.y).toBe(50);
  });

  it("resolves enclosing roof centroid when targetType is roof", () => {
    const panel: FloorInfoPanel = {
      id: "p1",
      x: 30,
      y: 40,
      targetType: "roof",
    };
    const anchor = resolvePanelAnchor(panel, floor);
    expect(anchor).toBeDefined();
    expect(anchor?.x).toBe(50);
    expect(anchor?.y).toBe(50);
  });

  it("returns undefined when no target or anchor exists", () => {
    const panel: FloorInfoPanel = {
      id: "p1",
      x: 200,
      y: 200,
    };
    expect(resolvePanelAnchor(panel, floor)).toBeUndefined();
  });
});

describe("computeLeaderLinePath", () => {
  it("draws straight line for nearly coincident points", () => {
    expect(computeLeaderLinePath({ x: 10, y: 10 }, { x: 11, y: 11 })).toBe("M 10 10 L 11 11");
  });

  it("computes stepped angled path from anchor to panel", () => {
    const path = computeLeaderLinePath({ x: 100, y: 100 }, { x: 200, y: 150 });
    expect(path.startsWith("M 100 100 L ")).toBe(true);
    expect(path.endsWith(" L 200 150")).toBe(true);
  });
});

