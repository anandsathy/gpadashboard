/**
 * Identifiers.
 *
 * `crypto.randomUUID` is only exposed on secure origins, and the app is meant
 * to keep working when it is opened from a file:// path or an old browser, so
 * there is a fallback that is still collision-proof for a student's transcript.
 */
export function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();

  if (c && typeof c.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
