'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GATE_COOKIE, GATE_TOKEN, GATE_MAX_AGE, passwordMatches } from '@/lib/wrtt/gate';

export async function enter(_prev: unknown, form: FormData) {
  if (!passwordMatches(String(form.get('password') ?? ''))) return { error: 'Not that.' };

  const jar = await cookies();
  jar.set(GATE_COOKIE, GATE_TOKEN, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/slt/wrtt',
    maxAge: GATE_MAX_AGE,
  });

  // Only ever bounce back inside the console: an unchecked `from` is an
  // open redirect waiting to happen.
  const raw = String(form.get('from') ?? '');
  const dest = raw.startsWith('/slt/wrtt') && !raw.startsWith('//') ? raw : '/slt/wrtt';
  redirect(dest);
}
