'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GATE_COOKIE, GATE_TOKEN, GATE_MAX_AGE, passwordMatches } from '@/lib/wrtt/gate';
import { recordHit } from '@/lib/wrtt/hits';

export async function enter(_prev: unknown, form: FormData) {
  if (!passwordMatches(String(form.get('password') ?? ''))) {
    await recordHit('gate_fail', { path: '/slt/wrtt/enter' });
    return { error: 'Not that.' };
  }
  await recordHit('gate_pass', { path: '/slt/wrtt/enter' });

  const jar = await cookies();
  jar.set(GATE_COOKIE, GATE_TOKEN, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    // '/' rather than '/slt/wrtt': the console also answers at /wrtt on
    // slt.ventures, and a cookie scoped to the long path would never be
    // sent there.
    path: '/',
    maxAge: GATE_MAX_AGE,
  });

  // Only ever bounce back inside the console: an unchecked `from` is an
  // open redirect waiting to happen.
  const raw = String(form.get('from') ?? '');
  // Either spelling of the console - /slt/wrtt on the primary domain, /wrtt
  // on slt.ventures. The default long form lands correctly on both: the
  // dedicated domain redirects it to the short path.
  const ok = (raw.startsWith('/slt/wrtt') || raw.startsWith('/wrtt')) && !raw.startsWith('//');
  redirect(ok ? raw : '/slt/wrtt');
}
