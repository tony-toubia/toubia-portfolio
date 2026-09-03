'use server';

import { cookies } from 'next/headers';
import { revalidatePath, updateTag } from 'next/cache';
import { db, isConfigured, sheetTag } from '@/lib/wrtt/db';
import { ADMIN_COOKIE } from '../profile/constants';
import { VERDICTS, type Verdict } from './verdicts';

/**
 * Records a human's verdict on a card. Append-only: every verdict is a row,
 * and the card shows the latest, so a change of mind is history rather than
 * an overwrite. This is the training signal that eventually replaces the
 * hand-set weights - it does not touch the score today, and it does not move
 * anyone off the sheet. Suppression stays an admin decision.
 *
 * Anyone through the gate can vote. The console password is shared with the
 * people whose judgment the index needs, so that is the point; the actor is
 * recorded as admin or viewer so the two can be told apart later.
 */
export async function submitVerdict(
  marketId: string,
  personId: string,
  verdict: string,
  note: string,
): Promise<{ ok?: true; verdict?: Verdict; error?: string }> {
  if (!isConfigured) return { error: 'Not connected.' };
  if (!(VERDICTS as readonly string[]).includes(verdict)) return { error: 'Unknown verdict.' };
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return { error: 'Bad person id.' };
  if (!/^[a-z0-9-]{1,64}$/i.test(marketId)) return { error: 'Bad market id.' };

  const token = process.env.WRTT_ADMIN_TOKEN;
  const jar = await cookies();
  const actor = token && jar.get(ADMIN_COOKIE)?.value === token ? 'admin' : 'viewer';

  const sql = await db();
  await sql`
    insert into wrtt.feedback (person_id, actor_id, verdict, note)
    values (${personId}, ${actor}, ${verdict}, ${note.trim().slice(0, 500) || null})`;

  // The sheet is served from cache; the verdict has to show on the very next
  // load, not after a stale-while-revalidate window - updateTag expires now.
  updateTag(sheetTag(marketId));
  revalidatePath(`/slt/wrtt/${marketId}`);
  return { ok: true, verdict: verdict as Verdict };
}
