/**
 * Desktop notifications for incoming messages.
 *
 * Browser-level only: it fires while a tab is open. Notifications when the app
 * is closed need push (service worker + FCM), which is a separate piece of work.
 *
 * Inside an iframe, Notification.requestPermission() is blocked in most
 * browsers unless the frame carries allow="notifications", so a failure here is
 * expected and must stay silent rather than breaking messaging.
 */

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

export const permission = () => (supported() ? Notification.permission : 'denied');

/** Ask once, from a user gesture. Returns true if we may notify. */
export async function requestPermission() {
  if (!supported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;   // blocked in iframe, or user dismissed
  }
}

let lastTag = null;

/**
 * Show a notification for a message. Focus-aware: nothing fires while the user
 * is already looking at the conversation.
 */
export function notifyMessage({ title, body, tag, onClick }) {
  if (!supported() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;

  try {
    // Reusing the tag collapses a burst from one conversation into a single
    // notification rather than a stack of them.
    const n = new Notification(title, {
      body: (body || '').slice(0, 180),
      tag: tag || 'cu-orbit',
      renotify: tag !== lastTag,
      silent: false,
    });
    lastTag = tag;
    n.onclick = () => { window.focus(); onClick?.(); n.close(); };
    setTimeout(() => n.close(), 8000);
  } catch { /* never let a notification failure surface in the UI */ }
}

/** Unread total in the tab title, so it is visible without notifications. */
export function setBadge(count) {
  const base = 'CU Orbit';
  document.title = count > 0 ? `(${count}) ${base}` : base;
  if (navigator.setAppBadge) {
    count > 0 ? navigator.setAppBadge(count).catch(() => {}) : navigator.clearAppBadge?.().catch(() => {});
  }
}
