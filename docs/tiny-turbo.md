# Tiny Turbo Club

First playable: one original course (Cloudtop Circuit), three free original toy cars, three local computer opponents and two-lap races. Standalone route: `/tiny-turbo`; portfolio Projects entry included. No advertising, payments, accounts, online players, or external asset requests. The existing bundled Three.js runtime is reused.

Automatic acceleration and track-following keep steering manageable for young children. Large left/right touch controls support simultaneous steering and boost, with keyboard alternatives. Gentle recentering is optional. Grass and barriers slow the car without crashes or elimination. All power-ups help the player: rainbow speed, a star magnet, and a bubble that preserves speed on grass. No weapons or attack items.

Learning defaults to Kindergarten, mixed math/spelling and a stop every 18 seconds of actual racing. Grades K–5, math-only/spelling-only/mixed and 12/18/26-second cadences are selectable. This is a starter question generator and spelling bank, not a curriculum or automatic assessment. K arithmetic stays within 0–5; later levels extend to 20/100, multiplication/division and simple equivalent fractions. Spelling includes a picture/clue and optional browser text-to-speech. Wrong answers allow another try with a hint. Questions have no timer; every racer freezes. Correct answers give four stars and one boost; skipping resumes without the bonus or penalty.

Finish a race to bank collected stars plus a finish bonus. Twelve stars buys one speed upgrade, up to three per car. All cars are available immediately. Profile/preferences and garage progress are kept in localStorage, with in-memory play if storage is unavailable. No child name, date of birth or other personal data is requested. Leaving a tab pauses active racing; abandon-to-garage does not bank unfinished race stars.

## Models and expansion

The initial cars are original procedural meshes, not Hot Wheels replicas. `CARS` in `public/tiny-turbo/core.mjs` is the catalog; `makeCar` builds its three reusable body styles. A future glTF adapter can supply an optional asset URL, scale and wheel metadata while keeping car IDs/progress stable. Check each model's license and attribution before adding community cars. A ready-to-use reusable official Hot Wheels game model library was not verified. Candidate search results are not approval to redistribute branded assets.

Course geometry is defined by a closed spline. Extend this to a course catalog with control points, scenery palette and pickup placement; save records by course ID. Next priorities: real-device iPad feel/performance testing, more spelling vocabulary and question shapes, additional courses/drivers and local same-device profiles. Multiplayer is outside the first version.

## Checks

`npm run tiny-turbo:test` checks 3,600 generated questions, valid answer choices, kindergarten limits, race clock freezing, skip/retry behavior, one-time finish rewards, upgrade spending/caps and saved-data normalization. The gameplay harness executes the real module with actual Three.js geometry plus a minimal DOM/renderer adapter; it checks steering direction projected through the chase camera, start, questions, pause/resume, finish, upgrades, car selection and settings. It does not render WebGL pixels. Browser testing was unavailable in the implementation session, so visual/responsive browser checks and physical iPad/touchscreen testing remain outstanding.
