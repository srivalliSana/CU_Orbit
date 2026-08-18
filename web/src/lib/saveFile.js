/**
 * "Save as" that actually asks where to save, on browsers that support the
 * File System Access API (Chrome/Edge). A plain `<a download>` always saves
 * silently to the browser's default downloads folder — there is no way to
 * make that ask, so this fetches the file as a blob and opens the real
 * native Save dialog instead. Falls back to the old silent download on
 * browsers without the API (Firefox, Safari) rather than failing outright.
 */
export async function saveFile(url, suggestedName) {
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName });
      const response = await fetch(url);
      const blob = await response.blob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return; // user cancelled the picker — not a failure
      // Any other failure (e.g. fetch blocked by CORS) falls through to the anchor download below.
    }
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
