# Floor Summaries & Telemetry Info-Panels

Floor summaries and telemetry callout info-panels ([GitHub Issue #234](https://github.com/nicosandller/easy-floorplan/issues/234)) bring spatial aggregate climate, occupancy, energy, and device metrics into `easy-floorplan` without cluttering your floorplan layout.

This feature provides two complementary presentation layers:
1. **Floor Switcher Aggregate Summaries**: Multi-metric summaries embedded directly on the floor switcher buttons, displaying climate, presence, active lights, and open windows for every floor at a glance.
2. **Spatial Telemetry Info-Panels (Callout HUD Cards)**: Floating callout cards with angled SVG leader lines anchored to rooms, furniture, appliances, or roofs in both 2D and 3D views.

---

## 1. Floor Switcher Aggregate Summaries

The floor switcher lets you monitor the status of all floors simultaneously without clicking between them.

```yaml
type: custom:easy-floorplan-card
floorSummary:
  enabled: true
  decimals: 1
  metrics:
    - temperature
    - humidity
    - presence
    - lights
    - windows
floors:
  - id: ground
    name: Ground Floor
    summary:
      enabled: true
      temperatureEntity: sensor.ground_floor_mean_temp # optional helper override
      humidityEntity: sensor.ground_floor_humidity     # optional helper override
      presenceEntity: binary_sensor.ground_presence    # optional helper override
```

### Automatic Sensor Discovery
A helper entity (`temperatureEntity`, `humidityEntity`, `presenceEntity`) always wins. A dedicated Home Assistant helper, such as a Min/Max sensor averaging the floor's thermometers, is the recommended way to set the floor's figure. Without one, the card looks for candidate sensors on the floor:
- **On the plan**: entities on items, readings, openings, trackers, rooms and panels of that floor.
- **Room / Area linkage**: every entity in the Home Assistant area linked to a room (`area.haArea`), including entities whose device is in that area.
- **Floor-level linkage**: every entity in the Home Assistant areas on the floor's linked Home Assistant floor (`floor.haFloor`).

Sensors are recognised by their `device_class` and unit, never by name, so a thermometer's battery sensor is not counted as a temperature:
- **Temperature**: `sensor` entities with `device_class: temperature` or a °C/°F/K unit, and `climate` entities (`current_temperature`). Mixed °C and °F are converted and rounded to `decimals`.
- **Humidity**: `sensor` entities with `device_class: humidity`, and `climate` entities with `current_humidity`.
- **Presence**: `binary_sensor` entities with `device_class` `occupancy`, `motion` or `presence`, plus `person` and `device_tracker` entities. Shown as `👤 N`.
- **Lights on**: `light` entities that are on (`💡 N`).
- **Openings**: openings on the plan, and `door`, `window`, `garage_door` or `opening` binary sensors that are open (`🪟 N`).

Use `summary.excludeEntities` to leave a sensor out (for example a garage or patio thermometer), and `summary.customText` to write the badge yourself with `{temp}`, `{humidity}`, `{presence}`, `{lights}` and `{windows}` placeholders.

### Options
| Key | Where | Description |
| --- | --- | --- |
| `floorSummary.enabled` | card | Show summaries on every floor (default `false`). |
| `floorSummary.metrics` | card | Which of `temperature`, `humidity`, `presence`, `lights`, `windows` to show (default: all five). |
| `floorSummary.decimals` | card | Decimal places for the temperature (default `1`). |
| `summary.enabled` | floor | Turn this floor's summary on or off, overriding the card setting. |
| `summary.temperatureEntity` / `humidityEntity` / `presenceEntity` | floor | Helper entity used instead of discovery. Setting one also turns the summary on for that floor. |
| `summary.excludeEntities` | floor | Entity ids left out of discovery. |
| `summary.customText` | floor | Badge text template. |

### Visual Editor Integration
1. Click the floor settings button (the floor name dropdown or pencil/cog icon) in the editor header.
2. Toggle **Summary enabled** with a single click.
3. When enabled, optional helper entity pickers (**Temp helper**, **Humidity helper**, **Presence helper**) expand immediately if you prefer to use dedicated Home Assistant Min/Max helpers. When disabled, the helpers remain hidden and summary computations for that floor are omitted.

---

## 2. Spatial Telemetry Info-Panels

Info-panels are floating HUD cards linked by an orthogonal or angled SVG leader line to a specific point on your plan.

![Spatial Telemetry Callout Panels on 2D Floorplan](img/2d-panels.png)

```yaml
floors:
  - id: 1st
    name: First Floor
    panels:
      # Room climate panel, anchored to the living room
      - id: living_room_panel
        targetType: area
        targetId: living_room
        style: tech
        x: 180
        'y': 140
        title: Living Room
        metrics:
          - entity: sensor.living_room_temp
            label: Temperature
            icon: mdi:thermometer
          - entity: sensor.living_room_humidity
            label: Humidity
            icon: mdi:water-percent
          - entity: sensor.living_room_co2
            label: Air Quality
            icon: mdi:molecule-co2
            unit: ppm

      # Compact workstation monitor, anchored to a furniture piece
      - id: workstation_panel
        targetType: furniture
        targetId: desk_pc
        style: minimal
        color: "#ff9100"
        x: 680
        'y': 220
        title: Workstation
        metrics:
          - entity: sensor.workstation_power
            label: Power Draw
            icon: mdi:flash
          - entity: sensor.workstation_cpu_temperature
            label: CPU Temp
```

### Panel options
| Key | Description |
| --- | --- |
| `id` | Unique id of the panel. |
| `x`, `y` | Where the panel's centre sits on the plan. |
| `title` | Header text. Defaults to the linked room's name (or the furniture type), then `Telemetry`. |
| `style` | `tech` (chamfered HUD, default), `minimal` (rounded card) or `pill` (one line). |
| `color` | Accent colour for the border, icons, status dot and leader line. |
| `targetType` | What the leader line points at; see below. |
| `targetId` | Id of the room, furniture piece or roof for `targetType`. |
| `anchor` | `{ x, y }`: an explicit point for the leader line, overriding the target. |
| `showLeaderLine` | `false` hides the leader line. |
| `showIn2D`, `showIn3D` | `false` hides the panel in that view. |
| `showOnlyWhenZoomed` | Only show the panel while its room is zoomed into. |
| `metrics` | Rows: `entity` (required), and optional `label`, `icon`, `unit`, `attribute` (show an attribute instead of the state). |

### Anchor Targets (`targetType`)
Each panel connects to a spatial anchor via an SVG leader line:
| `targetType` | Leader line points at |
| --- | --- |
| `area` | The room named by `targetId`. Without one, the room the panel sits in, or the nearest room. Tapping the panel zooms into that room. |
| `furniture` | The furniture piece named by `targetId`, and follows it when it moves. |
| `roof` | The roof named by `targetId`, or the roof the panel sits over. Projected at roof height in 3D. |
| `floor` / `fixed` | Nothing, unless you set `anchor: { x, y }`. |

### 3D Projection & Outdoor Roof Attachment
In 3D view (`view: 3d`) and outdoor stacked house view (`isOutdoor: true`):
- Panels attached to floors or rooms project at their floor's physical elevation.
- Panels attached to roofs (`targetType: roof`) project at the roof's physical 3D elevation, for exterior rooftop telemetry (e.g. solar PV generation, roof weather stations).
- Leader lines render in 3D isometric space connecting the panel to the 3D surface point.

### Theming
The panel backgrounds are dark in every theme, so panels carry their own text colour. Override them together:
| Variable | Default |
| --- | --- |
| `--fp-panel-bg` | dark navy (per style) |
| `--fp-panel-text` | `#fff` |
| `--fp-panel-accent` | `#00e5ff` (or `color`) |
| `--fp-panel-border` | translucent white (`minimal`, `pill`) |

In the `line-art` appearance, panels switch to a white card with ink text.

### Visual Editor Support
- **Add**: Choose **+ Add → Panel** to drop a new callout panel onto the active floor. It links to the room it sits in (or the nearest room), so it has a leader line straight away.
- **Position**: Drag the panel card to position it on the canvas.
- **Inspector**: Select the panel to set its title, style, accent colour, target type and target, leader line and visibility options, and metrics list.

![Configuring an Info-Panel in the Visual Editor Inspector](img/panel-configuration.png)
