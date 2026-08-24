import { GateForm } from './GateForm';
import { recordHit } from '@/lib/wrtt/hits';

export const dynamic = 'force-dynamic';
// No title override: link scrapers follow the gate redirect here, so this
// page must present the layout's SLT Ventures metadata untouched.
export const metadata = { robots: { index: false, follow: false } };

export default async function Enter({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  // Either spelling of the console - /slt/wrtt on the primary domain, /wrtt
  // on slt.ventures - so a deep link survives the gate on both hosts.
  const ok = from && (from.startsWith('/slt/wrtt') || from.startsWith('/wrtt')) && !from.startsWith('//');
  // The link was opened: the single fact most worth recording.
  await recordHit('gate_view', { path: '/slt/wrtt/enter' });
  return <GateForm from={ok ? from : '/slt/wrtt'} />;
}
