import { GateForm } from './GateForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'WRTT Index', robots: { index: false, follow: false } };

export default async function Enter({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const safe = from && from.startsWith('/slt/wrtt') && !from.startsWith('//') ? from : '/slt/wrtt';
  return <GateForm from={safe} />;
}
