# How real sets are built (StudForge construction analysis)

StudForge's builders were written from intuition. This analysis measures how official sets are actually put together,
using the LDraw community's part-exact reconstructions (the Official Model Repository, converted to StudForge's format
by `scripts/ldraw/omr-convert.mjs`, see `docs/studforge-ldraw.md`), and measures our own forges of the same subjects in
exactly the same way, so the two can be compared side by side.

- Script: `node scripts/ldraw/analyse.mjs --lib <ldraw library dir>` (real models + our forges) or `--generated`
  (our forges only). Output: `public/studforge/data/construction.json` (per-subject profiles, loaded by
  `public/studforge/js/construction.js`) and the AUTO block at the end of this file.
- The metrics are computed by `FORGE.construction.measure()` in `construction.js`, which the script loads in a vm and
  the REAL SETS panel runs live on the model on screen, so "this model" in the panel is measured like the real sets.

## What is measured

| metric | definition |
|---|---|
| proportions | grid bounding box of the structure: width (short side) × length (long side) in studs, height in bricks (3 plates). Minifigs and loose accessories are left out; a display base or baseplate (one plate layer under ≥ 60% of the footprint) and flat decoration on it (≤ 2 plates tall, < 10% of the pieces) are measured apart, so a truck on a road plate is measured as the truck. |
| base | `plate` (stands on a base plate), `wheels` (stands on its own wheels), `self` |
| hollow | empty cells strictly between the lowest and highest occupied plate of each column, plus whole columns enclosed by walls (2D flood fill from outside), as a share of that envelope; `interior` = the same air as a share of the bounding box |
| wall thickness | in the middle height band, runs of solid cells with interior air on one side and the outside on the other (median, and the share of 1-, 2- and 3+-stud runs); `solid` when a model has no such walls |
| layer recipe | bottom 15% / middle / top 20% of the height: share of each part category (plates, bricks, tiles, slopes, round, brackets/SNOT, wheels, windows/doors, hinges/clips, minifig-scale interior items, special) and the top colours |
| build order | progress through the real instruction steps (0 = first step, 1 = last) against height: 5 phases with their mean height and main part kinds, the correlation between step and height, pieces per step, steps per 100 pieces, the median progress at which interior items, mid-height walls and the top band are placed, and the sub-assemblies (submodels) with a role inferred from their names or position |
| interiors | seats (4079…), steering wheels (3829c01…), tables, beds, control panels (patterned tiles/slopes), furniture: share of sets that have them, how high (0–1), how far along the length, and whether walls surround them |
| techniques | off-grid parts (rotated off the 90° lattice), sideways parts (up axis not vertical), bracket/SNOT, hinge/clip, window, wheel shares; top finish: in each column the part seen from above, `tileTop` = tile columns ÷ (tile + stud columns) |

