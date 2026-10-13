# StudForge feature log

Updated 2026-10-13. Recommendations inspired by BrickLink Studio, adapted to StudForge's kit-first browser experience.

| Priority | Feature | Status | Scope / next step |
| --- | --- | --- | --- |
| 1 | Grab and pose movable assemblies | Expanded — automatic detection | 29 movable kits: 27 automatically detected kits (51 joints) plus reviewed WALL·E neck and Poe's X-Wing wings. Shared connector rules and rigid stud connections, source assembly instances, accessible angle controls, reset. Movable label in library. |
| 2 | Remix this kit | Queued | Independent copy, recolor/replace parts, preserve original author and lineage. Current reference saves point to the original kit. |
| 3 | Check real part/color availability | Queued | Verified marketplace identifiers, unavailable-color warnings, valid alternatives, useful purchase lists. Current prices are estimates. |
| 4 | Connectivity and collision checks | Queued | Highlight disconnected groups and overlapping geometry; offer understandable fixes. Current generator checks cover its grid-based builds, not every imported connector. |
| 5 | Edit building instructions | Queued | Reorder steps, group subassemblies, save per-step camera angles. Step viewing and printable booklets already exist. |
| 6 | Upload community model files | Queued | Start with LDraw .ldr/.mpd; validate geometry, attribution, and completeness before library inclusion. Later consider Studio .io. |
| 7 | Improve image / animation exports | Queued | Refine existing share cards and turntables; add assembly animation. |
| 8 | Unified, prominent kit library | Released | 166 community kits + 16 starter ideas + local saved/recent builds. Real set/Generated/Saved/Favorites/theme labels, first-visit browsing, one-click kit opening. Released in 98a75a6. |

## Articulation design

The importer now retains distinct source assembly instances, including repeated instances of the same submodel. Older packed models recover this metadata only when source physical-part traversal exactly matches the installed model. This backfill changes assembly metadata and motion profiles; geometry, placement matrices, inventory, colors and building steps are preserved.

`scripts/studforge/detect-motion.mjs` runs automatically during conversion. Shared part rules currently recognize the 3680/3679 turntable and 3937/3938/6134 paired hinge. Matching transformed bearing positions and axes identifies the joint. Stud/socket connections and distinct source subassemblies identify its moving members. Coaxial paired hinges form one rigid leaf. Locked stud connections, contradictory boundary axes, overlapping proposed groups and unknown attached receivers are rejected. The batch report records supported kits and skip reasons in `studforge-motion-report.json`. Re-run `npm run studforge:motion` to update installed models without rebaking their geometry.

Posing changes displayed meshes only. Leaving Pose mode, entering instructions/explode/parts tray, or changing models restores the original assembly. All rigs are guarded by placement fingerprints. Detection supports this connector vocabulary, not every moving feature of a supported kit. Technic axle/pin networks, clips/ball joints, gears and nested independently movable groups need more shared rules. Angle ranges are demonstration limits, not verified physical travel or collision checking; turntables offer ±180° and simple hinges ±15°. Flexible-string simulation, pose persistence and edited instruction exports remain queued.

Reviewed complex rigs remain available. WALL·E uses its source's annotated neck pivot. Poe's X-Wing now pivots at the four 55013 support axles through the 11458 wing bearings, rather than the engine attachment holes. Each complete engine is assigned to its own wing, including cannons/tips. Regression checks verify the bearing centers remain coaxial at 0°, 5°, 10°, 15° and 20°. The original rubber-band meshes remain static.

Validation covers source matching and changed-source rejection for every automatic rig, disjoint members, rotor blade/cap coverage, locked-joint rejection, repeated assembly instances, and all 166 kit assets. Browser checks cover rear X-Wing opening/closing, automatic controls, reset and return to building steps. Physical touchscreen testing remains outstanding.

## Official Studio references

- [Rotating and hinging parts](https://studiohelp.bricklink.com/hc/en-us/articles/5411433123351-Rotating-and-hinging-parts)
- [Color Validator](https://studiohelp.bricklink.com/hc/en-us/articles/6501160941591-Color-Validator)
- [Connectivity check](https://studiohelp.bricklink.com/hc/en-us/articles/6501624386071-Connectivity-check)
- [Collision](https://studiohelp.bricklink.com/hc/en-us/articles/5412820155927-Collision)
- [Instruction Maker](https://studiohelp.bricklink.com/hc/en-us/articles/5626403887511-Introduction-to-instructions-maker)
- [Import formats](https://studiohelp.bricklink.com/hc/en-us/articles/6502277722647-Import-formats): importing a set number supplies its parts inventory; assembled models require a model file.
