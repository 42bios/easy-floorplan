# Changelog

## Unreleased

- Ambient daylight (`ambientDaylight: true`) now follows solid wall outlines and
  openings instead of named Area boundaries (#319). Interior partitions block the
  wash, and open or glazed doors can carry it into neighbouring rooms within its
  fade distance. Adding or moving Area labels no longer changes wall-derived light.
- This changes existing opt-in plans: if any closed wall outline exists on a floor,
  openings outside closed outlines are ignored even if their rooms have Areas.
  Complete each building's walls to include it. Explicit doors, windows and passages
  can bridge wall gaps when both jambs meet walls; unmarked gaps can still prevent an
  outline from closing. Floors with no closed outline retain the Area-based fallback.
  See the [ambient daylight guide](docs/ambient-daylight.md) for the geometry limits.
- Ambient daylight remains off by default. The direct sunlight and device-light
  layers keep their existing behaviour.
