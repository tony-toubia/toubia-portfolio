'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ADMIN_COOKIE } from '../profile/constants';

/** Same lock as the scoring profile: WRTT_ADMIN_TOKEN, fail closed. */
export async function unlock(_prev: unknown, form: FormData) {
  const token = process.env.WRTT_ADMIN_TOKEN;
  if (!token) return { error: 'No WRTT_ADMIN_TOKEN is set on the server.' };

  const given = String(form.get('token') ?? '');
  if (given !== token) return { error: 'That token does not match.' };

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 8,
  });
  revalidatePath('/slt/wrtt/activity');
  return { ok: true };
}
