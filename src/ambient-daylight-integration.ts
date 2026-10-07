import { nothing, svg, type SVGTemplateResult } from "lit";
import type { Area, Floor, FloorplanCardConfig, Opening, RenderHass, Wall } from "./types";
import { rectAreaSideWalls } from "./editor-geometry";
import {
  CLOUD_DIFFUSE_MIN,
  cloudCover,
  cloudCoverEntityOf,
  cloudFactor,
  glowClearSpan,
  openingClearFraction,
  shutterAmount,
  wallsThatBlock,
} from "./render";
import {
  DEFAULT_AMBIENT_DAYLIGHT_STRENGTH,
  ambientDaylightPatches,
  ambientOpeningSources,
  ambientOpeningTransmission,
} from "./ambient-daylight";
import { renderAmbientDaylight } from "./ambient-daylight-render";
import { ambientWallBlockers, ambientWallClip, ambientWallLights } from "./ambient-daylight-walls";

/** Explicit opt-in: existing plans remain on their old render path. */
export function ambientDaylightEnabled(
  config: Pick<FloorplanCardConfig, "ambientDaylight"> | null | undefined,
): boolean {
  return config?.ambientDaylight === true;
}

export interface AmbientDaylightOpeningState {
  /** Primary opening travel, normalized to 0..1 by the card's existing resolver. */
  amount(opening: Opening): number;
  /** Optional second-leaf travel for two-panel openings. */
  secondAmount(opening: Opening): number | undefined;
}

const noAreas: readonly Area[] = [];
const floorWallMemo = new WeakMap<FloorplanCardConfig, { input: readonly Wall[]; areas: readonly Area[]; walls: Wall[] }>();

/** The card's other layers rebuild generated wall arrays on each render.
 * Derive ours from the original config arrays so topology caches survive HA
 * state updates, including plans with generated room walls and dividers. */
function ambientFloorWalls(floor: Pick<Floor, "walls" | "areas">, config: FloorplanCardConfig): Wall[] {
  const areas = floor.areas.length ? floor.areas : noAreas;
  const hit = floorWallMemo.get(config);
  if (hit?.input === floor.walls && hit.areas === areas) return hit.walls;
  const generated = areas.flatMap(a => rectAreaSideWalls(a.id, a.points, a.sideWalls ?? {}))
    .filter(w => !w.divider);
  // setConfig replaces the config object even if a caller reused its arrays.
  // Give every new config its own wall array to invalidate downstream caches.
  const walls = wallsThatBlock([...floor.walls, ...generated]);
  floorWallMemo.set(config, { input: floor.walls, areas, walls });
  return walls;
}

/**
 * The floor's Areas, each carrying an id no other Area on the floor shares.
 *
 * Area ids are hand-authored, so two rooms can carry the same one. Everything
 * downstream keys on that id twice over — which sources belong to which room,
 * and the clip/filter/gradient ids the SVG resolves by `url(#...)` — so a
 * duplicate does not merely confuse a label. A window in the first room paints
 * a patch into the second, and the second room's patches resolve their clip to
 * the first room's polygon: daylight in a room with no opening at all, shaped
 * like a room somewhere else. `renderAreaBorder` takes the same precaution by
 * handing its clip the array index (see `floorplan-card.ts`).
 *
 * The first Area to claim an id keeps it, so a well-formed plan renders
 * byte-identical markup and only a plan that is already wrong sees a suffix.
 * The loop covers the corner where a real Area is already named like the
 * suffix we would have generated.
 */
function uniquelyIdentified(areas: readonly Area[]): Area[] {
  const taken = new Set(areas.map((area) => area.id));
  const seen = new Set<string>();
  return areas.map((area, index) => {
    if (!seen.has(area.id)) {
      seen.add(area.id);
      return area;
    }
    let id = `${area.id}#${index}`;
    for (let n = 0; taken.has(id); n++) id = `${area.id}#${index}-${n}`;
    taken.add(id);
    seen.add(id);
    return { ...area, id };
  });
}

/**
 * Render the complete diffuse-daylight layer for one active floor.
 *
 * Kept separate from `floorplan-card.ts` so the host card only needs one
 * additive render call. The feature uses the same opening-clear and shutter
 * resolvers as existing light behavior; geometry and SVG painting remain in
 * the pure ambient modules.
 */
export function renderAmbientDaylightLayer(
  floor: Pick<Floor, "areas" | "openings" | "walls">,
  config: FloorplanCardConfig,
  hass: Pick<RenderHass, "states"> | undefined,
  idPrefix: string,
  openingState: AmbientDaylightOpeningState,
): SVGTemplateResult | typeof nothing {
  if (!ambientDaylightEnabled(config)) return nothing;

  const openingsById = new Map(floor.openings.map((opening) => [opening.id, opening]));
  const transmission = (openingId: string): number => {
    const opening = openingsById.get(openingId);
    if (!opening) return 0;
    const clear = openingClearFraction(
      opening,
      openingState.amount(opening),
      openingState.secondAmount(opening),
    );
    const shutterOpen = opening.shutterEntity
      ? shutterAmount(hass?.states[opening.shutterEntity], opening.shutterInvert)
      : 1;
    return ambientOpeningTransmission(opening, clear, shutterOpen);
  };

  const elevation = hass?.states["sun.sun"]?.attributes?.elevation;
  // Clouds thin the sky light far less than the sun's (issue #201) — see
  // CLOUD_DIFFUSE_MIN — and not at all when there is no reading.
  const strength =
    DEFAULT_AMBIENT_DAYLIGHT_STRENGTH *
    cloudFactor(cloudCover(cloudCoverEntityOf(config), hass), CLOUD_DIFFUSE_MIN);
  const walls = ambientFloorWalls(floor, config);
  const blockers = ambientWallBlockers(walls, floor.openings, o => o.sunlight === false ? [0, 0] : glowClearSpan(
    o, openingState.amount(o), openingState.secondAmount(o),
    o.shutterEntity ? shutterAmount(hass?.states[o.shutterEntity], o.shutterInvert) : undefined,
  ));
  const wallLights = ambientWallLights(walls, floor.openings, blockers, elevation, transmission, strength);
  if (wallLights !== undefined) {
    const layers = wallLights.map(light => light
      ? renderAmbientDaylight(light.area, [light.patch], { idPrefix }) : nothing);
    return layers.some(layer => layer !== nothing) ? svg`${layers}` : nothing;
  }

  const areas = uniquelyIdentified(floor.areas);
  const sources = ambientOpeningSources(areas, floor.openings);
  if (sources.length === 0) return nothing;
  const rendered = areas.map((area) => {
    const patches = ambientDaylightPatches(area, sources, elevation, transmission, { strength })
      .map(patch => ambientWallClip(sources.find(source => source.openingId === patch.openingId && source.areaId === patch.areaId)!, patch, blockers));
    return patches.length
      ? renderAmbientDaylight(area, patches, { idPrefix })
      : nothing;
  });
  return rendered.some((layer) => layer !== nothing) ? svg`${rendered}` : nothing;
}
