// Tiny client-side helper to send a GA4 event. gtag is loaded in the root
// layout (property G-K870M6C49G). No-ops safely on the server, or if gtag is
// blocked or not yet loaded, so callers never need to guard.
export function gaEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
  if (typeof g === 'function') {
    try {
      g('event', name, params || {});
    } catch {
      /* never let analytics break the app */
    }
  }
}
