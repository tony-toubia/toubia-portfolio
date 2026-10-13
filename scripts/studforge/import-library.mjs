// Backward-compatible entry point; importing never replaces the existing catalog.
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
if (process.argv.includes('--download-parts')) {
  await fs.mkdir('scripts/studforge/.cache', {recursive:true});
  const response = await fetch('https://library.ldraw.org/library/updates/complete.zip');
  if (!response.ok) throw new Error('Official parts download: ' + response.status);
  await fs.writeFile('scripts/studforge/.cache/complete.zip', Buffer.from(await response.arrayBuffer()));
  console.log('Downloaded official parts archive. Extract into scripts/studforge/.cache.');
} else {
  const result = spawnSync(process.execPath, ['scripts/studforge/backfill-library.mjs', ...process.argv.slice(2)], {stdio:'inherit',windowsHide:true});
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
