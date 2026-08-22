import Link from 'next/link';
import { cookies } from 'next/headers';
import { getProfile, isConfigured } from '@/lib/wrtt/db';
import { ProfileForm } from './ProfileForm';
import { unlock, lock } from './actions';
import { ADMIN_COOKIE } from './constants';
import { Unlock } from './Unlock';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Scoring profile – WRTT Index' };

export default async function ProfilePage() {
  if (!isConfigured) {
    return <div className="wrtt-note"><strong>Not connected.</strong></div>;
  }

  const profile = await getProfile();
  if (!profile) {
    return (
      <div className="wrtt-note">
        <strong>No scoring profile.</strong> Apply migration{' '}
        <code>0005_wrtt_scoring_profile.sql</code>.
      </div>
    );
  }

  // Fail closed: with no token configured on the server, the levers are
  // visible but not movable. An unset variable locks, never opens.
  const token = process.env.WRTT_ADMIN_TOKEN;
  const jar = await cookies();
  const editable = Boolean(token) && jar.get(ADMIN_COOKIE)?.value === token;

  return (
    <>
      <Link href="/slt/wrtt" className="wrtt-back">← Markets</Link>

      <h1 style={{ marginTop: 12 }}>Scoring profile</h1>
      <p className="lede">
        {profile.label ?? profile.name} · last changed {profile.updated_at.slice(0, 16)}
      </p>

      <div className="wrtt-note">
        <strong>Changing these re-ranks every market.</strong> The profile is stored with each
        scoring run, so any sheet can be traced back to the settings that produced it – which is
        what stops a tuned ranking from being an unexplained reshuffle.{' '}
        <Link href="/slt/wrtt/method">Method →</Link>
      </div>

      {editable ? (
        <form action={lock} className="wrtt-lever-actions">
          <button type="submit" className="ghost">Lock</button>
        </form>
      ) : (
        <Unlock configured={Boolean(token)} action={unlock} />
      )}

      <ProfileForm levers={profile.profile} editable={editable} />
    </>
  );
}
