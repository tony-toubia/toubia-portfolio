# StudForge × LDraw: real sets from the Official Model Repository

**What it is.** 100 real LEGO sets, rebuilt part-for-part by the LDraw community and published in the LDraw.org
Official Model Repository (OMR, https://library.ldraw.org/omr), converted into StudForge's `studforge-omr-1` format:
every part with its world position and rotation, its real instruction step, the sub-assembly it belongs to, its
StudForge catalog id when we stock it, and a stud/plate grid footprint when it sits on the grid. They feed the
"build a real set" viewer, the per-subject construction analysis and the real-example prompts for Claude.

- Data: `public/studforge/data/omr/<id>.json` (100 files, 1.8 MB in all, largest 97 KB, compact JSON) and
  `public/studforge/data/omr/index.json` (28 KB).
- Browser: `public/studforge/js/omr.js` → `FORGE.omr.list()`, `.forSubject(subject)`, `.load(id)` (a generator-shaped
  model: `studForge.load(model)` shows it, `layer` = real step), `.expand(data)`.
- Scripts: `scripts/ldraw/omr-fetch.mjs` (listing, selection, polite cached download) and `scripts/ldraw/omr-convert.mjs`
  (parse, flatten, map, footprint, write). Raw downloads stay in a scratch cache, never in the repo.

## Sources and licences

| Source | What we use | Licence |
| --- | --- | --- |
| LDraw.org Official Model Repository, https://library.ldraw.org/omr | 100 model files (.mpd), one per set; the authors are named in each model's `source.authors` and in the table below | CC BY 2.0 (files saying "Redistributable under CCAL version 2.0", the LDraw wording for the Creative Commons Attribution License 2.0) or CC BY 4.0 ("Licenced under CC BY 4.0") |
| LDraw.org Parts Library | part bounding boxes (for footprints) and, through agent A's baker, the rendered geometry; `~Moved to` redirects; `LDConfig.ldr` colours | CC BY 2.0 / CC BY 4.0 (`CAreadme.txt`) |

Every model file was checked: its main `0 !LICENSE` line must be CC BY 2.0/4.0 (NC/ND/SA variants are refused). Four
of the downloaded files (6285-1, 6286-1 and two 31066-1 alternates) also embed copies of official parts with a
`Free for non-commercial use` LDCad header; the converter never uses an embedded copy of a part that exists in the
official library: it references the official part instead (`stats.embeddedOfficial`, 151 references in all), so nothing
derived from those embedded sections ships. Set numbers and names appear as plain text only; no logos, box art or
sticker artwork are used (printed parts are mapped to their plain base part, stickers are dropped).

**Attribution text** (shown with every model; `index.json` carries the general form in `licence`):

> *<Set name>* (<year>, set <number>), rebuilt from the LDraw Official Model Repository file by <authors>, licensed
> CC BY 2.0/4.0, https://library.ldraw.org/omr/sets/<n>. Part geometry from the LDraw.org Parts Library (CC BY).
> Converted for StudForge. LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this project.

`FORGE.omr.load()` builds the description line from it: "Knight's Castle: the real 1984 Castle set 6073, 446 pieces in
48 steps with 12 sub-assemblies, rebuilt from the LDraw OMR file by Stefan Frenz." and puts `{ setId, year, theme,
authors, url, file, licence }` in `model.reference` for the attribution line in the viewer.

## How the OMR is served (inspected October 2026)

There is no JSON API. `https://library.ldraw.org/omr/sets?page=N` is a paginated table (25 rows a page, 59 pages,
1 470 sets) of set number, name, theme, year and model count; each row links to `/omr/sets/<id>`, whose page lists the
set's models (main model plus alternates) with author, "missing parts / patterns / stickers" flags and a download link
`https://library.ldraw.org/library/omr/<file>.mpd`. `omr-fetch.mjs` parses that HTML.

Politeness: strictly sequential requests, ≥1.2 s apart, a descriptive User-Agent (`StudForge-OMR-fetch/1.0 ...`), every
response cached (`<cache>/html`, `<cache>/files`) and never fetched twice. In all: 59 list pages, 284 set pages and
294 model files (one 404).

