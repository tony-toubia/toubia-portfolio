# StudForge feature log

Updated 2026-10-13. Recommendations inspired by BrickLink Studio, adapted to StudForge's kit-first browser experience.

| Priority | Feature | Status | Scope / next step |
| --- | --- | --- | --- |
| 1 | Grab and pose movable assemblies | Expanded — Technic connectors | 63 movable kits: 61 automatically detected kits (268 joints) plus reviewed WALL·E neck and Poe's X-Wing wings. Shared connector rules and rigid stud/axle connections, source assembly instances, accessible angle controls, reset. Movable label in library. |
| 2 | Remix this kit | Queued | Independent copy, recolor/replace parts, preserve original author and lineage. Current reference saves point to the original kit. |
| 3 | Check real part/color availability | Queued | Verified marketplace identifiers, unavailable-color warnings, valid alternatives, useful purchase lists. Current prices are estimates. |
| 4 | Connectivity and collision checks | Queued | Highlight disconnected groups and overlapping geometry; offer understandable fixes. Current generator checks cover its grid-based builds, not every imported connector. |
| 5 | Edit building instructions | Queued | Reorder steps, group subassemblies, save per-step camera angles. Step viewing and printable booklets already exist. |
| 6 | Upload community model files | Queued | Start with LDraw .ldr/.mpd; validate geometry, attribution, and completeness before library inclusion. Later consider Studio .io. |
| 7 | Improve image / animation exports | Queued | Refine existing share cards and turntables; add assembly animation. |
| 8 | Unified, prominent kit library | Released and repaired | 169 community kits + 16 starter ideas + local saved/recent builds. Every bundled kit and starter has a linked preview. Broken images have an accessible fallback. Top-level creation dropdown says Get Started; Describe it stays inside. |

## Articulation design

The importer now retains distinct source assembly instances, including repeated instances of the same submodel. Older packed models recover this metadata only when source physical-part traversal exactly matches the installed model. This backfill changes assembly metadata and motion profiles; geometry, placement matrices, inventory, colors and building steps are preserved.

`scripts/studforge/detect-motion.mjs` runs automatically during conversion. Shared rules recognize 3680/3679 turntables, 3937/3938/6134 tilt hinges, 2429/2430 plate hinges and 3831/3830 brick hinges. `connector-reader.mjs` reads official LDraw finger/click-hinge macros and Technic circular/keyed-hole macros through transformed subparts; standard Technic bricks supply their official hole grids. Straight axles and common pure pins use their actual local shaft axis and extent. Keyed holes join rigidly to axles; circular bearings form rotational boundaries. This is per-part/primitive support reused across all kits, with no new kit-specific rigs.

Matching transformed bearing positions and axes identifies the joint. Stud/socket connections, keyed axle connections and distinct source subassemblies identify moving members. Coaxial bearings form one rigid group. Locked stud connections, contradictory boundary axes, overlapping proposed groups, moving supports, mixed axle/pin boundaries and unknown attached receivers are rejected. Bare shafts are not exposed as movable assemblies. The batch report records supported kits and skip reasons in `studforge-motion-report.json`. Re-run `npm run studforge:motion` to update installed models without rebaking geometry.

Posing changes displayed meshes only. Leaving Pose mode, entering instructions/explode/parts tray, or changing models restores the original assembly. All rigs are guarded by placement fingerprints. Detection supports this connector vocabulary, not every moving feature of a supported kit. Mixed axle/pins, clips/ball joints, gearing, sliding actuators, coupled linkages and nested independently movable groups need more shared rules. Geared mechanical groups stay disabled until linked motion is supported. Angle ranges are demonstration limits, not verified physical travel or collision checking; turntables offer ±180° and hinges/shaft pivots ±15°. Flexible-string simulation, pose persistence and edited instruction exports remain queued.

Reviewed complex rigs remain available. WALL·E uses its source's annotated neck pivot. Poe's X-Wing now pivots at the four 55013 support axles through the 11458 wing bearings, rather than the engine attachment holes. Each complete engine is assigned to its own wing, including cannons/tips. Regression checks verify the bearing centers remain coaxial at 0°, 5°, 10°, 15° and 20°. The original rubber-band meshes remain static.

Validation covers source matching and changed-source rejection for every automatic rig, disjoint members, rotor blade/cap coverage, locked-joint rejection, repeated assembly instances, and all 166 kit assets. Browser checks cover rear X-Wing opening/closing, automatic controls, reset and return to building steps. Physical touchscreen testing remains outstanding.

The latest batch adds Pirate Roller Coaster (31084), Mobile Crane (42108) and Crawler Crane (42042), retaining community authors and original source disclosures. Library thumbnail links are complete for all 169 kits and 16 starters; 102 missing previews were rendered with the viewer's part builder. The legacy moved-to ID repair preserves redirect rotations/translations: all six Jet Airliner tires now share their rim axes, and the same repair covers 42 placements in nine kits. The legacy converter applies the same correction on future runs.

## Official Studio references

- [Rotating and hinging parts](https://studiohelp.bricklink.com/hc/en-us/articles/5411433123351-Rotating-and-hinging-parts)
- [Color Validator](https://studiohelp.bricklink.com/hc/en-us/articles/6501160941591-Color-Validator)
- [Connectivity check](https://studiohelp.bricklink.com/hc/en-us/articles/6501624386071-Connectivity-check)
- [Collision](https://studiohelp.bricklink.com/hc/en-us/articles/5412820155927-Collision)
- [Instruction Maker](https://studiohelp.bricklink.com/hc/en-us/articles/5626403887511-Introduction-to-instructions-maker)
- [Import formats](https://studiohelp.bricklink.com/hc/en-us/articles/6502277722647-Import-formats): importing a set number supplies its parts inventory; assembled models require a model file.
