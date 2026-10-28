import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SONIC PRISM — Spotify & System Audio Shader Visualizer | Tony Toubia',
  description:
    'A modern Windows Media Player & MilkDrop-inspired WebGL audio visualizer with direct in-app Spotify integration, zero-mic desktop/tab digital loopback, local audio file deck, and 7 interactive shader worlds.',
};

interface VisualizerPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VisualizerPage({ searchParams }: VisualizerPageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === 'string') {
      qs.set(key, value);
    } else if (Array.isArray(value) && value.length > 0) {
      qs.set(key, value[0]);
    }
  }

  const envClientId =
    process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ||
    process.env.SPOTIFY_CLIENT_ID ||
    '';
  const envRedirectUri =
    process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI ||
    process.env.SPOTIFY_REDIRECT_URI ||
    '';

  if (envClientId && !qs.has('envClientId')) {
    qs.set('envClientId', envClientId);
  }
  if (envRedirectUri && !qs.has('envRedirectUri')) {
    qs.set('envRedirectUri', envRedirectUri);
  }

  const queryStr = qs.toString();
  const iframeSrc = `/visualizer/index.html${queryStr ? `?${queryStr}` : ''}`;

  return (
    <main className="fixed inset-0 h-[100dvh] overflow-hidden bg-[#04050c]">
      <iframe
        src={iframeSrc}
        className="absolute inset-0 h-full w-full border-0"
        title="SONIC PRISM Audio Visualizer"
        allow="display-capture; autoplay; encrypted-media; clipboard-write; fullscreen; microphone; picture-in-picture"
      />
    </main>
  );
}
