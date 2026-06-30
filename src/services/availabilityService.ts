import { supabase } from '@/lib/supabase';
import type { DriverAvailabilityRow, ServiceAvailabilityFlags } from '@/types/driver';

type AvailResult = { data: DriverAvailabilityRow | null; error: string | null };

/**
 * Reads the driver's current availability row.
 * profileUserId is auth.uid() / profiles.id — driver_availability.driver_id matches this.
 * Returns null data (no error) when no row exists yet; the caller should treat missing row
 * as default accepts (all true except rides).
 */
export async function getMyServiceAvailability(profileUserId: string): Promise<AvailResult> {
  const { data, error } = await supabase
    .from('driver_availability')
    .select('driver_id, status, availability_status, accepts_delivery, accepts_rides, accepts_courier, accepts_gas, last_whatsapp_command, last_whatsapp_at, updated_at')
    .eq('driver_id', profileUserId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message || 'Could not load service availability.' };
  }
  return { data: data as DriverAvailabilityRow | null, error: null };
}

/**
 * Updates which service types the driver accepts.
 * Uses the set_driver_availability SECURITY DEFINER RPC which:
 *   - upserts driver_availability (driver_id = auth.uid())
 *   - mirrors drivers.online_status
 * currentOnlineStatus: pass driverRow.online_status so the RPC doesn't flip the driver online/offline.
 */
export async function updateMyServiceFlags(
  currentOnlineStatus: string,
  flags: ServiceAvailabilityFlags
): Promise<AvailResult> {
  const { data, error } = await supabase.rpc('set_driver_availability', {
    p_status:           currentOnlineStatus,
    p_accepts_delivery: flags.accepts_delivery,
    p_accepts_rides:    flags.accepts_rides,
    p_accepts_courier:  flags.accepts_courier,
    p_accepts_gas:      flags.accepts_gas,
  });

  if (error) {
    return { data: null, error: error.message || 'Could not update service availability.' };
  }
  return { data: data as DriverAvailabilityRow, error: null };
}

/**
 * Default flags to show when no driver_availability row exists yet.
 * Mirrors the SQL dispatch function's implicit defaults: delivery/courier/gas on, rides off.
 */
export const DEFAULT_SERVICE_FLAGS: ServiceAvailabilityFlags = {
  accepts_delivery: true,
  accepts_rides:    false,
  accepts_courier:  true,
  accepts_gas:      true,
};

/**
 * Syncs the driver's online/offline status to driver_availability without
 * changing any accepts_* flags.  Called non-fatally after setDriverOnlineStatus
 * so that driver_availability.status and .availability_status stay in sync with
 * drivers.online_status.
 *
 * The set_driver_availability RPC (SECURITY DEFINER) uses auth.uid() internally,
 * so no userId parameter is needed.
 */
export async function syncAvailabilityStatus(
  nextStatus: string,
  currentRow: DriverAvailabilityRow | null
): Promise<void> {
  const flags: ServiceAvailabilityFlags = currentRow
    ? {
        accepts_delivery: currentRow.accepts_delivery,
        accepts_rides:    currentRow.accepts_rides,
        accepts_courier:  currentRow.accepts_courier,
        accepts_gas:      currentRow.accepts_gas,
      }
    : DEFAULT_SERVICE_FLAGS;

  const { error } = await supabase.rpc('set_driver_availability', {
    p_status:           nextStatus,
    p_accepts_delivery: flags.accepts_delivery,
    p_accepts_rides:    flags.accepts_rides,
    p_accepts_courier:  flags.accepts_courier,
    p_accepts_gas:      flags.accepts_gas,
  });

  if (error) {
    console.warn('[availability] syncAvailabilityStatus non-fatal error:', error.message);
  }
}
