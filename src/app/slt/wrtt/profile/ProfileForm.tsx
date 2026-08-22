'use client';

import { useActionState } from 'react';
import { saveProfile } from './actions';

type Levers = {
  components: Record<string, number>;
  roles: Record<string, number>;
  domains: Record<string, number>;
  compensation: Record<string, number>;
  compensation_nominal_max: number;
  same_family_repeat: number;
  half_life_years: number;
  org_scale_divisor: number;
};

const PAY_LABELS: Record<string, string> = {
  unpaid: 'unpaid ($0 reported)',
  nominal: 'nominal (a stipend)',
  paid: 'paid (a living)',
  unknown: 'not reported',
};

const COMPONENT_LABELS: Record<string, string> = {
  M: 'Mobilization', B: 'Breadth', T: 'Tenure',
  R: 'Reach', A: 'Availability', X: 'Adjacency',
};

const DEAD = new Set(['R', 'A', 'X']);

function Rows({
  group, values, labels, readOnly,
}: {
  group: string;
  values: Record<string, number>;
  labels?: Record<string, string>;
  readOnly: boolean;
}) {
  return (
    <div className="wrtt-levers">
      {Object.entries(values).map(([key, v]) => (
        <label key={key} className={`wrtt-lever${DEAD.has(key) ? ' is-off' : ''}`}>
          <span className="wrtt-lever-name">
            {labels?.[key] ?? key.replace(/_/g, ' ')}
            {DEAD.has(key) ? <em> no input</em> : null}
          </span>
          <input
            type="number" step="0.05" min="0" max="10"
            name={`${group}.${key}`} defaultValue={v}
            readOnly={readOnly} disabled={readOnly}
          />
        </label>
      ))}
    </div>
  );
}

export function ProfileForm({ levers, editable }: { levers: Levers; editable: boolean }) {
  const [state, action, pending] = useActionState(saveProfile, null as
    | { ok?: boolean; markets?: number; error?: string } | null);

  return (
    <form action={action}>
      <h2>Components</h2>
      <p className="wrtt-prose wrtt-prose-dim">
        Relative weight of each input. R, A and X have no data, so their weight leaves the
        denominator rather than counting as zero – changing them does nothing until a source
        exists.
      </p>
      <Rows group="components" values={levers.components} labels={COMPONENT_LABELS} readOnly={!editable} />

      <h2>Organization type</h2>
      <p className="wrtt-prose wrtt-prose-dim">
        The target profile, in practice. A seat on a national trade body is not the same signal
        as chairing a PTA; this is where you say so. 1.0 is neutral.
      </p>
      <Rows group="domains" values={levers.domains} readOnly={!editable} />

      <h2>Paid or unpaid</h2>
      <p className="wrtt-prose wrtt-prose-dim">
        The premise is people organizing things nobody pays them to organize, and Form 990
        reports what each role paid. A volunteer director reads $0. &ldquo;Not reported&rdquo;
        is genuinely unknown rather than zero, so it sits between the two rather than being
        treated as free labour.
      </p>
      <Rows group="compensation" values={levers.compensation} labels={PAY_LABELS} readOnly={!editable} />
      <div className="wrtt-levers">
        <label className="wrtt-lever">
          <span className="wrtt-lever-name">nominal ceiling ($)</span>
          <input type="number" step="1000" min="0" max="1000000" name="compensation_nominal_max"
                 defaultValue={levers.compensation_nominal_max} readOnly={!editable} disabled={!editable} />
        </label>
        <label className="wrtt-lever">
          <span className="wrtt-lever-name">repeat seat, same family</span>
          <input type="number" step="0.05" min="0" max="1" name="same_family_repeat"
                 defaultValue={levers.same_family_repeat} readOnly={!editable} disabled={!editable} />
        </label>
      </div>
      <p className="wrtt-prose wrtt-prose-dim">
        Three boards of one institution are one crowd, not three. The second and later seats
        inside an organizational family count at this fraction, and breadth counts the family
        once however many of its boards someone sits on.
      </p>

      <h2>Role seniority</h2>
      <p className="wrtt-prose wrtt-prose-dim">Evidence of leading rather than joining.</p>
      <Rows group="roles" values={levers.roles} readOnly={!editable} />

      <h2>Decay and scale</h2>
      <div className="wrtt-levers">
        <label className="wrtt-lever">
          <span className="wrtt-lever-name">half life (years)</span>
          <input type="number" step="0.5" min="0.25" max="50" name="half_life_years"
                 defaultValue={levers.half_life_years} readOnly={!editable} disabled={!editable} />
        </label>
        <label className="wrtt-lever">
          <span className="wrtt-lever-name">org scale divisor</span>
          <input type="number" step="1" min="1" max="100" name="org_scale_divisor"
                 defaultValue={levers.org_scale_divisor} readOnly={!editable} disabled={!editable} />
        </label>
      </div>
      <p className="wrtt-prose wrtt-prose-dim">
        Half life is how fast an old board seat stops counting. The divisor flattens organization
        size – raise it to stop one very large filer dominating a market.
      </p>

      {editable ? (
        <div className="wrtt-lever-actions">
          <button type="submit" disabled={pending}>
            {pending ? 'Rescoring every market…' : 'Save and rescore'}
          </button>
          {state?.ok ? <span className="ok">Saved. {state.markets} markets rescored.</span> : null}
          {state?.error ? <span className="bad">{state.error}</span> : null}
        </div>
      ) : null}
    </form>
  );
}
