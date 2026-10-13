# StudForge library maintenance

The current workbench retains its existing 100 real sets and adds 16 bundled character models. Model loading uses local assets without an API key. The Quick generator and AI features remain available.

To regenerate thumbnails, piece counts, and credits from the bundled files:

```powershell
node scripts/studforge/prepare-models.mjs
node scripts/studforge/integrate-workbench.mjs
node --test scripts/studforge/library.test.mjs
```

To refresh models, update the explicit selection in `import-library.mjs`, then download and extract the official part library:

```powershell
node scripts/studforge/import-library.mjs --download-parts
Expand-Archive -LiteralPath scripts/studforge/.cache/complete.zip -DestinationPath scripts/studforge/.cache -Force
node scripts/studforge/import-library.mjs
node scripts/studforge/prepare-models.mjs
node scripts/studforge/integrate-workbench.mjs
```

The importer checks the downloaded model title against the selected title, recursively bundles all required parts, retains license headers, and copies the applicable license notices. The ignored cache is only for maintenance. Runtime assets live under `public/studforge`.

Reference inventories use LDraw identifiers and export CSV because community pattern identifiers and LDraw colors have not been mapped to verified BrickLink inventory IDs. Generated builds keep their existing BrickLink XML export. Do not label model inventories as official retailer inventories or boxed-set counts. The integration script preserves printed geometry using separate baked part IDs while inventories retain their source part IDs.

Source STEP records drive assembly mode. Files without them expose inspection layers and a link to LEGO's original instructions. Favorites and per-model steps/checklists are saved locally under `studforge-library-v1`; they are not synced to an account.

Before adding a model, verify its source, credits, complete dependency graph, physical part count, readable thumbnail, and browser rendering. Some OMR files report missing patterns or stickers: preserve those disclosures in the catalog and interface.
