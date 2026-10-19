import { afterEach, describe, expect, it } from "vitest";
import "./floorplan-card";
import type { FloorplanCard } from "./floorplan-card";
import type { Floor, FloorInfoPanel, FloorplanCardConfig } from "./types";
import { makeFloor } from "./types";

let seq = 0;
async function mount(floor: Partial<Floor>, extraConfig: Partial<FloorplanCardConfig> = {}) {
  const host = document.createElement("div");
  host.style.cssText = `width:600px;height:400px;--primary-color:#00e5ff;
    --primary-text-color:#ffffff;--card-background-color:#0b1326;--text-primary-color:#ffffff;`;
  document.body.append(host);

  const fullFloor: Floor = {
    ...makeFloor(`Floor-${seq++}`),
    ...floor,
  };

  const config: FloorplanCardConfig = {
    type: "custom:easy-floorplan-card",
    width: 600,
    height: 400,
    floors: [fullFloor],
    ...extraConfig,
  };

  const card = document.createElement("easy-floorplan-card") as FloorplanCard;
  card.setConfig(config);
  card.hass = {
    states: {
      "sensor.temp": { state: "21.8", attributes: { unit_of_measurement: "°C", friendly_name: "Temperature" } },
      "sensor.power": { state: "145", attributes: { unit_of_measurement: "W", friendly_name: "Power Draw" } },
    },
    entities: {},
    formatEntityState: (s: any) => `${s.state} ${s.attributes?.unit_of_measurement ?? ""}`.trim(),
  } as unknown as FloorplanCard["hass"];

  host.append(card);
  await card.updateComplete;
  return { host, card, root: card.shadowRoot! };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("floor callout panels in real chromium", () => {
  it("renders tech callout panel with HUD styling and leader line", async () => {
    const panel: FloorInfoPanel = {
      id: "panel_1",
      x: 350,
      y: 120,
      title: "Climate Zone",
      style: "tech",
      color: "#00e5ff",
      anchor: { x: 180, y: 200 },
      showLeaderLine: true,
      metrics: [
        { entity: "sensor.temp", label: "Temperature" },
        { entity: "sensor.power", label: "Power Draw" },
      ],
    };

    const { root } = await mount({ panels: [panel] });

    const panelEl = root.querySelector<HTMLElement>(".fp-info-panel.tech");
    expect(panelEl).not.toBeNull();

    // Verify computed styles in real browser layout
    const cs = getComputedStyle(panelEl!);
    expect(cs.position).toBe("absolute");
    expect(cs.userSelect).toBe("none");

    const leaderLine = root.querySelector<SVGPathElement>(".fp-panel-leader-line");
    expect(leaderLine).not.toBeNull();
    expect(leaderLine?.getAttribute("d")).toContain("M 180 200");

    const rows = root.querySelectorAll(".fp-panel-metric-row");
    expect(rows.length).toBe(2);
  });

  it("renders readable light background and dark ink text in line-art mode", async () => {
    const panel: FloorInfoPanel = {
      id: "panel_line_art",
      x: 300,
      y: 150,
      title: "Solar Inverter",
      style: "tech",
      metrics: [{ entity: "sensor.power", label: "Solar Output" }],
    };

    const { root } = await mount({ panels: [panel] }, { appearance: "line-art" });

    const panelEl = root.querySelector<HTMLElement>(".fp-info-panel.tech");
    expect(panelEl).not.toBeNull();

    const cs = getComputedStyle(panelEl!);
    // Background must be crisp white and text must be ink dark
    expect(cs.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(cs.color).toBe("rgb(40, 52, 62)");

    const titleEl = root.querySelector<HTMLElement>(".fp-panel-title");
    expect(getComputedStyle(titleEl!).color).toBe("rgb(40, 52, 62)");
  });
});
