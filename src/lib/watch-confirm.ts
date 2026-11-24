// A watch-confirmation link names both the watch and the address it was sent
// to. The confirm route activates the watch only if that is still the watch's
// address, so an old link (sent to the requester's own mailbox) can't activate
// a watch that has since been re-pointed at a stranger who never agreed.
export function confirmSubject(watchId: string, email: string): string {
  return `${watchId}:${email.toLowerCase()}`;
}

/** Split a confirm-token subject. Returns null for the old id-only format. */
export function parseConfirmSubject(subject: string): { watchId: string; email: string } | null {
  const idx = subject.indexOf(":");
  if (idx <= 0) return null;
  return { watchId: subject.slice(0, idx), email: subject.slice(idx + 1) };
}
