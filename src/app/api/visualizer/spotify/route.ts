import { NextRequest, NextResponse } from 'next/server';

export interface VisualizerTrack {
  id: string;
  spotifyId?: string;
  spotifyUri?: string;
  title: string;
  artist: string;
  album?: string;
  artwork: string;
  durationMs: number;
  previewUrl: string | null;
  streamProxyUrl: string | null;
  externalUrl?: string;
}

const OFFICIAL_SPOTIFY_PLAYLISTS = [
  {
    id: '37i9dQZF1DXcBWIGoYBM5M',
    title: "Today's Top Hits",
    subtitle: 'Spotify Official · Global Hits',
    spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
  },
  {
    id: '37i9dQZF1DX4dyzvuaRJ0n',
    title: 'mint · Electronic & Club',
    subtitle: 'Spotify Official · Dance & Electronic',
    spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX4dyzvuaRJ0n',
  },
  {
    id: '37i9dQZF1DX0XUsuxWHRQd',
    title: 'RapCaviar',
    subtitle: 'Spotify Official · Hip-Hop',
    spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd',
  },
  {
    id: '37i9dQZF1DX8CopunbDxgW',
    title: 'Night Rider',
    subtitle: 'Spotify Official · Synthwave & Electronic',
    spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX8CopunbDxgW',
  },
  {
    id: '37i9dQZF1DWXRqgorJj26U',
    title: 'Rock Classics',
    subtitle: 'Spotify Official · Iconic Rock Anthems',
    spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DWXRqgorJj26U',
  },
  {
    id: '37i9dQZF1DX4WYpdgoIcn6',
    title: 'Chill Hits',
    subtitle: 'Spotify Official · Laid-Back Pop & Indie',
    spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX4WYpdgoIcn6',
  },
];

function toProxyUrl(previewUrl: string | null | undefined): string | null {
  if (!previewUrl) return null;
  return `/api/visualizer/stream?url=${encodeURIComponent(previewUrl)}`;
}

function parseSpotifyInput(input: string): { type: 'track' | 'playlist' | 'album' | 'artist'; id: string } | null {
  const trimmed = input.trim();
  const uriMatch = trimmed.match(/^spotify:(track|playlist|album|artist):([a-zA-Z0-9]+)$/i);
  if (uriMatch) {
    return {
      type: uriMatch[1].toLowerCase() as 'track' | 'playlist' | 'album' | 'artist',
      id: uriMatch[2],
    };
  }
  const urlMatch = trimmed.match(
    /spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|playlist|album|artist)\/([a-zA-Z0-9]+)/i
  );
  if (urlMatch) {
    return {
      type: urlMatch[1].toLowerCase() as 'track' | 'playlist' | 'album' | 'artist',
      id: urlMatch[2],
    };
  }
  return null;
}

async function searchItunesTracks(query: string, limit = 16): Promise<VisualizerTrack[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .filter((r: Record<string, unknown>) => typeof r.previewUrl === 'string' && r.previewUrl)
      .map((r: Record<string, unknown>) => {
        const previewUrl = String(r.previewUrl);
        const rawArt = String(r.artworkUrl100 || '');
        const artwork = rawArt ? rawArt.replace('100x100bb', '600x600bb') : '';
        return {
          id: `itunes-${r.trackId}`,
          title: String(r.trackName || 'Unknown Track'),
          artist: String(r.artistName || 'Unknown Artist'),
          album: String(r.collectionName || ''),
          artwork,
          durationMs: Number(r.trackTimeMillis || 30000),
          previewUrl,
          streamProxyUrl: toProxyUrl(previewUrl),
          externalUrl: String(r.trackViewUrl || ''),
        };
      });
  } catch {
    return [];
  }
}

async function fetchSpotifyEmbedEntity(type: string, id: string): Promise<Record<string, any> | null> {
  try {
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const marker = '__NEXT_DATA__';
    const idx = html.indexOf(marker);
    if (idx === -1) return null;
    const start = html.indexOf('>', idx) + 1;
    const end = html.indexOf('</script>', start);
    if (start <= 0 || end === -1) return null;
    const parsed = JSON.parse(html.slice(start, end));
    return parsed?.props?.pageProps?.state?.data?.entity || null;
  } catch {
    return null;
  }
}

