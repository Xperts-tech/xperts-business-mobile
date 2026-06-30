import { supabase } from '@/lib/supabase';
import type { ActiveOrder, OrderItem } from '@/types/order';

// Mirrors DRIVER_ACTIVE_STATUSES from web driverService.js
export const DRIVER_ACTIVE_STATUSES = [
  'accepted',
  'accepted_by_driver',
  'assigned',
  'assigned_to_driver',
  'driver_assigned',
  'en_route_to_pickup',
  'arrived_at_pickup',
  'driver_arriving',
  'picked_up',
  'rider_picked_up',
  'en_route_to_dropoff',
  'in_progress',
  'on_the_way',
  'delivered',
] as const;

// ── Display helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  accepted:            'Accepted',
  accepted_by_driver:  'Accepted',
  assigned:            'Assigned',
  assigned_to_driver:  'Assigned to driver',
  driver_assigned:     'Driver assigned',
  en_route_to_pickup:  'En route to pickup',
  arrived_at_pickup:   'Arrived at pickup',
  driver_arriving:     'Driver arriving',
  picked_up:           'Picked up',
  rider_picked_up:     'Rider picked up',
  en_route_to_dropoff: 'En route to drop-off',
  in_progress:         'In progress',
  on_the_way:          'On the way',
  delivered:           'Delivered',
  completed:           'Completed',
  cancelled:           'Cancelled',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  store:           'Store Order',
  food:            'Food Delivery',
  grocery:         'Grocery Delivery',
  package:         'Package Delivery',
  send_it:         'Send It Courier',
  ride:            'Ride',
  errand:          'Errand',
  service_booking: 'Service Booking',
  business_support:'Business Support',
  gas:             'Cooking Gas',
  water_refill:    'Water Refill',
  delivery_food:   'Food Delivery',
  delivery_grocery:'Grocery Delivery',
  delivery_package:'Package Delivery',
  store_order:     'Store Order',
  cooking_gas:     'Cooking Gas',
  car_rental:      'Car Rental',
  senior_care:     'Senior Care',
  provider_service:'Provider Service',
  errand_service:  'Errand',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export function orderTypeLabel(order: ActiveOrder): string {
  const key = order.order_type ?? order.service_type ?? '';
  return ORDER_TYPE_LABELS[key] ?? (key ? key.replace(/_/g, ' ') : 'Xperts Order');
}

export function orderRef(order: ActiveOrder): string {
  if (order.order_number) return `#${order.order_number}`;
  return `#${String(order.id).slice(0, 8).toUpperCase()}`;
}

// Mirrors the parseAddress / getPickupAddress / getDropoffAddress utilities
// from DriverActiveOrderPage — same fallback chain.
function extractAddress(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        return (
          (parsed.address_line as string) ||
          (parsed.formatted_address as string) ||
          (parsed.label as string) ||
          (parsed.name as string) ||
          (parsed.address as string) ||
          (parsed.full_address as string) ||
          (parsed.street as string) ||
          [parsed.city, parsed.parish, parsed.country].filter(Boolean).join(', ') ||
          null
        );
      } catch { /* not JSON — return raw */ }
    }
    return trimmed;
  }
  if (typeof val === 'object') {
    const o = val as Record<string, unknown>;
    return (
      (o.address_line as string) ||
      (o.formatted_address as string) ||
      (o.label as string) ||
      (o.name as string) ||
      (o.address as string) ||
      (o.full_address as string) ||
      (o.street as string) ||
      [o.city, o.parish, o.country].filter(Boolean).join(', ') ||
      null
    );
  }
  return null;
}

export function pickupAddress(order: ActiveOrder): string | null {
  return extractAddress(order.pickup_address) ?? extractAddress(order.pickup) ?? null;
}

export function dropoffAddress(order: ActiveOrder): string | null {
  return extractAddress(order.dropoff_address) ?? extractAddress(order.dropoff) ?? null;
}

// Returns { address, lat, lng } from a raw pickup/dropoff field.
// Used by navigation buttons so lat/lng can be passed to Maps/Waze for precision.
export type NavLocation = { address: string | null; lat: number | null; lng: number | null };