```
node scripts/ldraw/omr-fetch.mjs --cache <scratch>/omr --lib <ldraw> [--stage list|candidates|fetch|rescan|select|all]
node scripts/ldraw/omr-convert.mjs --lib <ldraw> --cache <scratch>/omr --out public/studforge/data/omr [--only id,..] [--verify id,..] [--bbox 3001,..]
```

## Selection

1. **Classify** every set by name (ordered keyword regexes, specific before general: fire truck before truck, pirate
   ship before ship, fire station before station) into the knowledge subjects of `data/knowledge.json`. Space-craft
   subjects only count in space themes ("Dino Explorer" is a jeep); Castle sets naming a structure count as castle;
   three hand corrections (`OVERRIDES`: Dark Shark and Hydro Racer are boats, Dino Explorer a car). Only studded System
   themes are kept (Town/City, Creator, Castle, Space, Pirates, Train, Boat, Legoland, Racers, Model Team...; no
   Technic, Duplo, Bionicle, Mindstorms, Star Wars, Brickheadz). 669 candidate sets.
2. **Fetch** per subject in an order that prefers City/Town/Creator/Castle/Space/Pirates/Train and rotates through the
   decades, downloading until the subject's quota is met (a qualifying model is CC BY, 50–1250 pieces, no missing
   parts) or the pool is spent. Creator 3-in-1 alternates are kept when they classify into another subject.
3. **Select** up to the subject quota (2–5; ~110 targeted), again round-robin over decades. Piece counts exclude LDraw
   primitives (rigging strings are hundreds of `4-4cyli.dat`).

Result: **100 models, 24 164 pieces, 3 636 instruction steps**, 35 subjects, 1966–2021 (1960s 2, 1970s 8, 1980s 34,
1990s 24, 2000s 17, 2010s 14, 2020s 1); themes Town 39, Creator 15, Space 12, City 10, Castle 9, Train 6, Boat 3,
Pirates 2, others 4. Subject counts: car, castle, house, plane, spaceship, train 5; boat, construction, fireTruck,
helicopter, rocket, shop, station, truck 4; policeCar 3; ambulance, animal, bus, dragon, farm, garbageTruck,
monsterTruck, motorcycle, pirateShip, robot, rover, seaCreature, ship, spaceStation, tractor 2; bird, bridge,
lighthouse, tower, windmill 1. **Not available** in the OMR within the filters: submarine, tank, dinosaur (only tiny
Designer sets), a third pirate ship (the OMR has exactly two Pirates ships, 6285 and 6286), more than one windmill,
tower or lighthouse.

## Method (omr-convert.mjs)

- **Parsing.** Multi-file MPD (`0 FILE`, `0 NOFILE`, `0 !DATA` skipped), case-insensitive references, UTF-8 with a
  Latin-1 fallback. A section is a submodel unless its `!LDRAW_ORG` says part or it is a `.dat`.
- **Steps.** A section's steps are its reference lines grouped by `0 STEP` / `0 ROTSTEP` (empty groups skipped).
  Flattening keeps the build order: when a parent step first places a submodel, the submodel's own steps are laid out
  right before that parent step (built where it is placed); later placements of the same submodel put all its parts
  into the placing parent step. The resulting step count equals the sum of the file's step groups for **all 100
  models** (checked on every run; raw `0 STEP` lines + one unterminated last step per section). A parent step that
  only attaches a sub-assembly has no new parts, so the viewer, which steps through distinct layers, can show a
  couple fewer steps than `steps` (e.g. 6285-1: 68 steps, 65 non-empty).
- **References.** Library parts are kept; references to primitives or unknown files are dropped (5 135, almost all the
  `4-4cyli.dat` rigging of the two pirate ships); stickers (embedded or library "Sticker" parts, 66) are dropped; LSynth
  hose segments (211) are dropped; embedded stickered parts (e.g. "2916pb03 with stickers applied") are unwrapped to
  their library base part; embedded copies of official parts use the official part.
