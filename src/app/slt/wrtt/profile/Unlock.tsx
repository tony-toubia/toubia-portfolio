'use client';

import { useActionState } from 'react';

export function Unlock({
  configured,
  action,
}: {
  configured: boolean;
  action: (prev: unknown, form: FormData) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, null as
    | { ok?: boolean; error?: string } | null);

  if (!configured) {
    return (
      <p className="wrtt-prose wrtt-prose-dim">
        Read-only. Set <code>WRTT_ADMIN_TOKEN</code> in the environment to make these editable.
      </p>
    );
  }

  return (
    <form action={formAction} className="wrtt-lever-actions">
      <input type="password" name="token" placeholder="admin token" autoComplete="off" />
      <button type="submit" disabled={pending}>{pending ? 'Checking…' : 'Unlock'}</button>
      {state?.error ? <span className="bad">{state.error}</span> : null}
    </form>
  );
}