function extractLatLng(obj: Record<string, unknown>): { lat: number | null; lng: number | null } {
  const lat = obj.lat ?? obj.latitude;
  const lng = obj.lng ?? obj.longitude;
  const latNum = lat != null ? Number(lat) : null;
  const lngNum = lng != null ? Number(lng) : null;
  return {
    lat: latNum != null && !isNaN(latNum) ? latNum : null,
    lng: lngNum != null && !isNaN(lngNum) ? lngNum : null,
  };
}

export function extractNavLocation(val: unknown): NavLocation {
  if (!val) return { address: null, lat: null, lng: null };

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        return { address: extractAddress(parsed), ...extractLatLng(parsed) };
      } catch { /* fall through */ }
    }
    return { address: trimmed || null, lat: null, lng: null };
  }

  if (typeof val === 'object') {
    const o = val as Record<string, unknown>;
    return { address: extractAddress(o), ...extractLatLng(o) };
  }

  return { address: null, lat: null, lng: null };
}

export function pickupNavLocation(order: ActiveOrder): NavLocation {
  const fromAddress = extractNavLocation(order.pickup_address);
  if (fromAddress.address || fromAddress.lat != null) return fromAddress;
  return extractNavLocation(order.pickup);
}

export function dropoffNavLocation(order: ActiveOrder): NavLocation {
  const fromAddress = extractNavLocation(order.dropoff_address);
  if (fromAddress.address || fromAddress.lat != null) return fromAddress;
  return extractNavLocation(order.dropoff);
}

export function storeName(order: ActiveOrder): string | null {
  return (
    order.store_name ??
    order.business_name ??
    order.provider_name ??
    (order.metadata?.store_name as string | null) ??
    (order.metadata?.business_name as string | null) ??
    null
  );
}

export function customerName(order: ActiveOrder): string | null {
  return (
    order.customer_name ??
    order.contact_name ??
    order.contact_details?.name ??
    null
  );
}

export function customerPhone(order: ActiveOrder): string | null {
  return order.customer_phone ?? order.contact_phone ?? order.contact_details?.phone ?? null;
}

export function itemDisplayName(item: OrderItem): string {
  return item.name ?? item.item_name ?? 'Item';
}

export function itemQty(item: OrderItem): number | null {
  return item.quantity ?? item.qty ?? null;
}

export function itemVariantLabel(item: OrderItem): string | null {
  const v = item.metadata?.selected_variant;
  if (!v) return null;
  if (typeof v === 'object' && v.variant_label) return v.variant_label;
  if (typeof v === 'string') return v;
  return null;
}

export function itemModifiers(item: OrderItem): string | null {
  const mods = item.metadata?.selected_modifiers;
  if (!Array.isArray(mods) || mods.length === 0) return null;
  return mods.map((m) => m.option_name ?? m.name ?? '').filter(Boolean).join(', ');
}

export function itemNote(item: OrderItem): string | null {
  return (
    item.notes ??
    item.metadata?.note ??
    item.metadata?.special_instruction ??
    null
  );
}

