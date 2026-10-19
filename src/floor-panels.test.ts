// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import "./floorplan-card";
import type { FloorplanCard } from "./floorplan-card";
import type { Floor, FloorInfoPanel, FloorplanCardConfig, HomeAssistant } from "./types";
import { makeFloor } from "./types";

afterEach(() => {
  document.body.innerHTML = "";
});

function createMockHass(states: Record<string, any> = {}): HomeAssistant {
  return {
    states,
    entities: {},
    devices: {},
    areas: {},
    floors: {},
    formatEntityState: (stateObj: any) => {
      const u = stateObj.attributes?.unit_of_measurement;
      return u ? `${stateObj.state} ${u}` : stateObj.state;
    },
    formatEntityAttributeValue: (stateObj: any, attr: string) => String(stateObj.attributes?.[attr] ?? ""),
  } as unknown as HomeAssistant;
}

async function mountCard(config: Partial<FloorplanCardConfig>, hassStates: Record<string, any> = {}) {
  const card = document.createElement("easy-floorplan-card") as FloorplanCard;
  card.setConfig({
    type: "custom:easy-floorplan-card",
    width: 600,
    height: 400,
    ...config,
  } as FloorplanCardConfig);
  card.hass = createMockHass(hassStates);
  document.body.appendChild(card);
  await card.updateComplete;
  return { card, root: card.shadowRoot! };
}

