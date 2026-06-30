import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';

// Mirrors web driverLocationService.js — upsert keyed by driver_id, one row per driver.
// orderId links the row to any active order so customer RLS can read it.
export async function pingDriverLocation(
  driverId: string,
  orderId: string | null,
  coords: {
    lat: number;
    lng: number;
    heading?: number | null;
    speed?: number | null;
    accuracy?: number | null;
  },
): Promise<void> {
  if (!driverId) return;
  await supabase.from('driver_locations').upsert(
    {
      driver_id: driverId,
      order_id:  orderId ?? null,
      lat:       coords.lat,
      lng:       coords.lng,
      heading:   coords.heading != null ? Number(coords.heading.toFixed(2)) : null,
      speed:     coords.speed   != null ? Number(coords.speed.toFixed(2))   : null,
      accuracy:  coords.accuracy != null ? Number(coords.accuracy.toFixed(2)) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'driver_id' },
  );
}

// Remove the driver's location row when going offline.
export async function clearDriverLocation(driverId: string): Promise<void> {
  if (!driverId) return;
  await supabase.from('driver_locations').delete().eq('driver_id', driverId);
}

// Request foreground location permission.
// Returns true if granted.
export async function requestForegroundLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

// Get a single current position with balanced accuracy (fast + reasonable precision).
export async function getCurrentLocation(): Promise<{
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
} | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      lat:      pos.coords.latitude,
      lng:      pos.coords.longitude,
      heading:  pos.coords.heading,
      speed:    pos.coords.speed,
      accuracy: pos.coords.accuracy,
    };
  } catch {
    return null;
  }
}
