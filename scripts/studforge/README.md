# StudForge community library

Adding a supported community model now takes a set number, rather than set-specific application code:

```powershell
npm run studforge:import -- --only 75053-1
npm run studforge:backfill -- --limit 100
npm run studforge:test
```

The first batch stopped after 15 candidates at the user's request: eight imported and seven skipped, plus The Ghost imported in the initial trial. The second batch imported six personally selected sets in 72 seconds. A third batch added ten varied sets in 221 seconds of processing, including four automatically skipped candidates and their replacements. The library now has 141 sets. The next 65 candidates remain in [the saved queue](../../docs/studforge-import-queue.json); its reserve list contains additional candidates beyond the original 100. Nothing is scheduled to run automatically. To process the next small batch:

```powershell
npm run studforge:backfill -- --queue docs/studforge-import-queue.json --limit 15
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

Inventories describe the community recreation, not the official boxed-set inventory. They retain LDraw identifiers and export CSV; these have not been mapped to verified BrickLink inventory IDs. Generated builds retain their existing BrickLink XML export. Printed geometry receives distinct content-hashed render IDs, while inventory rows retain their source part identifiers. Counts exclude spares and may differ from boxed sets.

Source STEP records drive assembly mode. Models without them provide inspection layers and a link to LEGO's original instructions. The library surfaces missing parts, patterns and stickers reported by each contributor. Favorites and step/checklist progress are stored locally and are not account synced.

Original model and embedded part author/license headers are retained in bundled MPDs. Applicable LDraw notices and generated attribution are published with the library. Geometry, placements, source colors and prints are preserved; unsupported or unresolved files are skipped rather than guessed. Tests verify packed dependency graphs, finite geometry and placements, palette coverage, inventories, thumbnails and unique catalog IDs.