Generated models have no instruction steps of their own: their "steps" are the build layers (the booklet's order), so
their build order is bottom-up by construction (step/height correlation ≈ 0.99).

## Status

Generated-model pass done (the AUTO block below currently profiles OUR forges only, `source: "generated"`); the real-set
pass runs when the converted OMR models are available, and the findings, the side-by-side comparison and the builder
recommendations below are rewritten from it.

### What our generator does today (generated pass)

- Every forged model stands on a display plate, vehicles included (base `plate` in 42 of 42 subjects). Real vehicles
  stand on their wheels.
- Vehicles are 6–8 studs wide (cars and police cars 6 × 14, fire trucks and ambulances 8 × 18, buses 8 × 20, 4.7–8
  bricks tall). The fire truck is 8 bricks tall, which looks high for a minifig-scale truck.
- Hollowness is low outside buildings: cars and police cars 5%, planes 7%, tanks 3%, spaceships 1%, submarines solid.
  Buildings are hollow (houses 35%, shops 36%, stations 54%) with 1-stud walls; the castle only 12% (thick curtain walls,
  no interior rooms).
- No minifig-scale interior items anywhere: no seats, no steering wheels, no control panels (our catalog has none).
- Tile finishing varies widely: motorcycles 50%, tanks 46%, food 34%, fire trucks 33%, cars 30%, but houses 14%,
  castles 2%, boats 6%, planes 0%.
- Technique shares are small: brackets ≤ 7% (cars and police cars), hinges mostly on creatures (dragon 23%, dinosaur 18%,
  helicopter 15%), sideways parts ≤ 9%.
- No sub-assemblies: every model is one build, bottom-up, about 2–17 pieces per layer.

## Generator wiring

- `ctx.construction` (builders): the subject's profile, `FORGE.construction.profile(knowledgeSubjectId)`, or null.
- Length calibration (`BrickGenerator.calibrateLength`): when the profile comes from two or more real sets and a forge's
  body (display base excluded) is under 0.7× or over 1.4× their median length, it is forged once more at a scale nudged
  toward it (×0.75…×1.35, on top of the piece-count nudge) and kept when it lands nearer. Prompts with a size word,
  minifig scale, scenes and blueprints are left alone. `model.construction.length` reports it.
- Tile finishing (`FORGE.construction.finishTops`, run in `assemble` after anchoring): exposed top plates (nothing on,
  over or linked into them, not the two lowest layers, not struts) become tiles of the same footprint, then longer
  plates are split into tiles covering the same cells (undone if any part would lose its path to the ground), until the
  model's tile share reaches the real one. `model.construction.tops` reports `{ from, to, target, tiled, split }`.
- Both act only on profiles with `source: "omr"` and n ≥ 2; the generated baseline never changes a forge.
- REAL SETS panel: a "HOW REAL SETS ARE BUILT" section (typical size, hollowness, wall thickness, tiled tops, brackets
  and hinges, pieces per step, interior elements, build order) with this model measured alongside.

## Per-subject numbers

<!-- AUTO:BEGIN (scripts/ldraw/analyse.mjs rewrites this block) -->
_Generated 2026-10-12 by `node scripts/ldraw/analyse.mjs --generated`; source: our own forges only (no real models yet)._

### fireTruck

| metric | profile | ours (6 forges: "fire truck", "red fire truck", "fire engine") |
|---|---|---|
| width × length (studs) | 8 (8–8) × 18 (18–18) | 8 (8–8) × 18 (18–18) |
| height (bricks) | 8 (8–8) | 8 (8–8) |
| pieces (structure) | 139 (139–139) | 139 (139–139) |
| w:l, h:l | 0.44, 0.44 | 0.44, 0.44 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 25% (interior 11% of the box) | 25% (interior 11% of the box) |
| wall thickness | 1 stud (1: 76%, 2: 10%, 3+: 14%) | 1 stud (1: 76%, 2: 10%, 3+: 14%) |
| bottom band mix | plate 57%, wheel 43%; BLACK 79%, LIGHT_GREY 21% | plate 57%, wheel 43%; BLACK 79%, LIGHT_GREY 21% |
| middle band mix | plate 35%, brick 25%, tile 16%; RED 51%, DARK_GREY 12%, LIGHT_GREY 11% | plate 35%, brick 25%, tile 16%; RED 51%, DARK_GREY 12%, LIGHT_GREY 11% |
| top band mix | plate 44%, tile 44%, brick 11%; LIGHT_GREY 100% | plate 44%, tile 44%, brick 11%; LIGHT_GREY 100% |
| steps, pcs/step, steps/100 pcs | 19, 7.32, 13.67 | 19, 7.32, 13.67 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.16 plate → 0.34 plate → 0.53 brick → 0.73 plate → 0.94 plate | 0.16 plate → 0.34 plate → 0.53 brick → 0.73 plate → 0.94 plate |
| interior / walls / roof at (progress) | – / 0.44 / 0.94 | – / 0.44 / 0.94 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 33% (tops: tile 23%, studs 48%, slope 15%) | 33% (tops: tile 23%, studs 48%, slope 15%) |
| off-grid, sideways, brackets, hinges | 0%, 4%, 4%, 1% | 0%, 4%, 4%, 1% |
| part mix | plate 40%, brick 19%, tile 14%, wheel 9%, round 6%, snot 4%, slope 4% | plate 40%, brick 19%, tile 14%, wheel 9%, round 6%, snot 4%, slope 4% |

### policeCar

| metric | profile | ours (6 forges: "police car", "cop car", "patrol car") |
|---|---|---|
| width × length (studs) | 6 (6–6) × 14 (14–14) | 6 (6–6) × 14 (14–14) |
| height (bricks) | 4.7 (4.7–4.7) | 4.7 (4.7–4.7) |
| pieces (structure) | 74 (73–75) | 74 (73–75) |
| w:l, h:l | 0.43, 0.33 | 0.43, 0.33 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 5% (interior 2% of the box) | 5% (interior 2% of the box) |
| wall thickness | 1 stud (1: 63%, 2: 9%, 3+: 28%) | 1 stud (1: 63%, 2: 9%, 3+: 28%) |
| bottom band mix | –;  | –;  |
| middle band mix | plate 45%, brick 19%, slope 10%; WHITE 41%, BLACK 25%, TRANS_CLEAR 12% | plate 45%, brick 19%, slope 10%; WHITE 41%, BLACK 25%, TRANS_CLEAR 12% |
| top band mix | plate 46%, slope 43%, tile 11%; WHITE 86%, TRANS_BLUE 6%, TRANS_RED 6% | plate 46%, slope 43%, tile 11%; WHITE 86%, TRANS_BLUE 6%, TRANS_RED 6% |
| steps, pcs/step, steps/100 pcs | 10.5, 7.06, 14.18 | 10.5, 7.06, 14.18 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.18 plate → 0.3 plate → 0.5 plate → 0.6 plate → 0.78 slope | 0.18 plate → 0.3 plate → 0.5 plate → 0.6 plate → 0.78 slope |
| interior / walls / roof at (progress) | – / 0.53 / 1 | – / 0.53 / 1 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 18% (tops: tile 12%, studs 43%, slope 32%) | 18% (tops: tile 12%, studs 43%, slope 32%) |
| off-grid, sideways, brackets, hinges | 0%, 7%, 7%, 0% | 0%, 7%, 7%, 0% |
| part mix | plate 45%, brick 18%, slope 12%, tile 8%, wheel 8%, snot 7%, round 3% | plate 45%, brick 18%, slope 12%, tile 8%, wheel 8%, snot 7%, round 3% |

### ambulance

| metric | profile | ours (2 forges: "ambulance") |
|---|---|---|
| width × length (studs) | 8 (8–8) × 18 (18–18) | 8 (8–8) × 18 (18–18) |
| height (bricks) | 6 (6–6) | 6 (6–6) |
| pieces (structure) | 123 (123–123) | 123 (123–123) |
| w:l, h:l | 0.44, 0.33 | 0.44, 0.33 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 23% (interior 12% of the box) | 23% (interior 12% of the box) |
| wall thickness | 1 stud (1: 80%, 2: 2%, 3+: 17%) | 1 stud (1: 80%, 2: 2%, 3+: 17%) |
| bottom band mix | –;  | –;  |
| middle band mix | plate 47%, brick 17%, wheel 12%; WHITE 43%, BLACK 30%, LIGHT_GREY 9% | plate 47%, brick 17%, wheel 12%; WHITE 43%, BLACK 30%, LIGHT_GREY 9% |
| top band mix | brick 37%, tile 32%, plate 32%; WHITE 37%, LIGHT_GREY 32%, TRANS_ORANGE 11% | brick 37%, tile 32%, plate 32%; WHITE 37%, LIGHT_GREY 32%, TRANS_ORANGE 11% |
| steps, pcs/step, steps/100 pcs | 13, 9.46, 10.57 | 13, 9.46, 10.57 |
| step vs height correlation | 0.98 | 0.98 |
| build phases (mean height, top parts) | 0.2 plate → 0.34 plate → 0.47 brick → 0.69 brick → 0.89 tile | 0.2 plate → 0.34 plate → 0.47 brick → 0.69 brick → 0.89 tile |
| interior / walls / roof at (progress) | – / 0.42 / 0.83 | – / 0.42 / 0.83 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 16% (tops: tile 11%, studs 59%, slope 15%) | 16% (tops: tile 11%, studs 59%, slope 15%) |
| off-grid, sideways, brackets, hinges | 0%, 5%, 5%, 0% | 0%, 5%, 5%, 0% |
| part mix | plate 45%, brick 20%, tile 12%, wheel 10%, snot 5%, slope 5%, round 2% | plate 45%, brick 20%, tile 12%, wheel 10%, snot 5%, slope 5%, round 2% |

### car

| metric | profile | ours (8 forges: "yellow sports car with a racing stripe", "convertible", "race car") |
|---|---|---|
| width × length (studs) | 6 (6–6) × 14 (14–14) | 6 (6–6) × 14 (14–14) |
| height (bricks) | 4.7 (4.5–4.7) | 4.7 (4.5–4.7) |
| pieces (structure) | 78.5 (71.5–84) | 78.5 (71.5–84) |
| w:l, h:l | 0.43, 0.33 | 0.43, 0.33 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 5% (interior 2% of the box) | 5% (interior 2% of the box) |
| wall thickness | 1 stud (1: 64%, 2: 8%, 3+: 27%) | 1 stud (1: 64%, 2: 8%, 3+: 27%) |
| bottom band mix | –;  | –;  |
| middle band mix | plate 51%, brick 17%, wheel 9%; RED 33%, BLACK 26%, YELLOW 10% | plate 51%, brick 17%, wheel 9%; RED 33%, BLACK 26%, YELLOW 10% |
| top band mix | slope 49%, plate 29%, tile 22%; RED 43%, WHITE 22%, YELLOW 11% | slope 49%, plate 29%, tile 22%; RED 43%, WHITE 22%, YELLOW 11% |
| steps, pcs/step, steps/100 pcs | 11.5, 6.88, 14.59 | 11.5, 6.88, 14.59 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.19 plate → 0.34 plate → 0.5 plate → 0.66 plate → 0.85 slope | 0.19 plate → 0.34 plate → 0.5 plate → 0.66 plate → 0.85 slope |
| interior / walls / roof at (progress) | – / 0.49 / 0.96 | – / 0.49 / 0.96 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 30% (tops: tile 17%, studs 39%, slope 32%) | 30% (tops: tile 17%, studs 39%, slope 32%) |
| off-grid, sideways, brackets, hinges | 0%, 6%, 6%, 0% | 0%, 6%, 6%, 0% |
| part mix | plate 49%, brick 15%, slope 11%, tile 9%, wheel 8%, snot 6%, round 3% | plate 49%, brick 15%, slope 11%, tile 9%, wheel 8%, snot 6%, round 3% |

### truck

| metric | profile | ours (8 forges: "pickup truck", "truck", "lorry") |
|---|---|---|
| width × length (studs) | 8 (8–8) × 18 (18–18) | 8 (8–8) × 18 (18–18) |
| height (bricks) | 5.3 (5–5.7) | 5.3 (5–5.7) |
| pieces (structure) | 109.5 (99–120) | 109.5 (99–120) |
| w:l, h:l | 0.44, 0.3 | 0.44, 0.3 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 13% (interior 7% of the box) | 13% (interior 7% of the box) |
| wall thickness | 1 stud (1: 68%, 2: 6%, 3+: 27%) | 1 stud (1: 68%, 2: 6%, 3+: 27%) |
| bottom band mix | –;  | –;  |
| middle band mix | plate 47%, brick 17%, wheel 12%; BLACK 34%, YELLOW 32%, LIGHT_GREY 13% | plate 47%, brick 17%, wheel 12%; BLACK 34%, YELLOW 32%, LIGHT_GREY 13% |
| top band mix | plate 50%, tile 26%, brick 24%; LIGHT_GREY 44%, YELLOW 30%, TRANS_ORANGE 26% | plate 50%, tile 26%, brick 24%; LIGHT_GREY 44%, YELLOW 30%, TRANS_ORANGE 26% |
| steps, pcs/step, steps/100 pcs | 11.5, 9.5, 10.56 | 11.5, 9.5, 10.56 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.23 plate → 0.35 plate → 0.51 plate → 0.62 brick → 0.85 plate | 0.23 plate → 0.35 plate → 0.51 plate → 0.62 brick → 0.85 plate |
| interior / walls / roof at (progress) | – / 0.48 / 0.91 | – / 0.48 / 0.91 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 12% (tops: tile 8%, studs 62%, slope 15%) | 12% (tops: tile 8%, studs 62%, slope 15%) |
| off-grid, sideways, brackets, hinges | 0%, 5%, 5%, 0% | 0%, 5%, 5%, 0% |
| part mix | plate 47%, brick 18%, wheel 11%, tile 9%, snot 5%, slope 5%, round 4% | plate 47%, brick 18%, wheel 11%, tile 9%, snot 5%, slope 5%, round 4% |

### monsterTruck

| metric | profile | ours (4 forges: "monster truck", "stunt truck") |
|---|---|---|
| width × length (studs) | 9.5 (8–11) × 18.5 (18–19) | 9.5 (8–11) × 18.5 (18–19) |
| height (bricks) | 6.2 (5.7–6.7) | 6.2 (5.7–6.7) |
| pieces (structure) | 117 (114–120) | 117 (114–120) |
| w:l, h:l | 0.51, 0.33 | 0.51, 0.33 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 12% (interior 7% of the box) | 12% (interior 7% of the box) |
| wall thickness | 1.25 stud (1: 63%, 2: 5%, 3+: 33%) | 1.25 stud (1: 63%, 2: 5%, 3+: 33%) |
| bottom band mix | tile 50%; YELLOW 43%, LIGHT_GREY 7% | tile 50%; YELLOW 43%, LIGHT_GREY 7% |
| middle band mix | plate 47%, brick 17%, wheel 12%; BLACK 33%, RED 32%, LIGHT_GREY 14% | plate 47%, brick 17%, wheel 12%; BLACK 33%, RED 32%, LIGHT_GREY 14% |
| top band mix | tile 34%, plate 34%, brick 24%; LIGHT_GREY 53%, TRANS_CLEAR 18%, TRANS_ORANGE 16% | tile 34%, plate 34%, brick 24%; LIGHT_GREY 53%, TRANS_CLEAR 18%, TRANS_ORANGE 16% |
| steps, pcs/step, steps/100 pcs | 11.5, 10.18, 9.82 | 11.5, 10.18, 9.82 |
| step vs height correlation | 0.97 | 0.97 |
| build phases (mean height, top parts) | 0.26 plate → 0.41 plate → 0.54 plate → 0.65 brick → 0.86 plate | 0.26 plate → 0.41 plate → 0.54 plate → 0.65 brick → 0.86 plate |
| interior / walls / roof at (progress) | – / 0.48 / 0.96 | – / 0.48 / 0.96 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 20% (tops: tile 12%, studs 52%, slope 13%) | 20% (tops: tile 12%, studs 52%, slope 13%) |
| off-grid, sideways, brackets, hinges | 0%, 5%, 5%, 0% | 0%, 5%, 5%, 0% |
| part mix | plate 44%, brick 18%, tile 13%, wheel 11%, round 5%, snot 5%, slope 5% | plate 44%, brick 18%, tile 13%, wheel 11%, round 5%, snot 5%, slope 5% |

### garbageTruck

| metric | profile | ours (8 forges: "garbage truck", "recycling truck", "trash truck") |
|---|---|---|
| width × length (studs) | 8 (8–8) × 18 (18–18) | 8 (8–8) × 18 (18–18) |
| height (bricks) | 5.7 (5.7–5.7) | 5.7 (5.7–5.7) |
| pieces (structure) | 120 (120–120) | 120 (120–120) |
| w:l, h:l | 0.44, 0.31 | 0.44, 0.31 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 23% (interior 13% of the box) | 23% (interior 13% of the box) |
| wall thickness | 1 stud (1: 75%, 2: 2%, 3+: 23%) | 1 stud (1: 75%, 2: 2%, 3+: 23%) |
| bottom band mix | –;  | –;  |
| middle band mix | plate 44%, brick 22%, wheel 11%; BLACK 30%, LIGHT_GREY 28%, WHITE 14% | plate 44%, brick 22%, wheel 11%; BLACK 30%, LIGHT_GREY 28%, WHITE 14% |
| top band mix | brick 47%, plate 40%, tile 13%; WHITE 47%, LIGHT_GREY 40%, TRANS_ORANGE 13% | brick 47%, plate 40%, tile 13%; WHITE 47%, LIGHT_GREY 40%, TRANS_ORANGE 13% |
| steps, pcs/step, steps/100 pcs | 12, 10, 10 | 12, 10, 10 |
| step vs height correlation | 0.98 | 0.98 |
| build phases (mean height, top parts) | 0.22 plate → 0.36 plate → 0.49 brick → 0.65 brick → 0.88 plate | 0.22 plate → 0.36 plate → 0.49 brick → 0.65 brick → 0.88 plate |
| interior / walls / roof at (progress) | – / 0.45 / 0.91 | – / 0.45 / 0.91 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 12% (tops: tile 8%, studs 62%, slope 15%) | 12% (tops: tile 8%, studs 62%, slope 15%) |
| off-grid, sideways, brackets, hinges | 0%, 5%, 5%, 0% | 0%, 5%, 5%, 0% |
| part mix | plate 43%, brick 25%, wheel 10%, tile 8%, snot 5%, slope 5%, round 3% | plate 43%, brick 25%, wheel 10%, tile 8%, snot 5%, slope 5%, round 3% |

### bus

| metric | profile | ours (4 forges: "school bus", "bus") |
|---|---|---|
| width × length (studs) | 8 (8–8) × 20 (20–20) | 8 (8–8) × 20 (20–20) |
| height (bricks) | 6 (6–6) | 6 (6–6) |
| pieces (structure) | 172.5 (169–176) | 172.5 (169–176) |
| w:l, h:l | 0.4, 0.3 | 0.4, 0.3 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 18% (interior 10% of the box) | 18% (interior 10% of the box) |
| wall thickness | 1 stud (1: 53%, 2: 45%, 3+: 2%) | 1 stud (1: 53%, 2: 45%, 3+: 2%) |
| bottom band mix | –;  | –;  |
| middle band mix | plate 37%, brick 27%, slope 11%; BLACK 26%, DARK_BLUE 24%, YELLOW 18% | plate 37%, brick 27%, slope 11%; BLACK 26%, DARK_BLUE 24%, YELLOW 18% |
| top band mix | brick 54%, plate 40%, tile 7%; RED 48%, YELLOW 29%, BLACK 20% | brick 54%, plate 40%, tile 7%; RED 48%, YELLOW 29%, BLACK 20% |
| steps, pcs/step, steps/100 pcs | 12, 14.38, 6.96 | 12, 14.38, 6.96 |
| step vs height correlation | 0.98 | 0.98 |
| build phases (mean height, top parts) | 0.2 plate → 0.34 plate → 0.47 brick → 0.64 brick → 0.83 slope | 0.2 plate → 0.34 plate → 0.47 brick → 0.64 brick → 0.83 slope |
| interior / walls / roof at (progress) | – / 0.73 / 0.82 | – / 0.73 / 0.82 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 10% (tops: tile 9%, studs 83%, slope 0%) | 10% (tops: tile 9%, studs 83%, slope 0%) |
| off-grid, sideways, brackets, hinges | 0%, 4%, 4%, 0% | 0%, 4%, 4%, 0% |
| part mix | plate 38%, brick 31%, slope 9%, window 8%, tile 5%, wheel 5%, snot 4% | plate 38%, brick 31%, slope 9%, window 8%, tile 5%, wheel 5%, snot 4% |

### tractor

| metric | profile | ours (4 forges: "tractor", "farm vehicle") |
|---|---|---|
| width × length (studs) | 8.5 (6–11) × 13.5 (13–14) | 8.5 (6–11) × 13.5 (13–14) |
| height (bricks) | 6 (4.7–7.3) | 6 (4.7–7.3) |
| pieces (structure) | 69 (65–73.8) | 69 (65–73.8) |
| w:l, h:l | 0.64, 0.45 | 0.64, 0.45 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 10% (interior 4% of the box) | 10% (interior 4% of the box) |
| wall thickness | 1 stud (1: 66%, 2: 8%, 3+: 26%) | 1 stud (1: 66%, 2: 8%, 3+: 26%) |
| bottom band mix | tile 50%; YELLOW 34%, LIGHT_GREY 17% | tile 50%; YELLOW 34%, LIGHT_GREY 17% |
| middle band mix | plate 45%, brick 19%, wheel 12%; BLACK 37%, RED 20%, GREEN 19% | plate 45%, brick 19%, wheel 12%; BLACK 37%, RED 20%, GREEN 19% |
| top band mix | plate 42%, brick 28%, slope 23%; RED 45%, BLACK 34%, LIGHT_GREY 7% | plate 42%, brick 28%, slope 23%; RED 45%, BLACK 34%, LIGHT_GREY 7% |
| steps, pcs/step, steps/100 pcs | 13, 5.49, 18.67 | 13, 5.49, 18.67 |
| step vs height correlation | 0.98 | 0.98 |
| build phases (mean height, top parts) | 0.17 wheel → 0.35 plate → 0.53 brick → 0.66 brick → 0.84 plate | 0.17 wheel → 0.35 plate → 0.53 brick → 0.66 brick → 0.84 plate |
| interior / walls / roof at (progress) | – / 0.54 / 0.93 | – / 0.54 / 0.93 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 16% (tops: tile 10%, studs 50%, slope 20%) | 16% (tops: tile 10%, studs 50%, slope 20%) |
| off-grid, sideways, brackets, hinges | 0%, 6%, 6%, 0% | 0%, 6%, 6%, 0% |
| part mix | plate 44%, brick 20%, tile 10%, wheel 10%, slope 8%, snot 6%, round 3% | plate 44%, brick 20%, tile 10%, wheel 10%, slope 8%, snot 6%, round 3% |

### motorcycle

| metric | profile | ours (8 forges: "motorcycle", "motorbike", "bike") |
|---|---|---|
| width × length (studs) | 6 (6–6) × 9 (9–9) | 6 (6–6) × 9 (9–9) |
| height (bricks) | 3.7 (3.7–3.7) | 3.7 (3.7–3.7) |
| pieces (structure) | 23 (23–23) | 23 (23–23) |
| w:l, h:l | 0.67, 0.41 | 0.67, 0.41 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 11% (interior 2% of the box) | 11% (interior 2% of the box) |
| wall thickness | 1 stud (1: 100%, 2: 0%, 3+: 0%) | 1 stud (1: 100%, 2: 0%, 3+: 0%) |
| bottom band mix | tile 100%; LIGHT_GREY 100% | tile 100%; LIGHT_GREY 100% |
| middle band mix | brick 40%, plate 20%, wheel 13%; BLACK 67%, LIGHT_GREY 20%, RED 7% | brick 40%, plate 20%, wheel 13%; BLACK 67%, LIGHT_GREY 20%, RED 7% |
| top band mix | plate 100%; BLACK 50%, YELLOW 50% | plate 100%; BLACK 50%, YELLOW 50% |
| steps, pcs/step, steps/100 pcs | 6, 3.83, 26.09 | 6, 3.83, 26.09 |
| step vs height correlation | 0.98 | 0.98 |
| build phases (mean height, top parts) | 0.09 tile → 0.32 brick → 0.5 plate → 0.64 plate → 0.81 brick | 0.09 tile → 0.32 brick → 0.5 plate → 0.64 plate → 0.81 brick |
| interior / walls / roof at (progress) | – / 0.2 / 1 | – / 0.2 / 1 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 50% (tops: tile 50%, studs 50%, slope 0%) | 50% (tops: tile 50%, studs 50%, slope 0%) |
| off-grid, sideways, brackets, hinges | 0%, 9%, 4%, 0% | 0%, 9%, 4%, 0% |
| part mix | tile 35%, brick 26%, plate 22%, wheel 9%, snot 4%, round 4% | tile 35%, brick 26%, plate 22%, wheel 9%, snot 4%, round 4% |

### train

| metric | profile | ours (6 forges: "steam train", "train", "locomotive") |
|---|---|---|
| width × length (studs) | 10 (10–10) × 36 (36–36) | 10 (10–10) × 36 (36–36) |
| height (bricks) | 7 (7–7) | 7 (7–7) |
| pieces (structure) | 233 (232.3–234.5) | 233 (232.3–234.5) |
| w:l, h:l | 0.28, 0.19 | 0.28, 0.19 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 21% (interior 5% of the box) | 21% (interior 5% of the box) |
| wall thickness | 1 stud (1: 89%, 2: 4%, 3+: 8%) | 1 stud (1: 89%, 2: 4%, 3+: 8%) |
| bottom band mix | plate 45%, tile 45%, round 6%; DARK_GREY 47%, BROWN 45%, LIGHT_GREY 6% | plate 45%, tile 45%, round 6%; DARK_GREY 47%, BROWN 45%, LIGHT_GREY 6% |
| middle band mix | plate 52%, brick 21%, wheel 11%; BLACK 36%, RED 24%, GREEN 19% | plate 52%, brick 21%, wheel 11%; BLACK 36%, RED 24%, GREEN 19% |
| top band mix | round 100%; BLACK 50%, GREEN 50% | round 100%; BLACK 50%, GREEN 50% |
| steps, pcs/step, steps/100 pcs | 16, 14.56, 6.87 | 16, 14.56, 6.87 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.1 plate → 0.28 plate → 0.46 plate → 0.62 brick → 0.76 plate | 0.1 plate → 0.28 plate → 0.46 plate → 0.62 brick → 0.76 plate |
| interior / walls / roof at (progress) | – / 0.53 / 0.97 | – / 0.53 / 0.97 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 25% (tops: tile 21%, studs 63%, slope 1%) | 25% (tops: tile 21%, studs 63%, slope 1%) |
| off-grid, sideways, brackets, hinges | 0%, 2%, 0%, 1% | 0%, 2%, 0%, 1% |
| part mix | plate 50%, brick 18%, tile 9%, wheel 9%, round 6%, window 4%, slope 2% | plate 50%, brick 18%, tile 9%, wheel 9%, round 6%, window 4%, slope 2% |

### plane

| metric | profile | ours (8 forges: "airliner", "fighter jet", "biplane") |
|---|---|---|
| width × length (studs) | 16.5 (15.5–17.3) × 17 (16.5–17.8) | 16.5 (15.5–17.3) × 17 (16.5–17.8) |
| height (bricks) | 5 (5–5.3) | 5 (5–5.3) |
| pieces (structure) | 52.5 (48.8–69.3) | 52.5 (48.8–69.3) |
| w:l, h:l | 0.94, 0.3 | 0.94, 0.3 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 7% (interior 1% of the box) | 7% (interior 1% of the box) |
| wall thickness | 1 stud (1: 88%, 2: 3%, 3+: 9%) | 1 stud (1: 88%, 2: 3%, 3+: 9%) |
| bottom band mix | wheel 19%, plate 6%; BLACK 13%, LIGHT_GREY 13% | wheel 19%, plate 6%; BLACK 13%, LIGHT_GREY 13% |
| middle band mix | plate 53%, brick 15%, slope 12%; WHITE 66%, LIGHT_GREY 15%, DARK_BLUE 5% | plate 53%, brick 15%, slope 12%; WHITE 66%, LIGHT_GREY 15%, DARK_BLUE 5% |
| top band mix | slope 69%, plate 19%, tile 13%; RED 69%, WHITE 31% | slope 69%, plate 19%, tile 13%; RED 69%, WHITE 31% |
| steps, pcs/step, steps/100 pcs | 12, 4.62, 21.82 | 12, 4.62, 21.82 |
| step vs height correlation | 0.96 | 0.96 |
| build phases (mean height, top parts) | 0.19 wheel → 0.28 plate → 0.4 plate → 0.58 plate → 0.78 plate | 0.19 wheel → 0.28 plate → 0.4 plate → 0.58 plate → 0.78 plate |
| interior / walls / roof at (progress) | – / 0.63 / 0.98 | – / 0.63 / 0.98 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 0% (tops: tile 0%, studs 78%, slope 15%) | 0% (tops: tile 0%, studs 78%, slope 15%) |
| off-grid, sideways, brackets, hinges | 0%, 3%, 0%, 2% | 0%, 3%, 0%, 2% |
| part mix | plate 52%, brick 14%, slope 13%, wheel 10%, round 5%, window 2%, tile 2% | plate 52%, brick 14%, slope 13%, wheel 10%, round 5%, window 2%, tile 2% |

### helicopter

| metric | profile | ours (4 forges: "helicopter", "drone") |
|---|---|---|
| width × length (studs) | 10.5 (6–15) × 16 (15–17) | 10.5 (6–15) × 16 (15–17) |
| height (bricks) | 4.2 (2.7–5.7) | 4.2 (2.7–5.7) |
| pieces (structure) | 29 (21–37) | 29 (21–37) |
| w:l, h:l | 0.68, 0.26 | 0.68, 0.26 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 19% (interior 3% of the box) | 19% (interior 3% of the box) |
| wall thickness | 1.5 stud (1: 68%, 2: 22%, 3+: 11%) | 1.5 stud (1: 68%, 2: 22%, 3+: 11%) |
| bottom band mix | plate 50%, round 50%; BLACK 100% | plate 50%, round 50%; BLACK 100% |
| middle band mix | plate 35%, round 23%, brick 19%; RED 38%, BLACK 27%, DARK_BLUE 8% | plate 35%, round 23%, brick 19%; RED 38%, BLACK 27%, DARK_BLUE 8% |
| top band mix | hinge 84%, tile 17%; LIGHT_GREY 84%, TRANS_RED 9%, TRANS_BLUE 9% | hinge 84%, tile 17%; LIGHT_GREY 84%, TRANS_RED 9%, TRANS_BLUE 9% |
| steps, pcs/step, steps/100 pcs | 9.5, 3.04, 32.88 | 9.5, 3.04, 32.88 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.12 plate → 0.3 plate → 0.49 round → 0.62 plate → 0.87 hinge | 0.12 plate → 0.3 plate → 0.49 round → 0.62 plate → 0.87 hinge |
| interior / walls / roof at (progress) | – / 0.47 / 0.89 | – / 0.47 / 0.89 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 7% (tops: tile 4%, studs 66%, slope 4%) | 7% (tops: tile 4%, studs 66%, slope 4%) |
| off-grid, sideways, brackets, hinges | 0%, 2%, 2%, 15% | 0%, 2%, 2%, 15% |
| part mix | plate 35%, round 19%, hinge 15%, brick 14%, tile 9%, slope 8%, snot 2% | plate 35%, round 19%, hinge 15%, brick 14%, tile 9%, slope 8%, snot 2% |

### boat

| metric | profile | ours (8 forges: "speedboat", "tugboat", "boat") |
|---|---|---|
| width × length (studs) | 6 (5.5–6) × 19 (18–19) | 6 (5.5–6) × 19 (18–19) |
| height (bricks) | 5.7 (5.3–6.3) | 5.7 (5.3–6.3) |
| pieces (structure) | 84.5 (80.5–86.3) | 84.5 (80.5–86.3) |
| w:l, h:l | 0.32, 0.3 | 0.32, 0.3 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 22% (interior 10% of the box) | 22% (interior 10% of the box) |
| wall thickness | 1 stud (1: 79%, 2: 15%, 3+: 6%) | 1 stud (1: 79%, 2: 15%, 3+: 6%) |
| bottom band mix | plate 90%, brick 6%, slope 4%; WHITE 98%, BROWN 1%, TAN 1% | plate 90%, brick 6%, slope 4%; WHITE 98%, BROWN 1%, TAN 1% |
| middle band mix | plate 41%, brick 25%, slope 10%; WHITE 50%, TAN 20%, DARK_GREY 8% | plate 41%, brick 25%, slope 10%; WHITE 50%, TAN 20%, DARK_GREY 8% |
| top band mix | round 50%, tile 25%; WHITE 25%, BROWN 25%, BLACK 13% | round 50%, tile 25%; WHITE 25%, BROWN 25%, BLACK 13% |
| steps, pcs/step, steps/100 pcs | 12, 7.25, 13.81 | 12, 7.25, 13.81 |
| step vs height correlation | 0.98 | 0.98 |
| build phases (mean height, top parts) | 0.11 plate → 0.34 plate → 0.56 hinge → 0.6 plate → 0.77 tile | 0.11 plate → 0.34 plate → 0.56 hinge → 0.6 plate → 0.77 tile |
| interior / walls / roof at (progress) | – / 0.36 / 0.91 | – / 0.36 / 0.91 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 6% (tops: tile 10%, studs 77%, slope 7%) | 6% (tops: tile 10%, studs 77%, slope 7%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 4% | 0%, 0%, 0%, 4% |
| part mix | plate 49%, brick 20%, slope 10%, tile 9%, round 7%, hinge 4%, window 3% | plate 49%, brick 20%, slope 10%, tile 9%, round 7%, hinge 4%, window 3% |

### ship

| metric | profile | ours (8 forges: "cruise ship", "battleship", "ship") |
|---|---|---|
| width × length (studs) | 6 (6–6) × 23 (23–23) | 6 (6–6) × 23 (23–23) |
| height (bricks) | 5.7 (5.7–5.8) | 5.7 (5.7–5.8) |
| pieces (structure) | 93 (87–99.5) | 93 (87–99.5) |
| w:l, h:l | 0.26, 0.25 | 0.26, 0.25 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 23% (interior 10% of the box) | 23% (interior 10% of the box) |
| wall thickness | 1 stud (1: 76%, 2: 15%, 3+: 10%) | 1 stud (1: 76%, 2: 15%, 3+: 10%) |
| bottom band mix | plate 100%; LIGHT_GREY 100% | plate 100%; LIGHT_GREY 100% |
| middle band mix | plate 36%, brick 34%, slope 12%; TAN 25%, LIGHT_GREY 24%, WHITE 16% | plate 36%, brick 34%, slope 12%; TAN 25%, LIGHT_GREY 24%, WHITE 16% |
| top band mix | round 63%, tile 25%, special 13%; LIGHT_GREY 50%, WHITE 25%, BLACK 25% | round 63%, tile 25%, special 13%; LIGHT_GREY 50%, WHITE 25%, BLACK 25% |
| steps, pcs/step, steps/100 pcs | 12, 7.9, 12.66 | 12, 7.9, 12.66 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.11 plate → 0.35 plate → 0.55 brick → 0.68 plate → 0.83 round | 0.11 plate → 0.35 plate → 0.55 brick → 0.68 plate → 0.83 round |
| interior / walls / roof at (progress) | – / 0.36 / 0.93 | – / 0.36 / 0.93 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 2% (tops: tile 2%, studs 90%, slope 1%) | 2% (tops: tile 2%, studs 90%, slope 1%) |
| off-grid, sideways, brackets, hinges | 0%, 1%, 0%, 3% | 0%, 1%, 0%, 3% |
| part mix | plate 49%, brick 25%, slope 9%, round 8%, window 5%, hinge 3%, tile 1% | plate 49%, brick 25%, slope 9%, round 8%, window 5%, hinge 3%, tile 1% |

### pirateShip

| metric | profile | ours (4 forges: "pirate ship", "galleon") |
|---|---|---|
| width × length (studs) | 6 (6–6) × 23 (23–23) | 6 (6–6) × 23 (23–23) |
| height (bricks) | 8.3 (8.3–8.3) | 8.3 (8.3–8.3) |
| pieces (structure) | 113 (112–114) | 113 (112–114) |
| w:l, h:l | 0.26, 0.36 | 0.26, 0.36 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 28% (interior 10% of the box) | 28% (interior 10% of the box) |
| wall thickness | 1 stud (1: 83%, 2: 12%, 3+: 6%) | 1 stud (1: 83%, 2: 12%, 3+: 6%) |
| bottom band mix | plate 57%, brick 26%, slope 14%; BLACK 47%, YELLOW 47%, BROWN 3% | plate 57%, brick 26%, slope 14%; BLACK 47%, YELLOW 47%, BROWN 3% |
| middle band mix | plate 44%, brick 33%, round 16%; TAN 26%, BLACK 20%, YELLOW 17% | plate 44%, brick 33%, round 16%; TAN 26%, BLACK 20%, YELLOW 17% |
| top band mix | round 100%; BROWN 100% | round 100%; BROWN 100% |
| steps, pcs/step, steps/100 pcs | 17, 6.65, 15.05 | 17, 6.65, 15.05 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.13 plate → 0.3 brick → 0.42 brick → 0.56 brick → 0.85 round | 0.13 plate → 0.3 brick → 0.42 brick → 0.56 brick → 0.85 round |
| interior / walls / roof at (progress) | – / 0.31 / 0.97 | – / 0.31 / 0.97 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 1% (tops: tile 1%, studs 96%, slope 1%) | 1% (tops: tile 1%, studs 96%, slope 1%) |
| off-grid, sideways, brackets, hinges | 0%, 4%, 0%, 3% | 0%, 4%, 0%, 3% |
| part mix | plate 46%, brick 29%, round 15%, slope 4%, tile 3%, hinge 3% | plate 46%, brick 29%, round 15%, slope 4%, tile 3%, hinge 3% |

### submarine

| metric | profile | ours (8 forges: "submarine", "micro yellow submarine", "sub") |
|---|---|---|
| width × length (studs) | 4 (4–4) × 21 (18.3–21) | 4 (4–4) × 21 (18.3–21) |
| height (bricks) | 6.3 (6.3–6.3) | 6.3 (6.3–6.3) |
| pieces (structure) | 37 (32.5–37) | 37 (32.5–37) |
| w:l, h:l | 0.19, 0.3 | 0.19, 0.3 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 0% (interior 0% of the box) | 0% (interior 0% of the box) |
| wall thickness | solid | solid |
| bottom band mix | brick 57%, plate 25%, hinge 18%; YELLOW 60%, DARK_GREY 26%, LIGHT_GREY 10% | brick 57%, plate 25%, hinge 18%; YELLOW 60%, DARK_GREY 26%, LIGHT_GREY 10% |
| middle band mix | slope 36%, brick 23%, plate 19%; YELLOW 55%, DARK_GREY 20%, TRANS_BLUE 15% | slope 36%, brick 23%, plate 19%; YELLOW 55%, DARK_GREY 20%, TRANS_BLUE 15% |
| top band mix | round 100%; LIGHT_GREY 50%, TRANS_BLUE 50% | round 100%; LIGHT_GREY 50%, TRANS_BLUE 50% |
| steps, pcs/step, steps/100 pcs | 10, 3.7, 27.03 | 10, 3.7, 27.03 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.1 brick → 0.25 slope → 0.44 plate → 0.66 plate → 0.92 round | 0.1 brick → 0.25 slope → 0.44 plate → 0.66 plate → 0.92 round |
| interior / walls / roof at (progress) | – / 0.33 / 0.94 | – / 0.33 / 0.94 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 8% (tops: tile 5%, studs 61%, slope 25%) | 8% (tops: tile 5%, studs 61%, slope 25%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 7% | 0%, 0%, 0%, 7% |
| part mix | brick 35%, plate 21%, slope 20%, round 10%, tile 8%, hinge 7% | brick 35%, plate 21%, slope 20%, round 10%, tile 8%, hinge 7% |

### spaceship

| metric | profile | ours (8 forges: "flying saucer", "cyberpunk neon hover speeder", "starfighter") |
|---|---|---|
| width × length (studs) | 9.5 (7–11.3) × 14.5 (12.8–16.5) | 9.5 (7–11.3) × 14.5 (12.8–16.5) |
| height (bricks) | 5.7 (4.9–6) | 5.7 (4.9–6) |
| pieces (structure) | 44.5 (34.5–53.5) | 44.5 (34.5–53.5) |
| w:l, h:l | 0.57, 0.37 | 0.57, 0.37 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 1% (interior 0% of the box) | 1% (interior 0% of the box) |
| wall thickness | 1.5 stud (1: 60%, 2: 20%, 3+: 20%) | 1.5 stud (1: 60%, 2: 20%, 3+: 20%) |
| bottom band mix | round 100%; TRANS_CLEAR 94%, LIGHT_GREY 6% | round 100%; TRANS_CLEAR 94%, LIGHT_GREY 6% |
| middle band mix | plate 70%, brick 14%, round 11%; LIGHT_GREY 39%, BLACK 28%, DARK_GREY 16% | plate 70%, brick 14%, round 11%; LIGHT_GREY 39%, BLACK 28%, DARK_GREY 16% |
| top band mix | round 63%, slope 19%, tile 19%; TRANS_BLUE 56%, BLACK 19%, LIGHT_GREY 13% | round 63%, slope 19%, tile 19%; TRANS_BLUE 56%, BLACK 19%, LIGHT_GREY 13% |
| steps, pcs/step, steps/100 pcs | 10, 4.47, 22.34 | 10, 4.47, 22.34 |
| step vs height correlation | 0.97 | 0.97 |
| build phases (mean height, top parts) | 0.18 round → 0.41 plate → 0.53 plate → 0.64 plate → 0.84 round | 0.18 round → 0.41 plate → 0.53 plate → 0.64 plate → 0.84 round |
| interior / walls / roof at (progress) | – / 0.56 / 0.95 | – / 0.56 / 0.95 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 5% (tops: tile 4%, studs 88%, slope 7%) | 5% (tops: tile 4%, studs 88%, slope 7%) |
| off-grid, sideways, brackets, hinges | 0%, 5%, 0%, 1% | 0%, 5%, 0%, 1% |
| part mix | plate 60%, round 19%, brick 11%, tile 5%, slope 4%, hinge 1% | plate 60%, round 19%, brick 11%, tile 5%, slope 4%, hinge 1% |

### rocket

| metric | profile | ours (6 forges: "apollo rocket on a launch pad", "rocket", "space rocket") |
|---|---|---|
| width × length (studs) | 6 (6–6) × 9 (9–9) | 6 (6–6) × 9 (9–9) |
| height (bricks) | 12.7 (12.7–12.7) | 12.7 (12.7–12.7) |
| pieces (structure) | 53 (53–53) | 53 (53–53) |
| w:l, h:l | 0.67, 1.41 | 0.67, 1.41 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 10% (interior 2% of the box) | 10% (interior 2% of the box) |
| wall thickness | 2 stud (1: 0%, 2: 100%, 3+: 0%) | 2 stud (1: 0%, 2: 100%, 3+: 0%) |
| bottom band mix | plate 36%, round 32%, slope 18%; RED 45%, DARK_GREY 32%, LIGHT_GREY 9% | plate 36%, round 32%, slope 18%; RED 45%, DARK_GREY 32%, LIGHT_GREY 9% |
| middle band mix | brick 34%, plate 34%, round 28%; RED 66%, WHITE 21%, BLACK 7% | brick 34%, plate 34%, round 28%; RED 66%, WHITE 21%, BLACK 7% |
| top band mix | round 100%; LIGHT_GREY 50%, RED 50% | round 100%; LIGHT_GREY 50%, RED 50% |
| steps, pcs/step, steps/100 pcs | 27, 1.96, 50.94 | 27, 1.96, 50.94 |
| step vs height correlation | 1 | 1 |
| build phases (mean height, top parts) | 0.08 plate → 0.27 brick → 0.43 brick → 0.59 brick → 0.79 round | 0.08 plate → 0.27 brick → 0.43 brick → 0.59 brick → 0.79 round |
| interior / walls / roof at (progress) | – / 0.5 / 0.98 | – / 0.5 / 0.98 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 3% (tops: tile 2%, studs 90%, slope 7%) | 3% (tops: tile 2%, studs 90%, slope 7%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 0% | 0%, 0%, 0%, 0% |
| part mix | plate 34%, round 32%, brick 25%, slope 8%, tile 2% | plate 34%, round 32%, brick 25%, slope 8%, tile 2% |

### rover

| metric | profile | ours (8 forges: "mars rover", "lunar rover", "rover") |
|---|---|---|
| width × length (studs) | 6.5 (6–7) × 9 (9–9) | 6.5 (6–7) × 9 (9–9) |
| height (bricks) | 5.3 (5.3–5.3) | 5.3 (5.3–5.3) |
| pieces (structure) | 27.5 (27–28) | 27.5 (27–28) |
| w:l, h:l | 0.69, 0.59 | 0.69, 0.59 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 26% (interior 8% of the box) | 26% (interior 8% of the box) |
| wall thickness | 1 stud (1: 71%, 2: 5%, 3+: 24%) | 1 stud (1: 71%, 2: 5%, 3+: 24%) |
| bottom band mix | tile 75%, round 25%; TAN 75%, LIGHT_GREY 25% | tile 75%, round 25%; TAN 75%, LIGHT_GREY 25% |
| middle band mix | wheel 38%, plate 38%, round 17%; LIGHT_GREY 79%, WHITE 8%, TRANS_BLUE 8% | wheel 38%, plate 38%, round 17%; LIGHT_GREY 79%, WHITE 8%, TRANS_BLUE 8% |
| top band mix | round 50%, tile 50%; WHITE 50%, TRANS_BLUE 50% | round 50%, tile 50%; WHITE 50%, TRANS_BLUE 50% |
| steps, pcs/step, steps/100 pcs | 9, 3.06, 32.74 | 9, 3.06, 32.74 |
| step vs height correlation | 0.98 | 0.98 |
| build phases (mean height, top parts) | 0.14 wheel → 0.28 brick → 0.47 plate → 0.67 round → 0.94 round | 0.14 wheel → 0.28 brick → 0.47 plate → 0.67 round → 0.94 round |
| interior / walls / roof at (progress) | – / 0.38 / 0.94 | – / 0.38 / 0.94 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 6% (tops: tile 4%, studs 69%, slope 0%) | 6% (tops: tile 4%, studs 69%, slope 0%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 0% | 0%, 0%, 0%, 0% |
| part mix | wheel 33%, plate 33%, round 20%, brick 7%, tile 7% | wheel 33%, plate 33%, round 20%, brick 7%, tile 7% |

### spaceStation

| metric | profile | ours (4 forges: "space station", "space base") |
|---|---|---|
| width × length (studs) | 7.5 (4–11) × 16.5 (15–18) | 7.5 (4–11) × 16.5 (15–18) |
| height (bricks) | 6.8 (6–7.7) | 6.8 (6–7.7) |
| pieces (structure) | 32 (15–49) | 32 (15–49) |
| w:l, h:l | 0.44, 0.42 | 0.44, 0.42 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 12% (interior 1% of the box) | 12% (interior 1% of the box) |
| wall thickness | 1.5 stud (1: 50%, 2: 20%, 3+: 30%) | 1.5 stud (1: 50%, 2: 20%, 3+: 30%) |
| bottom band mix | round 100%; TRANS_CLEAR 100% | round 100%; TRANS_CLEAR 100% |
| middle band mix | plate 59%, round 25%, tile 9%; LIGHT_GREY 54%, TRANS_BLUE 13%, WHITE 9% | plate 59%, round 25%, tile 9%; LIGHT_GREY 54%, TRANS_BLUE 13%, WHITE 9% |
| top band mix | round 84%, special 17%; LIGHT_GREY 59%, BLACK 25%, WHITE 17% | round 84%, special 17%; LIGHT_GREY 59%, BLACK 25%, WHITE 17% |
| steps, pcs/step, steps/100 pcs | 10.5, 2.98, 44.56 | 10.5, 2.98, 44.56 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.15 round → 0.36 plate → 0.47 plate → 0.63 plate → 0.84 round | 0.15 round → 0.36 plate → 0.47 plate → 0.63 plate → 0.84 round |
| interior / walls / roof at (progress) | – / 0.7 / 0.92 | – / 0.7 / 0.92 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 3% (tops: tile 3%, studs 91%, slope 6%) | 3% (tops: tile 3%, studs 91%, slope 6%) |
| off-grid, sideways, brackets, hinges | 0%, 4%, 0%, 0% | 0%, 4%, 0%, 0% |
| part mix | plate 50%, round 34%, tile 7%, special 4%, brick 3%, slope 3% | plate 50%, round 34%, tile 7%, special 4%, brick 3%, slope 3% |

### robot

| metric | profile | ours (6 forges: "orange recon mech with cannons", "robot", "mech") |
|---|---|---|
| width × length (studs) | 4 (4–4) × 10 (10–10) | 4 (4–4) × 10 (10–10) |
| height (bricks) | 8.3 (8.3–8.3) | 8.3 (8.3–8.3) |
| pieces (structure) | 47 (47–47.8) | 47 (47–47.8) |
| w:l, h:l | 0.4, 0.83 | 0.4, 0.83 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 10% (interior 3% of the box) | 10% (interior 3% of the box) |
| wall thickness | 1 stud (1: 100%, 2: 0%, 3+: 0%) | 1 stud (1: 100%, 2: 0%, 3+: 0%) |
| bottom band mix | round 59%, brick 21%, plate 21%; LIGHT_GREY 41%, BLACK 25%, WHITE 21% | round 59%, brick 21%, plate 21%; LIGHT_GREY 41%, BLACK 25%, WHITE 21% |
| middle band mix | brick 38%, round 33%, plate 20%; LIGHT_GREY 48%, BLACK 13%, WHITE 11% | brick 38%, round 33%, plate 20%; LIGHT_GREY 48%, BLACK 13%, WHITE 11% |
| top band mix | special 100%; LIGHT_GREY 100% | special 100%; LIGHT_GREY 100% |
| steps, pcs/step, steps/100 pcs | 16, 2.94, 34.04 | 16, 2.94, 34.04 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.08 round → 0.22 round → 0.37 plate → 0.5 brick → 0.69 brick | 0.08 round → 0.22 round → 0.37 plate → 0.5 brick → 0.69 brick |
| interior / walls / roof at (progress) | – / 0.63 / 1 | – / 0.63 / 1 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 17% (tops: tile 17%, studs 80%, slope 0%) | 17% (tops: tile 17%, studs 80%, slope 0%) |
| off-grid, sideways, brackets, hinges | 0%, 8%, 0%, 0% | 0%, 8%, 0%, 0% |
| part mix | round 37%, brick 34%, plate 20%, tile 6%, special 2%, slope 1% | round 37%, brick 34%, plate 20%, tile 6%, special 2%, slope 1% |

### tank

| metric | profile | ours (4 forges: "tank", "apc") |
|---|---|---|
| width × length (studs) | 6 (6–6) × 17 (17–17) | 6 (6–6) × 17 (17–17) |
| height (bricks) | 5.7 (5.7–5.7) | 5.7 (5.7–5.7) |
| pieces (structure) | 69 (69–69) | 69 (69–69) |
| w:l, h:l | 0.35, 0.33 | 0.35, 0.33 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 3% (interior 1% of the box) | 3% (interior 1% of the box) |
| wall thickness | 4 stud (1: 0%, 2: 0%, 3+: 100%) | 4 stud (1: 0%, 2: 0%, 3+: 100%) |
| bottom band mix | brick 76%, plate 24%; GREEN 76%, DARK_GREY 24% | brick 76%, plate 24%; GREEN 76%, DARK_GREY 24% |
| middle band mix | plate 45%, tile 41%, hinge 6%; GREEN 45%, BLACK 41%, DARK_GREY 8% | plate 45%, tile 41%, hinge 6%; GREEN 45%, BLACK 41%, DARK_GREY 8% |
| top band mix | special 100%; BLACK 100% | special 100%; BLACK 100% |
| steps, pcs/step, steps/100 pcs | 11, 6.27, 15.94 | 11, 6.27, 15.94 |
| step vs height correlation | 0.97 | 0.97 |
| build phases (mean height, top parts) | 0.08 brick → 0.21 plate → 0.28 tile → 0.4 tile → 0.65 brick | 0.08 brick → 0.21 plate → 0.28 tile → 0.4 tile → 0.65 brick |
| interior / walls / roof at (progress) | – / 0.8 / 1 | – / 0.8 / 1 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 46% (tops: tile 40%, studs 47%, slope 8%) | 46% (tops: tile 40%, studs 47%, slope 8%) |
| off-grid, sideways, brackets, hinges | 0%, 4%, 3%, 4% | 0%, 4%, 3%, 4% |
| part mix | plate 39%, tile 30%, brick 20%, hinge 4%, snot 3%, slope 1%, special 1% | plate 39%, tile 30%, brick 20%, hinge 4%, snot 3%, slope 1%, special 1% |

### house

| metric | profile | ours (8 forges: "cozy alpine cottage with a garden and chimney", "haunted mansion", "tiny cottage") |
|---|---|---|
| width × length (studs) | 17.5 (15.3–20.3) × 20 (17.8–20.5) | 17.5 (15.3–20.3) × 20 (17.8–20.5) |
| height (bricks) | 17.5 (14.3–20.6) | 17.5 (14.3–20.6) |
| pieces (structure) | 392 (282.8–570) | 392 (282.8–570) |
| w:l, h:l | 0.94, 0.96 | 0.94, 0.96 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 35% (interior 14% of the box) | 35% (interior 14% of the box) |
| wall thickness | 1 stud (1: 88%, 2: 4%, 3+: 8%) | 1 stud (1: 88%, 2: 4%, 3+: 8%) |
| bottom band mix | plate 37%, brick 34%, tile 10%; WHITE 35%, BLACK 29%, BROWN 11% | plate 37%, brick 34%, tile 10%; WHITE 35%, BLACK 29%, BROWN 11% |
| middle band mix | brick 38%, slope 26%, plate 25%; DARK_RED 39%, WHITE 19%, BLACK 19% | brick 38%, slope 26%, plate 25%; DARK_RED 39%, WHITE 19%, BLACK 19% |
| top band mix | slope 33%, brick 29%, plate 27%; BLACK 47%, DARK_RED 42%, LIGHT_GREY 12% | slope 33%, brick 29%, plate 27%; BLACK 47%, DARK_RED 42%, LIGHT_GREY 12% |
| steps, pcs/step, steps/100 pcs | 32, 13.55, 7.41 | 32, 13.55, 7.41 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.06 plate → 0.24 brick → 0.39 plate → 0.57 brick → 0.78 slope | 0.06 plate → 0.24 brick → 0.39 plate → 0.57 brick → 0.78 slope |
| interior / walls / roof at (progress) | – / 0.56 / 0.89 | – / 0.56 / 0.89 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 14% (tops: tile 4%, studs 23%, slope 63%) | 14% (tops: tile 4%, studs 23%, slope 63%) |
| off-grid, sideways, brackets, hinges | 0%, 1%, 1%, 1% | 0%, 1%, 1%, 1% |
| part mix | brick 37%, plate 28%, slope 21%, window 5%, tile 4%, round 4%, hinge 1% | brick 37%, plate 28%, slope 21%, window 5%, tile 4%, round 4%, hinge 1% |

### castle

| metric | profile | ours (6 forges: "medieval stone castle with four towers", "huge castle", "medieval castle") |
|---|---|---|
| width × length (studs) | 20 (19.3–22.3) × 22 (20.5–24.3) | 20 (19.3–22.3) × 22 (20.5–24.3) |
| height (bricks) | 11.3 (11.1–11.3) | 11.3 (11.1–11.3) |
| pieces (structure) | 288 (254.3–310.5) | 288 (254.3–310.5) |
| w:l, h:l | 0.92, 0.52 | 0.92, 0.52 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 12% (interior 2% of the box) | 12% (interior 2% of the box) |
| wall thickness | 1 stud (1: 65%, 2: 18%, 3+: 17%) | 1 stud (1: 65%, 2: 18%, 3+: 17%) |
| bottom band mix | brick 41%, plate 32%, round 19%; LIGHT_GREY 46%, GREEN 29%, BROWN 11% | brick 41%, plate 32%, round 19%; LIGHT_GREY 46%, GREEN 29%, BROWN 11% |
| middle band mix | brick 55%, plate 34%, round 9%; LIGHT_GREY 71%, DARK_GREY 17%, TRANS_ORANGE 8% | brick 55%, plate 34%, round 9%; LIGHT_GREY 71%, DARK_GREY 17%, TRANS_ORANGE 8% |
| top band mix | hinge 100%; DARK_GREY 67%, DARK_RED 33% | hinge 100%; DARK_GREY 67%, DARK_RED 33% |
| steps, pcs/step, steps/100 pcs | 20, 14.4, 6.94 | 20, 14.4, 6.94 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.08 brick → 0.3 brick → 0.42 plate → 0.52 plate → 0.72 brick | 0.08 brick → 0.3 brick → 0.42 plate → 0.52 plate → 0.72 brick |
| interior / walls / roof at (progress) | – / 0.32 / 1 | – / 0.32 / 1 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 2% (tops: tile 1%, studs 98%, slope 0%) | 2% (tops: tile 1%, studs 98%, slope 0%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 3% | 0%, 0%, 0%, 3% |
| part mix | brick 50%, plate 33%, round 12%, hinge 3%, slope 1%, tile 1% | brick 50%, plate 33%, round 12%, hinge 3%, slope 1%, tile 1% |

### tower

| metric | profile | ours (8 forges: "tall modern glass skyscraper", "clock tower", "water tower") |
|---|---|---|
| width × length (studs) | 7.5 (6–9.8) × 7.5 (7–10) | 7.5 (6–9.8) × 7.5 (7–10) |
| height (bricks) | 12.8 (10.9–16.7) | 12.8 (10.9–16.7) |
| pieces (structure) | 55 (23–140.5) | 55 (23–140.5) |
| w:l, h:l | 0.97, 1.56 | 0.97, 1.56 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 10% (interior 3% of the box) | 10% (interior 3% of the box) |
| wall thickness | 1 stud (1: 100%, 2: 0%, 3+: 0%) | 1 stud (1: 100%, 2: 0%, 3+: 0%) |
| bottom band mix | brick 48%, round 36%, plate 9%; LIGHT_GREY 46%, TAN 17%, WHITE 14% | brick 48%, round 36%, plate 9%; LIGHT_GREY 46%, TAN 17%, WHITE 14% |
| middle band mix | brick 56%, round 23%, plate 14%; LIGHT_GREY 58%, WHITE 17%, DARK_GREY 14% | brick 56%, round 23%, plate 14%; LIGHT_GREY 58%, WHITE 17%, DARK_GREY 14% |
| top band mix | round 40%, plate 21%, slope 16%; DARK_RED 45%, GOLD 25%, WHITE 11% | round 40%, plate 21%, slope 16%; DARK_RED 45%, GOLD 25%, WHITE 11% |
| steps, pcs/step, steps/100 pcs | 19, 2.86, 35.95 | 19, 2.86, 35.95 |
| step vs height correlation | 1 | 1 |
| build phases (mean height, top parts) | 0.08 brick → 0.27 brick → 0.45 brick → 0.65 brick → 0.85 plate | 0.08 brick → 0.27 brick → 0.45 brick → 0.65 brick → 0.85 plate |
| interior / walls / roof at (progress) | – / 0.44 / 0.94 | – / 0.44 / 0.94 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 0% (tops: tile 5%, studs 80%, slope 14%) | 0% (tops: tile 5%, studs 80%, slope 14%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 0% | 0%, 0%, 0%, 0% |
| part mix | brick 49%, round 28%, plate 13%, window 5%, slope 4%, tile 2% | brick 49%, round 28%, plate 13%, window 5%, slope 4%, tile 2% |

### lighthouse

| metric | profile | ours (4 forges: "red and white lighthouse on a rocky shore", "lighthouse") |
|---|---|---|
| width × length (studs) | 16 (16–16) × 16 (16–16) | 16 (16–16) × 16 (16–16) |
| height (bricks) | 13.7 (13.7–13.7) | 13.7 (13.7–13.7) |
| pieces (structure) | 82 (82–82) | 82 (82–82) |
| w:l, h:l | 1, 0.85 | 1, 0.85 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 36% (interior 3% of the box) | 36% (interior 3% of the box) |
| wall thickness | 1 stud (1: 52%, 2: 0%, 3+: 48%) | 1 stud (1: 52%, 2: 0%, 3+: 48%) |
| bottom band mix | plate 84%, brick 11%, round 2%; DARK_GREY 56%, LIGHT_GREY 28%, WHITE 12% | plate 84%, brick 11%, round 2%; DARK_GREY 56%, LIGHT_GREY 28%, WHITE 12% |
| middle band mix | round 65%, plate 22%, brick 13%; WHITE 35%, BLACK 30%, RED 17% | round 65%, plate 22%, brick 13%; WHITE 35%, BLACK 30%, RED 17% |
| top band mix | plate 50%, round 50%; BLACK 50%, RED 50% | plate 50%, round 50%; BLACK 50%, RED 50% |
| steps, pcs/step, steps/100 pcs | 20, 4.1, 24.39 | 20, 4.1, 24.39 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.04 plate → 0.18 brick → 0.29 plate → 0.59 round → 0.79 round | 0.04 plate → 0.18 brick → 0.29 plate → 0.59 round → 0.79 round |
| interior / walls / roof at (progress) | – / 0.32 / 0.97 | – / 0.32 / 0.97 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 1% (tops: tile 1%, studs 99%, slope 0%) | 1% (tops: tile 1%, studs 99%, slope 0%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 0% | 0%, 0%, 0%, 0% |
| part mix | plate 66%, round 21%, brick 11%, window 1%, tile 1% | plate 66%, round 21%, brick 11%, window 1%, tile 1% |

### windmill

| metric | profile | ours (2 forges: "windmill") |
|---|---|---|
| width × length (studs) | 11.5 (11.3–11.8) × 12 (12–12) | 11.5 (11.3–11.8) × 12 (12–12) |
| height (bricks) | 7.7 (7.7–7.7) | 7.7 (7.7–7.7) |
| pieces (structure) | 49.5 (48.8–50.3) | 49.5 (48.8–50.3) |
| w:l, h:l | 0.96, 0.64 | 0.96, 0.64 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 14% (interior 2% of the box) | 14% (interior 2% of the box) |
| wall thickness | 1 stud (1: 93%, 2: 5%, 3+: 1%) | 1 stud (1: 93%, 2: 5%, 3+: 1%) |
| bottom band mix | round 54%, brick 42%, tile 4%; RED 42%, LIGHT_GREY 21%, TAN 17% | round 54%, brick 42%, tile 4%; RED 42%, LIGHT_GREY 21%, TAN 17% |
| middle band mix | plate 52%, brick 30%, round 10%; RED 57%, BROWN 18%, GREEN 14% | plate 52%, brick 30%, round 10%; RED 57%, BROWN 18%, GREEN 14% |
| top band mix | round 100%; DARK_RED 100% | round 100%; DARK_RED 100% |
| steps, pcs/step, steps/100 pcs | 15, 3.31, 30.27 | 15, 3.31, 30.27 |
| step vs height correlation | 0.97 | 0.97 |
| build phases (mean height, top parts) | 0.1 round → 0.23 brick → 0.42 brick → 0.56 plate → 0.71 plate | 0.1 round → 0.23 brick → 0.42 brick → 0.56 plate → 0.71 plate |
| interior / walls / roof at (progress) | – / 0.43 / 1 | – / 0.43 / 1 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 1% (tops: tile 1%, studs 93%, slope 0%) | 1% (tops: tile 1%, studs 93%, slope 0%) |
| off-grid, sideways, brackets, hinges | 0%, 4%, 0%, 2% | 0%, 4%, 0%, 2% |
| part mix | plate 38%, brick 32%, round 23%, window 2%, special 2%, hinge 2%, tile 1% | plate 38%, brick 32%, round 23%, window 2%, special 2%, hinge 2%, tile 1% |

### bridge

| metric | profile | ours (2 forges: "bridge") |
|---|---|---|
| width × length (studs) | 6 (6–6) × 32 (32–32) | 6 (6–6) × 32 (32–32) |
| height (bricks) | 5.3 (5.3–5.3) | 5.3 (5.3–5.3) |
| pieces (structure) | 92 (92–92) | 92 (92–92) |
| w:l, h:l | 0.19, 0.17 | 0.19, 0.17 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 2% (interior 1% of the box) | 2% (interior 1% of the box) |
| wall thickness | 1 stud (1: 90%, 2: 10%, 3+: 0%) | 1 stud (1: 90%, 2: 10%, 3+: 0%) |
| bottom band mix | brick 100%; GREEN 60%, LIGHT_GREY 40% | brick 100%; GREEN 60%, LIGHT_GREY 40% |
| middle band mix | plate 53%, brick 22%, tile 20%; DARK_GREY 34%, LIGHT_GREY 32%, GREEN 28% | plate 53%, brick 22%, tile 20%; DARK_GREY 34%, LIGHT_GREY 32%, GREEN 28% |
| top band mix | snot 50%, tile 50%; BLACK 50%, TRANS_ORANGE 50% | snot 50%, tile 50%; BLACK 50%, TRANS_ORANGE 50% |
| steps, pcs/step, steps/100 pcs | 9, 10.22, 9.78 | 9, 10.22, 9.78 |
| step vs height correlation | 0.95 | 0.95 |
| build phases (mean height, top parts) | 0.19 brick → 0.31 plate → 0.41 plate → 0.5 plate → 0.83 hinge | 0.19 brick → 0.31 plate → 0.41 plate → 0.5 plate → 0.83 hinge |
| interior / walls / roof at (progress) | – / 0.13 / 1 | – / 0.13 / 1 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 24% (tops: tile 24%, studs 76%, slope 0%) | 24% (tops: tile 24%, studs 76%, slope 0%) |
| off-grid, sideways, brackets, hinges | 0%, 4%, 4%, 4% | 0%, 4%, 4%, 4% |
| part mix | plate 42%, brick 28%, tile 21%, hinge 4%, snot 4% | plate 42%, brick 28%, tile 21%, hinge 4%, snot 4% |

### shop

| metric | profile | ours (8 forges: "bakery", "shop", "store") |
|---|---|---|
| width × length (studs) | 18 (17–19) × 20 (19.8–20) | 18 (17–19) × 20 (19.8–20) |
| height (bricks) | 16.2 (15.7–17.8) | 16.2 (15.7–17.8) |
| pieces (structure) | 352.5 (299–433.8) | 352.5 (299–433.8) |
| w:l, h:l | 0.9, 0.81 | 0.9, 0.81 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 36% (interior 14% of the box) | 36% (interior 14% of the box) |
| wall thickness | 1 stud (1: 96%, 2: 2%, 3+: 2%) | 1 stud (1: 96%, 2: 2%, 3+: 2%) |
| bottom band mix | plate 36%, brick 33%, tile 14%; WHITE 45%, BLACK 18%, BROWN 12% | plate 36%, brick 33%, tile 14%; WHITE 45%, BLACK 18%, BROWN 12% |
| middle band mix | brick 43%, slope 31%, plate 18%; DARK_RED 60%, WHITE 29%, TAN 8% | brick 43%, slope 31%, plate 18%; DARK_RED 60%, WHITE 29%, TAN 8% |
| top band mix | plate 34%, slope 30%, brick 27%; DARK_RED 72%, BLACK 19%, LIGHT_GREY 10% | plate 34%, slope 30%, brick 27%; DARK_RED 72%, BLACK 19%, LIGHT_GREY 10% |
| steps, pcs/step, steps/100 pcs | 26.5, 13.29, 7.55 | 26.5, 13.29, 7.55 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.05 plate → 0.24 brick → 0.42 brick → 0.58 slope → 0.79 slope | 0.05 plate → 0.24 brick → 0.42 brick → 0.58 slope → 0.79 slope |
| interior / walls / roof at (progress) | – / 0.52 / 0.89 | – / 0.52 / 0.89 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 14% (tops: tile 3%, studs 20%, slope 67%) | 14% (tops: tile 3%, studs 20%, slope 67%) |
| off-grid, sideways, brackets, hinges | 0%, 1%, 1%, 1% | 0%, 1%, 1%, 1% |
| part mix | brick 39%, slope 24%, plate 23%, window 5%, tile 4%, round 4%, hinge 1% | brick 39%, slope 24%, plate 23%, window 5%, tile 4%, round 4%, hinge 1% |

### station

| metric | profile | ours (4 forges: "fire station", "police station") |
|---|---|---|
| width × length (studs) | 16.5 (14.8–18) × 18 (15.8–20) | 16.5 (14.8–18) × 18 (15.8–20) |
| height (bricks) | 16.7 (16.7–16.7) | 16.7 (16.7–16.7) |
| pieces (structure) | 349 (284–414.3) | 349 (284–414.3) |
| w:l, h:l | 0.92, 0.94 | 0.92, 0.94 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 54% (interior 24% of the box) | 54% (interior 24% of the box) |
| wall thickness | 1 stud (1: 95%, 2: 3%, 3+: 3%) | 1 stud (1: 95%, 2: 3%, 3+: 3%) |
| bottom band mix | plate 41%, brick 37%, tile 10%; BLACK 32%, RED 26%, WHITE 22% | plate 41%, brick 37%, tile 10%; BLACK 32%, RED 26%, WHITE 22% |
| middle band mix | brick 55%, plate 30%, window 7%; WHITE 35%, RED 30%, LIGHT_GREY 22% | brick 55%, plate 30%, window 7%; WHITE 35%, RED 30%, LIGHT_GREY 22% |
| top band mix | plate 81%, tile 12%, brick 3%; BLACK 71%, LIGHT_GREY 30% | plate 81%, tile 12%, brick 3%; BLACK 71%, LIGHT_GREY 30% |
| steps, pcs/step, steps/100 pcs | 35, 9.91, 10.11 | 35, 9.91, 10.11 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.08 brick → 0.24 brick → 0.4 plate → 0.57 brick → 0.83 plate | 0.08 brick → 0.24 brick → 0.4 plate → 0.57 brick → 0.83 plate |
| interior / walls / roof at (progress) | – / 0.63 / 0.93 | – / 0.63 / 0.93 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 5% (tops: tile 5%, studs 90%, slope 2%) | 5% (tops: tile 5%, studs 90%, slope 2%) |
| off-grid, sideways, brackets, hinges | 0%, 1%, 1%, 2% | 0%, 1%, 1%, 2% |
| part mix | brick 45%, plate 38%, tile 6%, window 5%, round 2%, hinge 2%, wheel 1% | brick 45%, plate 38%, tile 6%, window 5%, round 2%, hinge 2%, wheel 1% |

### farm

| metric | profile | ours (4 forges: "barn", "stable") |
|---|---|---|
| width × length (studs) | 15.5 (15–16.8) × 18 (15–21.3) | 15.5 (15–16.8) × 18 (15–21.3) |
| height (bricks) | 12.7 (10.7–14.9) | 12.7 (10.7–14.9) |
| pieces (structure) | 244.5 (163–345) | 244.5 (163–345) |
| w:l, h:l | 0.95, 0.71 | 0.95, 0.71 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 26% (interior 9% of the box) | 26% (interior 9% of the box) |
| wall thickness | 1 stud (1: 89%, 2: 2%, 3+: 9%) | 1 stud (1: 89%, 2: 2%, 3+: 9%) |
| bottom band mix | plate 45%, brick 26%, round 13%; WHITE 39%, BLACK 18%, DARK_RED 10% | plate 45%, brick 26%, round 13%; WHITE 39%, BLACK 18%, DARK_RED 10% |
| middle band mix | slope 39%, brick 35%, plate 19%; DARK_RED 77%, WHITE 12%, GREEN 3% | slope 39%, brick 35%, plate 19%; DARK_RED 77%, WHITE 12%, GREEN 3% |
| top band mix | brick 46%, plate 31%, round 23%; BLACK 46%, DARK_RED 31%, LIGHT_GREY 23% | brick 46%, plate 31%, round 23%; BLACK 46%, DARK_RED 31%, LIGHT_GREY 23% |
| steps, pcs/step, steps/100 pcs | 24, 9.9, 10.41 | 24, 9.9, 10.41 |
| step vs height correlation | 0.98 | 0.98 |
| build phases (mean height, top parts) | 0.06 plate → 0.21 brick → 0.34 plate → 0.54 slope → 0.81 slope | 0.06 plate → 0.21 brick → 0.34 plate → 0.54 slope → 0.81 slope |
| interior / walls / roof at (progress) | – / 0.45 / 0.92 | – / 0.45 / 0.92 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 15% (tops: tile 4%, studs 23%, slope 62%) | 15% (tops: tile 4%, studs 23%, slope 62%) |
| off-grid, sideways, brackets, hinges | 0%, 1%, 1%, 1% | 0%, 1%, 1%, 1% |
| part mix | brick 33%, slope 26%, plate 26%, round 6%, window 5%, tile 4%, hinge 1% | brick 33%, slope 26%, plate 26%, round 6%, window 5%, tile 4%, hinge 1% |

### tree

| metric | profile | ours (12 forges: "cherry blossom tree", "pine tree", "palm tree") |
|---|---|---|
| width × length (studs) | 8 (8–9.3) × 9 (8–11) | 8 (8–9.3) × 9 (8–11) |
| height (bricks) | 5 (4.7–7) | 5 (4.7–7) |
| pieces (structure) | 35.5 (33–43.8) | 35.5 (33–43.8) |
| w:l, h:l | 1, 0.54 | 1, 0.54 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 2% (interior 1% of the box) | 2% (interior 1% of the box) |
| wall thickness | 1.5 stud (1: 60%, 2: 19%, 3+: 22%) | 1.5 stud (1: 60%, 2: 19%, 3+: 22%) |
| bottom band mix | round 72%, brick 13%, plate 12%; BROWN 41%, LIGHT_GREY 29%, TAN 14% | round 72%, brick 13%, plate 12%; BROWN 41%, LIGHT_GREY 29%, TAN 14% |
| middle band mix | plate 64%, round 16%, hinge 9%; GREEN 52%, BROWN 18%, PINK 16% | plate 64%, round 16%, hinge 9%; GREEN 52%, BROWN 18%, PINK 16% |
| top band mix | round 71%, tile 16%, hinge 10%; GREEN 66%, PINK 25%, YELLOW 6% | round 71%, tile 16%, hinge 10%; GREEN 66%, PINK 25%, YELLOW 6% |
| steps, pcs/step, steps/100 pcs | 10.5, 3.85, 26.34 | 10.5, 3.85, 26.34 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.15 plate → 0.41 plate → 0.54 plate → 0.65 plate → 0.84 round | 0.15 plate → 0.41 plate → 0.54 plate → 0.65 plate → 0.84 round |
| interior / walls / roof at (progress) | – / 0.38 / 0.95 | – / 0.38 / 0.95 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 2% (tops: tile 8%, studs 83%, slope 1%) | 2% (tops: tile 8%, studs 83%, slope 1%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 7% | 0%, 0%, 0%, 7% |
| part mix | plate 52%, round 24%, tile 9%, brick 7%, hinge 7%, slope 2% | plate 52%, round 24%, tile 9%, brick 7%, hinge 7%, slope 2% |

### flower

| metric | profile | ours (8 forges: "sunflower", "cactus", "lily pond") |
|---|---|---|
| width × length (studs) | 4.5 (4–8.5) × 6 (5–8.8) | 4.5 (4–8.5) × 6 (5–8.8) |
| height (bricks) | 8.5 (7.3–8.7) | 8.5 (7.3–8.7) |
| pieces (structure) | 26 (24.3–30) | 26 (24.3–30) |
| w:l, h:l | 0.8, 1.46 | 0.8, 1.46 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 26% (interior 6% of the box) | 26% (interior 6% of the box) |
| wall thickness | 1 stud (1: 95%, 2: 3%, 3+: 3%) | 1 stud (1: 95%, 2: 3%, 3+: 3%) |
| bottom band mix | round 74%, tile 17%, plate 10%; ORANGE 56%, TAN 22%, DARK_GREY 7% | round 74%, tile 17%, plate 10%; ORANGE 56%, TAN 22%, DARK_GREY 7% |
| middle band mix | round 50%, plate 28%, hinge 20%; GREEN 81%, BROWN 7%, ORANGE 7% | round 50%, plate 28%, hinge 20%; GREEN 81%, BROWN 7%, ORANGE 7% |
| top band mix | round 77%, tile 20%, plate 4%; GREEN 40%, PINK 37%, YELLOW 22% | round 77%, tile 20%, plate 4%; GREEN 40%, PINK 37%, YELLOW 22% |
| steps, pcs/step, steps/100 pcs | 12.5, 1.86, 53.85 | 12.5, 1.86, 53.85 |
| step vs height correlation | 1 | 1 |
| build phases (mean height, top parts) | 0.11 round → 0.35 round → 0.48 plate → 0.64 plate → 0.89 round | 0.11 round → 0.35 round → 0.48 plate → 0.64 plate → 0.89 round |
| interior / walls / roof at (progress) | – / – / 1 | – / – / 1 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 23% (tops: tile 22%, studs 77%, slope 0%) | 23% (tops: tile 22%, studs 77%, slope 0%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 8% | 0%, 0%, 0%, 8% |
| part mix | round 59%, plate 19%, tile 14%, hinge 8% | round 59%, plate 19%, tile 14%, hinge 8% |

### dragon

| metric | profile | ours (8 forges: "red dragon breathing fire", "dragon", "wyvern") |
|---|---|---|
| width × length (studs) | 23 (23–27) × 32 (31–33.3) | 23 (23–27) × 32 (31–33.3) |
| height (bricks) | 12 (12–12) | 12 (12–12) |
| pieces (structure) | 115 (114.8–118.3) | 115 (114.8–118.3) |
| w:l, h:l | 0.74, 0.38 | 0.74, 0.38 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 3% (interior 0% of the box) | 3% (interior 0% of the box) |
| wall thickness | 2 stud (1: 0%, 2: 90%, 3+: 10%) | 2 stud (1: 0%, 2: 90%, 3+: 10%) |
| bottom band mix | brick 81%, round 20%; RED 81%, LIGHT_GREY 13%, BROWN 7% | brick 81%, round 20%; RED 81%, LIGHT_GREY 13%, BROWN 7% |
| middle band mix | plate 40%, hinge 34%, brick 19%; RED 84%, DARK_RED 13%, DARK_GREY 3% | plate 40%, hinge 34%, brick 19%; RED 84%, DARK_RED 13%, DARK_GREY 3% |
| top band mix | plate 52%, round 32%, slope 8%; RED 52%, WHITE 24%, TRANS_ORANGE 16% | plate 52%, round 32%, slope 8%; RED 52%, WHITE 24%, TRANS_ORANGE 16% |
| steps, pcs/step, steps/100 pcs | 27, 4.26, 23.48 | 27, 4.26, 23.48 |
| step vs height correlation | 1 | 1 |
| build phases (mean height, top parts) | 0.19 plate → 0.36 brick → 0.48 hinge → 0.71 plate → 0.88 plate | 0.19 plate → 0.36 brick → 0.48 hinge → 0.71 plate → 0.88 plate |
| interior / walls / roof at (progress) | – / 0.35 / 0.88 | – / 0.35 / 0.88 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 2% (tops: tile 1%, studs 93%, slope 4%) | 2% (tops: tile 1%, studs 93%, slope 4%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 23% | 0%, 0%, 0%, 23% |
| part mix | plate 39%, hinge 23%, brick 20%, round 11%, slope 5%, tile 2% | plate 39%, hinge 23%, brick 20%, round 11%, slope 5%, tile 2% |

### dinosaur

| metric | profile | ours (6 forges: "triceratops", "dinosaur", "dino") |
|---|---|---|
| width × length (studs) | 6.5 (5.3–7.8) × 28 (27–29) | 6.5 (5.3–7.8) × 28 (27–29) |
| height (bricks) | 9.3 (9.3–9.3) | 9.3 (9.3–9.3) |
| pieces (structure) | 79 (75.3–97) | 79 (75.3–97) |
| w:l, h:l | 0.23, 0.34 | 0.23, 0.34 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 6% (interior 1% of the box) | 6% (interior 1% of the box) |
| wall thickness | 2 stud (1: 4%, 2: 86%, 3+: 10%) | 2 stud (1: 4%, 2: 86%, 3+: 10%) |
| bottom band mix | brick 66%, round 34%; GREEN 66%, LIGHT_GREY 30%, BROWN 4% | brick 66%, round 34%; GREEN 66%, LIGHT_GREY 30%, BROWN 4% |
| middle band mix | brick 30%, plate 29%, hinge 26%; GREEN 93%, RED 5%, WHITE 1% | brick 30%, plate 29%, hinge 26%; GREEN 93%, RED 5%, WHITE 1% |
| top band mix | plate 61%, round 12%, brick 10%; GREEN 71%, WHITE 19%, BLACK 10% | plate 61%, round 12%, brick 10%; GREEN 71%, WHITE 19%, BLACK 10% |
| steps, pcs/step, steps/100 pcs | 20, 3.95, 25.36 | 20, 3.95, 25.36 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.19 plate → 0.4 brick → 0.53 hinge → 0.79 plate → 0.92 plate | 0.19 plate → 0.4 brick → 0.53 hinge → 0.79 plate → 0.92 plate |
| interior / walls / roof at (progress) | – / 0.21 / 0.84 | – / 0.21 / 0.84 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 3% (tops: tile 3%, studs 88%, slope 8%) | 3% (tops: tile 3%, studs 88%, slope 8%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 18% | 0%, 0%, 0%, 18% |
| part mix | plate 35%, brick 27%, hinge 18%, round 10%, slope 9%, tile 3% | plate 35%, brick 27%, hinge 18%, round 10%, slope 9%, tile 3% |

### animal

| metric | profile | ours (12 forges: "a giraffe", "elephant", "cat") |
|---|---|---|
| width × length (studs) | 7 (6.8–11) × 20.5 (16–21.3) | 7 (6.8–11) × 20.5 (16–21.3) |
| height (bricks) | 7.5 (5–10) | 7.5 (5–10) |
| pieces (structure) | 60 (52.8–64.3) | 60 (52.8–64.3) |
| w:l, h:l | 0.47, 0.4 | 0.47, 0.4 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 0% (interior 0% of the box) | 0% (interior 0% of the box) |
| wall thickness | 3 stud (1: 0%, 2: 75%, 3+: 25%) | 3 stud (1: 0%, 2: 75%, 3+: 25%) |
| bottom band mix | brick 70%, round 30%; LIGHT_GREY 30%, BROWN 20%, YELLOW 13% | brick 70%, round 30%; LIGHT_GREY 30%, BROWN 20%, YELLOW 13% |
| middle band mix | plate 70%, brick 19%, round 7%; BROWN 21%, LIME 17%, LIGHT_GREY 16% | plate 70%, brick 19%, round 7%; BROWN 21%, LIME 17%, LIGHT_GREY 16% |
| top band mix | plate 36%, round 31%, tile 18%; BLACK 25%, YELLOW 21%, WHITE 14% | plate 36%, round 31%, tile 18%; BLACK 25%, YELLOW 21%, WHITE 14% |
| steps, pcs/step, steps/100 pcs | 17.5, 3.33, 30.16 | 17.5, 3.33, 30.16 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.16 brick → 0.36 plate → 0.52 plate → 0.74 plate → 0.91 round | 0.16 brick → 0.36 plate → 0.52 plate → 0.74 plate → 0.91 round |
| interior / walls / roof at (progress) | – / 0.42 / 0.91 | – / 0.42 / 0.91 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 4% (tops: tile 4%, studs 88%, slope 3%) | 4% (tops: tile 4%, studs 88%, slope 3%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 2% | 0%, 0%, 0%, 2% |
| part mix | plate 56%, brick 22%, round 13%, tile 3%, slope 3%, hinge 2% | plate 56%, brick 22%, round 13%, tile 3%, slope 3%, hinge 2% |

### bird

| metric | profile | ours (8 forges: "parrot", "penguin", "flamingo") |
|---|---|---|
| width × length (studs) | 4.5 (4–5.3) × 6 (6–6) | 4.5 (4–5.3) × 6 (6–6) |
| height (bricks) | 5.2 (5–6.1) | 5.2 (5–6.1) |
| pieces (structure) | 28 (27–30.3) | 28 (27–30.3) |
| w:l, h:l | 0.75, 0.86 | 0.75, 0.86 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 0% (interior 0% of the box) | 0% (interior 0% of the box) |
| wall thickness | solid | solid |
| bottom band mix | round 100%; ORANGE 46%, BROWN 21%, LIGHT_GREY 19% | round 100%; ORANGE 46%, BROWN 21%, LIGHT_GREY 19% |
| middle band mix | plate 58%, slope 21%, hinge 10%; PINK 25%, BLUE 22%, RED 21% | plate 58%, slope 21%, hinge 10%; PINK 25%, BLUE 22%, RED 21% |
| top band mix | round 26%, tile 26%, slope 26%; BLACK 30%, WHITE 26%, ORANGE 24% | round 26%, tile 26%, slope 26%; BLACK 30%, WHITE 26%, ORANGE 24% |
| steps, pcs/step, steps/100 pcs | 13.5, 2.08, 48.22 | 13.5, 2.08, 48.22 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.19 round → 0.44 plate → 0.57 plate → 0.76 plate → 0.91 round | 0.19 round → 0.44 plate → 0.57 plate → 0.76 plate → 0.91 round |
| interior / walls / roof at (progress) | – / 0.28 / 0.92 | – / 0.28 / 0.92 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 29% (tops: tile 13%, studs 34%, slope 53%) | 29% (tops: tile 13%, studs 34%, slope 53%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 7% | 0%, 0%, 0%, 7% |
| part mix | plate 43%, slope 21%, round 19%, hinge 7%, tile 7%, brick 4% | plate 43%, slope 21%, round 19%, hinge 7%, tile 7%, brick 4% |

### seaCreature

| metric | profile | ours (10 forges: "shark", "blue whale", "octopus") |
|---|---|---|
| width × length (studs) | 10 (10–10) × 14 (10–19) | 10 (10–10) × 14 (10–19) |
| height (bricks) | 4.3 (4–4.3) | 4.3 (4–4.3) |
| pieces (structure) | 46 (35–46) | 46 (35–46) |
| w:l, h:l | 0.6, 0.23 | 0.6, 0.23 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 11% (interior 2% of the box) | 11% (interior 2% of the box) |
| wall thickness | 7.5 stud (1: 25%, 2: 17%, 3+: 58%) | 7.5 stud (1: 25%, 2: 17%, 3+: 58%) |
| bottom band mix | plate 86%, round 14%; TAN 59%, RED 20%, TRANS_CLEAR 12% | plate 86%, round 14%; TAN 59%, RED 20%, TRANS_CLEAR 12% |
| middle band mix | plate 35%, round 21%, brick 18%; BLUE 37%, RED 24%, LIGHT_GREY 15% | plate 35%, round 21%, brick 18%; BLUE 37%, RED 24%, LIGHT_GREY 15% |
| top band mix | tile 38%, slope 36%, round 26%; BLACK 38%, BLUE 23%, PURPLE 20% | tile 38%, slope 36%, round 26%; BLACK 38%, BLUE 23%, PURPLE 20% |
| steps, pcs/step, steps/100 pcs | 11, 4.18, 23.91 | 11, 4.18, 23.91 |
| step vs height correlation | 0.98 | 0.98 |
| build phases (mean height, top parts) | 0.11 plate → 0.36 plate → 0.49 plate → 0.62 plate → 0.84 tile | 0.11 plate → 0.36 plate → 0.49 plate → 0.62 plate → 0.84 tile |
| interior / walls / roof at (progress) | – / 0.3 / 0.91 | – / 0.3 / 0.91 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 3% (tops: tile 5%, studs 87%, slope 8%) | 3% (tops: tile 5%, studs 87%, slope 8%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 1% | 0%, 0%, 0%, 1% |
| part mix | plate 51%, round 16%, slope 10%, brick 10%, tile 10%, hinge 1% | plate 51%, round 16%, slope 10%, brick 10%, tile 10%, hinge 1% |

### insect

| metric | profile | ours (8 forges: "bee", "butterfly", "spider") |
|---|---|---|
| width × length (studs) | 7 (6.8–7) × 8 (7–10) | 7 (6.8–7) × 8 (7–10) |
| height (bricks) | 1.7 (1.7–2) | 1.7 (1.7–2) |
| pieces (structure) | 17.5 (16.8–20.3) | 17.5 (16.8–20.3) |
| w:l, h:l | 0.85, 0.23 | 0.85, 0.23 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 0% (interior 0% of the box) | 0% (interior 0% of the box) |
| wall thickness | solid | solid |
| bottom band mix | plate 86%, tile 14%; YELLOW 25%, BLACK 25%, DARK_GREY 25% | plate 86%, tile 14%; YELLOW 25%, BLACK 25%, DARK_GREY 25% |
| middle band mix | round 35%, plate 24%, brick 21%; LIGHT_GREY 27%, BLACK 24%, YELLOW 18% | round 35%, plate 24%, brick 21%; LIGHT_GREY 27%, BLACK 24%, YELLOW 18% |
| top band mix | tile 75%; BLACK 75% | tile 75%; BLACK 75% |
| steps, pcs/step, steps/100 pcs | 5, 4.3, 23.58 | 5, 4.3, 23.58 |
| step vs height correlation | 0.95 | 0.95 |
| build phases (mean height, top parts) | 0.16 plate → 0.3 plate → 0.42 plate → 0.7 round → 0.84 tile | 0.16 plate → 0.3 plate → 0.42 plate → 0.7 round → 0.84 tile |
| interior / walls / roof at (progress) | – / 0 / 1 | – / 0 / 1 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 10% (tops: tile 11%, studs 87%, slope 1%) | 10% (tops: tile 11%, studs 87%, slope 1%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 0% | 0%, 0%, 0%, 0% |
| part mix | plate 46%, tile 22%, round 18%, brick 11%, special 2%, slope 1% | plate 46%, tile 22%, round 18%, brick 11%, special 2%, slope 1% |

### food

| metric | profile | ours (12 forges: "birthday cake", "cheeseburger", "donut") |
|---|---|---|
| width × length (studs) | 12 (8–12) × 12 (8–12) | 12 (8–12) × 12 (8–12) |
| height (bricks) | 3.3 (2–4.3) | 3.3 (2–4.3) |
| pieces (structure) | 46 (45–57) | 46 (45–57) |
| w:l, h:l | 1, 0.36 | 1, 0.36 |
| base | plate (plate 100%) | plate (plate 100%) |
| hollow (air in envelope) | 0% (interior 0% of the box) | 0% (interior 0% of the box) |
| wall thickness | 6 stud (1: 25%, 2: 0%, 3+: 75%) | 6 stud (1: 25%, 2: 0%, 3+: 75%) |
| bottom band mix | plate 64%, tile 36%; WHITE 43%, LIGHT_GREY 42%, TAN 15% | plate 64%, tile 36%; WHITE 43%, LIGHT_GREY 42%, TAN 15% |
| middle band mix | plate 57%, brick 37%, tile 5%; RED 47%, TAN 21%, YELLOW 11% | plate 57%, brick 37%, tile 5%; RED 47%, TAN 21%, YELLOW 11% |
| top band mix | tile 57%, brick 19%, round 12%; RED 30%, WHITE 20%, DARK_RED 17% | tile 57%, brick 19%, round 12%; RED 30%, WHITE 20%, DARK_RED 17% |
| steps, pcs/step, steps/100 pcs | 8, 7.29, 13.9 | 8, 7.29, 13.9 |
| step vs height correlation | 0.99 | 0.99 |
| build phases (mean height, top parts) | 0.11 plate → 0.35 plate → 0.48 brick → 0.69 plate → 0.86 tile | 0.11 plate → 0.35 plate → 0.48 brick → 0.69 plate → 0.86 tile |
| interior / walls / roof at (progress) | – / 0.38 / 0.96 | – / 0.38 / 0.96 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 34% (tops: tile 25%, studs 73%, slope 0%) | 34% (tops: tile 25%, studs 73%, slope 0%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 0% | 0%, 0%, 0%, 0% |
| part mix | plate 47%, tile 27%, brick 23%, round 3% | plate 47%, tile 27%, brick 23%, round 3% |

### skyline

| metric | profile | ours (8 forges: "pyramid", "temple", "colosseum") |
|---|---|---|
| width × length (studs) | 17.5 (11.3–22.3) × 21 (18–22.5) | 17.5 (11.3–22.3) × 21 (18–22.5) |
| height (bricks) | 7.7 (5.8–9.2) | 7.7 (5.8–9.2) |
| pieces (structure) | 145 (104.5–187.3) | 145 (104.5–187.3) |
| w:l, h:l | 0.81, 0.37 | 0.81, 0.37 |
| base | self (self 50%, plate 50%) | self (self 50%, plate 50%) |
| hollow (air in envelope) | 2% (interior 0% of the box) | 2% (interior 0% of the box) |
| wall thickness | 1 stud (1: 100%, 2: 0%, 3+: 0%) | 1 stud (1: 100%, 2: 0%, 3+: 0%) |
| bottom band mix | plate 40%, brick 39%, round 13%; TAN 61%, GREEN 26%, LIGHT_GREY 12% | plate 40%, brick 39%, round 13%; TAN 61%, GREEN 26%, LIGHT_GREY 12% |
| middle band mix | brick 69%, plate 14%, round 11%; TAN 84%, WHITE 13%, GREEN 1% | brick 69%, plate 14%, round 11%; TAN 84%, WHITE 13%, GREEN 1% |
| top band mix | brick 28%, hinge 25%, plate 17%; TAN 63%, DARK_GREY 17%, GOLD 13% | brick 28%, hinge 25%, plate 17%; TAN 63%, DARK_GREY 17%, GOLD 13% |
| steps, pcs/step, steps/100 pcs | 10, 17.45, 6.73 | 10, 17.45, 6.73 |
| step vs height correlation | 1 | 1 |
| build phases (mean height, top parts) | 0.08 brick → 0.26 brick → 0.47 brick → 0.62 brick → 0.86 brick | 0.08 brick → 0.26 brick → 0.47 brick → 0.62 brick → 0.86 brick |
| interior / walls / roof at (progress) | – / 0.43 / 0.98 | – / 0.43 / 0.98 |
| sub-assemblies | 0% of models, 0 per model, 0% of pieces; roles – | 0% of models, 0 per model, 0% of pieces; roles – |
| interiors (freq, height, inside) | none | none |
| tiled tops (tile / tile+studs) | 0% (tops: tile 1%, studs 78%, slope 14%) | 0% (tops: tile 1%, studs 78%, slope 14%) |
| off-grid, sideways, brackets, hinges | 0%, 0%, 0%, 6% | 0%, 0%, 0%, 6% |
| part mix | brick 55%, plate 16%, round 12%, slope 7%, hinge 6%, tile 4% | brick 55%, plate 16%, round 12%, slope 7%, hinge 6%, tile 4% |

<!-- AUTO:END -->
