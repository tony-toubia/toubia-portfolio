// Rebuild existing community sets through the same importer used for new additions.
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const catalog = JSON.parse(await fs.readFile('public/studforge/models/catalog.json','utf8'));
const args = process.argv.slice(2);
const selection = args.includes('--only') ? args : ['--only',catalog.map(entry=>entry.setNumber).join(','),...args];
const result = spawnSync(process.execPath, ['scripts/studforge/backfill-library.mjs','--rebuild','--limit','200',...selection], {stdio:'inherit',windowsHide:true});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
