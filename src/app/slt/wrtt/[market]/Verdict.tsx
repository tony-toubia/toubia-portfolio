'use client';

import { useState, useTransition } from 'react';
import { submitVerdict } from './actions';
import { VERDICTS, VERDICT_LABEL, VERDICT_HINT, type Verdict as V } from './verdicts';

/**
 * Five buttons and an optional note. The chosen verdict lights up; the note
 * field opens once there is a verdict to attach it to. Optimistic - the
 * button flips on click and the server confirms behind it - because a
 * reviewer working down a list of fifty should not wait on a round trip
 * for every card.
 */
export function Verdict({
  marketId, personId, current, note, by,
}: {
  marketId: string;
  personId: string;
  current: string | null;
  note: string | null;
  by: string | null;
}) {
  const [verdict, setVerdict] = useState<V | null>((current as V) ?? null);
  const [text, setText] = useState(note ?? '');
  const [saved, setSaved] = useState(note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send(v: V, n: string) {
    setError(null);
    start(async () => {
      const r = await submitVerdict(marketId, personId, v, n);
      if (r.error) setError(r.error);
      else setSaved(n);
    });
  }

  return (
    <div className="wrtt-verdict" aria-label="Your verdict on this card">
      <div className="wrtt-verdict-btns">
        {VERDICTS.map((v) => (
          <button
            key={v}
            type="button"
            className={verdict === v ? `is-on is-${v}` : undefined}
            title={VERDICT_HINT[v]}
            disabled={pending}
            onClick={() => { setVerdict(v); send(v, text); }}
          >
            {VERDICT_LABEL[v]}
          </button>
        ))}
      </div>

      {verdict ? (
        <div className="wrtt-verdict-note">
          <input
            type="text"
            value={text}
            maxLength={500}
            placeholder="Why? (optional – this is what trains the model)"
            onChange={(e) => setText(e.target.value)}
            onBlur={() => { if (text !== saved) send(verdict, text); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
          <span className="wrtt-verdict-meta">
            {pending ? 'saving…' : error ? error : by ? `last by ${by}` : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
}
