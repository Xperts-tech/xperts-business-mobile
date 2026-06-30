import { supabase } from '@/lib/supabase';
import type { DriverRow } from '@/types/driver';

export type OnlineStatus = 'online' | 'offline';

type StatusResult = {
  data: DriverRow | null;
  error: string | null;
};

/**
 * Updates drivers.online_status for the authenticated driver.
 *
 * The prevent_driver_self_approval trigger explicitly allows drivers to write
 * online_status, last_activity_at, and updated_at on their own row.
 * All other sensitive columns (approval_status, enforcement_status, etc.)
 * are blocked by that same trigger.
 *
 * Logs to driver_activity_logs non-fatally — if that insert fails
 * (e.g. an RLS policy edge-case) the main status update is still returned.
 */
export async function setDriverOnlineStatus(
  driverId: string,
  nextStatus: OnlineStatus
): Promise<StatusResult> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('drivers')
    .update({
      online_status: nextStatus,
      last_activity_at: now,
      updated_at: now,
    })
    .eq('id', driverId)
    .select('id, profile_id, approval_status, enforcement_status, online_status, phone, metadata')
    .single();

  if (error) {
    return {
      data: null,
      error: friendlyStatusError(error.message),
    };
  }

  // Non-fatal audit log — mirrors what the web driverService.updateDriverOnlineStatus does.
  void (async () => {
    try {
      await supabase.from('driver_activity_logs').insert({
        driver_id: driverId,
        activity_type: `status_${nextStatus}`,
        description: `Driver is now ${nextStatus}.`,
      });
    } catch {
      // intentionally silent — activity log failure does not block the caller
    }
  })();

  return { data: data as DriverRow, error: null };
}

function friendlyStatusError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('insufficient_privilege') || m.includes('permission')) {
    return 'Permission denied. Your account may not be approved yet.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'No connection. Check your internet and try again.';
  }
  return 'Could not update status. Please try again.';
}
