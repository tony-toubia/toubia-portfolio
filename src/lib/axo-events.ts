/**
 * Report a site event to the AXO tag (window.axo.event).
 *
 * The tag loads after the page becomes interactive and only on
 * tonytoubia.com (see components/AxoTag.tsx), and it has no queue of its
 * own. Events fired before it arrives wait here and are sent once
 * window.axo appears. If it never appears within 30 seconds (another host,
 * /slt, a blocker), they are dropped.
 *
 * Properties must be primitives and must never carry personal data: no
 * names, emails or message text.
 */
type AxoApi = { event?: (type: string, properties?: Record<string, unknown>) => void };
type Props = Record<string, string | number | boolean>;

const pending: Array<[string, Props]> = [];
const MAX_PENDING = 50;
const POLL_MS = 500;
const MAX_POLLS = 60;
let timer: ReturnType<typeof setInterval> | null = null;

function axo(): AxoApi | undefined {
  return (window as unknown as { axo?: AxoApi }).axo;
}

function send(api: AxoApi, type: string, props: Props) {
  try {
    api.event?.(type, props);
  } catch {
    // Analytics must never break the page.
  }
}

export function trackAxoEvent(type: string, props: Props = {}): void {
  if (typeof window === "undefined") return;
  const api = axo();
  if (api?.event) {
    send(api, type, props);
    return;
  }
  if (pending.length >= MAX_PENDING) return;
  pending.push([type, props]);
  if (timer) return;
  let polls = 0;
  timer = setInterval(() => {
    const ready = axo();
    if (ready?.event) {
      for (const [t, p] of pending.splice(0)) send(ready, t, p);
    } else if (++polls < MAX_POLLS) {
      return;
    } else {
      pending.length = 0;
    }
    if (timer) clearInterval(timer);
    timer = null;
  }, POLL_MS);
}
