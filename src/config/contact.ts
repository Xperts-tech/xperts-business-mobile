// Support contact config — values come from EXPO_PUBLIC_ env vars.
// Set them in .env (local dev) and in each eas.json build profile (CI/production).
// Helpers return null when not configured so callers can hide links safely.

export const SUPPORT_WA    = process.env.EXPO_PUBLIC_SUPPORT_WA ?? '';
export const SUPPORT_EMAIL = 'support@xpertsxpress.com';

/** wa.me deep-link with optional pre-filled message. Null when WA is not configured. */
export function waUrl(msg?: string): string | null {
  if (!SUPPORT_WA) return null;
  const base = `https://wa.me/${SUPPORT_WA}`;
  return msg ? `${base}?text=${encodeURIComponent(msg)}` : base;
}
