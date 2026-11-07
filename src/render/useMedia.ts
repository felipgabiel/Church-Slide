import { useEffect, useState } from 'react';
import { getMediaUrl, getThumbUrl } from '../core/storage/media';

export type MediaState = { url: string | null; status: 'idle' | 'loading' | 'ready' | 'missing' };

/** Resolve um `mediaId` para uma URL de objeto (do IndexedDB). `thumb` pede a miniatura. */
export function useMediaUrl(mediaId: string | null | undefined, thumb = false): MediaState {
  const [state, setState] = useState<MediaState>({ url: null, status: mediaId ? 'loading' : 'idle' });
  useEffect(() => {
    let alive = true;
    if (!mediaId) {
      setState({ url: null, status: 'idle' });
      return;
    }
    setState((s) => (s.status === 'ready' ? s : { url: null, status: 'loading' }));
    (thumb ? getThumbUrl(mediaId) : getMediaUrl(mediaId))
      .then((url) => alive && setState(url ? { url, status: 'ready' } : { url: null, status: 'missing' }))
      .catch(() => alive && setState({ url: null, status: 'missing' }));
    return () => {
      alive = false;
    };
  }, [mediaId, thumb]);
  return state;
}
