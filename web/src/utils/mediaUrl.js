// Attachment URLs from the API are server-relative ("/uploads/..."). That's
// fine for <img>/<video src> (the browser resolves them against the current
// origin and sends the auth cookie automatically), but copying one to the
// clipboard as-is hands out a path with no host — useless outside the app.
export function absoluteMediaUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}
