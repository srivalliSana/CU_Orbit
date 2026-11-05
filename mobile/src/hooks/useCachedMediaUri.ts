import { useEffect, useState } from "react";
import { ensureCachedMediaUri } from "../lib/fileActions";

/** Pre-warms an attachment's local cache as soon as it's rendered (not
 *  just when the user later taps Open/Save), so a previously-viewed photo
 *  or video still opens — and can still be saved — once the device goes
 *  offline. Returns the remote url immediately (so the image still shows
 *  right away while online) and swaps to the local file uri once cached. */
export function useCachedMediaUri(url?: string | null): string | undefined {
  const [uri, setUri] = useState<string | undefined>(url ?? undefined);

  useEffect(() => {
    setUri(url ?? undefined);
    if (!url) return;
    let cancelled = false;
    ensureCachedMediaUri(url).then((cachedUri) => {
      if (!cancelled) setUri(cachedUri);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return uri;
}