export function itemVariantFull(item: OrderItem): string | null {
  const parts = [itemVariantLabel(item), itemModifiers(item)].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function itemBackup(item: OrderItem): string | null {
  return (
    item.backup_option ??
    item.second_choice ??
    item.metadata?.backup_item_name ??
    null
  );
}

export function orderNotes(order: ActiveOrder): string | null {
  return (
    order.notes ??
    order.delivery_note ??
    (order.metadata?.special_instructions as string | null) ??
    (order.metadata?.delivery_note as string | null) ??
    (order.metadata?.notes as string | null) ??
    null
  );
}

// ── Status colour group ───────────────────────────────────────────────────────
// Returns a semantic token so the screen can pick colours without knowing statuses.
export type StatusGroup = 'pending' | 'enroute' | 'active' | 'nearend' | 'done';

export function statusGroup(status: string): StatusGroup {
  if (['accepted', 'accepted_by_driver', 'assigned', 'assigned_to_driver', 'driver_assigned'].includes(status))
    return 'pending';
  if (['en_route_to_pickup', 'arrived_at_pickup', 'driver_arriving'].includes(status))
    return 'enroute';
  if (['in_progress'].includes(status))
    return 'active';
  if (['picked_up', 'rider_picked_up', 'en_route_to_dropoff', 'on_the_way'].includes(status))
    return 'nearend';
  if (['delivered', 'completed'].includes(status))
    return 'done';
  return 'pending';
}

// ── Action button logic ───────────────────────────────────────────────────────
// Mirrors the handler wiring in DriverActiveOrderPage.jsx (resolveMissionState handlers).
// Three steps the user spec requires for Step 7.

export type ActionButton = {
  label: string;
  nextStatus: string;
  nextDriverStage: string;
  description: string;
  tone: 'brand' | 'info' | 'success';
};

const PRE_PICKUP  = new Set(['accepted', 'accepted_by_driver', 'assigned', 'assigned_to_driver', 'driver_assigned', 'en_route_to_pickup', 'driver_arriving']);
const AT_PICKUP   = new Set(['in_progress', 'arrived_at_pickup']);
const IN_TRANSIT  = new Set(['picked_up', 'rider_picked_up', 'en_route_to_dropoff', 'on_the_way']);
const DONE        = new Set(['delivered', 'completed']);

// Exported so the screen can show the proof-of-delivery card for these statuses
export const IN_TRANSIT_STATUSES = IN_TRANSIT;

export function getActionButton(status: string): ActionButton | null {
  if (PRE_PICKUP.has(status)) {
    return {
      label: 'Arrived at Pickup',
      nextStatus: 'in_progress',
      nextDriverStage: 'arrived_at_pickup',
      description: 'Driver arrived at pickup location',
      tone: 'brand',
    };
  }
  if (AT_PICKUP.has(status)) {
    return {
      label: 'Mark Picked Up',
      nextStatus: 'picked_up',
      nextDriverStage: 'items_collected',
      description: 'Driver collected order, heading to customer',
      tone: 'info',
    };
  }
  if (IN_TRANSIT.has(status)) {
    return {
      label: 'Mark Delivered',
      nextStatus: 'delivered',
      nextDriverStage: 'delivered',
      description: 'Driver confirmed delivery to customer',
      tone: 'success',
    };
  }
  if (DONE.has(status)) return null; // completion banner shown instead
  return null;
}

export function isOrderDone(status: string): boolean {
  return DONE.has(status);
}

// ── Status advancement ────────────────────────────────────────────────────────
// Mirrors advanceOrderStage() in DriverActiveOrderPage.jsx:
//   1. UPDATE orders SET status, driver_status, metadata (merged), updated_at
//   2. INSERT order_timeline_events with event_type="driver_stage"
// Uses a direct table update — no RPC — same as the web.

export async function advanceOrderStage({
  orderId,
  userId,
  currentMetadata,
  currentStatus,
  nextStatus,
  nextDriverStage,
  description,
}: {
  orderId: string;
  userId: string;
  currentMetadata: Record<string, unknown> | null | undefined;
  currentStatus: string;
  nextStatus: string | null;
  nextDriverStage: string;
  description: string;
}): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  const newMetadata: Record<string, unknown> = {
    ...(currentMetadata ?? {}),
    driver_stage: nextDriverStage,
  };

  // nextStatus === null means metadata-only update (e.g. "arrived_at_customer")
  const payload: Record<string, unknown> = { metadata: newMetadata, updated_at: now };
  if (nextStatus != null) {
    payload.status = nextStatus;
    payload.driver_status = nextStatus;
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update(payload)
    .eq('id', orderId);

  if (updateError) {
    const m = updateError.message.toLowerCase();
    if (m.includes('permission') || m.includes('policy') || m.includes('rls')) {
      return { error: 'Permission denied. You may not be assigned to this order.' };
    }
    if (m.includes('network') || m.includes('fetch')) {
      return { error: 'No connection. Check your internet and try again.' };
    }
    return { error: 'Could not update order status. Please try again.' };
  }

  // Non-fatal timeline event — same as web (insert after update, no blocking)
  void (async () => {
    try {
      await supabase.from('order_timeline_events').insert({
        order_id:   orderId,
        actor_id:   userId,
        event_type: 'driver_stage',
        title:      description,
        description,
        metadata: {
          driver_stage: nextDriverStage,
          order_status: nextStatus ?? currentStatus,
        },
      });
    } catch { /* timeline insert failure never blocks the driver */ }
  })();

  return { error: null };
}

// ── Item verification ─────────────────────────────────────────────────────────
// Mirrors verifyOrderItem() in web driverService.js — uses the same
// SECURITY DEFINER RPC (driver_update_order_item_verification) because
// order_items has no driver UPDATE RLS policy.
//
// status values: pending | verified | removed | admin_reported | ...
// resolutionType values: verified | remove_item | report_admin | ...

export async function verifyItem({
  orderId,
  itemId,
  status,
  resolutionType,
  payload = {},
}: {
  orderId: string;
  itemId: string;
  status: string;
  resolutionType: string | null;
  payload?: Record<string, unknown>;
}): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('driver_update_order_item_verification', {
    p_order_id:              orderId,
    p_order_item_id:         itemId,
    p_verification_status:   status,
    p_resolution_type:       resolutionType,
    p_resolution_payload:    payload,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('not found') || m.includes('no rows'))
      return { error: 'Item not found. Refresh and try again.' };
    if (m.includes('permission') || m.includes('policy'))
      return { error: 'Permission denied for this item.' };
    return { error: 'Could not save item update. Try again.' };
  }
  const result = data as { success?: boolean; error?: string } | null;
  if (result?.success === false) {
    return { error: result.error ?? 'Could not save item update. Try again.' };
  }
  return { error: null };
}

