import { GateForm } from './GateForm';

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
  const safe = from && from.startsWith('/slt/wrtt') && !from.startsWith('//') ? from : '/slt/wrtt';
  return <GateForm from={safe} />;
}
