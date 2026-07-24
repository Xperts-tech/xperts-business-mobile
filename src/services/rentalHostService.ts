import { supabase } from '@/lib/supabase';

// Business-app host/provider side of car rentals. Reuses the rental_* backend (same
// tables as the web vehicleNetworkService). A host is a rental_partner the current
// user owns (via rental_partner_users). Approving a booking + acknowledging payment
// mirror the web provider flow. Payout of hosts flows through rental_provider_payouts
// + the payout/bank system.

export interface PartnerAccess {
  partner_id: string;
  company_name: string;
  approval_status: string;
  role: string;
}

export interface HostVehicle {
  id: string; make: string; model: string; year: number | null;
  plate_number: string | null; vehicle_type: string | null; colour: string | null;
  daily_rate: number | null; deposit_amount: number | null; status: string;
  is_active: boolean; main_image_url: string | null; photo_urls: string[] | null;
}

export interface HostBooking {
  id: string; rental_vehicle_id: string | null; requester_name: string | null;
  requester_phone: string | null; requested_start_at: string; requested_end_at: string;
  pickup_location: string | null; estimated_days: number | null; estimated_total: number | null;
  provider_deposit_amount: number | null; status: string; provider_decision: string;
  payment_status: string | null; verification_status: string | null; created_at: string;
}

/** The current user's host access (null if not a host yet). */
export async function getMyHostAccess(): Promise<PartnerAccess | null> {
  const { data } = await supabase
    .from('rental_partner_users')
    .select('partner_id, role, status, is_active, partner:rental_partners(id, company_name, approval_status)')
    .eq('status', 'active')
    .maybeSingle();
  const row = data as { partner_id: string; role: string; partner: { company_name: string; approval_status: string } | null } | null;
  if (!row?.partner) return null;
  return { partner_id: row.partner_id, company_name: row.partner.company_name, approval_status: row.partner.approval_status, role: row.role };
}

export async function applyAsHost(kind: 'individual' | 'company', fields: Record<string, string>): Promise<{ ok: boolean; reason?: string; partnerId?: string }> {
  const { data, error } = await supabase.rpc('apply_as_rental_host', { p_kind: kind, p_fields: fields });
  if (error) return { ok: false, reason: error.message };
  const res = data as { ok: boolean; reason?: string; partner_id?: string };
  return res.ok ? { ok: true, partnerId: res.partner_id } : { ok: false, reason: res.reason };
}

// ── Vehicles ────────────────────────────────────────────────────────────────────
export async function listMyVehicles(partnerId: string): Promise<HostVehicle[]> {
  const { data } = await supabase.from('rental_vehicles')
    .select('id, make, model, year, plate_number, vehicle_type, colour, daily_rate, deposit_amount, status, is_active, main_image_url, photo_urls')
    .eq('partner_id', partnerId).order('created_at', { ascending: false });
  return (data as HostVehicle[]) ?? [];
}

export async function saveVehicle(partnerId: string, v: Partial<HostVehicle> & { id?: string }): Promise<{ ok: boolean; reason?: string; id?: string }> {
  const body: Record<string, unknown> = {
    make: v.make, model: v.model, year: v.year ?? null, plate_number: v.plate_number ?? null,
    vehicle_type: v.vehicle_type ?? null, colour: v.colour ?? null,
    daily_rate: v.daily_rate ?? null, deposit_amount: v.deposit_amount ?? null,
    status: v.status ?? 'available', is_active: v.is_active ?? true,
  };
  if (v.id) {
    const { error } = await supabase.from('rental_vehicles').update(body).eq('id', v.id);
    return error ? { ok: false, reason: error.message } : { ok: true, id: v.id };
  }
  const { data, error } = await supabase.from('rental_vehicles').insert({ ...body, partner_id: partnerId, owner_type: 'individual' }).select('id').single();
  return error ? { ok: false, reason: error.message } : { ok: true, id: (data as { id: string }).id };
}

/** Upload a vehicle photo to the public vehicle-assets bucket; sets it as main. */
export async function uploadVehiclePhoto(vehicleId: string, uri: string): Promise<{ ok: boolean; url?: string }> {
  try {
    const resp = await fetch(uri); const blob = await resp.blob();
    const path = `${vehicleId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('vehicle-assets').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
    if (error) return { ok: false };
    const { data: pub } = supabase.storage.from('vehicle-assets').getPublicUrl(path);
    const url = pub.publicUrl;
    await supabase.from('rental_vehicles').update({ main_image_url: url }).eq('id', vehicleId);
    return { ok: true, url };
  } catch { return { ok: false }; }
}

export async function addAvailabilityBlock(vehicleId: string, startISO: string, endISO: string, reason?: string): Promise<boolean> {
  const { error } = await supabase.from('rental_vehicle_availability_blocks').insert({
    rental_vehicle_id: vehicleId, start_at: startISO, end_at: endISO, reason: reason ?? 'blocked',
  });
  return !error;
}

// ── Booking requests ────────────────────────────────────────────────────────────
export async function listBookingRequests(partnerId: string): Promise<HostBooking[]> {
  const { data } = await supabase.from('rental_booking_requests')
    .select('id, rental_vehicle_id, requester_name, requester_phone, requested_start_at, requested_end_at, pickup_location, estimated_days, estimated_total, provider_deposit_amount, status, provider_decision, payment_status, verification_status, created_at')
    .eq('rental_partner_id', partnerId).order('created_at', { ascending: false });
  return (data as HostBooking[]) ?? [];
}

export async function decideBooking(requestId: string, action: 'approve' | 'reject', reason?: string): Promise<boolean> {
  const patch = action === 'approve'
    ? { provider_decision: 'approved', status: 'approved', updated_at: new Date().toISOString() }
    : { provider_decision: 'rejected', status: 'declined', rejection_reason: reason ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('rental_booking_requests').update(patch).eq('id', requestId);
  return !error;
}

/** Acknowledge that the host received a submitted payment for a booking. */
export async function acknowledgePayment(bookingId: string, providerReference?: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error: pErr } = await supabase.from('rental_booking_payments')
    .update({ payment_status: 'confirmed', provider_reference: providerReference ?? null, collected_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq('rental_booking_request_id', bookingId).eq('payment_status', 'submitted');
  if (pErr) return false;
  const { error: bErr } = await supabase.from('rental_booking_requests')
    .update({ payment_status: 'paid', status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', bookingId);
  return !bErr;
}