- **Ids.** `parts[k] = [renderId, catalogId, originalId?, flag?]`. `renderId` is the canonical LDraw id (`~Moved to`
  followed) and de-patterned when the plain base exists (`3069bp01` → `3069b`, `973p24` → `973`, `3626bpa3` → `3626b`):
  we render one colour per part and ship no print artwork, and the baker has far fewer parts to bake (1 203 distinct render ids).
  `originalId` keeps the file's id when it differs (260 distinct). `catalogId`: exact; `~Moved to` chains both ways
  (our `4073` is LDraw's moved-to `6141`); strip a trailing letter (`3062b` → `3062`); pattern suffixes
  (`pNN`, `prNNNN`, `patNNNN`, `dNN`); composite suffix `cNN`; a short equivalence table (`3794a/b` → `15573`,
  `3065` → `3004`, `6143` → `3941`, `4150` → `14769`, `4589` → `59900`, `87994` → `30374`, `4276b/4275b` → `44302/44301`...).
  Flags: `baseplate` (LDraw names starting "Baseplate": draw procedurally, they are 25k–55k triangles) and `segment`
  (flexible-hose segments `~Hose Flexible Segment ...`: one real hose is dozens of them, so they are not counted in
  `pieces`). Minifigure parts (LDraw name/category "Minifig", or anything in a submodel named minifig/figure) stay,
  are listed in `minifigParts` and flagged `minifig`.
- **Axes.** `ours = C · ldraw / 20`, `C = diag(1, −1, −1)` (a proper 180° rotation about X, determinant +1, so nothing is
  mirrored), `R_ours = C · R · C`, positions to 3 decimals, matrices to 4.
- **Bounding boxes.** Own minimal recursive bbox: vertices of line types 3/4 through sub-file transforms, memoised per
  file; a child placed with a signed-permutation (possibly scaled) matrix contributes its transformed bbox corners
  (exact), any other child its actual vertices. Checked against agent A's baked geometry: identical bboxes for all 274
  parts compared (max difference < 0.02 stud).
- **Footprints.** A part gets `x0, z0, y0, w, l, hp` when its rotation keeps +Y up and is on the 90° lattice about Y.
  Bbox edges are snapped independently (round; the top edge is floored with a tolerance so the studs' half plate
  doesn't count); both X (or Z) edges half a stud off (jumper offsets) or a bottom more than 0.3 plate off → `null`.
  Baseplates get the one plate under their top surface. The grid phase (half-stud / plate offset) is taken per
  top-level item (vehicle, base, minifig group) as the most common fraction of its parts' bbox minima, then expressed
  on the model's grid; the model is shifted so the footprint starts at 0,0,0 (lowest plate).
- **Display poses.** OMR main files often stand the finished vehicle at an angle next to its minifigs. When exactly one
  top-level sub-assembly is posed off the 90° lattice about Y, it is squared to the nearest 90° and half stud (its
  internals untouched). Several angled items (a train on curved track: Metroliner) are a deliberate arrangement and
  are left alone. A whole-model tilt (every part sharing one off-lattice rotation) would be undone too; none of the
  100 needed it (6679-2's 17° is a real tilted tow boom).
- **Colours.** `LDConfig.ldr` code → our 21 `window.LEGO_COLORS`: LEGO colour id (LDConfig's `// LEGOID` comment)
  match, then name, then a few overrides (metallic silvers → LIGHT_GREY, Trans_Brown → TRANS_CLEAR, medium/light/sky
  blues → BLUE, Dark_Tan → TAN), then nearest in CIELAB within solid vs transparent. Direct colours (`0x2RRGGBB`) go
  nearest. Pieces by method: LEGO id 20 452 (82.8%), name 3 163 (12.8%), override 212 (0.9%), nearest 869 (3.5%:
  rubber black/white tyres, Trans_Yellow → TRANS_ORANGE, trans greens → TRANS_BLUE, Light_Yellow → TAN, pearl gold).

## Coverage

- **Catalog mapping: 67.6% of non-minifigure pieces** (14 115 of 20 882) map to a StudForge catalog part; per model
  41–92%, median 69%. Top unmapped parts (pieces): 2420 Plate 2x2 Corner 177, 4162 Tile 1x8 115, 2357 Brick 2x2 Corner
  101, 4865a Panel 1x2x1 93, 3711 Technic Chain Link 91, 3297 Slope 33 3x4 82, 2540 Plate 1x2 with Handle 73, 2877 Brick
  1x2 with Grille 73, 4488 Plate 2x2 with Wheel Pin 65, 32028 Plate 1x2 with Door Rail 56, 6019 Plate 1x1 with
  Horizontal Clip 55, 4084 Tyre 54, 2454 Brick 1x2x5 51, 3829c01 Steering Stand 48, 6541 Technic Brick 1x1 48, 4444
  Panel 2x5x6 Wall 47, 122c01 Plate 2x2 with Red Wheels 46, 3713 Technic Bush 45, 3788 Mudguard 2x4 43, 2453a Brick
  1x1x5 43. These are the obvious next catalog additions (corner plates/bricks, long tiles, panels, 1x5 pillars).
- **Grid footprints:** 15 548 of 24 164 pieces; mean off-grid share per model 30% (minifigures, SNOT detail, wheels on
  axles, hinged and angled parts). Castles and houses are almost fully on the grid (Knight's Castle 1%, Post Office
  2%); vehicles less so (wheels, mudguards, hinged ramps: 20–55%).
- **Overlaps** (grid cells claimed by two grid-aligned non-minifig parts): 3 257 pairs over 3 595 parts in all. They
  come from footprints that are bounding boxes of hollow or overhanging parts, not from misplacement: panels and walls
  (4444 2x5x6 wall: 47 of 47 instances overlap the bricks inside its corner), window frames with their glass (3853 +
  3854), boat hulls (2559c01), jet noses over the plates they cover (4854/4855), wheel holders and wheels (4488 + 3641),
  and SNOT bricks mounted on side studs half a plate off the grid.

## Verification (5 models)

| Model | Pieces | Steps (file groups / raw `0 STEP` lines) | Sub-assemblies | Catalog | Off-grid | Overlap pairs | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4208-1 4 x 4 Fire Truck (2012) | 248 | 92 / 82 | 9 | 61% | 28% | 68 | cab, door, water cannon, rack, tree, firemen; overlaps: 30157a wheel arches over plates, 62361 mudguards |
| 6368-1 Jet Airliner (1985) | 147 | 19 / 14 | 4 | 41% | 8% | 29 | 4282/4854/4855 hull and nose pieces over the plates they cover |
| 6365-1 Summer Cottage (1981) | 154 | 15 / 12 | 2 | 75% | 18% | 4 | 4 = window frames 3853 holding their glass 3854 |
| 6073-1 Knight's Castle (1984) | 446 | 48 / 35 | 12 | 80% | 1% | 142 | 4444 wall panels' bboxes over the bricks in their corners; 122 rope primitives dropped |
| 6285-1 Black Seas Barracuda (1989) | 955 | 68 / 36 | 32 | 74% | 32% | 161 | 2559c01 hull bbox; 2 103 rigging primitives dropped; the main file builds the hull in one 519-part step |

All five load with `FORGE.omr.load(id).then(studForge.load)` on a local server without console errors; rendered with
baked LDraw geometry and each brick's matrix (a test-only stand-in for agent C's path) they come out upright and
recognisable (sails up, castle gate red in grey walls, the airliner's tail and engines on top), and the conversion is a
proper rotation (det C = +1), so nothing is mirrored.

## Surprises

- The OMR has no API and no per-model piece counts; piece counts had to come from the downloaded files.
- Rigging and hoses are not parts: OMR pirate ships draw strings from hundreds of `4-4cyli.dat` primitives, newer files
  use LSynth segments, and flexible hoses are dozens of `~Hose Flexible Segment` parts. Counting naively puts the
  Black Seas Barracuda at 3 102 pieces; it is 955.
- Instruction granularity varies wildly: modern Creator/City files have a step per real booklet step (Bridge Chase 149,
  Wind Turbine Transport 169), some classic files have a handful (Ferry 311-1 has none: 1 step), and 6285's main file
  builds the whole hull in one step.
- Display poses: main files put the vehicle at 30° next to its minifigs, or trains on curved track; a few classic
  models are partly tilted on purpose (6679-2's tow boom).
- Several MPDs carry copies of official parts with LDCad's own non-commercial header; harmless once those copies are
  replaced by the official parts, but a reason to check every section, not just the first licence line.

## Models

| Subject | Id | Name | Year | Theme | Pieces | Steps | Catalog | Off-grid | Overlap pairs | Authors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ambulance | 6364-1 | Paramedic Unit | 1980 | Town > Classic Town | 145 | 21 | 86% | 37% | 0 | Robert Paciorek |
| ambulance | 6666-1 | Ambulance | 1994 | Town > Classic Town | 89 | 18 | 67% | 23% | 4 | Robert Paciorek |
| animal | 6022-1 | Horse Cart | 1984 | Castle > Lion Knights | 53 | 13 | 50% | 18% | 7 | Stefan Frenz |
| animal | 30026-1 | Panda | 2011 | Creator | 61 | 3 | 69% | 38% | 25 | Takeshi Takahashi |
| bird | 4917-1-bird | Mini Robots (Bird) | 2007 | Creator > Creator 3-in-1 | 64 | 14 | 72% | 83% | 1 | Marc Giraudet |
| boat | 311-1 | Ferry | 1973 | Boat | 82 | 1 | 92% | 15% | 25 | Merlijn Wissink |
| boat | 6698-1 | RV with Speedboat | 1986 | Town > Classic Town | 128 | 26 | 60% | 54% | 20 | Robert Paciorek |
| boat | 6679-1 | Dark Shark | 1991 | Town > Classic Town | 94 | 3 | 64% | 47% | 0 | Rijk van Voorst |
| boat | 4643-1 | Power Boat Transporter | 2011 | City > Harbor | 265 | 112 | 67% | 26% | 69 | Marc Giraudet |
| bridge | 8135-1 | Bridge Chase | 2007 | Racers | 576 | 149 | 62% | 36% | 33 | Massimo Maso |
| bus | 6694-1 | Car with Camper | 1984 | Town > Classic Town | 121 | 28 | 73% | 17% | 28 | Robert Paciorek |
| bus | 6351-1 | Surf N' Sail Camper | 1992 | Town > Classic Town | 191 | 36 | 71% | 17% | 14 | Robert Paciorek |
| car | 5934-1 | Dino Explorer | 2000 | Adventurers > Dino Island | 102 | 30 | 51% | 17% | 10 | Stan Isachenko |
| car | 4896-1 | Roaring Roadsters | 2006 | Creator > Creator 3-in-1 | 924 | 164 | 65% | 33% | 99 | Marc Giraudet |
| car | 5767-1 | Cool Cruiser | 2011 | Creator > Creator 3-in-1 | 593 | 17 | 67% | 39% | 48 | Takeshi Takahashi |
| car | 10242-1 | MINI Cooper | 2014 | Creator > Creator Expert | 1076 | 225 | 75% | 36% | 259 | Magnus Forsberg |
| car | 76897-1 | 1985 Audi Sport quattro S1 | 2020 | Speed Champions | 262 | 69 | 62% | 35% | 75 | Adrien Pennamen |
| castle | 6040-1 | Blacksmith Shop | 1984 | Castle > Lion Knights | 99 | 21 | 83% | 3% | 35 | Stefan Frenz |
| castle | 6073-1 | Knight's Castle | 1984 | Castle > Black Falcons | 446 | 48 | 80% | 1% | 142 | Stefan Frenz |
| castle | 6059-1 | Knight's Stronghold | 1990 | Castle > Black Knights | 256 | 45 | 70% | 19% | 42 | Stefan Frenz |
| castle | 6071-1 | Forestmen's Crossing | 1990 | Castle > Forestmen | 240 | 44 | 63% | 6% | 73 | Takeshi Takahashi |
| castle | 10176-1 | Royal King's Castle | 2006 | Castle > Knights Kingdom II | 943 | 254 | 65% | 21% | 177 | Marc Giraudet |
| construction | 6648-2 | Dump Truck | 1980 | Town > Classic Town | 53 | 4 | 51% | 14% | 3 | Robert Paciorek |
| construction | 6678-1 | Pneumatic Crane | 1980 | Town > Classic Town | 69 | 20 | 69% | 54% | 1 | Robert Paciorek |
| construction | 6352-1 | Cargomaster Crane | 1991 | Town > Classic Town | 153 | 24 | 70% | 26% | 11 | Robert Paciorek |
| construction | 5761-1 | Mini Digger | 2011 | Creator > Creator 3-in-1 | 53 | 3 | 55% | 34% | 9 | Takeshi Takahashi |
| dragon | 6043-1 | Dragon Defender | 1993 | Castle > Dragon Knights | 168 | 43 | 71% | 33% | 8 | Chris Böhnke |
| dragon | 6056-1 | Dragon Wagon | 1993 | Castle > Dragon Knights | 118 | 30 | 41% | 33% | 20 | Chris Böhnke |
| farm | 6379-1 | Riding Stable | 1986 | Town > Classic Town | 275 | 29 | 79% | 8% | 21 | Stefan Frenz |
| farm | 7637-1 | Farm | 2009 | City > Farm | 632 | 172 | 59% | 37% | 67 | Marc Giraudet |
| fireTruck | 6480-1 | Hook and Ladder Truck | 1986 | Town > Classic Town | 122 | 23 | 61% | 25% | 35 | Robert Paciorek |
| fireTruck | 6440-1 | Jetport Fire Squad | 1991 | Town > Classic Town | 170 | 23 | 66% | 22% | 14 | Robert Paciorek |
| fireTruck | 4208-1 | 4 x 4 Fire Truck | 2012 | City > Fire | 248 | 92 | 61% | 28% | 68 | Robert Paciorek |
| fireTruck | 6911-1 | Mini Fire Truck | 2012 | Creator > Creator 3-in-1 | 68 | 31 | 71% | 50% | 8 | Johann Eisner, Ken Drew |
| garbageTruck | 6693-1 | Refuse Collection Truck | 1987 | Town > Classic Town | 128 | 34 | 67% | 47% | 7 | Robert Paciorek |
| garbageTruck | 20011-1 | Garbage Truck | 2009 | Creator | 74 | 31 | 84% | 38% | 9 | Ken Drew |
| helicopter | 6691-1 | Red Cross Helicopter | 1981 | Town > Classic Town | 115 | 13 | 77% | 34% | 13 | Victor Di Rienzo |
| helicopter | 6685-1 | Fire Copter 1 | 1982 | Town > Classic Town | 102 | 27 | 87% | 17% | 6 | Robert Paciorek |
| helicopter | 2531-1 | Rescue Helicopter and Jeep | 1998 | Town | 107 | 29 | 66% | 53% | 10 | Robert Paciorek |
| helicopter | 30181-1 | Helicopter | 2012 | Creator | 52 | 1 | 73% | 37% | 0 | Merlijn Wissink |
| house | 345-1 | House with Mini Wheel Car | 1969 | Legoland > Building | 132 | 14 | 81% | 2% | 8 | Marc Giraudet |
| house | 376-2 | Town House with Garden | 1978 | Town > Classic Town | 231 | 35 | 79% | 51% | 2 | Robert Paciorek |
| house | 6365-1 | Summer Cottage | 1981 | Town > Classic Town | 154 | 15 | 75% | 18% | 4 | Robert Paciorek |
| house | 6592-1 | Vacation Hideaway | 1990 | Town > Classic Town | 124 | 16 | 70% | 20% | 1 | Stefan Frenz |
| house | 4954-1 | Model Town House | 2007 | Creator > Creator 3-in-1 | 1174 | 105 | 78% | 15% | 58 | Marc Giraudet |
| lighthouse | 5770-1 | Lighthouse Island | 2011 | Creator > Creator 3-in-1 | 514 | 5 | 68% | 19% | 27 | Takeshi Takahashi |
| monsterTruck | 6675-1 | Road & Trail 4x4 | 1988 | Town > Classic Town | 87 | 15 | 50% | 41% | 10 | Victor Di Rienzo, Takeshi Takahashi |
| monsterTruck | 6533-1 | Police 4x4 | 1992 | Town > Classic Town | 69 | 14 | 76% | 34% | 6 | Robert Paciorek |
| motorcycle | 6373-1 | Motorcycle Shop | 1984 | Town > Classic Town | 189 | 18 | 75% | 14% | 9 | Robert Paciorek |
| motorcycle | 60065-1 | ATV Patrol | 2015 | City > Police | 71 | 6 | 44% | 48% | 9 | Merlijn Wissink |
| pirateShip | 6285-1 | Black Seas Barracuda | 1989 | Pirates > Pirates I | 955 | 68 | 74% | 32% | 161 | Philippe Hurbain |
| pirateShip | 6286-1 | Skull's Eye Schooner | 1993 | Pirates > Pirates I | 990 | 83 | 70% | 21% | 239 | Philippe Hurbain |
| plane | 6368-1 | Jet Airliner | 1985 | Town > Classic Town | 147 | 19 | 41% | 8% | 29 | Robert Paciorek |
| plane | 6356-1 | Med-Star Rescue Plane | 1988 | Town > Classic Town | 179 | 23 | 55% | 11% | 23 | Robert Paciorek |
| plane | 6399-1 | Airport Shuttle | 1990 | Town > Classic Town | 788 | 72 | 71% | 17% | 96 | Robert Paciorek |
| plane | 10124-1 | Wright Flyer | 2003 | Creator > Creator Expert | 677 | 136 | 48% | 53% | 13 | Marc Giraudet |
| plane | 3178-1 | Seaplane | 2010 | City > Harbor | 107 | 48 | 51% | 47% | 7 | Marc Giraudet |
| policeCar | 6681-1 | Police Van | 1981 | Town > Classic Town | 87 | 15 | 69% | 24% | 18 | Robert Paciorek |
| policeCar | 6684-1 | Police Patrol Squad | 1984 | Town > Classic Town | 93 | 14 | 65% | 31% | 14 | Robert Paciorek |
| policeCar | 7236-1 | Police Car (Black Sticker Version) | 2005 | City > Police | 63 | 11 | 59% | 35% | 22 | Victor Di Rienzo |
| robot | 6889-1 | Recon Robot | 1994 | Space > Spyrius | 145 | 17 | 61% | 53% | 1 | Damien Roux |
| robot | 4917-1 | Mini Robots | 2007 | Creator > Creator 3-in-1 | 77 | 10 | 74% | 75% | 2 | Marc Giraudet |
| rocket | 897-1 | Mobile Rocket Launcher | 1979 | Space > Classic Space | 90 | 29 | 69% | 45% | 19 | Willy Tschager |
| rocket | 6870-1 | Space Probe Launcher | 1981 | Space > Classic Space | 68 | 22 | 47% | 58% | 5 | Willy Tschager |
| rocket | 6346-1 | Shuttle Launching Crew | 1992 | Town > Classic Town | 456 | 11 | 64% | 54% | 55 | Robert Paciorek, EdmanZA |
| rocket | 31066-1 | Space Shuttle Explorer | 2017 | Creator > Creator 3-in-1 | 174 | 26 | 67% | 27% | 24 | Philippe Hurbain |
| rover | 6770-1 | Lunar Transporter Patroller | 1988 | Space > Futuron | 123 | 9 | 42% | 39% | 21 | Damien Roux |
| rover | 1621-1 | Lunar MPV Vehicle | 1990 | Space > Futuron | 104 | 13 | 60% | 65% | 9 | Damien Roux |
| seaCreature | 6414-1 | Dolphin Point | 1995 | Town > Paradisa | 217 | 56 | 64% | 20% | 53 | Robert Paciorek |
| seaCreature | 30025-1 | Clown Fish | 2011 | Creator | 59 | 2 | 85% | 39% | 4 | Takeshi Takahashi |
| ship | 316-1 | Fire Fighter Ship | 1978 | Boat | 135 | 2 | 69% | 33% | 30 | Robert Paciorek |
| ship | 4015-1 | Freighter | 1982 | Boat | 87 | 7 | 77% | 12% | 28 | Robert Paciorek |
| shop | 6362-1 | Post Office | 1982 | Town > Classic Town | 138 | 20 | 75% | 2% | 16 | Robert Paciorek |
| shop | 6651-1 | Post Office Van | 1982 | Town > Classic Town | 50 | 10 | 60% | 20% | 15 | Robert Paciorek |
| shop | 6376-1 | Breezeway Cafe | 1990 | Town > Classic Town | 221 | 7 | 52% | 26% | 10 | Robert Paciorek |
| shop | 10036-1 | Pizza To Go | 2002 | Town | 166 | 30 | 77% | 38% | 2 | Robert Paciorek |
| spaceship | 894-1 | Mobile Ground Tracking Station | 1979 | Space > Classic Space | 85 | 33 | 76% | 26% | 15 | Willy Tschager |
| spaceship | 918-1 | Space Transport | 1979 | Space > Classic Space | 92 | 15 | 75% | 5% | 12 | Willy Tschager |
| spaceship | 6841-1 | Mineral Detector | 1980 | Space > Classic Space | 50 | 14 | 63% | 21% | 12 | Willy Tschager |
| spaceship | 6861-1 | X1 Patrol Craft | 1980 | Space > Classic Space | 61 | 14 | 60% | 31% | 8 | Willy Tschager |
| spaceship | 6878-1 | Sub Orbital Guardian | 1991 | Space > Blacktron II | 79 | 8 | 73% | 64% | 0 | Damien Roux |
| spaceStation | 6885-1 | Saturn Base Main Team (Crater Crawler) | 1988 | Space > Futuron | 110 | 13 | 55% | 69% | 3 | Damien Roux |
| spaceStation | 6988-1 | Alpha Centauri Outpost | 1991 | Space > Blacktron II | 521 | 26 | 48% | 22% | 27 | Damien Roux |
| station | 374-1 | Fire Station | 1978 | Town > Classic Town | 354 | 31 | 80% | 6% | 20 | Takeshi Takahashi |
| station | 6363-1 | Auto Service Station | 1980 | Town > Classic Town | 150 | 22 | 78% | 34% | 1 | Robert Paciorek |
| station | 2150-1 | Train Station | 1996 | Train > 9V | 622 | 64 | 72% | 7% | 94 | Robert Paciorek |
| station | 10159-1 | City Airport | 2004 | City > Airport | 584 | 16 | 63% | 35% | 39 | Zoltán Kéri, Zoltan Keri |
| tower | 6061-1 | Siege Tower | 1984 | Castle > Lion Knights | 237 | 46 | 78% | 10% | 82 | Stefan Frenz |
| tractor | 6692-1 | Tractor Trailer | 1983 | Town > Classic Town | 95 | 25 | 60% | 18% | 23 | Robert Paciorek |
| tractor | 7634-1 | Tractor | 2009 | City > Farm | 83 | 24 | 51% | 32% | 23 | Marc Giraudet |
| train | 112-2 | Locomotive with Motor | 1966 | Train > 4.5V | 78 | 9 | 73% | 8% | 8 | Michael Heidemann |
| train | 126-1 | Steam Locomotive (Push) | 1970 | Train > 4.5V | 60 | 7 | 82% | 7% | 2 | Merlijn Wissink |
| train | 7730-1 | Electric Goods Train | 1980 | Train > 12V | 373 | 9 | 73% | 14% | 78 | Strikeman, Robert Paciorek |
| train | 4536-1 | Blue Hopper Car | 1991 | Train > 9V | 167 | 4 | 69% | 4% | 30 | Merlijn Wissink |
| train | 10001-1 | Metroliner | 2001 | Train | 841 | 23 | 62% | 69% | 70 | Zoltán Kéri, Zoltan Keri |
| truck | 6679-2 | Exxon Tow Truck | 1980 | Town > Classic Town | 82 | 15 | 69% | 53% | 5 | Victor Di Rienzo |
| truck | 1772-1 | Airport Container Truck | 1992 | Town > Classic Town | 89 | 16 | 60% | 52% | 6 | Robert Paciorek |
| truck | 10156-1 | LEGO Truck | 2004 | Town | 110 | 20 | 74% | 23% | 20 | Robert Paciorek |
| truck | 3179-1 | Repair Truck | 2010 | City > Traffic | 128 | 40 | 56% | 31% | 44 | Marc Giraudet |
| windmill | 7747-1 | Wind Turbine Transport | 2009 | City > Traffic | 455 | 169 | 57% | 41% | 106 | Marc Giraudet |
