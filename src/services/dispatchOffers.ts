import { supabase } from '@/lib/supabase';
import type { AcceptRpcResult, DispatchAttempt, Order } from '@/types/dispatch';

// ── Label maps (mirrors web DriverDashboardPage serviceLabels) ────────────────

const SERVICE_LABELS: Record<string, string> = {
  delivery_food:     'Food Delivery',
  delivery_grocery:  'Grocery Delivery',
  delivery_package:  'Package Delivery',
  send_it:           'Send It Courier',
  cooking_gas:       'Cooking Gas',
  store_order:       'Store Order',
  ride:              'Ride',
  car_rental:        'Car Rental',
  errand:            'Errand',
  senior_care:       'Senior Care',
  provider_service:  'Provider Service',
  business_support:  'Business Support',
};

// ── Pure helpers (ported from web DriverDashboardPage) ────────────────────────

export function getOrderFromAttempt(attempt: DispatchAttempt | null | undefined): Order | null {
  return (attempt as { orders?: Order | null; order?: Order | null })?.orders
    ?? (attempt as { order?: Order | null })?.order
    ?? null;
}

function extractAddress(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          return (
            (parsed.address_line as string) ||
            (parsed.formatted_address as string) ||
            (parsed.label as string) ||
            (parsed.name as string) ||
            (parsed.address as string) ||
            (parsed.street as string) ||
            [parsed.city, parsed.parish, parsed.country].filter(Boolean).join(', ') ||
            null
          );
        }
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

export function getPickup(order: Order | null | undefined): string | null {
  return extractAddress(order?.pickup) ?? extractAddress(order?.pickup_address) ?? null;
}

export function getDropoff(order: Order | null | undefined): string | null {
  return extractAddress(order?.dropoff) ?? extractAddress(order?.dropoff_address) ?? null;
}

export function getStoreName(order: Order | null | undefined): string | null {
  return (
    (order?.metadata?.store_name as string | null) ??
    order?.store_name ??
    order?.business_name ??
    order?.provider_name ??
    null
  );
}

export function getServiceLabel(order: Order | null | undefined): string {
  const key = order?.service_type ?? order?.order_type ?? '';
  return SERVICE_LABELS[key] ?? key ?? 'Delivery';
}

export function getOrderRef(order: Order | null | undefined): string | null {
  if (!order) return null;
  if (order.order_number) return `#${order.order_number}`;
  if (order.id) return `#${String(order.id).slice(0, 8).toUpperCase()}`;
  return null;
}

/**
 * Returns seconds remaining until expiry.
 * Returns Infinity when expires_at is null/undefined (no expiry = never expires).
 */
export function getSecondsRemaining(expiresAt: string | null | undefined, nowMs: number): number {
  if (!expiresAt) return Infinity;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / 1000));
}

export function timeAgoShort(ts: string | null | undefined): string {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Supabase operations ───────────────────────────────────────────────────────

/**
 * Fetches a single dispatch_attempt by ID (any status).
 * Used by IncomingOfferScreen to load the full offer on mount.
 */
export async function fetchOfferById(attemptId: string): Promise<DispatchAttempt | null> {
  const { data, error } = await supabase
    .from('dispatch_attempts')
    .select('*, orders(*)')
    .eq('id', attemptId)
    .maybeSingle();
  if (error || !data) return null;
  return data as DispatchAttempt;
}

/**
 * Calls expire_dispatch_attempt RPC when the client-side countdown reaches zero.
 * Safe to call even if the attempt was already expired by the dispatch-worker —
 * the RPC only updates rows where status='offered'.
 */
export async function expireOffer(attemptId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('expire_dispatch_attempt', {
    p_attempt_id: attemptId,
  });
  return { error: error?.message ?? null };
}

/**
 * Fetches dispatch_attempts for this driver filtered to status='offered'.
 * dispatch_attempts.driver_id = auth.uid() (profiles.id), confirmed in dispatch.ts.
 */
export async function fetchPendingOffers(profileId: string): Promise<DispatchAttempt[]> {
  const { data, error } = await supabase
    .from('dispatch_attempts')
    .select('*, orders(*)')
    .eq('driver_id', profileId)
    .eq('status', 'offered')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as DispatchAttempt[];
}

/**
 * Calls accept_dispatch_attempt RPC — same as the web DriverDashboardPage.
 * RPC handles atomicity: marks attempt accepted, assigns driver to order.
 */
export async function acceptOffer(attemptId: string): Promise<{
  result: AcceptRpcResult | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('accept_dispatch_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) {
    return { result: null, error: friendlyRpcError(error.message, 'accept') };
  }
  return { result: data as AcceptRpcResult, error: null };
}

/**
 * Calls decline_dispatch_attempt RPC — same as the web DriverDashboardPage.
 */
export async function declineOffer(attemptId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('decline_dispatch_attempt', {
    p_attempt_id: attemptId,
    p_note: 'Declined by driver',
  });
  if (error) {
    return { error: friendlyRpcError(error.message, 'decline') };
  }
  return { error: null };
}

function friendlyRpcError(message: string, action: string): string {
  const m = message.toLowerCase();
  if (m.includes('not found') || m.includes('no rows')) {
    return 'This offer is no longer available.';
  }
  if (m.includes('already') || m.includes('taken')) {
    return 'Another driver already accepted this order.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return `No connection. Could not ${action}. Try again.`;
  }
  return `Could not ${action} this offer. Please try again.`;
}
