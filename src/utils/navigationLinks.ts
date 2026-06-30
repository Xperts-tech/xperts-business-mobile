// Mirrors web src/utils/navigationLinks.js — same URL schemes, same fallback logic.
// React Native-specific: Waze uses waze:// deep link; Google Maps uses universal https URL.

/**
 * buildGoogleMapsUrl — directions to a single destination.
 * Uses the universal https URL that opens Google Maps on both iOS and Android.
 * Prefers lat/lng over address text when both are available.
 */
export function buildGoogleMapsUrl({
  address = null,
  lat = null,
  lng = null,
}: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  if (!address && lat == null) return null;

  const dest =
    lat != null && lng != null
      ? `${lat},${lng}`
      : encodeURIComponent(address ?? '');

  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/**
 * buildWazeUrl — Waze deep link (waze:// scheme).
 * Prefers lat/lng; falls back to address text query.
 * Returns null when neither is available.
 */
export function buildWazeUrl({
  address = null,
  lat = null,
  lng = null,
}: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  if (lat != null && lng != null) {
    return `waze://?ll=${lat},${lng}&navigate=yes`;
  }
  if (address) {
    return `waze://?q=${encodeURIComponent(address)}&navigate=yes`;
  }
  return null;
}
