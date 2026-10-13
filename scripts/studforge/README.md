# StudForge community library

Adding a supported community model now takes a set number, rather than set-specific application code:

```powershell
node scripts/studforge/backfill-library.mjs --only 75053-1
node scripts/studforge/backfill-library.mjs --limit 100
npm run studforge:test
```

The first batch stopped after 15 candidates at the user's request: eight imported and seven skipped, plus The Ghost imported in the initial trial. The second batch imported six personally selected sets in 72 seconds. A third batch added ten varied sets in 221 seconds of processing, including four automatically skipped candidates and their replacements. The geometry repair pass recovered 10 of the 11 skipped sets and rebuilt six older models with missing strings or custom surfaces. The next batch imported all 15 queued sets in 109 seconds of model processing, including two successful retries and one validation rebuild using shared support for collapsed cable endpoints and legacy blended colors. The library now has 166 sets. The next 50 candidates remain in [the saved queue](../../docs/studforge-import-queue.json); its reserve list contains additional candidates beyond the original 100. Nothing is scheduled to run automatically. To process the next small batch:

```powershell
node scripts/studforge/backfill-library.mjs --queue docs/studforge-import-queue.json --limit 15
```

To choose specific pending entries rather than the next ones in order, combine `--queue` with `--only 75969-1,75253-1` (replace these example IDs with pending set numbers).

The queue advances after each attempted set. Failed imports retain their reasons in the report and completed queue entries; they are not repeatedly retried by queue runs. No two import commands should run concurrently.

The first command imports one exact OMR set number; comma-separated numbers work too. The second checks Brick Ranker's user-rated top 100 against LDraw OMR, prioritizes exact versions, then fills out the batch with available Star Wars, Marvel, DC, Harry Potter, Lord of the Rings, Indiana Jones, Minecraft, Ideas and Speed Champions models. Existing sets are preserved and skipped. Repeating an import is safe.

Optional switches: `--rebuild` refreshes existing entries, `--refresh` bypasses the seven-day download cache, and `--complete-only` excludes sources whose authors report omitted physical parts. The default includes such recreations with visible source-omission disclosures. `--limit` caps attempts, not successful imports (maximum 200).

One command downloads the source, recursively bundles the official part definitions, validates dependency resolution and licenses, converts geometry, preserves colors and source STEP records, renders a thumbnail, writes the catalog entry and inventory, and regenerates credits. Each model runs in an isolated worker with a 300-second conversion limit. A failed import stays in staging and receives a reason in [the backfill report](../../docs/studforge-backfill-report.json). The viewer currently accepts up to 10,000 physical pieces and 2 million placed triangles per imported model. Large UCS sets can exceed those limits.

A community set listing, parts inventory or product photo alone cannot produce the interactive model: a compatible LDraw model must exist. The report distinguishes exact ranked versions from supplemental picks; older versions are never reported as exact matches. Availability is an OMR search result, not a claim that models cannot exist elsewhere. Ranking facts come from [Brick Ranker](https://brickranker.com/hall-of-fame/sets/top); geometry and author disclosures come from [LDraw OMR](https://library.ldraw.org/omr).

## One-time maintenance setup

Use the repository's installed Node dependencies and bundled Three.js loader. The ignored official part cache is needed when importing additional sets:

```powershell
node scripts/studforge/import-library.mjs --download-parts
Expand-Archive -LiteralPath scripts/studforge/.cache/complete.zip -DestinationPath scripts/studforge/.cache -Force
```

Published assets live under `public/studforge` and load without a community API key. The cache contains original downloads and staging output, not runtime assets. Legacy `import-library.mjs` forwards to the same importer; `integrate-workbench.mjs` rebuilds the existing community catalog through it.

## Inventory, steps and attribution

The converter preserves source subassembly instance identity and automatically detects supported hinges, turntables, Technic pins and axles after baking. Official connector primitives and shared part rules identify pivots; stud connections, keyed axle holes and source groups identify attached members. Circular bearings allow rotation, while cross-shaped holes stay locked to their axles. No per-kit code is required for supported mechanisms. Ambiguous boundaries, bare shafts and geared groups stay unposed. `npm run studforge:motion` applies the detector to installed kits without geometry conversion. It now supplies 268 joints across 61 kits; with the two reviewed complex rigs, 63 library kits carry the Movable label. See [the motion report](../../docs/studforge-motion-report.json) for supported kits and skip reasons. Detection does not imply every moving feature of a kit is supported.

The latest three imports are Pirate Roller Coaster, Mobile Crane and Crawler Crane, bringing the library to 169 sets. `node scripts/studforge/library-thumbnails.mjs` links previews for every installed kit, renders missing kit/starter previews and refreshes repaired kits using the actual part builder. `node scripts/studforge/repair-moved-frames.mjs` repairs legacy moved-to aliases once, carrying their rotations/translations and preserving inventory. This fixed 42 placements in nine kits, including all six Jet Airliner tires. The modern converter already retains redirect geometry; the legacy converter now carries the frame too.

Inventories describe the community recreation, not the official boxed-set inventory. They retain LDraw identifiers and export CSV; these have not been mapped to verified BrickLink inventory IDs. Generated builds retain their existing BrickLink XML export. Printed geometry receives distinct content-hashed render IDs, while inventory rows retain their source part identifiers. Counts exclude spares and may differ from boxed sets.

Source STEP records drive assembly mode. Models without them provide inspection layers and a link to LEGO's original instructions. The library surfaces missing parts, patterns and stickers reported by each contributor. Favorites and step/checklist progress are stored locally and are not account synced.

Original model and embedded part author/license headers are retained in bundled MPDs. Applicable LDraw notices and generated attribution are published with the library. Geometry, placements, source colors and prints are preserved; unsupported or unresolved files are skipped rather than guessed. Tests verify packed dependency graphs, finite geometry and placements, palette coverage, inventories, thumbnails and unique catalog IDs.

## Flexible geometry and large models

The converter separates physical Part records from supplemental surfaces in Model groups. Generated strings, hose sections and custom scenery render at their source transforms and steps, but are excluded from stock counts, prices, CSV exports, checklists and the parts tray. Identified physical string or rigging parts remain in inventory. Mixed assemblies retain their own surface meshes alongside their ordinary bricks without counting or baking children twice.

Models above one million source triangles use available official LDraw 8-segment primitive equivalents before the two-million-triangle limit is applied. Physical part IDs, placement matrices, source colors and printed face colors remain unchanged; full-detail packed source files and their author/license notices are retained. Loader edge geometry and normal smoothing are bypassed only during baking because the viewer reconstructs normals from the indexed output.

Ten previously skipped models now load automatically. Titanic remains above the interactive budget: 4,700,775 source triangles become 2,745,665 triangles after primitive reduction. Enabling it needs another measured optimization, such as rendering sections separately or instancing repeated parts, with desktop and phone validation. The importer reports exact source and optimized counts rather than raising its limit silently. Detailed outcomes and prior failure history are in the backfill report.

Publication uses temporary files and atomic replacement with bounded retries for transient Windows locks. This prevents readers from observing partially written catalogs. Use the direct Node command shown above on PowerShell; some npm versions consume importer flags such as --only instead of forwarding them.

Generated cable references that collapse to a line or point have no visible surface area. The renderer excludes these endpoints before matrix decomposition; the original references remain in the archived MPD and the omission count is recorded in model statistics. Visible cable segments remain rendered and excluded from inventory. Legacy blended colors absent from current official definitions follow the original RGB averaging rules in the [LDraw file specification](https://www.ldraw.org/article/218.html#colours); current official color definitions take precedence.
