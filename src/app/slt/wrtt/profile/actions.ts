'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { saveProfileAndRescore, getProfile } from '@/lib/wrtt/db';
import { ADMIN_COOKIE } from './constants';

/**
 * Editing the profile re-ranks every market, so it is a write worth gating.
 * The console is a public URL; without WRTT_ADMIN_TOKEN set, the page is
 * read-only and these actions refuse. That is deliberately fail-closed:
 * an unset variable locks the levers rather than opening them.
 */
async function authorized() {
  const token = process.env.WRTT_ADMIN_TOKEN;
  if (!token) return false;
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === token;
}

export async function unlock(_prev: unknown, form: FormData) {
  const token = process.env.WRTT_ADMIN_TOKEN;
  if (!token) return { error: 'No WRTT_ADMIN_TOKEN is set on the server, so the levers stay locked.' };

  const given = String(form.get('token') ?? '');
  if (given !== token) return { error: 'That token does not match.' };

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/slt/wrtt', maxAge: 60 * 60 * 8,
  });
  revalidatePath('/slt/wrtt/profile');
  return { ok: true };
}

export async function lock() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  revalidatePath('/slt/wrtt/profile');
}

export async function saveProfile(_prev: unknown, form: FormData) {
  if (!(await authorized())) return { error: 'Not unlocked.' };

  const current = await getProfile();
  if (!current) return { error: 'No default scoring profile exists.' };

  // Only keys already present in the stored profile are writable, so a
  // crafted form cannot introduce a new domain or role out of nowhere.
  const next = structuredClone(current.profile);
  const num = (v: FormDataEntryValue | null, fallback: number, max = 10) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
  };

  for (const group of ['components', 'roles', 'domains', 'compensation'] as const) {
    for (const key of Object.keys(next[group])) {
      next[group][key] = num(form.get(`${group}.${key}`), next[group][key]);
    }
  }
  // Half-life, the scale divisor and the pay threshold are not 0-1 weights;
  // they need their own ranges.
  next.half_life_years   = num(form.get('half_life_years'), next.half_life_years, 50);
  next.org_scale_divisor = num(form.get('org_scale_divisor'), next.org_scale_divisor, 100);
  next.same_family_repeat = num(form.get('same_family_repeat'), next.same_family_repeat);
  next.compensation_nominal_max =
    num(form.get('compensation_nominal_max'), next.compensation_nominal_max, 1_000_000);

  const markets = await saveProfileAndRescore(next);
  revalidatePath('/slt/wrtt', 'layout');
  return { ok: true, markets };
}
