'use client';

import { useActionState } from 'react';
import { enter } from './actions';

export function GateForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState(enter, null as { error?: string } | null);

  return (
    <form action={action} className="wrtt-gate">
      <h1>WRTT<span>.Index</span></h1>
      <p>
        A scouting console listing named private individuals from public filings. Not indexed,
        not public.
      </p>
      <input type="hidden" name="from" value={from} />
      <label htmlFor="pw">Password</label>
      <input
        id="pw" name="password" type="password" autoFocus
        autoComplete="current-password" spellCheck={false}
      />
      <button type="submit" disabled={pending}>{pending ? 'Checking…' : 'Enter'}</button>
      {state?.error ? <p className="bad">{state.error}</p> : null}
    </form>
  );
}
