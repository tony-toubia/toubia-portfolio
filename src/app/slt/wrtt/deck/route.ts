import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { recordHit } from '@/lib/wrtt/hits';

/**
 * The City Lifestyle concepts deck, served from inside the gate.
 *
 * It lives here rather than in public/ deliberately: the middleware matcher
 * skips paths with a file extension, so anything in public/ is reachable
 * without the password. An extension-less route keeps the deck behind the
 * same gate as the sheets it describes - one link, one password, everything.
 *
 * The PDF is an export of the Google Slides source (which stays private to
 * its two collaborators). After editing the deck: File > Download > PDF,
 * replace the file beside this route, redeploy.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  await recordHit('deck', { path: '/slt/wrtt/deck' });
  const buf = await readFile(
    path.join(process.cwd(), 'src/app/slt/wrtt/deck/city-lifestyle-concepts.pdf'),
  );
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="city-lifestyle-concepts.pdf"',
      'cache-control': 'private, max-age=0, must-revalidate',
    },
  });
}