async function resolveSingleTrackStream(
  title: string,
  artist: string,
  spotifyId?: string,
  existingPreview?: string | null,
  existingArt?: string
): Promise<VisualizerTrack> {
  let previewUrl = existingPreview || null;
  let artwork = existingArt || '';
  let album = '';
  let durationMs = 30000;

  if (!previewUrl || !artwork) {
    const matches = await searchItunesTracks(`${title} ${artist}`, 3);
    const best = matches[0];
    if (best) {
      if (!previewUrl) previewUrl = best.previewUrl;
      if (!artwork) artwork = best.artwork;
      album = best.album || '';
      durationMs = best.durationMs || 30000;
    }
  }

  return {
    id: spotifyId ? `spotify-${spotifyId}` : `track-${title}-${artist}`,
    spotifyId,
    spotifyUri: spotifyId ? `spotify:track:${spotifyId}` : undefined,
    title,
    artist,
    album,
    artwork,
    durationMs,
    previewUrl,
    streamProxyUrl: toProxyUrl(previewUrl),
    externalUrl: spotifyId ? `https://open.spotify.com/track/${spotifyId}` : undefined,
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const query = sp.get('q')?.trim();
  const spotifyUrl = sp.get('spotifyUrl')?.trim();
  const resolveTrack = sp.get('resolveTrack');

  const configuredClientId =
    process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ||
    process.env.SPOTIFY_CLIENT_ID ||
    '';

  if (resolveTrack) {
    const title = sp.get('title') || '';
    const artist = sp.get('artist') || '';
    const spotifyId = sp.get('spotifyId') || undefined;
    const artwork = sp.get('artwork') || '';
    const track = await resolveSingleTrackStream(title, artist, spotifyId, null, artwork);
    return NextResponse.json({ track, clientId: configuredClientId });
  }

  if (spotifyUrl) {
    const parsed = parseSpotifyInput(spotifyUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Please paste a valid Spotify Track, Playlist, or Album link or URI.' },
        { status: 400 }
      );
    }

    const entity = await fetchSpotifyEmbedEntity(parsed.type, parsed.id);

    if (parsed.type === 'track') {
      const title = entity?.title || entity?.name || 'Spotify Track';
      const artist =
        Array.isArray(entity?.artists)
          ? entity.artists.map((a: { name: string }) => a.name).join(', ')
          : entity?.subtitle || '';
      const artwork =
        entity?.visualIdentity?.image?.[0]?.url ||
        entity?.coverArt?.sources?.[0]?.url ||
        '';
      const directPreview = entity?.audioPreview?.url || null;
      const track = await resolveSingleTrackStream(
        title,
        artist,
        parsed.id,
        directPreview,
        artwork
      );
      if (entity?.duration) track.durationMs = Number(entity.duration);

      return NextResponse.json({
        kind: 'track',
        spotifyType: parsed.type,
        spotifyId: parsed.id,
        spotifyUri: `spotify:track:${parsed.id}`,
        title: track.title,
        subtitle: track.artist,
        artwork: track.artwork,
        tracks: [track],
        clientId: configuredClientId,
      });
    }

    if (entity && Array.isArray(entity.trackList) && entity.trackList.length > 0) {
      const collectionArtwork =
        entity?.visualIdentity?.image?.[0]?.url ||
        entity?.coverArt?.sources?.[0]?.url ||
        '';
      const rawList = entity.trackList.slice(0, 25);

      const tracks: VisualizerTrack[] = await Promise.all(
        rawList.map(async (item: Record<string, any>, index: number) => {
          const uri = String(item.uri || '');
          const trackIdMatch = uri.match(/spotify:track:([a-zA-Z0-9]+)/);
          const trackId = trackIdMatch ? trackIdMatch[1] : `${parsed.id}-${index}`;
          const tTitle = String(item.title || 'Track');
          const tArtist = String(item.subtitle || entity.subtitle || '');
          const itemPreview = item?.audioPreview?.url ? String(item.audioPreview.url) : null;

          if (itemPreview) {
            return {
              id: `spotify-${trackId}`,
              spotifyId: trackId,
              spotifyUri: uri || `spotify:track:${trackId}`,
              title: tTitle,
              artist: tArtist,
              album: String(entity.title || entity.name || ''),
              artwork: collectionArtwork,
              durationMs: Number(item.duration || 30000),
              previewUrl: itemPreview,
              streamProxyUrl: toProxyUrl(itemPreview),
              externalUrl: `https://open.spotify.com/track/${trackId}`,
            };
          }

          if (index < 6) {
            const resolved = await resolveSingleTrackStream(
              tTitle,
              tArtist,
              trackId,
              null,
              collectionArtwork
            );
            if (item.duration) resolved.durationMs = Number(item.duration);
            return resolved;
          }

          return {
            id: `spotify-${trackId}`,
            spotifyId: trackId,
            spotifyUri: uri || `spotify:track:${trackId}`,
            title: tTitle,
            artist: tArtist,
            album: String(entity.title || entity.name || ''),
            artwork: collectionArtwork,
            durationMs: Number(item.duration || 30000),
            previewUrl: null,
            streamProxyUrl: null,
            externalUrl: `https://open.spotify.com/track/${trackId}`,
          };
        })
      );

      return NextResponse.json({
        kind: parsed.type,
        spotifyType: parsed.type,
        spotifyId: parsed.id,
        spotifyUri: `spotify:${parsed.type}:${parsed.id}`,
        title: String(entity.title || entity.name || 'Spotify Collection'),
        subtitle: String(entity.subtitle || `${tracks.length} tracks`),
        artwork: collectionArtwork,
        tracks,
        clientId: configuredClientId,
      });
    }

    return NextResponse.json(
      { error: 'Could not extract tracks from that Spotify link.' },
      { status: 404 }
    );
  }

  if (query) {
    const maybeSpotify = parseSpotifyInput(query);
    if (maybeSpotify) {
      const redirectUrl = new URL(req.url);
      redirectUrl.searchParams.delete('q');
      redirectUrl.searchParams.set('spotifyUrl', query);
      return GET(new NextRequest(redirectUrl));
    }

    const tracks = await searchItunesTracks(query, 18);
    return NextResponse.json({
      kind: 'search',
      query,
      tracks,
      clientId: configuredClientId,
    });
  }

  return NextResponse.json({
    kind: 'playlists',
    playlists: OFFICIAL_SPOTIFY_PLAYLISTS,
    clientId: configuredClientId,
  });
}
