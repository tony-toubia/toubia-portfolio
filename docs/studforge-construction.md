# How real sets are built (StudForge construction analysis)

StudForge's builders were written from intuition. This analysis measures how official sets are actually put together,
using the LDraw community's part-exact reconstructions (the Official Model Repository, converted to StudForge's format
by `scripts/ldraw/omr-convert.mjs`, see `docs/studforge-ldraw.md`), and measures our own forges of the same subjects in
exactly the same way, so the two can be compared side by side.

- Script: `node scripts/ldraw/analyse.mjs --omr public/studforge/data/omr --lib <ldraw library dir>` (real models + our forges) or `--generated`
  (our forges only). Output: `public/studforge/data/construction.json` (per-subject profiles, loaded by
  `public/studforge/js/construction.js`) and the AUTO block at the end of this file.
- The metrics are computed by `FORGE.construction.measure()` in `construction.js`, which the script loads in a vm and
  the REAL SETS panel runs live on the model on screen, so "this model" in the panel is measured like the real sets.

## What is measured

| metric | definition |
|---|---|
| proportions | grid bounding box of the structure: width (short side) × length (long side) in studs, height in bricks (3 plates). Minifigs, their accessories, hose segments and train track are left out (the converter's `minifig`/`segment` flags plus part names); a baseplate (converter flag `baseplate`) or a display plate (one plate layer under ≥ 60% of the footprint) and flat decoration on it (≤ 2 plates tall, < 10% of the pieces) are measured apart. Without a base, the subject is the largest group of touching parts plus whatever overlaps its footprint, so the second vehicle, the track or the spare parts laid out beside a model do not inflate it. `lenTypical` is the median length of the real sets whose piece count is typical for the subject (Rebrickable p25–p75 from `knowledge.json`), so a 1,000-piece display car does not set the length of a minifig-scale one. |
| base | `plate` (stands on a base plate), `wheels` (stands on its own wheels), `self` |
| hollow | empty cells strictly between the lowest and highest occupied plate of each column, plus whole columns enclosed by walls (2D flood fill from outside), as a share of that envelope; `interior` = the same air as a share of the bounding box. Off-grid parts (about 30% of a real model) fill the cells their baked bounding box covers (`data/ldraw/parts`), so they are not counted as holes; parts whose box encloses space (panels, windows, windscreens, hulls, cockpits, nose cones, arches) claim only the ring of their box. |
| wall thickness | in the middle height band, runs of solid cells with interior air on one side and the outside on the other (median, and the share of 1-, 2- and 3+-stud runs); `solid` when a model has no such walls |
| layer recipe | bottom 15% / middle / top 20% of the height (by a part's lowest plate): share of each part category (plates, bricks, tiles, slopes, round, brackets/SNOT, wheels, windows/doors, hinges/clips/bars, minifig-scale interior items, special) and the top colours |
| build order | progress through the real instruction steps (0 = first step, 1 = last) against height: 5 phases with their mean height and main part kinds, the correlation between step and height, pieces per step, steps per 100 pieces, the median progress at which interior items, mid-height walls and the top band are placed. Every statistic is computed per model, then the median or mean is taken over models (a 519-part single step in 6285 weighs as one model, not as 519 parts). Sub-assemblies are the submodels other than the one holding most of the structure, with a role inferred from their names or position. |
| interiors | seats (4079), steering wheels (3829c01, 30663), control panels (printed tiles and slopes: the converter's printed id names the pattern), tables, beds, furniture: share of sets that have them, how high (0–1), how far along the length, whether walls surround them. Our builders make interiors from plain bricks (H.seat, H.bed, tables, dashboards), which no part id reveals, so for our forges they are read from the model description and reported as "brick-built". |
| techniques | off-grid parts, sideways parts (up axis not vertical), bracket/SNOT, hinge/clip, window, wheel shares; top finish: in each column the part seen from above, `tileTop` = tile columns ÷ (tile + stud columns); `tileTopModern` = the same for the subject's sets from 2005 on (when it has two) |

Generated models have no instruction steps of their own: their "steps" are the build layers (the booklet's order), so
their build order is bottom-up by construction (step/height correlation ≈ 0.99). Subjects with fewer than 3 real sets
are flagged `lowConfidence` in `construction.json` and in the panel, and never steer a forge.

## The data, and its biases

100 converted OMR models, 35 subjects, 2–5 sets for most subjects (13 subjects have 3 or more). Two things to keep in mind
when reading the numbers:

- **Era.** 66 of the 100 sets are from before 2000 (34 from the 1980s). Older sets build differently: no tiles on top,
  4-stud-wide cars, fewer pieces per step. Where it matters the tables split by era (see "By era").
- **Selection.** A few subjects are represented by sets that are not quite the subject: `windmill` is the Wind Turbine
  Transport (a truck), `motorcycle` includes the Motorcycle Shop, `dragon` the Dragon Defender and Dragon Wagon (castle
  carts), `car` includes three large Creator Expert cars (MINI Cooper, Roaring Roadsters, Cool Cruiser) next to two
  minifig-scale ones, `station` includes the City Airport. The medians and `lenTypical` damp this, but read single-set
  and two-set subjects as hints.

## Findings: how real sets are built, and how our forges differ

1. **Vehicles stand on their wheels; ours stand on a display plate.** Every real car, police car, truck, fire truck,
   garbage and monster truck, bus, tractor, construction vehicle and train stands on its own wheels (base `wheels` in
   100% of their sets); helicopters, ships, rovers and most spaceships stand on skids or hulls; only sets that include a
   scene (one of the two ambulances, one of the two motorcycle sets, an airport) have a base plate. Our forges put every
   vehicle on a road or apron plate (base `plate` in all vehicle subjects). For buildings we agree: real houses (100%),
   shops and stations (75%) and farms stand on baseplates.
2. **Minifig-scale vehicles are narrower and shorter than ours.** Real fire trucks are 6 × 16 studs and 6.5 bricks
   tall (p25–p75: 6–7 × 14–17, 5–8 bricks) against our 8 × 18 × 8; police cars 6 × 12 × 6 against our 6 × 14 × 4.7;
   trucks 5 × 13.5 against 8 × 18; garbage trucks 4 × 13 against 8 × 18; monster trucks 4 × 10 against 9.5 × 18.5;
   buses 4 × 14.5 against 8 × 20 (the 4-wide ones are 1980s sets; modern City vehicles are 6 wide, which our cars
   match). Our cabs and bodies are 1–2 studs too wide and our trucks too long.
3. **Buildings: real ones are lower and longer.** Real houses are 16 × 27 studs and 10.7 bricks tall (ours 17.5 × 20 ×
   17.5: half again as tall), shops 13 × 21 × 10.3 (ours 18 × 20 × 16.2), castles 21 × 36 × 19 (ours 20 × 22 × 11:
   real castles are much bigger and taller, and open-backed playsets rather than closed squares).
4. **Real models are hollower, except our buildings.** Air inside the envelope: cars 16% real vs 5% ours, police cars
   24% vs 5%, planes 17% vs 7%, helicopters 30% vs 19%, spaceships 16% vs 1%, castles 34% vs 12%, robots 32% vs 10%,
   dragons 30% vs 3%. Our buildings are the opposite: houses 35% vs 21% real, shops 36% vs 26%, stations 54% vs 29%
   (our rooms are big empty boxes; real buildings fill their floor with furniture, stairs and a second storey).
5. **Walls: 1 stud in buildings, 1–2 in vehicles.** Real houses, shops, trains, buses, trucks and police cars have
   1-stud walls like ours; real fire trucks, castles, helicopters, rockets and creatures measure 2 (castle walls are
   doubled, vehicle sides carry a second layer of panels, brackets or slopes). Ours are 1 almost everywhere.
6. **Interiors are standard in real vehicles.** A steering wheel (3829c01) is in 100% of real cars, police cars, trucks,
   tractors and monster trucks, 75% of fire trucks and construction vehicles, 80% of spaceships; printed control panels
   in 80% of cars and 60% of planes and spaceships; seats (4079) in 25–75%. They sit at 0.3–0.5 of the height and are
   enclosed by walls (`inside` 0.75–1). Our vehicle builders (fire truck, ambulance, truck, garbage and monster trucks,
   planes, boats) DO build seats, a steering wheel and a dashboard, but from plain bricks and tiles; police cars, cars,
   buses, tractors, rockets and spaceships have none.
7. **Build order: chassis, then the interior, then the body, roof last, wheels at the very end.** Real vehicles place
   interior items at a median progress of 0.3–0.5 (police car 0.30, fire truck 0.45, spaceship 0.25), before the
   mid-height walls (0.63–0.66) and the top band (0.88). The last phase of real fire trucks and police cars is made of
   wheels (mean height drops back to 0.46–0.49 in the final 20% of the steps). The step/height correlation is 0.35–0.6
   for real models against 0.99 for ours: real instructions build in modules, ours strictly layer by layer.
8. **Smaller steps, and sub-assemblies.** Real sets add 4.4–6 pieces per step to vehicles (fire truck 4.4, castle 4.6,
   police car 6.1) against our 7–17 (ours: one step per plate layer; castle 14.4, house 13.6, bus 14.4). 80–100% of real
   castles, planes, cars, trains, spaceships and rockets build sub-assemblies apart (castle towers, doors and weapons,
   plane wings and engines), 29% of a castle's pieces; ours never do.
9. **Tiles are an era marker.** Real vehicles from before 1990 have 0% tiled tops, 1990–2004 21%, 2005 on 31%
   (buildings: 0%, 0%, 16%). Our forges already tile 30–50% of vehicle tops (fire truck 33%, cars 30%, motorcycles 50%,
   trains 25%) and 14% of house tops, i.e. like modern sets; the tile post-pass only fills the gap where a subject's real
   (modern) share is above ours.
10. **Techniques we under-use: hinges, clips and off-grid parts.** Real fire trucks are 16% hinges/clips/bars (ladder
    turntables, hinged lockers, hoses on clips) and 28% off-grid parts; real helicopters, spaceships, dragons and rovers
    15–27% hinges. Ours: 0–1% on vehicles (creatures excepted: dragon 23%). Brackets are rare in both (2–6%).

## Generator wiring (what this changes)

- `ctx.construction` (builders): the subject's profile, `FORGE.construction.profile(knowledgeSubjectId)`, or null.
- Length calibration (`BrickGenerator.calibrateLength`): for vehicles, buildings and castles whose subject has three or
  more real sets, a forge whose body (display base excluded) is under 0.7× or over 1.4× the subject's `lenTypical` is
  forged once more at a scale nudged toward it (×0.75…×1.35, on top of the piece-count nudge) and kept when it lands
  nearer. Prompts with a size word, minifig scale, scenes and blueprints are left alone. `model.construction.length`
  reports it. With the current data it grows castles (22 → 28 studs long; real typical 36), planes (biplane, fighter jet
  21 → 26) and shops, and bullet trains a little; everything else is already within range.
- Tile finishing (`FORGE.construction.finishTops`, run in `assemble` after anchoring): exposed top plates (nothing on,
  over or linked into them, not the two lowest layers, not struts) become tiles of the same footprint, then longer
  plates are split into tiles covering the same cells (undone if any part would lose its path to the ground), until the
  model's tile share reaches the subject's real one (`tileTopModern` when it has two modern sets, else `tileTop`).
  `model.construction.tops` reports `{ from, to, target, tiled, split }`. With the current data our forges are already
  at or above the real shares, so it rarely acts; it was stress-tested with a 70% target on every subject (136 harness
  prompts and the 612-forge option sweep: 0 overlaps, 0 loose parts).
- Both act only on profiles with `source: "omr"`, three or more sets and no `lowConfidence`.
- REAL SETS panel: a "HOW REAL SETS ARE BUILT" section (typical size and base, hollowness, wall thickness, tiled tops,
  brackets and hinges, pieces per step, interior elements, build order and sub-assemblies) with the model on screen
  measured the same way, values far from the real ones highlighted, and the low-confidence warning.

## Recommendations per builder (what builder code should change; not done here)

- **All vehicle builders (`car`, fire truck, ambulance, police, truck, bus, garbage, monster truck, tractor):** drop the
  display plate and let the vehicle stand on its wheels (real base `wheels` in every vehicle subject). Build 6 wide, not
  8 (fire truck 6 × 16 × 6.5 bricks, police car 6 × 12 × 6, truck 5–6 × 13.5); shorten trucks to 13–16 studs. Add the
  real interior parts to the catalog: seat 4079 and steering stand 3829c01 (and a printed control-panel tile), then put
  one steering wheel and one seat in every cab at 0.3–0.5 of the height, enclosed by the cab walls. Car and police car
  builders have no interior at all today.
- **Fire truck:** add hinged/clipped detail (16% hinges and clips in real sets): a ladder on a turntable (3679/3680 are
  in the catalog), lockers with hinged doors, hoses on clips. Keep the height at 5–8 bricks (ours 8).
- **Plane / helicopter / spaceship:** hollow fuselages with a cockpit (real air share 17–30% vs our 1–19%), a seat and a
  control panel in 40–60% of real planes and spaceships, wings and engines as sub-assemblies (80% of real planes);
  planes should be longer than wide (real 28 × 32 wingspan × length, ours 16.5 × 17).
- **House / shop / station:** lower (real houses 10.7 bricks, shops 10.3, ours 16–17.5) and longer footprints (w:l
  0.6–0.66 real vs 0.94 ours); fill the rooms (real 21–29% air vs our 35–54%): counters, a second floor, stairs, a
  vehicle; real fire stations and shops include the vehicle (steering 75%).
- **Castle:** bigger and taller (21 × 36 × 19 bricks real vs 20 × 22 × 11), open-backed playset walls 2 studs thick,
  towers, gate doors and weapons as sub-assemblies (100% of real castles), more air inside (34% vs 12%).
- **Creatures (dragon, robot):** hollow bodies (30% air in real dragons and robots vs our 3–10%), more hinges and
  off-grid limbs (real robots 31% hinges, 64% off-grid).
- **Instructions (`instructions.js` / generator steps):** real steps add 4–6 pieces; ours are one per plate layer
  (7–17). Splitting a layer into 2–3 steps, building the interior before the walls and fitting the wheels last would
  read like a real booklet.

## Per-subject numbers

<!-- AUTO:BEGIN (scripts/ldraw/analyse.mjs rewrites this block) -->
_Generated 2026-10-12 by `node scripts/ldraw/analyse.mjs`; source: 100 converted LDraw OMR models._

### By era (all real models of a family)

| family | era | n | tiled tops | hollow | brackets | hinges/clips | off-grid | pcs/step | with interior items |
|---|---|---|---|---|---|---|---|---|---|
| vehicles | pre1990 | 30 | 0% | 23% | 3% | 10% | 24% | 6.1 | 80% |
| vehicles | 1990to2004 | 17 | 21% | 21% | 4% | 14% | 28% | 6.9 | 88% |
| vehicles | from2005 | 16 | 31% | 11% | 4% | 11% | 34% | 4.56 | 69% |
| buildings | pre1990 | 11 | 0% | 25% | 2% | 4% | 15% | 7.47 | 45% |
| buildings | 1990to2004 | 7 | 0% | 34% | 2% | 4% | 22% | 7.92 | 57% |
| buildings | from2005 | 5 | 16% | 24% | 4% | 7% | 25% | 3.92 | 40% |

### At a glance: real sets vs our forges

| subject | real n | real w × l × h (studs, bricks) | ours w × l × h | real hollow | ours hollow | real wall | ours wall | real tiled tops | ours tiled tops | real pcs/step | ours pcs/step | real interiors | ours interiors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ambulance | 2 | 6 × 18.5 × 7.7 | 8 × 18 × 6 | 27% | 23% | 1.5 | 1 | 14% | 16% | 5.92 | 9.46 | steering 100%, seat 50% | seat 100% (brick-built), steering 100% (brick-built), panel 100% (brick-built) |
| animal | 2 | 5 × 9 × 4.8 | 7 × 20.5 × 7.5 | 7% | 0% | 1.5 | 3 | 36% | 4% | 16.2 | 3.33 | none | none |
| bird | 1 | 3 × 7 × 2.3 | 4.5 × 6 × 5.2 | 12% | 0% | 1.5 | solid | 0% | 29% | 4.92 | 2.08 | none | none |
| boat | 4 | 7 × 20.5 × 8.2 | 6 × 19 × 5.7 | 32% | 22% | 1 | 1 | 21% | 6% | 19.4 | 7.25 | steering 50%, seat 50% | seat 75% (brick-built), steering 25% (brick-built), panel 25% (brick-built), table 75% (brick-built) |
| bridge | 1 | 50 × 54 × 9 | 6 × 32 × 5.3 | 20% | 2% | 1 | 1 | 51% | 24% | 3.92 | 10.22 | none | none |
| bus | 2 | 4 × 14.5 × 7 | 8 × 20 × 6 | 24% | 18% | 1 | 1 | 21% | 10% | 5.27 | 14.38 | panel 50%, seat 50%, steering 50% | none |
| car | 5 | 14 × 30 × 8 | 6 × 14 × 4.7 | 16% | 5% | 3 | 1 | 27% | 30% | 5.08 | 6.88 | panel 80%, steering 100% | none |
| castle | 5 | 21 × 36 × 19 | 20 × 22 × 11.3 | 34% | 12% | 2 | 1 | 0% | 2% | 4.63 | 14.4 | none | seat 100% (brick-built) |
| construction | 4 | 5 × 11 × 5.7 | – | 7% | – | 2 | solid | 0% | – | 10.49 | – | steering 75%, seat 25% | – |
| dragon | 2 | 10 × 15.5 × 12.3 | 23 × 32 × 12 | 30% | 3% | 1.5 | 2 | 0% | 2% | 3.24 | 4.26 | none | none |
| farm | 2 | 43 × 51 × 22.3 | 15.5 × 18 × 12.7 | 27% | 26% | 1.5 | 1 | 6% | 15% | 6.58 | 9.9 | seat 100%, steering 50% | none |
| fireTruck | 4 | 6 × 16 × 6.5 | 8 × 18 × 8 | 18% | 25% | 2 | 1 | 22% | 33% | 4.39 | 7.32 | steering 75%, bed 25%, furniture 25%, seat 25%, panel 25% | seat 100% (brick-built), steering 100% (brick-built), panel 100% (brick-built) |
| garbageTruck | 2 | 4 × 13 × 6.5 | 8 × 18 × 5.7 | 25% | 23% | 1 | 1 | 5% | 12% | 3.21 | 10 | steering 50% | seat 100% (brick-built), steering 100% (brick-built), panel 100% (brick-built) |
| helicopter | 4 | 6 × 15.5 × 7.8 | 10.5 × 16 × 4.2 | 28% | 19% | 3 | 1.5 | 20% | 7% | 5.98 | 3.04 | steering 50%, seat 25%, panel 25% | seat 50% (brick-built) |
| house | 5 | 16 × 27 × 10.7 | 17.5 × 20 × 17.5 | 20% | 35% | 1 | 1 | 16% | 14% | 10.85 | 13.55 | seat 20% | furniture 100% (brick-built), seat 25% (brick-built), table 25% (brick-built), bed 13% (brick-built) |
| lighthouse | 1 | 16 × 33 × 20 | 16 × 16 × 13.7 | 44% | 36% | 2 | 1 | 16% | 1% | 160 | 4.1 | steering 100% | none |
| monsterTruck | 2 | 4 × 10 × 5.8 | 9.5 × 18.5 × 6.2 | 15% | 12% | 2 | 1.25 | 17% | 20% | 5.2 | 10.18 | steering 100% | seat 100% (brick-built), steering 100% (brick-built), panel 100% (brick-built) |
| motorcycle | 2 | 14 × 19 × 7.2 | 6 × 9 × 3.7 | 13% | 11% | 1.5 | 1 | 6% | 50% | 13.9 | 3.83 | seat 50%, panel 50% | none |
| pirateShip | 2 | 27 × 66 × 34.7 | 6 × 23 × 8.3 | 42% | 28% | 3.5 | 1 | 3% | 1% | 12.92 | 6.65 | none | none |
| plane | 5 | 28 × 32 × 10.7 | 16.5 × 17 × 5 | 16% | 7% | 1 | 1 | 2% | 0% | 7.84 | 4.62 | seat 40%, panel 60%, bed 20%, steering 20% | seat 100% (brick-built), panel 100% (brick-built) |
| policeCar | 3 | 6 × 12 × 6 | 6 × 14 × 4.7 | 24% | 5% | 1 | 1 | 0% | 18% | 6.09 | 7.06 | steering 100%, seat 33% | none |
| robot | 2 | 6.5 × 10 × 9.5 | 4 × 10 × 8.3 | 32% | 10% | 2 | 1 | 5% | 17% | 9.38 | 2.94 | panel 50% | none |
| rocket | 4 | 9 × 13 × 7 | 6 × 9 × 12.7 | 11% | 10% | 2 | 2 | 26% | 3% | 4.97 | 1.96 | steering 50%, panel 50% | none |
| rover | 2 | 7 × 11.5 × 6.8 | 6.5 × 9 × 5.3 | 12% | 26% | 3 | 1 | 0% | 6% | 9.66 | 3.06 | none | none |
| seaCreature | 2 | 13.5 × 15 × 13 | 10 × 14 × 4.3 | 16% | 11% | 2 | 7.5 | 2% | 3% | 31.27 | 4.18 | furniture 50%, seat 50% | none |
| ship | 2 | 6 × 21 × 8 | 6 × 23 × 5.7 | 21% | 23% | 1.5 | 1 | 0% | 2% | 73.5 | 7.9 | steering 50% | seat 100% (brick-built), table 100% (brick-built) |
| shop | 4 | 13 × 21 × 10.3 | 18 × 20 × 16.2 | 26% | 36% | 1 | 1 | 0% | 14% | 6.22 | 13.29 | seat 50%, steering 75% | furniture 88% (brick-built), seat 13% (brick-built), table 13% (brick-built) |
| spaceship | 5 | 9 × 15 × 7.7 | 9.5 × 14.5 × 5.7 | 16% | 1% | 1 | 1.5 | 0% | 5% | 4 | 4.47 | steering 80%, panel 60%, furniture 20% | none |
| spaceStation | 2 | 16.5 × 32.5 × 6.3 | 7.5 × 16.5 × 6.8 | 22% | 12% | 1.5 | 1.5 | 0% | 3% | 11.2 | 2.98 | panel 100%, steering 50% | none |
| station | 4 | 27.5 × 50.5 × 19.7 | 16.5 × 18 × 16.7 | 28% | 54% | 1.5 | 1 | 0% | 5% | 10.68 | 9.91 | seat 75%, steering 75%, furniture 25%, panel 50% | bed 50% (brick-built), furniture 50% (brick-built) |
| tower | 1 | 8 × 17 × 16 | 7.5 × 7.5 × 12.8 | 46% | 10% | 2 | 1 | 0% | 0% | 6.16 | 2.86 | none | none |
| tractor | 2 | 6 × 17 × 7.3 | 8.5 × 13.5 × 6 | 17% | 10% | 1 | 1 | 2% | 16% | 3.57 | 5.49 | steering 100% | none |
| train | 5 | 7 × 21 × 9.3 | 10 × 36 × 7 | 29% | 21% | 1 | 1 | 0% | 25% | 33 | 14.56 | steering 20%, seat 20% | seat 100% (brick-built), table 100% (brick-built) |
| truck | 4 | 5 × 13.5 × 7.5 | 8 × 18 × 5.3 | 15% | 13% | 1.25 | 1 | 16% | 12% | 4.64 | 9.5 | steering 100%, seat 25%, furniture 25% | seat 100% (brick-built), steering 100% (brick-built), panel 100% (brick-built) |
| windmill | 1 | 8 × 21 × 9.3 | 11.5 × 12 × 7.7 | 18% | 14% | 2 | 1 | 38% | 1% | 2.49 | 3.31 | seat 100%, steering 100%, furniture 100% | none |

### ambulance (2 real: 6364-1 Paramedic Unit; 6666-1 Ambulance)

| metric | real sets | ours (2 forges: "ambulance") |
|---|---|---|
| width × length (studs) | 6 (5–7) × 18.5 (15.8–21.3) | 8 (8–8) × 18 (18–18) |
| height (bricks) | 7.7 (7.3–8) | 6 (6–6) |
| pieces (structure) | 93.5 (79.8–107.3) | 123 (123–123) |
| length of typical-size sets | 18.5 (15.8–21.3) (2 sets) | 18 (18–18) (2 sets) |
| w:l, h:l | 0.32, 0.45 | 0.44, 0.33 |
| base | plate (plate 50%, wheels 50%) | plate (plate 100%) |
| hollow (air in envelope) | 27% (interior 15% of the box) | 23% (interior 12% of the box) |
| wall thickness | 1.5 stud (1: 55%, 2: 28%, 3+: 17%) | 1 stud (1: 80%, 2: 2%, 3+: 17%) |
| bottom band mix | wheel 31%, brick 24%, plate 18%; BLACK 48%, WHITE 20%, RED 15% | wheel 100%; LIGHT_GREY 100% |
| middle band mix | plate 41%, brick 20%, window 13%; WHITE 51%, RED 22%, TRANS_BLUE 8% | plate 45%, brick 23%, tile 12%; WHITE 48%, BLACK 28%, TRANS_CLEAR 6% |
| top band mix | tile 50%, plate 34%, brick 17%; WHITE 63%, TRANS_BLUE 38% | plate 75%, tile 25%; LIGHT_GREY 75%, RED 25% |
| steps, pcs/step, steps/100 pcs | 15.5, 5.92, 17.63 | 13, 9.46, 10.57 |
| step vs height correlation | 0.62 | 0.98 |
| build phases (mean height, top parts) | 0.13 plate → 0.19 plate → 0.17 brick → 0.47 brick → 0.62 plate | 0.2 plate → 0.34 plate → 0.47 brick → 0.69 brick → 0.89 tile |
| interior / walls / roof at (progress) | 0.46 / 0.66 / 0.97 | – / 0.67 / 0.92 |
| sub-assemblies | 50% of models, 0.5 per model, 18% of pieces; roles body×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 100% h0.24 in50%; seat 50% h0.04 in0% | seat 100% brick-built; steering 100% brick-built; panel 100% brick-built |
| tiled tops (tile / tile+studs) | 14% (tops: tile 8%, studs 52%, slope 15%) | 16% (tops: tile 11%, studs 59%, slope 15%) |
| off-grid, sideways, brackets, hinges | 32%, 6%, 3%, 6% | 0%, 5%, 5%, 0% |
| part mix | plate 34%, brick 21%, wheel 10%, tile 10%, window 9%, hinge 6%, special 4% | plate 45%, brick 20%, tile 12%, wheel 10%, snot 5%, slope 5%, round 2% |

### animal (2 real: 6022-1 Horse Cart; 30026-1 Panda)

| metric | real sets | ours (12 forges: "a giraffe", "elephant", "cat") |
|---|---|---|
| width × length (studs) | 5 (4.5–5.5) × 9 (9–9) | 7 (6.8–11) × 20.5 (16–21.3) |
| height (bricks) | 4.8 (4.1–5.6) | 7.5 (5–10) |
| pieces (structure) | 42 (33–51) | 60 (52.8–64.3) |
| length of typical-size sets | – (1 sets of typical size) | 21 (18.5–21.8) (10 sets) |
| w:l, h:l | 0.56, 0.53 | 0.47, 0.4 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 7% (interior 3% of the box) | 0% (interior 0% of the box) |
| wall thickness | 1.5 stud (1: 36%, 2: 45%, 3+: 19%) | 3 stud (1: 0%, 2: 75%, 3+: 25%) |
| bottom band mix | wheel 54%, slope 42%, round 4%; BROWN 50%, BLACK 34%, WHITE 13% | brick 72%, round 25%, plate 2%; LIGHT_GREY 28%, BROWN 21%, YELLOW 14% |
| middle band mix | plate 28%, hinge 26%, brick 14%; BLACK 80%, WHITE 18%, LIGHT_GREY 3% | plate 71%, brick 17%, round 8%; BROWN 21%, YELLOW 16%, LIGHT_GREY 16% |
| top band mix | special 50%, slope 50%; WHITE 50%, RED 25%, YELLOW 25% | plate 34%, round 33%, tile 21%; BLACK 36%, WHITE 16%, YELLOW 12% |
| steps, pcs/step, steps/100 pcs | 6, 16.2, 22.5 | 17.5, 3.33, 30.16 |
| step vs height correlation | 0.49 | 0.99 |
| build phases (mean height, top parts) | 0.31 hinge → 0.29 wheel → 0.46 brick → 0.63 hinge → 0.56 wheel | 0.16 brick → 0.36 plate → 0.52 plate → 0.74 plate → 0.91 round |
| interior / walls / roof at (progress) | – / 0.22 / 1 | – / 0.43 / 0.92 |
| sub-assemblies | 50% of models, 0.5 per model, 17% of pieces; roles body×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 36% (tops: tile 14%, studs 46%, slope 19%) | 4% (tops: tile 4%, studs 88%, slope 3%) |
| off-grid, sideways, brackets, hinges | 23%, 4%, 2%, 21% | 0%, 0%, 0%, 2% |
| part mix | plate 23%, hinge 21%, slope 16%, brick 12%, special 11%, wheel 10%, tile 5% | plate 56%, brick 22%, round 13%, tile 3%, slope 3%, hinge 2% |

### bird (1 real: 4917-1-bird Mini Robots (Bird))

| metric | real sets | ours (8 forges: "parrot", "penguin", "flamingo") |
|---|---|---|
| width × length (studs) | 3 (3–3) × 7 (7–7) | 4.5 (4–5.3) × 6 (6–6) |
| height (bricks) | 2.3 (2.3–2.3) | 5.2 (5–6.1) |
| pieces (structure) | 64 (64–64) | 28 (27–30.3) |
| length of typical-size sets | – (1 sets of typical size) | – (0 sets of typical size) |
| w:l, h:l | 0.43, 0.33 | 0.75, 0.86 |
| base | self (self 100%) | plate (plate 100%) |
| hollow (air in envelope) | 12% (interior 6% of the box) | 0% (interior 0% of the box) |
| wall thickness | 1.5 stud (1: 50%, 2: 17%, 3+: 33%) | solid |
| bottom band mix | slope 50%, hinge 25%, plate 25%; WHITE 75%, BLUE 25% | round 100%; ORANGE 46%, BROWN 21%, PINK 18% |
| middle band mix | plate 42%, hinge 21%, tile 11%; BLACK 42%, DARK_GREY 21%, WHITE 16% | plate 59%, slope 22%, hinge 10%; PINK 25%, BLUE 22%, RED 21% |
| top band mix | hinge 32%, slope 22%, plate 19%; BLUE 30%, WHITE 27%, DARK_GREY 14% | round 26%, tile 26%, slope 26%; BLACK 30%, WHITE 26%, ORANGE 24% |
| steps, pcs/step, steps/100 pcs | 13, 4.92, 20.31 | 13.5, 2.08, 48.22 |
| step vs height correlation | 0.42 | 0.99 |
| build phases (mean height, top parts) | 0.57 plate → 0.81 slope → 0.31 slope → 0.83 hinge → 0.93 hinge | 0.19 round → 0.44 plate → 0.57 plate → 0.76 plate → 0.91 round |
| interior / walls / roof at (progress) | – / – / 0.83 | – / 0.28 / 0.92 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 0% (tops: tile 0%, studs 12%, slope 12%) | 29% (tops: tile 13%, studs 34%, slope 53%) |
| off-grid, sideways, brackets, hinges | 83%, 5%, 0%, 28% | 0%, 0%, 0%, 7% |
| part mix | hinge 28%, plate 27%, slope 20%, round 14%, special 6%, tile 5% | plate 43%, slope 21%, round 19%, hinge 7%, tile 7%, brick 4% |

### boat (4 real: 311-1 Ferry; 6698-1 RV with Speedboat; 6679-1 Dark Shark; 4643-1 Power Boat Transporter)

| metric | real sets | ours (8 forges: "speedboat", "tugboat", "boat") |
|---|---|---|
| width × length (studs) | 7 (5.8–8) × 20.5 (10.3–32.5) | 6 (5.5–6) × 19 (18–19) |
| height (bricks) | 8.2 (7.1–9.1) | 5.7 (5.3–6.3) |
| pieces (structure) | 70 (51.8–119.8) | 84.5 (80.5–86.3) |
| length of typical-size sets | 20.5 (10.3–32.5) (4 sets) | 19 (18–19) (8 sets) |
| w:l, h:l | 0.36, 0.49 | 0.32, 0.3 |
| base | wheels (self 25%, wheels 75%) | plate (plate 100%) |
| hollow (air in envelope) | 32% (interior 15% of the box) | 22% (interior 10% of the box) |
| wall thickness | 1 stud (1: 65%, 2: 21%, 3+: 15%) | 1 stud (1: 79%, 2: 15%, 3+: 6%) |
| bottom band mix | wheel 29%, special 26%, plate 14%; BLACK 40%, RED 30%, LIGHT_GREY 14% | plate 69%, brick 17%, slope 12%; WHITE 95%, BROWN 2%, TAN 2% |
| middle band mix | plate 23%, brick 16%, round 14%; RED 24%, BLACK 19%, WHITE 15% | plate 45%, brick 21%, tile 10%; WHITE 44%, TAN 22%, DARK_GREY 9% |
| top band mix | hinge 46%, round 18%, plate 14%; BLACK 28%, YELLOW 26%, BLUE 25% | round 42%, tile 34%; WHITE 34%, BROWN 25%, LIGHT_GREY 17% |
| steps, pcs/step, steps/100 pcs | 5.5, 19.4, 10.14 | 12, 7.25, 13.81 |
| step vs height correlation | 0.91 | 0.98 |
| build phases (mean height, top parts) | 0.34 plate → 0.34 wheel → 0.4 plate → 0.46 window → 0.72 hinge | 0.11 plate → 0.34 plate → 0.56 hinge → 0.6 plate → 0.77 tile |
| interior / walls / roof at (progress) | 0.44 / 0.35 / 0.49 | – / 0.36 / 0.91 |
| sub-assemblies | 25% of models, 0.5 per model, 13% of pieces; roles body×1, upper×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 50% h0.53 in100%; seat 50% h0.41 in75% | seat 75% brick-built; steering 25% brick-built; panel 25% brick-built; table 75% brick-built |
| tiled tops (tile / tile+studs) | 21% (tops: tile 7%, studs 30%, slope 14%) | 6% (tops: tile 10%, studs 77%, slope 7%) |
| off-grid, sideways, brackets, hinges | 21%, 10%, 4%, 11% | 0%, 0%, 0%, 4% |
| part mix | plate 21%, round 15%, brick 14%, hinge 11%, slope 8%, special 7%, wheel 7% | plate 49%, brick 20%, slope 10%, tile 9%, round 7%, hinge 4%, window 3% |

### bridge (1 real: 8135-1 Bridge Chase)

| metric | real sets | ours (2 forges: "bridge") |
|---|---|---|
| width × length (studs) | 50 (50–50) × 54 (54–54) | 6 (6–6) × 32 (32–32) |
| height (bricks) | 9 (9–9) | 5.3 (5.3–5.3) |
| pieces (structure) | 569 (569–569) | 92 (92–92) |
| length of typical-size sets | – (1 sets of typical size) | – (0 sets of typical size) |
| w:l, h:l | 0.93, 0.17 | 0.19, 0.17 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 20% (interior 2% of the box) | 2% (interior 1% of the box) |
| wall thickness | 1 stud (1: 54%, 2: 25%, 3+: 21%) | 1 stud (1: 90%, 2: 10%, 3+: 0%) |
| bottom band mix | plate 27%, special 21%, wheel 12%; BLACK 50%, WHITE 10%, TAN 8% | brick 100%; LIGHT_GREY 63%, GREEN 38% |
| middle band mix | plate 30%, special 23%, brick 14%; WHITE 33%, BLACK 20%, TAN 12% | plate 57%, tile 22%, brick 15%; DARK_GREY 37%, GREEN 31%, LIGHT_GREY 26% |
| top band mix | round 50%, special 25%, wheel 10%; WHITE 60%, BLACK 30%, LIGHT_GREY 5% | snot 50%, tile 50%; BLACK 50%, TRANS_ORANGE 50% |
| steps, pcs/step, steps/100 pcs | 145, 3.92, 25.48 | 9, 10.22, 9.78 |
| step vs height correlation | 0.4 | 0.95 |
| build phases (mean height, top parts) | 0.11 plate → 0.18 plate → 0.29 special → 0.31 plate → 0.38 special | 0.19 brick → 0.31 plate → 0.41 plate → 0.5 plate → 0.83 hinge |
| interior / walls / roof at (progress) | – / 0.65 / 0.87 | – / 0.13 / 1 |
| sub-assemblies | 100% of models, 15 per model, 81% of pieces; roles body×14, upper×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 51% (tops: tile 27%, studs 26%, slope 4%) | 24% (tops: tile 24%, studs 76%, slope 0%) |
| off-grid, sideways, brackets, hinges | 36%, 15%, 4%, 5% | 0%, 4%, 4%, 4% |
| part mix | plate 27%, special 22%, brick 9%, round 9%, slope 8%, tile 8%, wheel 7% | plate 42%, brick 28%, tile 21%, hinge 4%, snot 4% |

### bus (2 real: 6694-1 Car with Camper; 6351-1 Surf N' Sail Camper)

| metric | real sets | ours (4 forges: "school bus", "bus") |
|---|---|---|
| width × length (studs) | 4 (4–4) × 14.5 (12.8–16.3) | 8 (8–8) × 20 (20–20) |
| height (bricks) | 7 (6.7–7.3) | 6 (6–6) |
| pieces (structure) | 89.5 (75.3–103.8) | 172.5 (169–176) |
| length of typical-size sets | – (0 sets of typical size) | 20 (20–20) (4 sets) |
| w:l, h:l | 0.29, 0.51 | 0.4, 0.3 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 24% (interior 16% of the box) | 18% (interior 10% of the box) |
| wall thickness | 1 stud (1: 77%, 2: 11%, 3+: 12%) | 1 stud (1: 53%, 2: 45%, 3+: 2%) |
| bottom band mix | wheel 64%, plate 19%, slope 12%; BLACK 58%, WHITE 23%, BLUE 8% | wheel 100%; LIGHT_GREY 100% |
| middle band mix | plate 41%, brick 15%, hinge 12%; WHITE 57%, BLUE 17%, RED 6% | plate 35%, brick 34%, slope 10%; BLACK 25%, DARK_BLUE 23%, YELLOW 21% |
| top band mix | plate 33%, window 12%, hinge 6%; WHITE 24%, BLUE 14%, TRANS_CLEAR 12% | plate 86%, tile 14%; RED 45%, BLACK 41%, TRANS_RED 9% |
| steps, pcs/step, steps/100 pcs | 17, 5.27, 21.14 | 12, 14.38, 6.96 |
| step vs height correlation | 0.63 | 0.98 |
| build phases (mean height, top parts) | 0.16 plate → 0.27 plate → 0.48 plate → 0.72 plate → 0.63 wheel | 0.2 plate → 0.34 plate → 0.47 brick → 0.64 brick → 0.83 slope |
| interior / walls / roof at (progress) | 0.56 / 0.63 / 0.75 | – / 0.73 / 0.91 |
| sub-assemblies | 50% of models, 0.5 per model, 8% of pieces; roles upper×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | panel 50% h0.43 in100%; seat 50% h0.3 in100%; steering 50% h0.28 in100% | none |
| tiled tops (tile / tile+studs) | 21% (tops: tile 9%, studs 29%, slope 12%) | 10% (tops: tile 9%, studs 83%, slope 0%) |
| off-grid, sideways, brackets, hinges | 15%, 2%, 2%, 11% | 0%, 4%, 4%, 0% |
| part mix | plate 43%, hinge 11%, brick 11%, slope 10%, window 9%, wheel 7%, tile 6% | plate 38%, brick 31%, slope 9%, window 8%, tile 5%, wheel 5%, snot 4% |

### car (5 real: 5934-1 Dino Explorer; 4896-1 Roaring Roadsters; 5767-1 Cool Cruiser; 10242-1 MINI Cooper; 76897-1 1985 Audi Sport quattro S1)

| metric | real sets | ours (8 forges: "yellow sports car with a racing stripe", "convertible", "race car") |
|---|---|---|
| width × length (studs) | 14 (10–16) × 30 (20–30) | 6 (6–6) × 14 (14–14) |
| height (bricks) | 8 (5.3–9.7) | 4.7 (4.5–4.7) |
| pieces (structure) | 593 (250–922) | 78.5 (71.5–84) |
| length of typical-size sets | 17.5 (16.3–18.8) (2 sets) | 14 (14–14) (8 sets) |
| w:l, h:l | 0.47, 0.27 | 0.43, 0.33 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 16% (interior 10% of the box) | 5% (interior 2% of the box) |
| wall thickness | 3 stud (1: 25%, 2: 22%, 3+: 54%) | 1 stud (1: 64%, 2: 8%, 3+: 27%) |
| bottom band mix | plate 29%, wheel 19%, special 13%; BLACK 33%, LIGHT_GREY 22%, WHITE 14% | wheel 53%, plate 47%; BLACK 56%, LIGHT_GREY 44% |
| middle band mix | plate 31%, tile 14%, brick 12%; BLACK 24%, LIGHT_GREY 16%, YELLOW 13% | plate 48%, brick 21%, slope 12%; RED 39%, BLACK 16%, YELLOW 13% |
| top band mix | plate 29%, interior 20%, tile 18%; WHITE 26%, TRANS_CLEAR 20%, BLACK 18% | tile 25%, plate 25%, slope 25%; RED 38%, WHITE 25%, YELLOW 13% |
| steps, pcs/step, steps/100 pcs | 62, 5.08, 19.7 | 11.5, 6.88, 14.59 |
| step vs height correlation | 0.42 | 0.99 |
| build phases (mean height, top parts) | 0.26 plate → 0.39 plate → 0.51 plate → 0.63 plate → 0.48 plate | 0.19 plate → 0.34 plate → 0.5 plate → 0.66 plate → 0.85 slope |
| interior / walls / roof at (progress) | 0.49 / 0.56 / 0.89 | – / 0.49 / 0.96 |
| sub-assemblies | 80% of models, 7.8 per model, 24% of pieces; roles body×25, upper×6, end×3, door×2, interior×1, engine×1, wheels×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | panel 80% h0.59 in8%; steering 100% h0.4 in40% | none |
| tiled tops (tile / tile+studs) | 27% (tops: tile 12%, studs 27%, slope 24%) | 30% (tops: tile 17%, studs 39%, slope 32%) |
| off-grid, sideways, brackets, hinges | 32%, 17%, 6%, 6% | 0%, 6%, 6%, 0% |
| part mix | plate 30%, brick 13%, slope 13%, tile 12%, special 9%, snot 6%, round 6% | plate 49%, brick 15%, slope 11%, tile 9%, wheel 8%, snot 6%, round 3% |

### castle (5 real: 6040-1 Blacksmith Shop; 6073-1 Knight's Castle; 6059-1 Knight's Stronghold; 6071-1 Forestmen's Crossing; 10176-1 Royal King's Castle)

| metric | real sets | ours (6 forges: "medieval stone castle with four towers", "huge castle", "medieval castle") |
|---|---|---|
| width × length (studs) | 21 (19–27) × 36 (28–42) | 20 (19.3–22.3) × 22 (20.5–24.3) |
| height (bricks) | 19 (18.7–19.7) | 11.3 (11.1–11.3) |
| pieces (structure) | 185 (172–352) | 288 (254.3–310.5) |
| length of typical-size sets | 36 (32–42) (3 sets) | 22 (20.5–24.3) (6 sets) |
| w:l, h:l | 0.53, 0.67 | 0.92, 0.52 |
| base | self (wheels 20%, self 40%, plate 40%) | plate (plate 100%) |
| hollow (air in envelope) | 34% (interior 4% of the box) | 12% (interior 2% of the box) |
| wall thickness | 2 stud (1: 28%, 2: 42%, 3+: 30%) | 1 stud (1: 65%, 2: 18%, 3+: 17%) |
| bottom band mix | brick 40%, plate 18%, special 11%; LIGHT_GREY 40%, BLACK 30%, RED 8% | brick 48%, plate 24%, round 21%; LIGHT_GREY 55%, GREEN 21%, BROWN 9% |
| middle band mix | brick 48%, plate 21%, slope 13%; LIGHT_GREY 51%, BLACK 29%, RED 7% | brick 53%, plate 37%, round 7%; LIGHT_GREY 70%, DARK_GREY 20%, TRANS_ORANGE 7% |
| top band mix | special 37%, round 16%, brick 12%; RED 30%, BLACK 26%, LIGHT_GREY 10% | hinge 100%; DARK_GREY 50%, DARK_RED 50% |
| steps, pcs/step, steps/100 pcs | 38, 4.63, 21.62 | 20, 14.4, 6.94 |
| step vs height correlation | 0.61 | 0.99 |
| build phases (mean height, top parts) | 0.14 brick → 0.3 brick → 0.29 brick → 0.39 brick → 0.51 brick | 0.08 brick → 0.3 brick → 0.42 plate → 0.52 plate → 0.72 brick |
| interior / walls / roof at (progress) | – / 0.71 / 0.84 | – / 0.32 / 1 |
| sub-assemblies | 100% of models, 3.4 per model, 29% of pieces; roles tower×4, body×3, door×3, weapon×2, end×2, cab×1, arm×1, chassis×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | seat 100% brick-built |
| tiled tops (tile / tile+studs) | 0% (tops: tile 0%, studs 66%, slope 4%) | 2% (tops: tile 1%, studs 98%, slope 0%) |
| off-grid, sideways, brackets, hinges | 9%, 3%, 2%, 6% | 0%, 0%, 0%, 3% |
| part mix | brick 45%, plate 20%, slope 12%, special 7%, hinge 6%, round 4%, tile 2% | brick 50%, plate 33%, round 12%, hinge 3%, slope 1%, tile 1% |

### construction (4 real: 6648-2 Dump Truck; 6678-1 Pneumatic Crane; 6352-1 Cargomaster Crane; 5761-1 Mini Digger)

| metric | real sets | ours (0 forges: ) |
|---|---|---|
| width × length (studs) | 5 (4–7.5) × 11 (9.5–12.3) | – |
| height (bricks) | 5.7 (5.2–6.3) | – |
| pieces (structure) | 51 (46–67.8) | – |
| length of typical-size sets | 10 (9–11) (3 sets) | – |
| w:l, h:l | 0.57, 0.55 | – |
| base | wheels (wheels 100%) | – |
| hollow (air in envelope) | 7% (interior 4% of the box) | – |
| wall thickness | 2 stud (1: 35%, 2: 21%, 3+: 44%) | – |
| bottom band mix | wheel 47%, hinge 24%, plate 21%; BLACK 47%, YELLOW 18%, RED 13% | – |
| middle band mix | plate 33%, brick 17%, hinge 13%; YELLOW 48%, BLACK 25%, DARK_GREY 6% | – |
| top band mix | round 40%, plate 33%, hinge 27%; YELLOW 42%, TRANS_ORANGE 40%, BLACK 13% | – |
| steps, pcs/step, steps/100 pcs | 10.5, 10.49, 12.63 | – |
| step vs height correlation | 0.29 | – |
| build phases (mean height, top parts) | 0.24 plate → 0.08 hinge → 0.41 hinge → 0.39 plate → 0.32 wheel | – |
| interior / walls / roof at (progress) | 0.88 / 0.88 / 0.88 | – |
| sub-assemblies | 75% of models, 1.5 per model, 19% of pieces; roles body×3, arm×3 | – |
| interiors (freq, height, inside) | steering 75% h0.45 in100%; seat 25% h0.38 in100% | – |
| tiled tops (tile / tile+studs) | 0% (tops: tile 2%, studs 29%, slope 4%) | – |
| off-grid, sideways, brackets, hinges | 31%, 9%, 5%, 20% | – |
| part mix | plate 30%, hinge 20%, wheel 16%, brick 8%, round 6%, snot 5%, tile 5% | – |

### dragon (2 real: 6043-1 Dragon Defender; 6056-1 Dragon Wagon)

| metric | real sets | ours (8 forges: "red dragon breathing fire", "dragon", "wyvern") |
|---|---|---|
| width × length (studs) | 10 (9–11) × 15.5 (15.3–15.8) | 23 (23–27) × 32 (31–33.3) |
| height (bricks) | 12.3 (12.2–12.5) | 12 (12–12) |
| pieces (structure) | 102 (88–116) | 115 (114.8–118.3) |
| length of typical-size sets | – (1 sets of typical size) | 32 (31–33.3) (8 sets) |
| w:l, h:l | 0.64, 0.8 | 0.74, 0.38 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 30% (interior 13% of the box) | 3% (interior 0% of the box) |
| wall thickness | 1.5 stud (1: 38%, 2: 33%, 3+: 30%) | 2 stud (1: 0%, 2: 90%, 3+: 10%) |
| bottom band mix | wheel 52%, plate 38%, hinge 7%; BLACK 52%, BROWN 28%, BLUE 10% | brick 81%, round 20%; RED 81%, LIGHT_GREY 13%, BROWN 7% |
| middle band mix | plate 36%, hinge 21%, brick 20%; BLACK 49%, RED 31%, BLUE 14% | plate 40%, hinge 34%, brick 19%; RED 84%, DARK_RED 13%, DARK_GREY 3% |
| top band mix | plate 49%, hinge 23%, snot 9%; BLACK 80%, YELLOW 9%, RED 8% | plate 52%, round 32%, slope 8%; RED 52%, WHITE 24%, TRANS_ORANGE 16% |
| steps, pcs/step, steps/100 pcs | 31.5, 3.24, 30.92 | 27, 4.26, 23.48 |
| step vs height correlation | 0.47 | 1 |
| build phases (mean height, top parts) | 0.18 plate → 0.38 plate → 0.63 brick → 0.63 plate → 0.4 hinge | 0.19 plate → 0.36 brick → 0.48 hinge → 0.71 plate → 0.88 plate |
| interior / walls / roof at (progress) | – / 0.51 / 0.62 | – / 0.35 / 0.88 |
| sub-assemblies | 100% of models, 3.5 per model, 39% of pieces; roles body×2, arm×2, upper×1, mast×1, wheels×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 0% (tops: tile 0%, studs 36%, slope 5%) | 2% (tops: tile 1%, studs 93%, slope 4%) |
| off-grid, sideways, brackets, hinges | 25%, 12%, 2%, 20% | 0%, 0%, 0%, 23% |
| part mix | plate 37%, hinge 20%, brick 16%, slope 10%, wheel 8%, special 5%, round 2% | plate 39%, hinge 23%, brick 20%, round 11%, slope 5%, tile 2% |

### farm (2 real: 6379-1 Riding Stable; 7637-1 Farm)

| metric | real sets | ours (4 forges: "barn", "stable") |
|---|---|---|
| width × length (studs) | 43 (36.5–49.5) × 51 (43.5–58.5) | 15.5 (15–16.8) × 18 (15–21.3) |
| height (bricks) | 22.3 (17.7–27) | 12.7 (10.7–14.9) |
| pieces (structure) | 401 (322–480) | 244.5 (163–345) |
| length of typical-size sets | 51 (43.5–58.5) (2 sets) | 18 (15–21.3) (4 sets) |
| w:l, h:l | 0.84, 0.42 | 0.95, 0.71 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 27% (interior 3% of the box) | 26% (interior 9% of the box) |
| wall thickness | 1.5 stud (1: 53%, 2: 29%, 3+: 18%) | 1 stud (1: 89%, 2: 2%, 3+: 9%) |
| bottom band mix | brick 30%, plate 18%, hinge 11%; WHITE 23%, BLACK 22%, BLUE 9% | plate 38%, brick 32%, round 11%; WHITE 39%, BLACK 16%, DARK_RED 12% |
| middle band mix | brick 30%, plate 22%, slope 13%; WHITE 28%, RED 21%, TAN 11% | slope 42%, brick 33%, plate 20%; DARK_RED 82%, WHITE 9%, GREEN 4% |
| top band mix | slope 47%, plate 43%, round 7%; RED 47%, TAN 28%, DARK_GREY 14% | brick 38%, plate 31%, round 31%; BLACK 38%, LIGHT_GREY 31%, DARK_RED 31% |
| steps, pcs/step, steps/100 pcs | 94, 6.58, 19.73 | 24, 9.9, 10.41 |
| step vs height correlation | -0.09 | 0.98 |
| build phases (mean height, top parts) | 0.23 brick → 0.21 brick → 0.34 brick → 0.36 plate → 0.21 plate | 0.06 plate → 0.21 brick → 0.34 plate → 0.54 slope → 0.81 slope |
| interior / walls / roof at (progress) | 0.54 / 0.41 / 0.68 | – / 0.63 / 0.93 |
| sub-assemblies | 100% of models, 4 per model, 37% of pieces; roles body×5, end×3 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | seat 100% h0.2 in100%; steering 50% h0.14 in100% | none |
| tiled tops (tile / tile+studs) | 6% (tops: tile 2%, studs 31%, slope 27%) | 15% (tops: tile 4%, studs 23%, slope 62%) |
| off-grid, sideways, brackets, hinges | 22%, 9%, 3%, 10% | 0%, 1%, 1%, 1% |
| part mix | brick 29%, plate 20%, slope 11%, hinge 10%, tile 7%, round 7%, window 6% | brick 33%, slope 26%, plate 26%, round 6%, window 5%, tile 4%, hinge 1% |

### fireTruck (4 real: 6480-1 Hook and Ladder Truck; 6440-1 Jetport Fire Squad; 4208-1 4 x 4 Fire Truck; 6911-1 Mini Fire Truck)

| metric | real sets | ours (6 forges: "fire truck", "red fire truck", "fire engine") |
|---|---|---|
| width × length (studs) | 6 (6–6.5) × 16 (14–16.8) | 8 (8–8) × 18 (18–18) |
| height (bricks) | 6.5 (5.3–8) | 8 (8–8) |
| pieces (structure) | 113.5 (78.5–156.8) | 139 (139–139) |
| length of typical-size sets | 16 (14–16.8) (4 sets) | 18 (18–18) (6 sets) |
| w:l, h:l | 0.44, 0.45 | 0.44, 0.44 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 18% (interior 11% of the box) | 25% (interior 11% of the box) |
| wall thickness | 2 stud (1: 33%, 2: 35%, 3+: 33%) | 1 stud (1: 76%, 2: 10%, 3+: 14%) |
| bottom band mix | wheel 39%, plate 23%, slope 15%; BLACK 30%, LIGHT_GREY 16%, WHITE 15% | plate 57%, wheel 43%; BLACK 79%, LIGHT_GREY 21% |
| middle band mix | plate 37%, hinge 16%, brick 12%; RED 35%, WHITE 22%, BLACK 6% | plate 35%, brick 26%, tile 16%; RED 50%, DARK_GREY 12%, LIGHT_GREY 12% |
| top band mix | hinge 42%, tile 18%, round 13%; LIGHT_GREY 27%, RED 17%, BLACK 12% | plate 50%, tile 50%; LIGHT_GREY 100% |
| steps, pcs/step, steps/100 pcs | 25.5, 4.39, 25.73 | 19, 7.32, 13.67 |
| step vs height correlation | 0.47 | 0.99 |
| build phases (mean height, top parts) | 0.11 plate → 0.26 plate → 0.39 plate → 0.65 plate → 0.46 wheel | 0.16 plate → 0.34 plate → 0.53 brick → 0.73 plate → 0.94 plate |
| interior / walls / roof at (progress) | 0.45 / 0.66 / 0.88 | – / 0.44 / 0.97 |
| sub-assemblies | 25% of models, 0.75 per model, 4% of pieces; roles weapon×2, door×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 75% h0.34 in100%; bed 25% h0 in0%; furniture 25% h0.41 in100%; seat 25% h0.4 in100%; panel 25% h0.42 in100% | seat 100% brick-built; steering 100% brick-built; panel 100% brick-built |
| tiled tops (tile / tile+studs) | 22% (tops: tile 9%, studs 32%, slope 17%) | 33% (tops: tile 23%, studs 48%, slope 15%) |
| off-grid, sideways, brackets, hinges | 28%, 15%, 5%, 16% | 0%, 4%, 4%, 1% |
| part mix | plate 29%, hinge 16%, wheel 12%, brick 9%, slope 9%, special 7%, tile 6% | plate 40%, brick 19%, tile 14%, wheel 9%, round 6%, snot 4%, slope 4% |

### garbageTruck (2 real: 6693-1 Refuse Collection Truck; 20011-1 Garbage Truck)

| metric | real sets | ours (8 forges: "garbage truck", "recycling truck", "trash truck") |
|---|---|---|
| width × length (studs) | 4 (4–4) × 13 (12–14) | 8 (8–8) × 18 (18–18) |
| height (bricks) | 6.5 (5.8–7.3) | 5.7 (5.7–5.7) |
| pieces (structure) | 76.5 (75.3–77.8) | 120 (120–120) |
| length of typical-size sets | – (0 sets of typical size) | 18 (18–18) (8 sets) |
| w:l, h:l | 0.32, 0.49 | 0.44, 0.31 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 25% (interior 18% of the box) | 23% (interior 13% of the box) |
| wall thickness | 1 stud (1: 77%, 2: 13%, 3+: 11%) | 1 stud (1: 75%, 2: 2%, 3+: 23%) |
| bottom band mix | wheel 53%, plate 20%, snot 6%; BLACK 34%, LIGHT_GREY 29%, YELLOW 25% | wheel 100%; LIGHT_GREY 100% |
| middle band mix | brick 41%, plate 27%, hinge 13%; YELLOW 26%, GREEN 23%, RED 18% | plate 43%, brick 28%, tile 8%; BLACK 29%, LIGHT_GREY 22%, WHITE 21% |
| top band mix | plate 42%, hinge 19%, tile 16%; GREEN 50%, YELLOW 34%, RED 14% | plate 75%, tile 25%; LIGHT_GREY 75%, TRANS_ORANGE 25% |
| steps, pcs/step, steps/100 pcs | 25, 3.21, 32.93 | 12, 10, 10 |
| step vs height correlation | 0.13 | 0.98 |
| build phases (mean height, top parts) | 0.21 plate → 0.49 plate → 0.6 wheel → 0.42 brick → 0.32 wheel | 0.22 plate → 0.36 plate → 0.49 brick → 0.65 brick → 0.88 plate |
| interior / walls / roof at (progress) | 0.79 / 0.48 / 0.66 | – / 0.73 / 1 |
| sub-assemblies | 50% of models, 1 per model, 20% of pieces; roles body×1, upper×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 50% h0.44 in100% | seat 100% brick-built; steering 100% brick-built; panel 100% brick-built |
| tiled tops (tile / tile+studs) | 5% (tops: tile 5%, studs 61%, slope 0%) | 12% (tops: tile 8%, studs 62%, slope 15%) |
| off-grid, sideways, brackets, hinges | 34%, 23%, 2%, 11% | 0%, 5%, 5%, 0% |
| part mix | plate 26%, brick 22%, wheel 17%, hinge 11%, round 8%, tile 6%, slope 6% | plate 43%, brick 25%, wheel 10%, tile 8%, snot 5%, slope 5%, round 3% |

### helicopter (4 real: 6691-1 Red Cross Helicopter; 6685-1 Fire Copter 1; 2531-1 Rescue Helicopter and Jeep; 30181-1 Helicopter)

| metric | real sets | ours (4 forges: "helicopter", "drone") |
|---|---|---|
| width × length (studs) | 6 (5.5–6.3) × 15.5 (12.3–20.3) | 10.5 (6–15) × 16 (15–17) |
| height (bricks) | 7.8 (6–8.9) | 4.2 (2.7–5.7) |
| pieces (structure) | 67.5 (51–84.8) | 29 (21–37) |
| length of typical-size sets | 15.5 (12.3–20.3) (4 sets) | 17 (17–17) (2 sets) |
| w:l, h:l | 0.32, 0.42 | 0.68, 0.26 |
| base | self (self 100%) | plate (plate 100%) |
| hollow (air in envelope) | 28% (interior 12% of the box) | 19% (interior 3% of the box) |
| wall thickness | 3 stud (1: 23%, 2: 22%, 3+: 55%) | 1.5 stud (1: 68%, 2: 22%, 3+: 11%) |
| bottom band mix | plate 43%, slope 22%, hinge 14%; BLACK 50%, LIGHT_GREY 16%, ORANGE 14% | plate 50%, round 50%; BLACK 100% |
| middle band mix | plate 42%, slope 12%, round 11%; RED 36%, WHITE 25%, LIGHT_GREY 13% | plate 32%, brick 19%, hinge 18%; RED 36%, BLACK 17%, LIGHT_GREY 14% |
| top band mix | plate 60%, slope 12%, hinge 11%; BLACK 48%, LIGHT_GREY 24%, RED 15% | hinge 50%, tile 50%; LIGHT_GREY 50%, TRANS_RED 25%, TRANS_BLUE 25% |
| steps, pcs/step, steps/100 pcs | 14.5, 5.98, 19.37 | 9.5, 3.04, 32.88 |
| step vs height correlation | 0.59 | 0.99 |
| build phases (mean height, top parts) | 0.31 plate → 0.37 plate → 0.56 plate → 0.74 plate → 0.58 plate | 0.12 plate → 0.3 plate → 0.49 round → 0.62 plate → 0.87 hinge |
| interior / walls / roof at (progress) | 0.25 / 0.38 / 0.95 | – / 0.47 / 0.98 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 50% h0.42 in50%; seat 25% h0.31 in100%; panel 25% h0.4 in100% | seat 50% brick-built |
| tiled tops (tile / tile+studs) | 20% (tops: tile 10%, studs 24%, slope 5%) | 7% (tops: tile 4%, studs 66%, slope 4%) |
| off-grid, sideways, brackets, hinges | 25%, 10%, 4%, 10% | 0%, 2%, 2%, 15% |
| part mix | plate 44%, slope 15%, hinge 10%, round 8%, brick 7%, tile 5%, special 4% | plate 35%, round 19%, hinge 15%, brick 14%, tile 9%, slope 8%, snot 2% |

### house (5 real: 345-1 House with Mini Wheel Car; 376-2 Town House with Garden; 6365-1 Summer Cottage; 6592-1 Vacation Hideaway; 4954-1 Model Town House)

| metric | real sets | ours (8 forges: "cozy alpine cottage with a garden and chimney", "haunted mansion", "tiny cottage") |
|---|---|---|
| width × length (studs) | 16 (15–30) × 27 (23–32) | 17.5 (15.3–20.3) × 20 (17.8–20.5) |
| height (bricks) | 10.7 (9.3–12) | 17.5 (14.3–20.6) |
| pieces (structure) | 141 (131–210) | 392 (282.8–570) |
| length of typical-size sets | 27 (25–29.5) (3 sets) | 20 (17.8–20.5) (8 sets) |
| w:l, h:l | 0.66, 0.46 | 0.94, 0.96 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 20% (interior 4% of the box) | 35% (interior 14% of the box) |
| wall thickness | 1 stud (1: 56%, 2: 28%, 3+: 16%) | 1 stud (1: 88%, 2: 4%, 3+: 8%) |
| bottom band mix | brick 36%, plate 15%, special 14%; RED 25%, WHITE 19%, YELLOW 15% | brick 33%, plate 33%, window 12%; WHITE 34%, BLACK 26%, BROWN 11% |
| middle band mix | brick 38%, slope 23%, plate 14%; RED 26%, WHITE 19%, YELLOW 17% | brick 38%, slope 29%, plate 26%; DARK_RED 42%, BLACK 20%, WHITE 19% |
| top band mix | slope 67%, plate 21%, brick 5%; BLACK 20%, RED 20%, YELLOW 20% | slope 31%, plate 29%, brick 26%; BLACK 44%, DARK_RED 42%, LIGHT_GREY 14% |
| steps, pcs/step, steps/100 pcs | 13, 10.85, 9.22 | 32, 13.55, 7.41 |
| step vs height correlation | 0.34 | 0.99 |
| build phases (mean height, top parts) | 0.17 brick → 0.3 brick → 0.32 plate → 0.43 slope → 0.38 slope | 0.06 plate → 0.24 brick → 0.39 plate → 0.57 brick → 0.78 slope |
| interior / walls / roof at (progress) | 1 / 0.33 / 0.92 | – / 0.6 / 0.89 |
| sub-assemblies | 80% of models, 1.6 per model, 17% of pieces; roles body×6, end×2 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | seat 20% h0.03 in0% | furniture 100% brick-built; seat 25% brick-built; table 25% brick-built; bed 13% brick-built |
| tiled tops (tile / tile+studs) | 16% (tops: tile 4%, studs 28%, slope 43%) | 14% (tops: tile 4%, studs 23%, slope 63%) |
| off-grid, sideways, brackets, hinges | 21%, 2%, 3%, 1% | 0%, 1%, 1%, 1% |
| part mix | brick 36%, slope 17%, plate 14%, tile 8%, window 8%, round 6%, special 6% | brick 37%, plate 28%, slope 21%, window 5%, tile 4%, round 4%, hinge 1% |

### lighthouse (1 real: 5770-1 Lighthouse Island)

| metric | real sets | ours (4 forges: "red and white lighthouse on a rocky shore", "lighthouse") |
|---|---|---|
| width × length (studs) | 16 (16–16) × 33 (33–33) | 16 (16–16) × 16 (16–16) |
| height (bricks) | 20 (20–20) | 13.7 (13.7–13.7) |
| pieces (structure) | 480 (480–480) | 82 (82–82) |
| length of typical-size sets | – (1 sets of typical size) | – (0 sets of typical size) |
| w:l, h:l | 0.48, 0.61 | 1, 0.85 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 44% (interior 9% of the box) | 36% (interior 3% of the box) |
| wall thickness | 2 stud (1: 44%, 2: 22%, 3+: 34%) | 1 stud (1: 52%, 2: 0%, 3+: 48%) |
| bottom band mix | round 27%, plate 22%, slope 19%; LIGHT_GREY 22%, DARK_GREY 19%, WHITE 13% | plate 81%, brick 12%, round 3%; DARK_GREY 56%, LIGHT_GREY 27%, WHITE 14% |
| middle band mix | brick 30%, round 25%, plate 15%; RED 31%, WHITE 30%, BLACK 13% | round 67%, plate 24%, brick 10%; WHITE 33%, BLACK 33%, RED 19% |
| top band mix | plate 32%, round 18%, brick 18%; WHITE 38%, BLACK 33%, RED 13% | plate 50%, round 50%; BLACK 50%, RED 50% |
| steps, pcs/step, steps/100 pcs | 3, 160, 0.63 | 20, 4.1, 24.39 |
| step vs height correlation | -0.56 | 0.99 |
| build phases (mean height, top parts) | 0.97 plate → –  → 0.46 round → –  → 0.07 plate | 0.04 plate → 0.18 brick → 0.29 plate → 0.59 round → 0.79 round |
| interior / walls / roof at (progress) | 1 / 0.5 / 0.5 | – / 0.32 / 0.97 |
| sub-assemblies | 100% of models, 2 per model, 18% of pieces; roles roof×1, end×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 100% h0.08 in0% | none |
| tiled tops (tile / tile+studs) | 16% (tops: tile 7%, studs 39%, slope 29%) | 1% (tops: tile 1%, studs 99%, slope 0%) |
| off-grid, sideways, brackets, hinges | 19%, 6%, 0%, 4% | 0%, 0%, 0%, 0% |
| part mix | round 24%, brick 23%, plate 21%, slope 13%, special 9%, hinge 4%, tile 4% | plate 66%, round 21%, brick 11%, window 1%, tile 1% |

### monsterTruck (2 real: 6675-1 Road & Trail 4x4; 6533-1 Police 4x4)

| metric | real sets | ours (4 forges: "monster truck", "stunt truck") |
|---|---|---|
| width × length (studs) | 4 (4–4) × 10 (10–10) | 9.5 (8–11) × 18.5 (18–19) |
| height (bricks) | 5.8 (5.4–6.3) | 6.2 (5.7–6.7) |
| pieces (structure) | 67.5 (63.3–71.8) | 117 (114–120) |
| length of typical-size sets | – (1 sets of typical size) | 18.5 (18–19) (4 sets) |
| w:l, h:l | 0.4, 0.59 | 0.51, 0.33 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 15% (interior 10% of the box) | 12% (interior 7% of the box) |
| wall thickness | 2 stud (1: 24%, 2: 59%, 3+: 18%) | 1.25 stud (1: 63%, 2: 5%, 3+: 33%) |
| bottom band mix | wheel 53%, special 21%, round 13%; BLACK 49%, YELLOW 16%, WHITE 15% | wheel 73%, tile 27%; LIGHT_GREY 77%, YELLOW 23% |
| middle band mix | plate 44%, snot 11%, window 9%; BLACK 33%, WHITE 28%, YELLOW 13% | plate 48%, brick 20%, tile 9%; BLACK 34%, RED 33%, LIGHT_GREY 11% |
| top band mix | hinge 58%, plate 22%, tile 11%; BLACK 31%, TRANS_BLUE 22%, YELLOW 17% | plate 51%, tile 40%, round 9%; LIGHT_GREY 47%, TRANS_ORANGE 22%, TRANS_CLEAR 18% |
| steps, pcs/step, steps/100 pcs | 13, 5.2, 19.57 | 11.5, 10.18, 9.82 |
| step vs height correlation | -0.16 | 0.97 |
| build phases (mean height, top parts) | 0.31 plate → 0.34 wheel → 0.43 plate → 0.39 hinge → 0.1 round | 0.26 plate → 0.41 plate → 0.54 plate → 0.65 brick → 0.86 plate |
| interior / walls / roof at (progress) | 0.25 / 0.5 / 0.88 | – / 0.62 / 1 |
| sub-assemblies | 100% of models, 1.5 per model, 7% of pieces; roles body×2, engine×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 100% h0.47 in100% | seat 100% brick-built; steering 100% brick-built; panel 100% brick-built |
| tiled tops (tile / tile+studs) | 17% (tops: tile 8%, studs 32%, slope 0%) | 20% (tops: tile 12%, studs 52%, slope 13%) |
| off-grid, sideways, brackets, hinges | 38%, 6%, 6%, 10% | 0%, 5%, 5%, 0% |
| part mix | plate 30%, wheel 19%, special 11%, hinge 10%, round 9%, snot 6%, window 5% | plate 44%, brick 18%, tile 13%, wheel 11%, round 5%, snot 5%, slope 5% |

### motorcycle (2 real: 6373-1 Motorcycle Shop; 60065-1 ATV Patrol)

| metric | real sets | ours (8 forges: "motorcycle", "motorbike", "bike") |
|---|---|---|
| width × length (studs) | 14 (9–19) × 19 (13.5–24.5) | 6 (6–6) × 9 (9–9) |
| height (bricks) | 7.2 (5.4–8.9) | 3.7 (3.7–3.7) |
| pieces (structure) | 98 (66–130) | 23 (23–23) |
| length of typical-size sets | 19 (13.5–24.5) (2 sets) | – (0 sets of typical size) |
| w:l, h:l | 0.65, 0.41 | 0.67, 0.41 |
| base | plate (plate 50%, wheels 50%) | plate (plate 100%) |
| hollow (air in envelope) | 13% (interior 3% of the box) | 11% (interior 2% of the box) |
| wall thickness | 1.5 stud (1: 48%, 2: 13%, 3+: 39%) | 1 stud (1: 100%, 2: 0%, 3+: 0%) |
| bottom band mix | wheel 56%, brick 22%, plate 6%; BLACK 31%, RED 22%, LIGHT_GREY 21% | tile 75%, wheel 25%; LIGHT_GREY 100% |
| middle band mix | hinge 22%, brick 21%, slope 14%; YELLOW 28%, WHITE 14%, BLACK 12% | brick 46%, plate 23%, tile 15%; BLACK 77%, RED 8%, TRANS_CLEAR 8% |
| top band mix | special 50%; YELLOW 25%, RED 25% | plate 100%; BLACK 50%, YELLOW 50% |
| steps, pcs/step, steps/100 pcs | 8.5, 13.9, 7.57 | 6, 3.83, 26.09 |
| step vs height correlation | 0.6 | 0.98 |
| build phases (mean height, top parts) | 0.05 wheel → 0.09 brick → 0.3 brick → 0.54 plate → 0.53 slope | 0.09 tile → 0.32 brick → 0.5 plate → 0.64 plate → 0.81 brick |
| interior / walls / roof at (progress) | 0.5 / 0.57 / 1 | – / 0.2 / 1 |
| sub-assemblies | 100% of models, 2 per model, 22% of pieces; roles engine×3, wheels×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | seat 50% h0.13 in100%; panel 50% h0.2 in100% | none |
| tiled tops (tile / tile+studs) | 6% (tops: tile 2%, studs 33%, slope 19%) | 50% (tops: tile 50%, studs 50%, slope 0%) |
| off-grid, sideways, brackets, hinges | 35%, 28%, 0%, 16% | 0%, 9%, 4%, 0% |
| part mix | brick 21%, wheel 20%, hinge 16%, special 10%, round 10%, plate 9%, slope 9% | tile 35%, brick 26%, plate 22%, wheel 9%, snot 4%, round 4% |

### pirateShip (2 real: 6285-1 Black Seas Barracuda; 6286-1 Skull's Eye Schooner)

| metric | real sets | ours (4 forges: "pirate ship", "galleon") |
|---|---|---|
| width × length (studs) | 27 (26.5–27.5) × 66 (63–69) | 6 (6–6) × 23 (23–23) |
| height (bricks) | 34.7 (30.2–39.2) | 8.3 (8.3–8.3) |
| pieces (structure) | 773.5 (738.8–808.3) | 113 (112–114) |
| length of typical-size sets | 66 (63–69) (2 sets) | – (0 sets of typical size) |
| w:l, h:l | 0.42, 0.52 | 0.26, 0.36 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 42% (interior 9% of the box) | 28% (interior 10% of the box) |
| wall thickness | 3.5 stud (1: 26%, 2: 18%, 3+: 57%) | 1 stud (1: 83%, 2: 12%, 3+: 6%) |
| bottom band mix | brick 38%, plate 16%, round 10%; BLACK 62%, LIGHT_GREY 18%, BROWN 6% | plate 57%, brick 26%, slope 14%; BLACK 47%, YELLOW 47%, BROWN 3% |
| middle band mix | plate 33%, brick 18%, hinge 15%; BLACK 61%, WHITE 11%, LIGHT_GREY 9% | plate 44%, brick 33%, round 16%; TAN 26%, BLACK 20%, YELLOW 17% |
| top band mix | plate 49%, hinge 40%, special 10%; BLACK 89%, WHITE 7%, DARK_GREY 2% | round 100%; BROWN 100% |
| steps, pcs/step, steps/100 pcs | 60.5, 12.92, 7.77 | 17, 6.65, 15.05 |
| step vs height correlation | 0.39 | 0.99 |
| build phases (mean height, top parts) | 0.09 brick → 0.26 brick → 0.27 plate → 0.49 plate → 0.37 plate | 0.13 plate → 0.3 brick → 0.42 brick → 0.56 brick → 0.85 round |
| interior / walls / roof at (progress) | – / 0.72 / 0.98 | – / 0.31 / 0.97 |
| sub-assemblies | 100% of models, 19 per model, 34% of pieces; roles body×18, mast×6, end×4, roof×3, tail×2, chassis×2, wall×2, door×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 3% (tops: tile 1%, studs 38%, slope 4%) | 1% (tops: tile 1%, studs 96%, slope 1%) |
| off-grid, sideways, brackets, hinges | 27%, 6%, 1%, 14% | 0%, 4%, 0%, 3% |
| part mix | plate 28%, brick 24%, hinge 14%, round 11%, slope 8%, special 6%, tile 5% | plate 46%, brick 29%, round 15%, slope 4%, tile 3%, hinge 3% |

### plane (5 real: 6368-1 Jet Airliner; 6356-1 Med-Star Rescue Plane; 6399-1 Airport Shuttle; 10124-1 Wright Flyer; 3178-1 Seaplane)

| metric | real sets | ours (8 forges: "airliner", "fighter jet", "biplane") |
|---|---|---|
| width × length (studs) | 28 (26–34) × 32 (28–68) | 16.5 (15.5–17.3) × 17 (16.5–17.8) |
| height (bricks) | 10.7 (9.7–17) | 5 (5–5.3) |
| pieces (structure) | 149 (126–543) | 52.5 (48.8–69.3) |
| length of typical-size sets | 28 (26.5–30) (3 sets) | 17 (16.5–17.8) (8 sets) |
| w:l, h:l | 0.81, 0.31 | 0.94, 0.3 |
| base | wheels (wheels 60%, plate 20%, self 20%) | plate (plate 100%) |
| hollow (air in envelope) | 16% (interior 1% of the box) | 7% (interior 1% of the box) |
| wall thickness | 1 stud (1: 45%, 2: 15%, 3+: 41%) | 1 stud (1: 88%, 2: 3%, 3+: 9%) |
| bottom band mix | wheel 37%, plate 22%, brick 9%; LIGHT_GREY 30%, BLACK 20%, BROWN 18% | wheel 81%, round 8%, hinge 7%; LIGHT_GREY 53%, BLACK 38%, DARK_GREY 8% |
| middle band mix | plate 29%, special 18%, slope 15%; WHITE 32%, BLACK 16%, RED 14% | plate 60%, brick 17%, slope 14%; WHITE 75%, LIGHT_GREY 10%, DARK_BLUE 6% |
| top band mix | plate 33%, round 20%, special 13%; WHITE 29%, TRANS_RED 20%, RED 10% | slope 56%, tile 25%, plate 19%; RED 81%, WHITE 19% |
| steps, pcs/step, steps/100 pcs | 37, 7.84, 12.75 | 12, 4.62, 21.82 |
| step vs height correlation | 0.16 | 0.96 |
| build phases (mean height, top parts) | 0.33 plate → 0.49 plate → 0.48 plate → 0.41 plate → 0.41 plate | 0.19 wheel → 0.28 plate → 0.4 plate → 0.58 plate → 0.78 plate |
| interior / walls / roof at (progress) | 0.69 / 0.53 / 0.93 | – / 0.63 / 1 |
| sub-assemblies | 80% of models, 5.6 per model, 28% of pieces; roles body×15, wing×5, upper×3, engine×2, roof×1, wheels×1, tail×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | seat 40% h0.54 in100%; panel 60% h0.47 in100%; bed 20% h0 in0%; steering 20% h0.43 in0% | seat 100% brick-built; panel 100% brick-built |
| tiled tops (tile / tile+studs) | 2% (tops: tile 2%, studs 43%, slope 12%) | 0% (tops: tile 0%, studs 78%, slope 15%) |
| off-grid, sideways, brackets, hinges | 26%, 6%, 1%, 7% | 0%, 3%, 0%, 2% |
| part mix | plate 31%, special 14%, slope 13%, brick 11%, hinge 7%, wheel 5%, window 5% | plate 52%, brick 14%, slope 13%, wheel 10%, round 5%, window 2%, tile 2% |

### policeCar (3 real: 6681-1 Police Van; 6684-1 Police Patrol Squad; 7236-1 Police Car (Black Sticker Version))

| metric | real sets | ours (6 forges: "police car", "cop car", "patrol car") |
|---|---|---|
| width × length (studs) | 6 (5–6) × 12 (11.5–12.5) | 6 (6–6) × 14 (14–14) |
| height (bricks) | 6 (5.8–6.3) | 4.7 (4.7–4.7) |
| pieces (structure) | 61 (54.5–64) | 74 (73–75) |
| length of typical-size sets | 12 (11.5–12.5) (3 sets) | 14 (14–14) (6 sets) |
| w:l, h:l | 0.46, 0.51 | 0.43, 0.33 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 24% (interior 12% of the box) | 5% (interior 2% of the box) |
| wall thickness | 1 stud (1: 63%, 2: 19%, 3+: 19%) | 1 stud (1: 63%, 2: 9%, 3+: 28%) |
| bottom band mix | wheel 83%, special 8%, snot 3%; BLACK 67%, WHITE 16%, RED 11% | plate 63%, wheel 38%; BLACK 75%, LIGHT_GREY 25% |
| middle band mix | plate 35%, brick 16%, window 16%; WHITE 51%, BLACK 28%, TRANS_CLEAR 6% | plate 41%, brick 25%, slope 13%; WHITE 53%, TRANS_CLEAR 15%, DARK_BLUE 11% |
| top band mix | plate 57%, slope 17%, tile 15%; TRANS_BLUE 37%, BLACK 28%, WHITE 27% | plate 44%, slope 44%, tile 11%; WHITE 89%, TRANS_BLUE 6%, TRANS_RED 6% |
| steps, pcs/step, steps/100 pcs | 10, 6.09, 16.42 | 10.5, 7.06, 14.18 |
| step vs height correlation | 0.35 | 0.99 |
| build phases (mean height, top parts) | 0.23 plate → 0.35 plate → 0.42 plate → 0.68 plate → 0.49 wheel | 0.18 plate → 0.3 plate → 0.5 plate → 0.6 plate → 0.78 slope |
| interior / walls / roof at (progress) | 0.3 / 0.63 / 0.88 | – / 0.53 / 1 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 100% h0.44 in100%; seat 33% h0.41 in100% | none |
| tiled tops (tile / tile+studs) | 0% (tops: tile 3%, studs 35%, slope 7%) | 18% (tops: tile 12%, studs 43%, slope 32%) |
| off-grid, sideways, brackets, hinges | 16%, 8%, 3%, 6% | 0%, 7%, 7%, 0% |
| part mix | plate 32%, wheel 13%, brick 11%, window 11%, tile 8%, hinge 6%, special 6% | plate 45%, brick 18%, slope 12%, tile 8%, wheel 8%, snot 7%, round 3% |

### robot (2 real: 6889-1 Recon Robot; 4917-1 Mini Robots)

| metric | real sets | ours (6 forges: "orange recon mech with cannons", "robot", "mech") |
|---|---|---|
| width × length (studs) | 6.5 (5.3–7.8) × 10 (10–10) | 4 (4–4) × 10 (10–10) |
| height (bricks) | 9.5 (8.6–10.4) | 8.3 (8.3–8.3) |
| pieces (structure) | 100 (87.5–112.5) | 47 (47–47.8) |
| length of typical-size sets | 10 (10–10) (2 sets) | – (0 sets of typical size) |
| w:l, h:l | 0.65, 0.95 | 0.4, 0.83 |
| base | wheels (wheels 50%, self 50%) | plate (plate 100%) |
| hollow (air in envelope) | 32% (interior 18% of the box) | 10% (interior 3% of the box) |
| wall thickness | 2 stud (1: 14%, 2: 63%, 3+: 23%) | 1 stud (1: 100%, 2: 0%, 3+: 0%) |
| bottom band mix | plate 32%, brick 16%, wheel 16%; BLACK 54%, BLUE 14%, WHITE 14% | round 66%, brick 17%, plate 17%; LIGHT_GREY 52%, BLACK 21%, WHITE 17% |
| middle band mix | hinge 39%, plate 23%, slope 16%; BLACK 54%, WHITE 15%, BLUE 12% | brick 39%, round 28%, plate 21%; LIGHT_GREY 47%, BLACK 14%, WHITE 11% |
| top band mix | round 41%, plate 30%, hinge 18%; BLACK 48%, TRANS_ORANGE 25%, RED 13% | –;  |
| steps, pcs/step, steps/100 pcs | 10.5, 9.38, 10.8 | 16, 2.94, 34.04 |
| step vs height correlation | 0.7 | 0.99 |
| build phases (mean height, top parts) | 0.3 plate → 0.36 hinge → 0.65 hinge → 0.74 hinge → 0.69 plate | 0.08 round → 0.22 round → 0.37 plate → 0.5 brick → 0.69 brick |
| interior / walls / roof at (progress) | 1 / 0.09 / 0.77 | – / 0.63 / – |
| sub-assemblies | 50% of models, 5 per model, 33% of pieces; roles arm×7, upper×2, wheels×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | panel 50% h0.03 in0% | none |
| tiled tops (tile / tile+studs) | 5% (tops: tile 3%, studs 30%, slope 0%) | 17% (tops: tile 17%, studs 80%, slope 0%) |
| off-grid, sideways, brackets, hinges | 64%, 28%, 3%, 31% | 0%, 8%, 0%, 0% |
| part mix | hinge 31%, plate 27%, slope 14%, round 9%, special 6%, brick 5%, tile 5% | round 37%, brick 34%, plate 20%, tile 6%, special 2%, slope 1% |

### rocket (4 real: 897-1 Mobile Rocket Launcher; 6870-1 Space Probe Launcher; 6346-1 Shuttle Launching Crew; 31066-1 Space Shuttle Explorer)

| metric | real sets | ours (6 forges: "apollo rocket on a launch pad", "rocket", "space rocket") |
|---|---|---|
| width × length (studs) | 9 (7–11) × 13 (9.5–18.8) | 6 (6–6) × 9 (9–9) |
| height (bricks) | 7 (5.8–7.9) | 12.7 (12.7–12.7) |
| pieces (structure) | 107 (50.5–176.5) | 53 (53–53) |
| length of typical-size sets | 21.5 (18.8–24.3) (2 sets) | – (0 sets of typical size) |
| w:l, h:l | 0.57, 0.42 | 0.67, 1.41 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 11% (interior 4% of the box) | 10% (interior 2% of the box) |
| wall thickness | 2 stud (1: 25%, 2: 31%, 3+: 44%) | 2 stud (1: 0%, 2: 100%, 3+: 0%) |
| bottom band mix | wheel 54%, plate 22%, tile 6%; LIGHT_GREY 30%, BLACK 29%, WHITE 15% | plate 35%, round 35%, slope 17%; RED 43%, DARK_GREY 30%, LIGHT_GREY 9% |
| middle band mix | plate 30%, special 20%, hinge 17%; WHITE 36%, LIGHT_GREY 34%, BLACK 15% | brick 36%, plate 36%, round 25%; RED 68%, WHITE 21%, BLACK 4% |
| top band mix | plate 20%, hinge 20%, slope 10%; LIGHT_GREY 29%, WHITE 21%, TRANS_BLUE 8% | round 100%; LIGHT_GREY 50%, RED 50% |
| steps, pcs/step, steps/100 pcs | 15, 4.97, 23.46 | 27, 1.96, 50.94 |
| step vs height correlation | 0.79 | 1 |
| build phases (mean height, top parts) | 0.17 wheel → 0.3 plate → 0.4 plate → 0.6 hinge → 0.6 slope | 0.08 plate → 0.27 brick → 0.43 brick → 0.59 brick → 0.79 round |
| interior / walls / roof at (progress) | 0.67 / 1 / 0.89 | – / 0.5 / 0.98 |
| sub-assemblies | 100% of models, 2.5 per model, 41% of pieces; roles body×6, upper×3, arm×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 50% h0.48 in75%; panel 50% h0.79 in50% | none |
| tiled tops (tile / tile+studs) | 26% (tops: tile 5%, studs 21%, slope 12%) | 3% (tops: tile 2%, studs 90%, slope 7%) |
| off-grid, sideways, brackets, hinges | 40%, 10%, 4%, 14% | 0%, 0%, 0%, 0% |
| part mix | plate 27%, wheel 17%, hinge 14%, special 12%, brick 7%, slope 7%, tile 6% | plate 34%, round 32%, brick 25%, slope 8%, tile 2% |

### rover (2 real: 6770-1 Lunar Transporter Patroller; 1621-1 Lunar MPV Vehicle)

| metric | real sets | ours (8 forges: "mars rover", "lunar rover", "rover") |
|---|---|---|
| width × length (studs) | 7 (6.5–7.5) × 11.5 (9.8–13.3) | 6.5 (6–7) × 9 (9–9) |
| height (bricks) | 6.8 (6.6–7.1) | 5.3 (5.3–5.3) |
| pieces (structure) | 40 (38–42) | 27.5 (27–28) |
| length of typical-size sets | 11.5 (9.8–13.3) (2 sets) | 9 (9–9) (8 sets) |
| w:l, h:l | 0.7, 0.64 | 0.69, 0.59 |
| base | self (self 100%) | plate (plate 100%) |
| hollow (air in envelope) | 12% (interior 5% of the box) | 26% (interior 8% of the box) |
| wall thickness | 3 stud (1: 18%, 2: 26%, 3+: 56%) | 1 stud (1: 71%, 2: 5%, 3+: 24%) |
| bottom band mix | hinge 38%, plate 26%, tile 25%; BLACK 63%, WHITE 38% | wheel 58%, plate 32%, tile 7%; LIGHT_GREY 93%, TAN 7% |
| middle band mix | hinge 31%, special 21%, plate 14%; WHITE 65%, BLACK 27%, TRANS_BLUE 3% | plate 40%, round 40%, brick 20%; LIGHT_GREY 50%, WHITE 20%, TRANS_BLUE 20% |
| top band mix | round 30%, special 15%, plate 5%; WHITE 25%, TRANS_RED 15%, BLACK 5% | round 50%, tile 50%; WHITE 50%, TRANS_BLUE 50% |
| steps, pcs/step, steps/100 pcs | 4.5, 9.66, 10.99 | 9, 3.06, 32.74 |
| step vs height correlation | 0.44 | 0.98 |
| build phases (mean height, top parts) | 0.23 plate → 0.23 round → 0.58 hinge → 0.68 round → 0.56 hinge | 0.14 wheel → 0.28 brick → 0.47 plate → 0.67 round → 0.94 round |
| interior / walls / roof at (progress) | – / 0.4 / 1 | – / 0.38 / 0.94 |
| sub-assemblies | 100% of models, 3 per model, 53% of pieces; roles body×5, upper×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 0% (tops: tile 0%, studs 35%, slope 8%) | 6% (tops: tile 4%, studs 69%, slope 0%) |
| off-grid, sideways, brackets, hinges | 42%, 3%, 4%, 27% | 0%, 0%, 0%, 0% |
| part mix | hinge 27%, special 17%, round 17%, plate 15%, tile 9%, slope 9%, snot 4% | wheel 33%, plate 33%, round 20%, brick 7%, tile 7% |

### seaCreature (2 real: 6414-1 Dolphin Point; 30025-1 Clown Fish)

| metric | real sets | ours (10 forges: "shark", "blue whale", "octopus") |
|---|---|---|
| width × length (studs) | 13.5 (10.8–16.3) × 15 (12.5–17.5) | 10 (10–10) × 14 (10–19) |
| height (bricks) | 13 (8.5–17.5) | 4.3 (4–4.3) |
| pieces (structure) | 116 (87.5–144.5) | 46 (35–46) |
| length of typical-size sets | – (1 sets of typical size) | 16.5 (13–20) (8 sets) |
| w:l, h:l | 0.88, 0.75 | 0.6, 0.23 |
| base | plate (plate 50%, wheels 50%) | plate (plate 100%) |
| hollow (air in envelope) | 16% (interior 4% of the box) | 11% (interior 2% of the box) |
| wall thickness | 2 stud (1: 29%, 2: 30%, 3+: 41%) | 7.5 stud (1: 25%, 2: 17%, 3+: 58%) |
| bottom band mix | plate 31%, hinge 18%, brick 15%; WHITE 29%, BLACK 25%, ORANGE 22% | plate 72%, round 24%, brick 5%; TAN 61%, RED 18%, TRANS_CLEAR 11% |
| middle band mix | brick 31%, plate 19%, round 18%; WHITE 41%, ORANGE 22%, BLACK 16% | plate 35%, slope 19%, round 18%; BLUE 39%, RED 25%, LIGHT_GREY 14% |
| top band mix | round 50%, plate 23%, slope 23%; BLACK 36%, TRANS_ORANGE 25%, WHITE 18% | tile 70%, slope 10%; BLACK 70%, LIGHT_GREY 10% |
| steps, pcs/step, steps/100 pcs | 25, 31.27, 15.01 | 11, 4.18, 23.91 |
| step vs height correlation | 0.48 | 0.98 |
| build phases (mean height, top parts) | 0.32 plate → 0.47 brick → 0.66 round → 0.05 round → 0.17 special | 0.11 plate → 0.36 plate → 0.49 plate → 0.62 plate → 0.84 tile |
| interior / walls / roof at (progress) | 0.43 / 0.18 / 0.25 | – / 0.3 / 1 |
| sub-assemblies | 50% of models, 2.5 per model, 14% of pieces; roles body×4, end×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | furniture 50% h0.38 in100%; seat 50% h0.05 in100% | none |
| tiled tops (tile / tile+studs) | 2% (tops: tile 1%, studs 57%, slope 7%) | 3% (tops: tile 5%, studs 87%, slope 8%) |
| off-grid, sideways, brackets, hinges | 30%, 5%, 2%, 14% | 0%, 0%, 0%, 1% |
| part mix | brick 25%, plate 23%, round 15%, hinge 14%, slope 12%, special 5%, tile 2% | plate 51%, round 16%, slope 10%, brick 10%, tile 10%, hinge 1% |

### ship (2 real: 316-1 Fire Fighter Ship; 4015-1 Freighter)

| metric | real sets | ours (8 forges: "cruise ship", "battleship", "ship") |
|---|---|---|
| width × length (studs) | 6 (6–6) × 21 (20–22) | 6 (6–6) × 23 (23–23) |
| height (bricks) | 8 (6.8–9.2) | 5.7 (5.7–5.8) |
| pieces (structure) | 88.5 (74.3–102.8) | 93 (87–99.5) |
| length of typical-size sets | – (1 sets of typical size) | 23 (23–23) (8 sets) |
| w:l, h:l | 0.29, 0.4 | 0.26, 0.25 |
| base | self (self 100%) | plate (plate 100%) |
| hollow (air in envelope) | 21% (interior 6% of the box) | 23% (interior 10% of the box) |
| wall thickness | 1.5 stud (1: 58%, 2: 28%, 3+: 15%) | 1 stud (1: 76%, 2: 15%, 3+: 10%) |
| bottom band mix | brick 40%, plate 19%, hinge 14%; WHITE 59%, LIGHT_GREY 14%, BLACK 13% | plate 53%, brick 33%, slope 13%; LIGHT_GREY 90%, TRANS_BLUE 6%, BROWN 1% |
| middle band mix | brick 32%, plate 22%, hinge 15%; WHITE 54%, BLACK 13%, TRANS_CLEAR 11% | plate 48%, brick 20%, round 12%; TAN 32%, WHITE 22%, DARK_GREY 19% |
| top band mix | round 56%, special 20%, hinge 16%; TRANS_ORANGE 50%, LIGHT_GREY 28%, WHITE 8% | round 67%, tile 34%; LIGHT_GREY 67%, WHITE 34% |
| steps, pcs/step, steps/100 pcs | 1.5, 73.5, 2.09 | 12, 7.9, 12.66 |
| step vs height correlation | 0.59 | 0.99 |
| build phases (mean height, top parts) | 0.27 hinge → –  → –  → –  → 0.26 plate | 0.11 plate → 0.35 plate → 0.55 brick → 0.68 plate → 0.83 round |
| interior / walls / roof at (progress) | 1 / 0.5 / 0.5 | – / 0.36 / 0.96 |
| sub-assemblies | 50% of models, 0.5 per model, 4% of pieces; roles body×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 50% h0.23 in50% | seat 100% brick-built; table 100% brick-built |
| tiled tops (tile / tile+studs) | 0% (tops: tile 0%, studs 43%, slope 8%) | 2% (tops: tile 2%, studs 90%, slope 1%) |
| off-grid, sideways, brackets, hinges | 19%, 13%, 0%, 19% | 0%, 1%, 0%, 3% |
| part mix | brick 28%, plate 21%, hinge 19%, special 13%, slope 7%, window 5%, round 5% | plate 49%, brick 25%, slope 9%, round 8%, window 5%, hinge 3%, tile 1% |

### shop (4 real: 6362-1 Post Office; 6651-1 Post Office Van; 6376-1 Breezeway Cafe; 10036-1 Pizza To Go)

| metric | real sets | ours (8 forges: "bakery", "shop", "store") |
|---|---|---|
| width × length (studs) | 13 (7.8–17) × 21 (12.3–29.5) | 18 (17–19) × 20 (19.8–20) |
| height (bricks) | 10.3 (8.3–12.4) | 16.2 (15.7–17.8) |
| pieces (structure) | 128 (105.3–136.8) | 352.5 (299–433.8) |
| length of typical-size sets | 29 (21–30) (3 sets) | 20 (19.8–20) (8 sets) |
| w:l, h:l | 0.57, 0.52 | 0.9, 0.81 |
| base | plate (plate 75%, wheels 25%) | plate (plate 100%) |
| hollow (air in envelope) | 26% (interior 10% of the box) | 36% (interior 14% of the box) |
| wall thickness | 1 stud (1: 65%, 2: 17%, 3+: 18%) | 1 stud (1: 96%, 2: 2%, 3+: 2%) |
| bottom band mix | brick 27%, wheel 22%, special 14%; WHITE 30%, BLACK 27%, RED 13% | brick 34%, plate 29%, window 14%; WHITE 44%, BLACK 15%, TAN 11% |
| middle band mix | brick 37%, plate 23%, window 9%; WHITE 27%, RED 26%, YELLOW 25% | brick 42%, slope 36%, plate 19%; DARK_RED 67%, WHITE 27%, TAN 4% |
| top band mix | slope 37%, plate 29%, brick 14%; YELLOW 33%, RED 24%, BLUE 17% | plate 48%, brick 26%, slope 14%; DARK_RED 65%, BLACK 23%, LIGHT_GREY 12% |
| steps, pcs/step, steps/100 pcs | 13, 6.22, 16.77 | 26.5, 13.29, 7.55 |
| step vs height correlation | 0.04 | 0.99 |
| build phases (mean height, top parts) | 0.23 brick → 0.37 brick → 0.57 brick → 0.34 plate → 0.15 plate | 0.05 plate → 0.24 brick → 0.42 brick → 0.58 slope → 0.79 slope |
| interior / walls / roof at (progress) | 0.43 / 0.37 / 0.57 | – / 0.67 / 0.89 |
| sub-assemblies | 75% of models, 0.75 per model, 18% of pieces; roles body×2, end×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | seat 50% h0.29 in100%; steering 75% h0.27 in67% | furniture 88% brick-built; seat 13% brick-built; table 13% brick-built |
| tiled tops (tile / tile+studs) | 0% (tops: tile 0%, studs 31%, slope 33%) | 14% (tops: tile 3%, studs 20%, slope 67%) |
| off-grid, sideways, brackets, hinges | 22%, 4%, 2%, 3% | 0%, 1%, 1%, 1% |
| part mix | brick 32%, plate 21%, special 11%, window 10%, wheel 7%, tile 6%, slope 5% | brick 39%, slope 24%, plate 23%, window 5%, tile 4%, round 4%, hinge 1% |

### spaceship (5 real: 894-1 Mobile Ground Tracking Station; 918-1 Space Transport; 6841-1 Mineral Detector; 6861-1 X1 Patrol Craft; 6878-1 Sub Orbital Guardian)

| metric | real sets | ours (8 forges: "flying saucer", "cyberpunk neon hover speeder", "starfighter") |
|---|---|---|
| width × length (studs) | 9 (6–14) × 15 (12–20) | 9.5 (7–11.3) × 14.5 (12.8–16.5) |
| height (bricks) | 7.7 (7.3–8) | 5.7 (4.9–6) |
| pieces (structure) | 54 (48–70) | 44.5 (34.5–53.5) |
| length of typical-size sets | 17.5 (14.3–20.8) (4 sets) | 15 (12–18) (4 sets) |
| w:l, h:l | 0.67, 0.64 | 0.57, 0.37 |
| base | self (wheels 40%, self 60%) | plate (plate 100%) |
| hollow (air in envelope) | 16% (interior 5% of the box) | 1% (interior 0% of the box) |
| wall thickness | 1 stud (1: 59%, 2: 15%, 3+: 26%) | 1.5 stud (1: 60%, 2: 20%, 3+: 20%) |
| bottom band mix | round 37%, wheel 25%, slope 12%; LIGHT_GREY 63%, BLACK 33%, TRANS_ORANGE 4% | round 100%; TRANS_CLEAR 94%, LIGHT_GREY 6% |
| middle band mix | plate 28%, hinge 18%, brick 16%; LIGHT_GREY 66%, BLACK 9%, BLUE 7% | plate 67%, brick 13%, round 12%; LIGHT_GREY 39%, BLACK 26%, DARK_GREY 16% |
| top band mix | plate 40%, hinge 15%, round 5%; LIGHT_GREY 40%, WHITE 8%, BLACK 8% | round 50%, tile 50%; TRANS_BLUE 75%, LIGHT_GREY 25% |
| steps, pcs/step, steps/100 pcs | 12, 4, 25 | 10, 4.47, 22.34 |
| step vs height correlation | 0.73 | 0.97 |
| build phases (mean height, top parts) | 0.29 plate → 0.35 plate → 0.34 brick → 0.33 hinge → 0.43 hinge | 0.18 round → 0.41 plate → 0.53 plate → 0.64 plate → 0.84 round |
| interior / walls / roof at (progress) | 0.25 / 0.45 / 1 | – / 0.56 / 1 |
| sub-assemblies | 100% of models, 2.6 per model, 32% of pieces; roles body×8, door×2, end×1, cab×1, mast×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 80% h0.33 in100%; panel 60% h0.4 in67%; furniture 20% h0.4 in100% | none |
| tiled tops (tile / tile+studs) | 0% (tops: tile 0%, studs 36%, slope 5%) | 5% (tops: tile 4%, studs 88%, slope 7%) |
| off-grid, sideways, brackets, hinges | 28%, 10%, 2%, 15% | 0%, 5%, 0%, 1% |
| part mix | plate 24%, hinge 15%, brick 12%, round 12%, special 10%, slope 9%, wheel 8% | plate 60%, round 19%, brick 11%, tile 5%, slope 4%, hinge 1% |

### spaceStation (2 real: 6885-1 Saturn Base Main Team (Crater Crawler); 6988-1 Alpha Centauri Outpost)

| metric | real sets | ours (4 forges: "space station", "space base") |
|---|---|---|
| width × length (studs) | 16.5 (11.3–21.8) × 32.5 (21.8–43.3) | 7.5 (4–11) × 16.5 (15–18) |
| height (bricks) | 6.3 (4.7–8) | 6.8 (6–7.7) |
| pieces (structure) | 56 (53–59) | 32 (15–49) |
| length of typical-size sets | – (0 sets of typical size) | – (0 sets of typical size) |
| w:l, h:l | 0.53, 0.23 | 0.44, 0.42 |
| base | wheels (wheels 50%, plate 50%) | plate (plate 100%) |
| hollow (air in envelope) | 22% (interior 5% of the box) | 12% (interior 1% of the box) |
| wall thickness | 1.5 stud (1: 49%, 2: 27%, 3+: 25%) | 1.5 stud (1: 50%, 2: 20%, 3+: 30%) |
| bottom band mix | brick 28%, special 19%, plate 17%; BLACK 43%, WHITE 38%, BLUE 17% | round 100%; TRANS_CLEAR 100% |
| middle band mix | plate 33%, snot 17%, brick 13%; BLACK 45%, WHITE 43%, TRANS_RED 10% | plate 57%, round 24%, tile 9%; LIGHT_GREY 55%, TRANS_BLUE 13%, WHITE 13% |
| top band mix | snot 50%, plate 19%, hinge 19%; BLACK 56%, WHITE 32%, TRANS_BLUE 13% | round 100%; LIGHT_GREY 100% |
| steps, pcs/step, steps/100 pcs | 5, 11.2, 9.03 | 10.5, 2.98, 44.56 |
| step vs height correlation | -0.61 | 0.99 |
| build phases (mean height, top parts) | 0.79 interior → 0.88 interior → 0.45 plate → 0.16 plate → 0.17 interior | 0.15 round → 0.36 plate → 0.47 plate → 0.63 plate → 0.84 round |
| interior / walls / roof at (progress) | 0.88 / 0.38 / 0.44 | – / 0.7 / 1 |
| sub-assemblies | 100% of models, 2.5 per model, 31% of pieces; roles body×3, roof×1, end×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | panel 100% h0.3 in0%; steering 50% h0.28 in0% | none |
| tiled tops (tile / tile+studs) | 0% (tops: tile 0%, studs 28%, slope 4%) | 3% (tops: tile 3%, studs 91%, slope 6%) |
| off-grid, sideways, brackets, hinges | 38%, 25%, 11%, 16% | 0%, 4%, 0%, 0% |
| part mix | plate 27%, brick 19%, hinge 16%, snot 11%, round 8%, special 8%, interior 5% | plate 50%, round 34%, tile 7%, special 4%, brick 3%, slope 3% |

### station (4 real: 374-1 Fire Station; 6363-1 Auto Service Station; 2150-1 Train Station; 10159-1 City Airport)

| metric | real sets | ours (4 forges: "fire station", "police station") |
|---|---|---|
| width × length (studs) | 27.5 (23–37.8) × 50.5 (34–72) | 16.5 (14.8–18) × 18 (15.8–20) |
| height (bricks) | 19.7 (14.9–23.2) | 16.7 (16.7–16.7) |
| pieces (structure) | 384 (266–469) | 349 (284–414.3) |
| length of typical-size sets | 64 (50.5–80) (3 sets) | 18 (15.8–20) (4 sets) |
| w:l, h:l | 0.62, 0.37 | 0.92, 0.94 |
| base | plate (plate 75%, wheels 25%) | plate (plate 100%) |
| hollow (air in envelope) | 28% (interior 3% of the box) | 54% (interior 24% of the box) |
| wall thickness | 1.5 stud (1: 52%, 2: 25%, 3+: 24%) | 1 stud (1: 95%, 2: 3%, 3+: 3%) |
| bottom band mix | brick 39%, plate 19%, wheel 14%; BLACK 27%, RED 21%, YELLOW 17% | brick 42%, plate 32%, tile 9%; RED 27%, BLACK 25%, WHITE 24% |
| middle band mix | brick 37%, plate 26%, slope 8%; YELLOW 33%, RED 14%, BLUE 12% | brick 54%, plate 33%, window 5%; WHITE 36%, RED 30%, LIGHT_GREY 22% |
| top band mix | brick 52%, plate 12%, slope 12%; BLUE 25%, YELLOW 23%, BLACK 21% | plate 81%, tile 12%, brick 3%; BLACK 71%, LIGHT_GREY 30% |
| steps, pcs/step, steps/100 pcs | 22.5, 10.68, 9.61 | 35, 9.91, 10.11 |
| step vs height correlation | 0.41 | 0.99 |
| build phases (mean height, top parts) | 0.18 plate → 0.18 plate → 0.26 brick → 0.33 brick → 0.35 brick | 0.08 brick → 0.24 brick → 0.4 plate → 0.57 brick → 0.83 plate |
| interior / walls / roof at (progress) | 0.29 / 0.51 / 0.78 | – / 0.65 / 0.93 |
| sub-assemblies | 100% of models, 3.75 per model, 39% of pieces; roles body×12, ladder×1, roof×1, end×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | seat 75% h0.18 in83%; steering 75% h0.24 in33%; furniture 25% h0.5 in50%; panel 50% h0.47 in100% | bed 50% brick-built; furniture 50% brick-built |
| tiled tops (tile / tile+studs) | 0% (tops: tile 2%, studs 57%, slope 6%) | 5% (tops: tile 5%, studs 90%, slope 2%) |
| off-grid, sideways, brackets, hinges | 21%, 2%, 2%, 6% | 0%, 1%, 1%, 2% |
| part mix | brick 36%, plate 24%, window 7%, wheel 6%, slope 6%, hinge 6%, special 5% | brick 45%, plate 38%, tile 6%, window 5%, round 2%, hinge 2%, wheel 1% |

### tower (1 real: 6061-1 Siege Tower)

| metric | real sets | ours (8 forges: "tall modern glass skyscraper", "clock tower", "water tower") |
|---|---|---|
| width × length (studs) | 8 (8–8) × 17 (17–17) | 7.5 (6–9.8) × 7.5 (7–10) |
| height (bricks) | 16 (16–16) | 12.8 (10.9–16.7) |
| pieces (structure) | 117 (117–117) | 55 (23–140.5) |
| length of typical-size sets | – (0 sets of typical size) | 16 (16–16) (2 sets) |
| w:l, h:l | 0.47, 0.94 | 0.97, 1.56 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 46% (interior 15% of the box) | 10% (interior 3% of the box) |
| wall thickness | 2 stud (1: 39%, 2: 37%, 3+: 24%) | 1 stud (1: 100%, 2: 0%, 3+: 0%) |
| bottom band mix | plate 57%, wheel 35%, brick 9%; BLACK 83%, BROWN 17% | brick 49%, round 34%, plate 8%; LIGHT_GREY 47%, TAN 17%, WHITE 13% |
| middle band mix | plate 33%, brick 21%, snot 11%; BLACK 93%, LIGHT_GREY 6%, BROWN 1% | brick 54%, round 22%, plate 19%; LIGHT_GREY 53%, WHITE 18%, DARK_GREY 15% |
| top band mix | brick 46%, plate 42%, snot 8%; BLACK 100% | round 27%, slope 19%, brick 15%; GOLD 25%, DARK_RED 24%, WHITE 13% |
| steps, pcs/step, steps/100 pcs | 19, 6.16, 16.24 | 19, 2.86, 35.95 |
| step vs height correlation | 0.76 | 1 |
| build phases (mean height, top parts) | 0.13 plate → 0.31 brick → 0.49 plate → 0.65 plate → 0.73 plate | 0.08 brick → 0.27 brick → 0.45 brick → 0.65 brick → 0.85 plate |
| interior / walls / roof at (progress) | – / 0.56 / 0.89 | – / 0.45 / 0.93 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 0% (tops: tile 0%, studs 73%, slope 5%) | 0% (tops: tile 5%, studs 80%, slope 14%) |
| off-grid, sideways, brackets, hinges | 15%, 11%, 9%, 8% | 0%, 0%, 0%, 0% |
| part mix | plate 39%, brick 24%, snot 9%, wheel 8%, hinge 8%, special 6%, slope 5% | brick 49%, round 28%, plate 13%, window 5%, slope 4%, tile 2% |

### tractor (2 real: 6692-1 Tractor Trailer; 7634-1 Tractor)

| metric | real sets | ours (4 forges: "tractor", "farm vehicle") |
|---|---|---|
| width × length (studs) | 6 (5–7) × 17 (15–19) | 8.5 (6–11) × 13.5 (13–14) |
| height (bricks) | 7.3 (7–7.7) | 6 (4.7–7.3) |
| pieces (structure) | 78.5 (75.3–81.8) | 69 (65–73.8) |
| length of typical-size sets | 17 (15–19) (2 sets) | 13.5 (13–14) (4 sets) |
| w:l, h:l | 0.41, 0.47 | 0.64, 0.45 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 17% (interior 12% of the box) | 10% (interior 4% of the box) |
| wall thickness | 1 stud (1: 68%, 2: 19%, 3+: 13%) | 1 stud (1: 66%, 2: 8%, 3+: 26%) |
| bottom band mix | wheel 78%, round 11%, plate 11%; BLACK 78%, WHITE 22% | wheel 47%, plate 41%, tile 14%; BLACK 55%, LIGHT_GREY 35%, YELLOW 9% |
| middle band mix | plate 35%, hinge 14%, special 14%; YELLOW 32%, BLACK 23%, RED 13% | plate 43%, brick 27%, tile 10%; BLACK 31%, RED 26%, GREEN 20% |
| top band mix | hinge 47%, slope 25%, tile 14%; YELLOW 50%, RED 50% | plate 75%, slope 25%; RED 50%, GREEN 25%, YELLOW 25% |
| steps, pcs/step, steps/100 pcs | 22, 3.57, 28.22 | 13, 5.49, 18.67 |
| step vs height correlation | 0.2 | 0.98 |
| build phases (mean height, top parts) | 0.21 plate → 0.4 plate → 0.48 plate → 0.38 plate → 0.38 wheel | 0.17 wheel → 0.35 plate → 0.53 brick → 0.66 brick → 0.84 plate |
| interior / walls / roof at (progress) | 0.41 / 0.69 / 0.61 | – / 0.67 / 0.98 |
| sub-assemblies | 50% of models, 1 per model, 24% of pieces; roles body×2 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 100% h0.5 in100% | none |
| tiled tops (tile / tile+studs) | 2% (tops: tile 1%, studs 44%, slope 14%) | 16% (tops: tile 10%, studs 50%, slope 20%) |
| off-grid, sideways, brackets, hinges | 25%, 16%, 3%, 13% | 0%, 6%, 6%, 0% |
| part mix | plate 30%, hinge 13%, wheel 13%, special 12%, brick 10%, slope 7%, window 5% | plate 44%, brick 20%, tile 10%, wheel 10%, slope 8%, snot 6%, round 3% |

### train (5 real: 112-2 Locomotive with Motor; 126-1 Steam Locomotive (Push); 7730-1 Electric Goods Train; 4536-1 Blue Hopper Car; 10001-1 Metroliner)

| metric | real sets | ours (6 forges: "steam train", "train", "locomotive") |
|---|---|---|
| width × length (studs) | 7 (6–8) × 21 (20–37) | 10 (10–10) × 36 (36–36) |
| height (bricks) | 9.3 (9–9.7) | 7 (7–7) |
| pieces (structure) | 123 (78–319) | 233 (232.3–234.5) |
| length of typical-size sets | 37 (28–59.5) (3 sets) | 36 (36–36) (6 sets) |
| w:l, h:l | 0.3, 0.35 | 0.28, 0.19 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 29% (interior 13% of the box) | 21% (interior 5% of the box) |
| wall thickness | 1 stud (1: 54%, 2: 20%, 3+: 26%) | 1 stud (1: 89%, 2: 4%, 3+: 8%) |
| bottom band mix | wheel 31%, special 28%, brick 14%; BLACK 67%, RED 21%, LIGHT_GREY 10% | plate 33%, tile 33%, wheel 26%; DARK_GREY 35%, BROWN 33%, LIGHT_GREY 30% |
| middle band mix | brick 41%, plate 25%, slope 14%; BLACK 38%, BLUE 25%, LIGHT_GREY 12% | plate 56%, brick 22%, round 6%; BLACK 38%, RED 25%, GREEN 21% |
| top band mix | plate 51%, slope 29%, tile 11%; LIGHT_GREY 46%, BLACK 30%, BLUE 15% | round 100%; BLACK 100% |
| steps, pcs/step, steps/100 pcs | 7, 33, 3.03 | 16, 14.56, 6.87 |
| step vs height correlation | 0.21 | 0.99 |
| build phases (mean height, top parts) | 0.3 plate → 0.43 brick → 0.69 brick → 0.48 brick → 0.45 plate | 0.1 plate → 0.28 plate → 0.46 plate → 0.62 brick → 0.76 plate |
| interior / walls / roof at (progress) | 0.34 / 0.33 / 0.67 | – / 0.53 / 1 |
| sub-assemblies | 80% of models, 1.8 per model, 25% of pieces; roles body×6, engine×1, end×1, wheels×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 20% h0.45 in0%; seat 20% h0.44 in100% | seat 100% brick-built; table 100% brick-built |
| tiled tops (tile / tile+studs) | 0% (tops: tile 8%, studs 39%, slope 29%) | 25% (tops: tile 21%, studs 63%, slope 1%) |
| off-grid, sideways, brackets, hinges | 13%, 1%, 1%, 3% | 0%, 2%, 0%, 1% |
| part mix | brick 32%, plate 28%, slope 15%, wheel 5%, special 5%, window 5%, tile 4% | plate 50%, brick 18%, tile 9%, wheel 9%, round 6%, window 4%, slope 2% |

### truck (4 real: 6679-2 Exxon Tow Truck; 1772-1 Airport Container Truck; 10156-1 LEGO Truck; 3179-1 Repair Truck)

| metric | real sets | ours (8 forges: "pickup truck", "truck", "lorry") |
|---|---|---|
| width × length (studs) | 5 (4–6.3) × 13.5 (11.8–15.8) | 8 (8–8) × 18 (18–18) |
| height (bricks) | 7.5 (6.8–8.1) | 5.3 (5–5.7) |
| pieces (structure) | 86.5 (68–100.5) | 109.5 (99–120) |
| length of typical-size sets | 15 (13–16.5) (3 sets) | 18 (18–18) (8 sets) |
| w:l, h:l | 0.35, 0.52 | 0.44, 0.3 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 15% (interior 8% of the box) | 13% (interior 7% of the box) |
| wall thickness | 1.25 stud (1: 54%, 2: 19%, 3+: 27%) | 1 stud (1: 68%, 2: 6%, 3+: 27%) |
| bottom band mix | wheel 64%, plate 14%, round 6%; BLACK 55%, LIGHT_GREY 14%, WHITE 13% | wheel 100%; LIGHT_GREY 100% |
| middle band mix | plate 28%, brick 13%, hinge 11%; YELLOW 23%, WHITE 17%, RED 14% | plate 48%, brick 21%, tile 9%; BLACK 35%, YELLOW 33%, LIGHT_GREY 11% |
| top band mix | plate 50%, brick 13%, hinge 13%; WHITE 29%, TRANS_ORANGE 25%, YELLOW 25% | plate 68%, tile 33%; LIGHT_GREY 38%, TRANS_ORANGE 33%, YELLOW 30% |
| steps, pcs/step, steps/100 pcs | 15.5, 4.64, 21.86 | 11.5, 9.5, 10.56 |
| step vs height correlation | 0.48 | 0.99 |
| build phases (mean height, top parts) | 0.22 plate → 0.28 plate → 0.33 plate → 0.53 plate → 0.56 wheel | 0.23 plate → 0.35 plate → 0.51 plate → 0.62 brick → 0.85 plate |
| interior / walls / roof at (progress) | 0.74 / 0.74 / 0.93 | – / 0.62 / 0.95 |
| sub-assemblies | 50% of models, 0.75 per model, 20% of pieces; roles body×3 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | steering 100% h0.45 in88%; seat 25% h0.47 in100%; furniture 25% h0.57 in50% | seat 100% brick-built; steering 100% brick-built; panel 100% brick-built |
| tiled tops (tile / tile+studs) | 16% (tops: tile 8%, studs 32%, slope 19%) | 12% (tops: tile 8%, studs 62%, slope 15%) |
| off-grid, sideways, brackets, hinges | 33%, 11%, 6%, 10% | 0%, 5%, 5%, 0% |
| part mix | plate 27%, wheel 16%, hinge 10%, brick 10%, tile 9%, window 7%, snot 6% | plate 47%, brick 18%, wheel 11%, tile 9%, snot 5%, slope 5%, round 4% |

### windmill (1 real: 7747-1 Wind Turbine Transport)

| metric | real sets | ours (2 forges: "windmill") |
|---|---|---|
| width × length (studs) | 8 (8–8) × 21 (21–21) | 11.5 (11.3–11.8) × 12 (12–12) |
| height (bricks) | 9.3 (9.3–9.3) | 7.7 (7.7–7.7) |
| pieces (structure) | 167 (167–167) | 49.5 (48.8–50.3) |
| length of typical-size sets | – (0 sets of typical size) | – (0 sets of typical size) |
| w:l, h:l | 0.38, 0.44 | 0.96, 0.64 |
| base | wheels (wheels 100%) | plate (plate 100%) |
| hollow (air in envelope) | 18% (interior 8% of the box) | 14% (interior 2% of the box) |
| wall thickness | 2 stud (1: 13%, 2: 51%, 3+: 37%) | 1 stud (1: 93%, 2: 5%, 3+: 1%) |
| bottom band mix | plate 37%, wheel 35%, special 12%; BLACK 37%, LIGHT_GREY 20%, DARK_GREY 16% | brick 49%, round 39%, plate 10%; RED 44%, BROWN 22%, LIGHT_GREY 12% |
| middle band mix | plate 25%, brick 15%, tile 11%; RED 40%, LIGHT_GREY 22%, BLACK 17% | plate 59%, brick 21%, round 11%; RED 59%, GREEN 14%, DARK_RED 14% |
| top band mix | tile 60%, plate 33%, special 7%; LIGHT_GREY 40%, DARK_GREY 20%, WHITE 13% | –;  |
| steps, pcs/step, steps/100 pcs | 67, 2.49, 40.12 | 15, 3.31, 30.27 |
| step vs height correlation | 0.6 | 0.97 |
| build phases (mean height, top parts) | 0.22 plate → 0.18 plate → 0.35 plate → 0.59 tile → 0.6 plate | 0.1 round → 0.23 brick → 0.42 brick → 0.56 plate → 0.71 plate |
| interior / walls / roof at (progress) | 0.73 / 0.47 / 0.8 | – / 0.5 / – |
| sub-assemblies | 100% of models, 2 per model, 14% of pieces; roles upper×1, body×1 | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | seat 100% h0.43 in100%; steering 100% h0.45 in100%; furniture 100% h0.55 in50% | none |
| tiled tops (tile / tile+studs) | 38% (tops: tile 17%, studs 27%, slope 18%) | 1% (tops: tile 1%, studs 93%, slope 0%) |
| off-grid, sideways, brackets, hinges | 32%, 22%, 3%, 4% | 0%, 4%, 0%, 2% |
| part mix | plate 29%, tile 16%, wheel 11%, special 10%, brick 9%, slope 7%, interior 6% | plate 38%, brick 32%, round 23%, window 2%, special 2%, hinge 2%, tile 1% |

<!-- AUTO:END -->