// Which statuses show the item-verification section (driver is at the store)
export const AT_PICKUP_STATUSES = new Set(['in_progress', 'arrived_at_pickup']);

// ── Mission stepper ───────────────────────────────────────────────────────────
// Mirrors missionStateResolver.js (web source of truth)

export const MISSION_STEPS_PARTNER = [
  { key: 'accept',   label: 'Accept' },
  { key: 'go_store', label: 'Go to store' },
  { key: 'verify',   label: 'Verify items' },
  { key: 'deliver',  label: 'Deliver' },
  { key: 'complete', label: 'Complete' },
] as const;

export const MISSION_STEPS_NON_PARTNER = [
  { key: 'accept',      label: 'Accept' },
  { key: 'go_store',    label: 'Go to store' },
  { key: 'place_order', label: 'Place order' },
  { key: 'verify',      label: 'Verify items' },
  { key: 'deliver',     label: 'Deliver' },
  { key: 'complete',    label: 'Complete' },
] as const;

function normalizeForStepper(status: string): string {
  const assignedSet = new Set(['accepted', 'accepted_by_driver', 'assigned', 'assigned_to_driver',
    'driver_assigned', 'en_route_to_pickup', 'arrived_at_pickup', 'driver_arriving']);
  if (assignedSet.has(status)) return 'assigned';
  if (['picked_up', 'rider_picked_up', 'en_route_to_dropoff'].includes(status)) return 'picked_up';
  return status;
}

export function getMissionStepIndex(status: string, isNonPartner: boolean, storeOrderPlaced: boolean): number {
  switch (normalizeForStepper(status)) {
    case 'assigned': return 1;
    case 'in_progress':
      if (isNonPartner && !storeOrderPlaced) return 2;
      return isNonPartner ? 3 : 2;
    case 'picked_up':
    case 'on_the_way':
    case 'delivered':
      return isNonPartner ? 4 : 3;
    case 'completed':
      return isNonPartner ? 5 : 4;
    default: return 1;
  }
}

// ── Issue report ──────────────────────────────────────────────────────────────
// Inserts into order_timeline_events — same table/pattern as web handleIssueSubmit.
export async function submitIssueReport(
  orderId: string,
  userId: string,
  driverId: string | null,
  reason: string,
  note: string,
): Promise<{ error: string | null }> {
  const description = note.trim() ? `${reason}: ${note.trim()}` : reason;
  const { error } = await supabase.from('order_timeline_events').insert({
    order_id:   orderId,
    actor_id:   userId,
    event_type: 'issue_reported',
    title:      `Issue reported: ${reason}`,
    description,
    metadata: {
      reason,
      note:      note.trim() || '',
      driver_id: driverId,
      source:    'mobile_driver_active_order',
    },
  });
  if (error) return { error: error.message || 'Unable to report issue.' };
  return { error: null };
}

