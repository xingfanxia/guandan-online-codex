export function normalizeHandle(handle: string): string {
  const trimmed = handle.trim();
  return trimmed.startsWith('@') ? trimmed.slice(1).toLowerCase() : trimmed.toLowerCase();
}

export function validateHandle(handle: unknown): boolean {
  if (!handle || typeof handle !== 'string') return false;
  if (handle.length < 2 || handle.length > 20) return false;
  return /^[a-zA-Z0-9_]+$/.test(handle);
}
