# StudForge design knowledge base

**What it is.** `public/studforge/data/knowledge.json` (≈140 KB) tells the generator and the Claude idea route what
*real* sets of a given subject are made of: which parts, in which colours, how many pieces, and which parts go
together. It is **real data**, mined from the open Rebrickable database dumps (set inventories, parts, colours,
themes; CC BY 4.0, https://rebrickable.com/downloads/). No instructions or images were read; only "set X contains
N of part P in colour C". The dumps are not in the repo; `scripts/studforge-mine-knowledge.mjs` rebuilds the JSON
from a scratch directory holding them (usage header in the script, ~10 s).

**Pool.** 7 717 brick-built sets (of 7 996 candidates after filtering): ≥ 15 parts, latest inventory version, not
Duplo/Technic/Mindstorms/Bionicle/figure packs/gear/buckets/Juniors/Minecraft, fewer than half the parts
minifigure parts, name not a pack or accessory. Minifigure, sticker, figure-only and Duplo part categories are
left out of every count; spares are left out.

**Subjects.** 55 entries: 43 subjects matched by regexes on set names (`fireTruck`, `policeCar`, `ambulance`,
`car`, `truck`, `monsterTruck`, `garbageTruck`, `bus`, `tractor`, `construction`, `motorcycle`, `train`, `plane`,
`helicopter`, `boat`, `ship`, `pirateShip`, `submarine`, `spaceship`, `rocket`, `rover`, `spaceStation`, `robot`,
`tank`, `house`, `castle`, `tower`, `lighthouse`, `windmill`, `bridge`, `shop`, `station`, `farm`, `tree`, `flower`,
`dragon`, `dinosaur`, `animal`, `bird`, `seaCreature`, `insect`, `food`, `skyline`) plus 12 whole themes as style
references (`themeCity`, `themeCreator`, `themeCastle`, `themeSpace`, `themeFriends`, `themeNinjago`,
`themeSpeedChampions`, `themePirates`, `themeTrains`, `themeIcons`, `themeArchitecture`, `themeIdeas`). Every
entry carries `n`, the number of sets behind it; treat anything under ~20 (ambulance 14, pirateShip 15,
seaCreature 15, windmill 8, lighthouse 11, bridge 12) as indicative only.

## Schema

```
{
  generated, sources, setsUsed,
  subjects: {
    fireTruck: {
      keys:     ['fire truck', 'fire engine', ...]   prompt words the loader matches
      n:        27                                    real sets behind the numbers
      themes:   ['City', 'Town', 'System']            top root themes
      years:    [1964, 2026]
      parts:    [[ourPartId, setShare, medianQty]]    top 50 parts of OUR catalog, by share of sets that use them
      wanted:   [[partNum, name, setShare]]           top 20 common parts we do NOT stock
      palette:  [[colorId, share]]                    top 8 of our colour ids, mean share of pieces per set
      pieces:   { p25, p50, p75 }                     piece-count percentiles
      longest:  8                                     median longest brick/plate in a set (studs)
      examples: [[setNum, name]]                      three sets closest to the median size
    }, ...
  },
  pairings:  [[idA, idB, lift, sets]]    our parts that share an inventory far more than chance (lift ≥ 1.5, ≥ 25 sets, top 150)
  wheelTyre: [[wheel, tyre, share, sets]] which tyre sits on which wheel in real sets (share of the wheel's sets)
  names:     { partNum: name }            names for the wheel/tyre part numbers
}
```

Rebrickable part numbers are reduced to the design id (`3068b` → `3068`, prints and mould variants fold in) and a
few are aliased onto our ids: `6141`/`85861` → `4073` (round plate), `38340`/`2879` → `55423` (train wheel),
`59900` → `4589` (cone with top groove), `3794` → `15573` (old jumper), `60897` → `4085`, `15712` → `2555` (current
clips), `87697`/`60700` → `6015` (the same 21×12 tyre with a centre band). Colours map onto `LEGO_COLORS` keys;
shades we don't stock go to the nearest (Dark Tan → TAN, Medium Azure → BLUE, Bright Green → GREEN, ...) and
unmapped ones count only in the denominator, so palette shares sum to less than 1.

**Loader.** `public/studforge/js/knowledge.js` (loaded before `generator.js`) fetches the file into
`window.STUDFORGE_KNOWLEDGE` (null until then; `document` fires `studforge:knowledge`) and exposes
`FORGE.knowledge`: `subjectFor(prompt)` (best key match, same word rules as the generator: longer and multi-word
keys win, the head noun wins, whole themes lose ties; `'red fire truck'` → `fireTruck`, `'cherry blossom tree'` →
`tree`), `palette(subject)`, `parts(subject)`, `wanted(subject)`, `pieces(subject)`, `pairings()`, `wheelTyre()`,
`onReady(fn)`. Without the file every call returns null and nothing logs. It is **not wired into the generator
yet**.

## Ten findings

1. **Every real vehicle has a steering wheel and we have none.** Steering Stand 1×2 (`3829`) sits in 83 % of police
   cars, 78 % of fire trucks, 87 % of tractors, 75 % of trucks, 71 % of ambulances, 60 % of cars. It is the single
   most wanted part for vehicles, with Seat 2×2 (`4079`, 33–43 %) right behind it.
2. **The wheel pairings in our catalog are two-thirds right.** 4624 + 3641 is confirmed (155 sets, lift 11) and
   4600 + 4624 is the classic small-car chassis (191 sets, lift 9). 6014 + 6015 is the dominant City pairing: 85 %
   of the 589 sets with wheel 6014 give it tyre 6015 (525 sets, counting the centre-band variants 87697/60700).
   But **56904 (Wheel 30×14) never appears with 56891**: real sets put 56898 or 30699 (Tyre 43.2×14) on it, while
   56891 (Tyre 37×18 balloon) belongs on the 18×14 wheel 55982. Our catalog names for 6015 ("17 mm × 6 mm", really
   21×12) and 56891 ("43.2 mm × 22 mm", really 37×18) are also off.
3. **Fire trucks are red, but only 29 % red.** Mean palette: RED 29 %, BLACK 15 %, LIGHT_GREY 13 %, WHITE 11 %,
   DARK_GREY 8 %, YELLOW 6 %, TRANS_BLUE 5 %, TRANS_ORANGE 3 %. Police cars: WHITE 27 / BLACK 25 / LIGHT_GREY 13 /
   BLUE 7 / TRANS_BLUE 5. Castles: LIGHT_GREY 19 / BLACK 17 / TAN 12 / DARK_GREY 9 / WHITE 9 / BROWN 7. Trees:
   GREEN 18 / BROWN 13 / TAN 10. Friends: WHITE 18 / BLUE 10 / TAN 9 / YELLOW 7 / PURPLE 7 / PINK 7. Speed
   Champions is 38 % black. A generator that paints a whole truck red is wrong by the data.
4. **The grille tile is a vehicle signature.** Tile 1×2 Grille (`2412`) is in 86 % of monster trucks, 82 % of garbage
   trucks and tanks, 76 % of buses, 68 % of trucks, 67 % of fire trucks — and 73 % of lighthouses.
5. **Modern sets are built from tiny parts.** Plate 1×1 (`3024`) is in 95 % of Icons sets, 93 % of Ideas sets, 91 %
   of Speed Champions; the round plate (`4073`) in 98 % of Icons sets; the jumper (`15573`) in 90 % of Icons/Ideas
   and 95 % of Architecture; the cheese slope (`54200`) in 91 % of Speed Champions and 88 % of Icons; brackets
   (`99780`) in 85 % of Speed Champions. A "detailed" or "adult" style should mean more of these, not bigger bricks.
6. **Size calibration.** Median piece counts: police car 81, tractor 78, animal 80, dinosaur 48, sea creature 44,
   helicopter 99, car 109, City set 120, plane 146, fire truck 201, truck 200, robot 203, shop 227, train 293,
   bus 379, house 386, station 411, castle 496, skyline 501, lighthouse 518, pirate ship 915, Icons 1 471. The
   p25/p75 spread is wide (fire truck 76–368), so "small/medium/large" should map to p25/p50/p75 of the subject.
7. **Castles and pirate ships are round-brick and arch country.** Brick 1×1 Round (`3062`) is in 93 % of pirate ships
   and 82 % of castles; Arch 1×4 (`3659`) in 60 % of pirate ships and 50 % of castles; the vertical clip (`4085`)
   in 61 % of castles and 60 % of pirate ships. Flag 2×2 ↔ Arch 1×6 is the strongest non-mechanical pairing in the
   file (lift 10): flags fly on arched walls. Castles also want parts we lack: Palisade/log brick (`30136`, 45 %),
   Brick 1×2×2 with inside axle holder (`3245`, 40 %), Plate Round 4×4 with pin hole (`60474`, 35 %).
8. **Pairs that always travel together** (lift, sets): window ↔ its glass (60593 + 60602: 28.6, 175; 60592 + 60601:
   12.2, 262), door frame ↔ door (11.4, 159), wedge plates left ↔ right (6.3, 1 152 and 6.2, 1 123: never place one
   without its mirror), hinge finger ↔ fingers (6.9, 247), turntable base ↔ top (8.7, 844), hinge brick base ↔ top
   (4.5, 1 066), curved arch 6005 ↔ curved brick 6091 (3.6, 230), slopes 2×4 ↔ 2×3 (3.8, 153). These are the
   techniques a module library should encode.
9. **Hinges live on creatures and space, not on buildings.** The locking finger hinge (`44301`) tops out in insects
   (23 %), dinosaurs (21 %) and fire trucks (26 %, the ladder); the hinge brick (`3937`) in classic Space (47 %)
   and rockets (46 %). Wedge plates (`43722/3`) mark anything that flies or swims: spaceships, birds, sea creatures
   and dragons at 30–37 %.
10. **Our catalog has three id mix-ups** (ids are frozen, so only the names/flags should change): `99780` is the
    *inverted* bracket and `99781` the regular one in Rebrickable and BrickLink, the reverse of our `isBracket`
    flags; `4617` is a 3-blade 5.5-diameter propeller, not a 2-blade 4 (the small 2-blade is `3480`); `92950` is
    Arch 1×6 Raised, not 1×8×2 (that is `3308`, or `16577` raised). Also `4589` is the groove-less old cone (the
    current one is `59900`), and `4073`/`55423` are BrickLink ids that Rebrickable keys as `6141`/`38340`.

## Wanted parts, ranked

Ranked by how many subjects list the part in their top 20 missing parts (share in brackets). The first ten
would lift vehicles the most; the palisade brick, 4×4 round plate and plant leaves would lift castles, towers
and gardens.

| # | Part | Name | Where it is wanted |
|---|------|------|--------------------|
| 1 | 2420 | Plate 2×2 Corner | 35 subjects: bus 66 %, monster truck 48 %, car 37 %, truck 32 %, train 30 % |
| 2 | 48336 | Plate 1×2 with Side Handle (closed ends) | 29: bus 42 %, fire truck 33 %, monster truck 33 % |
| 3 | 2654 | Plate Round 2×2 with Rounded Bottom (boat stud) | 27: garbage truck 35 %, bus 34 %, plane 29 % |
| 4 | 2540 | Plate 1×2 with Side Handle (free ends) | 24: construction 29 %, plane 29 %, train 28 % |
| 5 | 4865 | Panel 1×2×1 | 21: garbage truck 53 %, bus 45 %, car 30 % |
| 6 | 4162 | Tile 1×8 | 20: bus 45 %, train 38 %, truck 32 %, plane 32 % |
| 7 | 32062 | Technic Axle 2 Notched | 19: pirate ship 53 %, garbage truck 41 % |
| 8 | 3829 | Steering Stand 1×2 with Wheel | 18: tractor 87 %, police car 83 %, fire truck 78 %, truck 75 % |
| 9 | 2357 | Brick 2×2 Corner | 16: pirate ship 60 %, ship 38 %, bus 39 % |
| 10 | 2432 | Tile 1×2 with Handle | 16: police car 42 %, fire truck 37 %, truck 36 % |
| 11 | 35480 | Plate 1×2 Rounded with 2 Open Studs | 16: monster truck 38 %, bus 37 %, robot 32 % |
| 12 | 63864 | Tile 1×3 | 15: bus 55 %, garbage truck 35 %, car 33 % |
| 13 | 43093 | Technic Axle Pin with Friction | 15: garbage truck 41 %, ship 38 %, fire truck 30 % |
| 14 | 32028 | Plate 1×2 with Door Rail | 15: fire truck 52 %, truck 29 %, bus 29 % |
| 15 | 4274 | Technic Pin 1/2 | 14: garbage truck 41 %, ship 38 % |
| 16 | 32064 | Technic Brick 1×2 with Axle Hole | 14: garbage truck 35 %, submarine 34 % |
| 17 | 99207 | Bracket 1×2–2×2 Inverted | 13: bus 37 %, car 24 %, submarine 24 % |
| 18 | 60470 | Plate 1×2 with 2 Clips Horizontal | 13: bus 39 %, monster truck 38 %, fire truck 30 % |
| 19 | 30136 | Brick 1×2 Palisade (log) | 12: lighthouse 64 %, pirate ship 53 %, castle 45 %, house 39 % |
| 20 | 30414 | Brick 1×4 with 4 Studs on Side | 12: bus 50 %, garbage truck 41 %, monster truck 38 % |
| 21 | 3245 | Brick 1×2×2 with Inside Axle Holder | 11: lighthouse 64 %, fire truck 41 %, castle 40 % |
| 22 | 4079 | Seat 2×2 | 11: tractor 43 %, garbage truck 41 %, fire truck 33 % |
| 23 | 2877 | Brick 1×2 with Grille | 11: garbage truck 35 %, fire truck 30 %, train 30 % |
| 24 | 298 | Lever Small Base with Lever | 11: helicopter 37 %, bus 32 % |
| 25 | 20482 | Tile Round 1×1 with Hollow Bar | 10: shop 45 %, house 40 %, bus 37 % |
| 26 | 3673 | Technic Pin without Friction | 10: tank 39 %, helicopter 31 % |
| 27 | 60474 | Plate Round 4×4 with Pin Hole | 9: windmill 63 %, lighthouse 45 %, castle 35 % |
| 28 | 18674 | Plate Round 2×2 with Centre Stud | 9: house 39 %, shop 35 %, monster truck 33 % |
| 29 | 2445 | Plate 2×12 | 9: ship 41 %, rocket 32 %, spaceship 28 % |
| 30 | 32607 | Plant Plate 1×1 Round with 3 Leaves | 8: flower 51 %, farm 48 %, tree 36 %, house 36 % |

Also notable but subject-specific: Wave/Flame (`6126`, fire truck 48 %), Brick Curved 4×6×2/3 wedge (`52031`,
fire truck 37 %), Wheel 18×14 (`55981`) + Tyre 30.4×14 (`92402`) (fire truck 33 %, the City truck wheel we lack),
Brick 1×2 with Vertical Clip (`30237`, fire truck 41 %), Panel 1×4×3 (`60581`, fire truck 33 %).

## Caveats

- Subjects come from set *names*, so a "Fire Truck" set's inventory includes its minifigures' accessories and any
  side build; the top parts are still dominated by the truck. Playset names ("X with Y", "Chase", "Rescue") are
  excluded for creature and food subjects so that the set *is* the subject.
- `spaceship` is mostly Star Wars (413 sets) and `robot` mostly Ninjago/Star Wars mechs; `dragon` is mostly Ninjago.
  That is where brick-built versions of those subjects live, and their palettes (greys and black) reflect it.
- Shares are rounded to 2 decimals and palettes to 3; medians of quantities can be `x.5`.
- Rebuilding: `node scripts/studforge-mine-knowledge.mjs --data <dir> --check --dump <file>`; `--check` prints every
  catalog id against the Rebrickable name (how the mix-ups above were found), `--dump` lists the sets each subject
  matched, for tuning the regexes.
