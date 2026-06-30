/**
 * contractLogisticsService — driver-facing contract logistics functions.
 *
 * ALL contract tables use drivers.id (not profiles.id / auth.uid()).
 * Pass driverId = driverRow.id from AuthContext.
 *
 * Admin-only operations (batch close, earnings calculation/approval,
 * partner management, manifest import, rental creation) are intentionally
 * absent. This file is mobile driver-safe only.
 */

import { supabase } from '@/lib/supabase';
import type {
  ContractBatch,
  ContractDriverRole,
  ContractEarnings,
  ContractHandoff,
  ContractPackage,
  ContractRental,
  ContractRoute,
  PackageStatusUpdate,
} from '@/types/contract';

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

function err(msg: string): ServiceResult<never> {
  return { ok: false, error: msg };
}

function nowIso(): string {
  return new Date().toISOString();
}

// ── Available Drop-offs (pool) ────────────────────────────────────────────────

export async function getAvailableContractRoutes(): Promise<ServiceResult<ContractRoute[]>> {
  try {
    const { data, error } = await supabase
      .from('contract_routes')
      .select('*, batch:contract_batches(id, title, batch_code, delivery_deadline_at)')
      .eq('available_to_driver_pool', true)
      .eq('status', 'available')
      .order('created_at', { ascending: false });

    if (error) return err(error.message || 'Could not load available drop-offs.');
    return ok((data ?? []) as ContractRoute[]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not load available drop-offs.');
  }
}

/**
 * Request or instantly claim a pool route.
 * driverId must be drivers.id (not profiles.id).
 * Returns { claimed: true } if instantly assigned; { claimed: false } if pending admin approval.
 */
export async function requestContractRoute(
  routeId: string,
  driverId: string
): Promise<ServiceResult<ContractRoute & { claimed: boolean }>> {
  if (!routeId || !driverId) return err('Missing route or driver ID.');
  try {
    const { data: route, error: fetchErr } = await supabase
      .from('contract_routes')
      .select('id, requires_admin_approval, status')
      .eq('id', routeId)
      .single();

    if (fetchErr || !route) return err('Route not found.');
    if (route.status !== 'available') return err('This drop-off is no longer available.');

    if (!route.requires_admin_approval) {
      const { data, error } = await supabase
        .from('contract_routes')
        .update({
          assigned_driver_id: driverId,
          status: 'assigned',
          available_to_driver_pool: false,
          updated_at: nowIso(),
        })
        .eq('id', routeId)
        .eq('status', 'available')
        .select('*, batch:contract_batches(id, title, batch_code, delivery_deadline_at)')
        .single();

      if (error) return err(error.message || 'Could not claim this drop-off.');
      return ok({ ...(data as ContractRoute), claimed: true });
    } else {
      const { data, error } = await supabase
        .from('contract_routes')
        .update({
          status: 'requested',
          metadata: { requested_by_driver_id: driverId, requested_at: nowIso() },
          updated_at: nowIso(),
        })
        .eq('id', routeId)
        .eq('status', 'available')
        .select('*, batch:contract_batches(id, title, batch_code, delivery_deadline_at)')
        .single();

      if (error) return err(error.message || 'Could not request this drop-off.');
      return ok({ ...(data as ContractRoute), claimed: false });
    }
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not request this drop-off.');
  }
}

// ── My Runs ───────────────────────────────────────────────────────────────────

export async function getMyContractRuns(driverId: string): Promise<ServiceResult<ContractRoute[]>> {
  if (!driverId) return err('Driver ID required.');
  try {
    const { data, error } = await supabase
      .from('contract_routes')
      .select('*, batch:contract_batches(id, title, batch_code, status)')
      .eq('assigned_driver_id', driverId)
      .not('status', 'in', '("cancelled","completed")')
      .order('created_at', { ascending: false });

    if (error) return err(error.message || 'Could not load your contract runs.');
    return ok((data ?? []) as ContractRoute[]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not load your contract runs.');
  }
}

export async function getMyContractRunsAll(driverId: string): Promise<ServiceResult<ContractRoute[]>> {
  if (!driverId) return err('Driver ID required.');
  try {
    const { data, error } = await supabase
      .from('contract_routes')
      .select('*, batch:contract_batches(id, title, batch_code, status)')
      .eq('assigned_driver_id', driverId)
      .order('created_at', { ascending: false });

    if (error) return err(error.message || 'Could not load contract runs.');
    return ok((data ?? []) as ContractRoute[]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not load contract runs.');
  }
}

// ── Run Detail + Packages ─────────────────────────────────────────────────────

export async function getContractRouteDetail(
  routeId: string
): Promise<ServiceResult<{ route: ContractRoute; packages: ContractPackage[] }>> {
  if (!routeId) return err('Route ID required.');
  try {
    const [routeRes, routePkgsRes] = await Promise.all([
      supabase
        .from('contract_routes')
        .select('*, batch:contract_batches(id, title, batch_code, status, warehouse_address)')
        .eq('id', routeId)
        .single(),
      supabase
        .from('contract_route_packages')
        .select('package_id')
        .eq('route_id', routeId),
    ]);

    if (routeRes.error) return err(routeRes.error.message || 'Could not load run detail.');

    const packageIds = (routePkgsRes.data ?? []).map((rp) => rp.package_id as string);

    let packages: ContractPackage[] = [];
    if (packageIds.length > 0) {
      const { data } = await supabase
        .from('contract_packages')
        .select('*')
        .in('id', packageIds)
        .order('zone')
        .order('customer_name');
      packages = (data ?? []) as ContractPackage[];
    }

    return ok({ route: routeRes.data as ContractRoute, packages });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not load run detail.');
  }
}

// ── Package status ────────────────────────────────────────────────────────────

export async function updateContractPackageStatus(
  packageId: string,
  update: PackageStatusUpdate
): Promise<ServiceResult<ContractPackage>> {
  if (!packageId) return err('Package ID required.');
  try {
    const payload: Record<string, unknown> = {
      status: update.status,
      updated_at: nowIso(),
    };
    if (update.failure_reason !== undefined) payload.failure_reason = update.failure_reason;
    if (update.status === 'delivered') payload.delivered_at = update.delivered_at ?? nowIso();
    if (update.status === 'returned_to_xperts') payload.returned_at = update.returned_at ?? nowIso();

    const { data, error } = await supabase
      .from('contract_packages')
      .update(payload)
      .eq('id', packageId)
      .select('*')
      .single();

    if (error) return err(error.message || 'Could not update package status.');
    return ok(data as ContractPackage);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not update package status.');
  }
}

// ── Route status ──────────────────────────────────────────────────────────────

export async function updateContractRouteStatus(
  routeId: string,
  status: 'in_progress' | 'completed' | 'picked_up'
): Promise<ServiceResult<ContractRoute>> {
  if (!routeId) return err('Route ID required.');
  try {
    const { data, error } = await supabase
      .from('contract_routes')
      .update({ status, updated_at: nowIso() })
      .eq('id', routeId)
      .select('*, batch:contract_batches(id, title, batch_code, status)')
      .single();

    if (error) return err(error.message || 'Could not update run status.');
    return ok(data as ContractRoute);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not update run status.');
  }
}

// ── Handoffs ──────────────────────────────────────────────────────────────────

export async function getMyContractHandoffs(
  driverId: string
): Promise<ServiceResult<ContractHandoff[]>> {
  if (!driverId) return err('Driver ID required.');
  try {
    const { data, error } = await supabase
      .from('contract_handoffs')
      .select(
        '*, route:contract_routes(id, title, zone, package_count), batch:contract_batches(id, title, batch_code)'
      )
      .or(`from_driver_id.eq.${driverId},to_driver_id.eq.${driverId}`)
      .in('status', ['pending', 'confirmed'])
      .order('created_at', { ascending: false });

    if (error) return err(error.message || 'Could not load handoffs.');
    return ok((data ?? []) as ContractHandoff[]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not load handoffs.');
  }
}

/**
 * Confirm receipt of a handoff (to_driver confirms).
 * Cascades: transfers route ownership + package custody to to_driver.
 * driverId is passed for safety check — only the to_driver should confirm.
 */
export async function confirmContractHandoff(
  handoffId: string,
  driverId: string
): Promise<ServiceResult<ContractHandoff>> {
  if (!handoffId || !driverId) return err('Handoff ID and driver ID required.');
  try {
    const { data: handoff, error: fetchErr } = await supabase
      .from('contract_handoffs')
      .select('*')
      .eq('id', handoffId)
      .single();

    if (fetchErr || !handoff) return err('Handoff not found.');
    if (handoff.to_driver_id !== driverId) return err('You are not the receiving driver for this handoff.');
    if (handoff.status !== 'pending') return err('This handoff has already been confirmed or cancelled.');

    const { data, error } = await supabase
      .from('contract_handoffs')
      .update({
        status: 'confirmed',
        confirmed_by_to_driver_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', handoffId)
      .select('*')
      .single();

    if (error) return err(error.message || 'Could not confirm handoff.');

    if (handoff.route_id) {
      await supabase
        .from('contract_routes')
        .update({
          assigned_driver_id: handoff.to_driver_id,
          status: 'in_progress',
          available_to_driver_pool: false,
          updated_at: nowIso(),
        })
        .eq('id', handoff.route_id);
    }

    if ((handoff.package_ids ?? []).length > 0) {
      await supabase
        .from('contract_packages')
        .update({
          assigned_driver_id: handoff.to_driver_id,
          current_custody_driver_id: handoff.to_driver_id,
          status: 'picked_up_by_driver',
          updated_at: nowIso(),
        })
        .in('id', handoff.package_ids);
    }

    return ok(data as ContractHandoff);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not confirm handoff.');
  }
}

// ── Earnings (read-only for driver) ──────────────────────────────────────────

export async function getMyContractEarnings(
  driverId: string
): Promise<ServiceResult<ContractEarnings[]>> {
  if (!driverId) return err('Driver ID required.');
  try {
    const { data, error } = await supabase
      .from('contract_driver_earnings')
      .select(
        '*, batch:contract_batches(id, title, batch_code), route:contract_routes(id, title)'
      )
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });

    if (error) return err(error.message || 'Could not load contract earnings.');
    return ok((data ?? []) as ContractEarnings[]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not load contract earnings.');
  }
}

// ── Driver roles ──────────────────────────────────────────────────────────────

export async function getMyContractRoles(
  driverId: string
): Promise<ServiceResult<ContractDriverRole[]>> {
  if (!driverId) return err('Driver ID required.');
  try {
    const { data, error } = await supabase
      .from('contract_driver_roles')
      .select('*')
      .eq('driver_id', driverId)
      .eq('status', 'active')
      .order('assigned_at', { ascending: false });

    if (error) return err(error.message || 'Could not load contract roles.');
    return ok((data ?? []) as ContractDriverRole[]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not load contract roles.');
  }
}

// ── Logistics Lead: batch + rentals ──────────────────────────────────────────

export async function getLeadAssignedBatches(
  driverId: string
): Promise<ServiceResult<ContractBatch[]>> {
  if (!driverId) return err('Driver ID required.');
  try {
    const [directRes, rolesRes] = await Promise.all([
      supabase
        .from('contract_batches')
        .select('*, partner:contract_partners(id, name)')
        .eq('logistics_lead_driver_id', driverId)
        .not('status', 'in', '("closed","cancelled")')
        .order('created_at', { ascending: false }),
      supabase
        .from('contract_driver_roles')
        .select('batch_id')
        .eq('driver_id', driverId)
        .eq('role', 'logistics_lead')
        .eq('status', 'active'),
    ]);

    if (directRes.error) return err(directRes.error.message || 'Could not load lead batches.');

    const roleBatchIds = [...new Set((rolesRes.data ?? []).map((r) => r.batch_id).filter(Boolean))];
    let roleBatches: ContractBatch[] = [];

    if (roleBatchIds.length > 0) {
      const { data: rb } = await supabase
        .from('contract_batches')
        .select('*, partner:contract_partners(id, name)')
        .in('id', roleBatchIds)
        .not('status', 'in', '("closed","cancelled")')
        .order('created_at', { ascending: false });
      roleBatches = (rb ?? []) as ContractBatch[];
    }

    const allBatches = [...(directRes.data ?? []), ...roleBatches] as ContractBatch[];
    const seen = new Set<string>();
    const unique = allBatches.filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });

    return ok(unique);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not load lead batches.');
  }
}

export async function getLeadAssignedRentals(
  driverId: string
): Promise<ServiceResult<ContractRental[]>> {
  if (!driverId) return err('Driver ID required.');
  try {
    const { data, error } = await supabase
      .from('contract_vehicle_rentals')
      .select('*, batch:contract_batches(id, title, batch_code)')
      .or(`assigned_driver_id.eq.${driverId},logistics_lead_driver_id.eq.${driverId}`)
      .not('status', 'in', '("closed","cancelled","returned")')
      .order('created_at', { ascending: false });

    if (error) return err(error.message || 'Could not load assigned vehicles.');
    return ok((data ?? []) as ContractRental[]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not load assigned vehicles.');
  }
}

// ── Rental punch-in / punch-out ───────────────────────────────────────────────
// TODO: pickup_photos and return_photos (string[] columns on contract_vehicle_rentals) are
// not yet written here. Photo capture requires storage bucket upload and is deferred.

export type RentalPunchInPayload = {
  pickup_mileage?: number | null;
  pickup_fuel_level?: string | null;
  pickup_condition_notes?: string | null;
  packages_collected_count?: number;
};

export type RentalPunchOutPayload = {
  return_mileage?: number | null;
  return_fuel_level?: string | null;
  return_condition_notes?: string | null;
  packages_delivered_count?: number;
  packages_failed_count?: number;
  packages_returned_count?: number;
};

export async function punchInRental(
  rentalId: string,
  payload: RentalPunchInPayload = {}
): Promise<ServiceResult<ContractRental>> {
  if (!rentalId) return err('Rental ID required.');
  try {
    const { data, error } = await supabase
      .from('contract_vehicle_rentals')
      .update({
        status: 'in_use',
        pickup_at: nowIso(),
        pickup_mileage: payload.pickup_mileage ?? null,
        pickup_fuel_level: payload.pickup_fuel_level ?? null,
        pickup_condition_notes: payload.pickup_condition_notes ?? null,
        packages_collected_count: payload.packages_collected_count ?? 0,
        updated_at: nowIso(),
      })
      .eq('id', rentalId)
      .select('*, batch:contract_batches(id, title, batch_code)')
      .single();

    if (error) return err(error.message || 'Could not record vehicle pickup.');
    return ok(data as ContractRental);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not record vehicle pickup.');
  }
}

export async function punchOutRental(
  rentalId: string,
  payload: RentalPunchOutPayload = {}
): Promise<ServiceResult<ContractRental>> {
  if (!rentalId) return err('Rental ID required.');
  try {
    const { data, error } = await supabase
      .from('contract_vehicle_rentals')
      .update({
        status: 'returned',
        actual_return_at: nowIso(),
        return_mileage: payload.return_mileage ?? null,
        return_fuel_level: payload.return_fuel_level ?? null,
        return_condition_notes: payload.return_condition_notes ?? null,
        packages_delivered_count: payload.packages_delivered_count ?? 0,
        packages_failed_count: payload.packages_failed_count ?? 0,
        packages_returned_count: payload.packages_returned_count ?? 0,
        updated_at: nowIso(),
      })
      .eq('id', rentalId)
      .select('*, batch:contract_batches(id, title, batch_code)')
      .single();

    if (error) return err(error.message || 'Could not record vehicle return.');
    return ok(data as ContractRental);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not record vehicle return.');
  }
}
