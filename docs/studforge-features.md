# StudForge feature log

Updated 2026-10-13. Recommendations inspired by BrickLink Studio, adapted to StudForge's kit-first browser experience.

| Priority | Feature | Status | Scope / next step |
| --- | --- | --- | --- |
| 1 | Grab and pose movable assemblies | Implemented — first release | Explicit pivot, axis, connected members, and angle limits. First profiles: WALL·E neck and Poe's X-Wing linked wings. Mouse/touch pointer support, accessible angle controls, reset. Demonstration poses; inventory and assembly instructions remain original. Movable label in library. |
| 2 | Remix this kit | Queued | Independent copy, recolor/replace parts, preserve original author and lineage. Current reference saves point to the original kit. |
| 3 | Check real part/color availability | Queued | Verified marketplace identifiers, unavailable-color warnings, valid alternatives, useful purchase lists. Current prices are estimates. |
| 4 | Connectivity and collision checks | Queued | Highlight disconnected groups and overlapping geometry; offer understandable fixes. Current generator checks cover its grid-based builds, not every imported connector. |
| 5 | Edit building instructions | Queued | Reorder steps, group subassemblies, save per-step camera angles. Step viewing and printable booklets already exist. |
| 6 | Upload community model files | Queued | Start with LDraw .ldr/.mpd; validate geometry, attribution, and completeness before library inclusion. Later consider Studio .io. |
| 7 | Improve image / animation exports | Queued | Refine existing share cards and turntables; add assembly animation. |
| 8 | Unified, prominent kit library | Released | 166 community kits + 16 starter ideas + local saved/recent builds. Real set/Generated/Saved/Favorites/theme labels, first-visit browsing, one-click kit opening. Released in 98a75a6. |

## Articulation design

The current importer stores individual world transforms and instruction steps but loses the assembly/connection graph for newer community imports. A hinge-shaped part alone cannot identify every piece that should move with it. Start with reviewed model profiles; reusable controls should also accept future importer-supplied profiles. Guard profiles against source geometry changes. Do not infer motion for unsupported models.

Posing changes the displayed meshes only. Leaving Pose mode, entering instructions/explode/parts tray, or changing models restores the original assembly. No physics certification, automatic hinge discovery, gearing, flexible-string simulation, pose persistence, or edited instruction exports in the first release.

First release: `articulation-core.js` holds reviewed placement fingerprints and rigid motion groups; `articulation.js` applies constrained display transforms and pointer interaction. New imports need a reviewed profile before showing Pose. WALL·E uses the source's annotated neck pivot; X-Wing uses the four root axle axes and includes engines/cannons/tips. Angle limits are conservative demonstration ranges. The original X-Wing rubber-band meshes remain static.

Validation: 24 StudForge tests pass, including profile/source matching, changed-source rejection, rigid distances, connected-member coverage, floor clearance, and all 166 kit assets. Browser checks cover direct dragging on both profiles, keyboard angle limits, reset, build-step and tray restoration. Phone layout and angle controls checked at 390×844; physical touchscreen gestures still need device testing.

## Official Studio references

- [Rotating and hinging parts](https://studiohelp.bricklink.com/hc/en-us/articles/5411433123351-Rotating-and-hinging-parts)
- [Color Validator](https://studiohelp.bricklink.com/hc/en-us/articles/6501160941591-Color-Validator)
- [Connectivity check](https://studiohelp.bricklink.com/hc/en-us/articles/6501624386071-Connectivity-check)
- [Collision](https://studiohelp.bricklink.com/hc/en-us/articles/5412820155927-Collision)
- [Instruction Maker](https://studiohelp.bricklink.com/hc/en-us/articles/5626403887511-Introduction-to-instructions-maker)
- [Import formats](https://studiohelp.bricklink.com/hc/en-us/articles/6502277722647-Import-formats): importing a set number supplies its parts inventory; assembled models require a model file.