// ── Non-partner: mark store order placed ──────────────────────────────────────
// Mirrors markStoreOrderPlaced() in web driverService.js.
// RPC re-validates ownership, active status, and non-partner flag server-side.
export async function markStoreOrderPlaced(orderId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('driver_mark_store_order_placed', {
    p_order_id: orderId,
    p_payload:  {},
  });
  if (error) return { error: error.message || 'Could not confirm order placement.' };
  const result = data as { success?: boolean; error?: string } | null;
  if (result?.success === false) return { error: result.error ?? 'Could not confirm order placement.' };
  return { error: null };
}

// ── Cash collection confirmation ──────────────────────────────────────────────
// Mirrors driverConfirmCashCollected() / markCashCollectedPendingAdmin() in web
// paymentTrackingService.js. Patches orders.payment_status and orders.metadata.payment
// then inserts a non-blocking order_timeline_events record.
export async function confirmCashCollected(
  orderId: string,
  driverId: string | null,
  collectedAmount: number,
): Promise<{ error: string | null }> {
  const { data: current, error: fetchErr } = await supabase
    .from('orders')
    .select('metadata')
    .eq('id', orderId)
    .single();

  if (fetchErr) return { error: 'Unable to read order.' };

  const existingMeta = (current as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
  const existingPayment = (existingMeta.payment as Record<string, unknown>) ?? {};
  const now = new Date().toISOString();

  const mergedPayment: Record<string, unknown> = {
    ...existingPayment,
    status: 'cash_collected_pending_admin',
    cash_collected_by_driver: driverId,
    cash_collected_amount: Number(collectedAmount),
    cash_collection_status: 'driver_confirmed',
    cash_collected_at: now,
    updated_at: now,
  };
  const mergedMeta: Record<string, unknown> = { ...existingMeta, payment: mergedPayment };

  const { error: updateErr } = await supabase
    .from('orders')
    .update({ payment_status: 'cash_collected_pending_admin', metadata: mergedMeta, updated_at: now })
    .eq('id', orderId);

  if (updateErr) return { error: 'Unable to update payment status.' };

  void (async () => {
    try {
      await supabase.from('order_timeline_events').insert({
        order_id:   orderId,
        actor_id:   driverId,
        event_type: 'cash_collected_pending_admin',
        title:      'Cash collected by driver — awaiting admin settlement',
        description: `Cash collected (${collectedAmount}) by driver — awaiting admin settlement for order ${orderId}`,
        metadata:   { order_id: orderId },
      });
    } catch { /* non-blocking */ }
  })();

  return { error: null };
}

// ── Supabase fetch ────────────────────────────────────────────────────────────

export async function fetchActiveOrder(driverRowId: string): Promise<{
  order: ActiveOrder | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('assigned_driver_id', driverRowId)
    .in('status', DRIVER_ACTIVE_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { order: null, error: 'Unable to load active order.' };
  }

  if (!data) {
    return { order: null, error: null };
  }

  // order_items lives in a separate table — same pattern as web driverService.js
  const { data: itemsData } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', (data as { id: string }).id)
    .order('created_at', { ascending: true });

  // Mirrors driverService.js Batch 8/9: load purchase record + approval request
  const { data: purchaseRecord } = await supabase
    .from('order_purchase_records')
    .select('*')
    .eq('order_id', (data as { id: string }).id)
    .maybeSingle();

  const { data: approvalRequest } = await supabase
    .from('order_purchase_approval_requests')
    .select('*')
    .eq('order_id', (data as { id: string }).id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const order: ActiveOrder = {
    ...(data as Omit<ActiveOrder, 'items' | 'purchase_record' | 'purchase_approval_request'>),
    items: (itemsData ?? []) as OrderItem[],
    purchase_record: (purchaseRecord ?? null) as ActiveOrder['purchase_record'],
    purchase_approval_request: (approvalRequest ?? null) as ActiveOrder['purchase_approval_request'],
  };

  return { order, error: null };
}