describe("Callout Info-Panels & Leader Lines (Phase 3)", () => {
  it("renders tech info-panel and SVG leader line connected to anchor", async () => {
    const panel: FloorInfoPanel = {
      id: "panel_living",
      x: 350,
      y: 120,
      title: "Living Room Telemetry",
      style: "tech",
      color: "#00e5ff",
      anchor: { x: 200, y: 150 },
      showLeaderLine: true,
      metrics: [
        { entity: "sensor.living_temp", label: "Temperature" },
        { entity: "sensor.living_humidity", label: "Humidity", unit: "%" },
      ],
    };

    const floor: Floor = {
      ...makeFloor("Main Floor"),
      panels: [panel],
    };

    const { root } = await mountCard(
      {
        floors: [floor],
      },
      {
        "sensor.living_temp": { state: "22.4", attributes: { unit_of_measurement: "°C" } },
        "sensor.living_humidity": { state: "48", attributes: { unit_of_measurement: "%" } },
      }
    );

    // Verify SVG Leader line
    const leaderLine = root.querySelector<SVGPathElement>(".fp-panel-leader-line");
    expect(leaderLine).not.toBeNull();
    const d = leaderLine?.getAttribute("d");
    expect(d?.startsWith("M 200 150")).toBe(true);
    expect(d?.endsWith("350 120")).toBe(true);

    const anchorDot = root.querySelector<SVGCircleElement>(".fp-panel-anchor-dot");
    expect(anchorDot?.getAttribute("cx")).toBe("200");
    expect(anchorDot?.getAttribute("cy")).toBe("150");

    // Verify HTML Overlay Panel
    const panelEl = root.querySelector<HTMLElement>(".fp-info-panel");
    expect(panelEl).not.toBeNull();
    expect(panelEl?.classList.contains("tech")).toBe(true);
    expect(panelEl?.getAttribute("data-panel-id")).toBe("panel_living");

    const titleEl = panelEl?.querySelector(".fp-panel-title");
    expect(titleEl?.textContent?.trim()).toBe("Living Room Telemetry");

    const metricRows = panelEl?.querySelectorAll(".fp-panel-metric-row");
    expect(metricRows?.length).toBe(2);

    expect(metricRows?.[0]?.querySelector(".fp-panel-metric-label")?.textContent).toBe("Temperature");
    expect(metricRows?.[0]?.querySelector(".fp-panel-metric-value")?.textContent).toContain("22.4");

    expect(metricRows?.[1]?.querySelector(".fp-panel-metric-label")?.textContent).toBe("Humidity");
    expect(metricRows?.[1]?.querySelector(".fp-panel-metric-value")?.textContent).toContain("48");
  });

  it("renders minimal and pill styled panels properly", async () => {
    const minimalPanel: FloorInfoPanel = {
      id: "p_min",
      x: 100,
      y: 100,
      title: "Compact",
      style: "minimal",
      showLeaderLine: false,
      metrics: [{ entity: "sensor.temp", label: "T" }],
    };
    const pillPanel: FloorInfoPanel = {
      id: "p_pill",
      x: 200,
      y: 200,
      title: "Pill",
      style: "pill",
      showLeaderLine: false,
      metrics: [{ entity: "sensor.temp", label: "T" }],
    };

    const floor: Floor = {
      ...makeFloor("Main Floor"),
      panels: [minimalPanel, pillPanel],
    };

    const { root } = await mountCard(
      { floors: [floor] },
      { "sensor.temp": { state: "21", attributes: { unit_of_measurement: "°C" } } }
    );

    const minEl = root.querySelector<HTMLElement>('.fp-info-panel[data-panel-id="p_min"]');
    expect(minEl?.classList.contains("minimal")).toBe(true);

    const pillEl = root.querySelector<HTMLElement>('.fp-info-panel[data-panel-id="p_pill"]');
    expect(pillEl?.classList.contains("pill")).toBe(true);

    // No leader lines rendered since showLeaderLine is false
    const leaders = root.querySelectorAll(".fp-panel-leader");
    expect(leaders.length).toBe(0);
  });

  it("links panel to room zoom when linked to an area", async () => {
    const panel: FloorInfoPanel = {
      id: "panel_bed",
      x: 250,
      y: 250,
      targetId: "bedroom",
      metrics: [],
    };

    const floor: Floor = {
      ...makeFloor("Main Floor"),
      areas: [
        {
          id: "bedroom",
          name: "Bedroom",
          points: [
            { x: 200, y: 200 },
            { x: 300, y: 200 },
            { x: 300, y: 300 },
            { x: 200, y: 300 },
          ],
        },
      ],
      panels: [panel],
    };

    const { card, root } = await mountCard({ floors: [floor] });

    const panelEl = root.querySelector<HTMLElement>(".fp-info-panel");
    expect(panelEl?.classList.contains("clickable")).toBe(true);

    // Clicking panel zooms into the linked area
    panelEl?.click();
    await card.updateComplete;

    // Zoom-out button should now appear
    const zoomOut = root.querySelector(".zoom-out");
    expect(zoomOut).not.toBeNull();
  });

  it("respects showOnlyWhenZoomed filter", async () => {
    const zoomedOnlyPanel: FloorInfoPanel = {
      id: "panel_detail",
      x: 250,
      y: 250,
      targetId: "bedroom",
      showOnlyWhenZoomed: true,
      metrics: [],
    };

    const floor: Floor = {
      ...makeFloor("Main Floor"),
      areas: [
        {
          id: "bedroom",
          name: "Bedroom",
          points: [
            { x: 200, y: 200 },
            { x: 300, y: 200 },
            { x: 300, y: 300 },
            { x: 200, y: 300 },
          ],
        },
      ],
      panels: [zoomedOnlyPanel],
    };

    const { card, root } = await mountCard({ floors: [floor] });

    // Initially not zoomed: panel should be hidden
    expect(root.querySelector('.fp-info-panel[data-panel-id="panel_detail"]')).toBeNull();

    // Tap the room to zoom in
    const areaTarget = root.querySelector<SVGElement>(".area-tap-target");
    areaTarget?.dispatchEvent(new CustomEvent("action", { detail: { action: "tap" } }));
    await card.updateComplete;

    // Now zoomed in: panel should be visible
    expect(root.querySelector('.fp-info-panel[data-panel-id="panel_detail"]')).not.toBeNull();
  });
});
