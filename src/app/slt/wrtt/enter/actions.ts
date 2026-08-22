'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE = 'wrtt_gate';
const TOKEN = 'ok';

/** Default is deliberately weak and the repository is public, so treat
 *  WRTT_GATE_PASSWORD as the way to set a real one without a commit. */
function expected() {
  return (process.env.WRTT_GATE_PASSWORD ?? 'success').trim().toLowerCase();
}

export async function enter(_prev: unknown, form: FormData) {
  const given = String(form.get('password') ?? '').trim().toLowerCase();
  if (given !== expected()) return { error: 'Not that.' };

  const jar = await cookies();
  jar.set(COOKIE, TOKEN, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/slt/wrtt',
    maxAge: 60 * 60 * 24 * 7,
  });

  // Only ever bounce back inside the console: an unchecked `from` is an
  // open redirect waiting to happen.
  const raw = String(form.get('from') ?? '');
  const dest = raw.startsWith('/slt/wrtt') && !raw.startsWith('//') ? raw : '/slt/wrtt';
  redirect(dest);
}
