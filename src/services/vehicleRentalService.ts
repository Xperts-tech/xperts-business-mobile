import { supabase } from '@/lib/supabase';

export type RentalRequestStatus =
  | 'requested'
  | 'awaiting_eligibility'
  | 'awaiting_provider_approval'
  | 'approved'
  | 'declined'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled';

export type RentalProgramRequest = {
  id: string;
  requester_user_id: string;
  driver_id: string | null;
  program_type: string;
  requested_vehicle_type: string | null;
  use_case: string | null;
  requested_start_at: string | null;
  estimated_days: number;
  pickup_location: string | null;
  return_location: string | null;
  status: RentalRequestStatus | string;
  eligibility_status: string | null;
  rejection_reason: string | null;
  provider_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EligibilityResult = {
  eligible: boolean;
  reason: string | null;
};

export function checkEligibility(
  approvalStatus: string,
  enforcementStatus: string,
): EligibilityResult {
  if (enforcementStatus === 'suspended') {
    return { eligible: false, reason: 'Your account is suspended. Contact Xperts support.' };
  }
  if (approvalStatus !== 'approved') {
    return {
      eligible: false,
      reason: 'Your driver account must be fully approved to apply for vehicle rentals.',
    };
  }
  return { eligible: true, reason: null };
}

export type RentalRequestPayload = {
  requestedVehicleType: string;
  useCase: string;
  requestedStartAt: string;
  estimatedDays: number;
  pickupLocation?: string;
  returnLocation?: string;
};

export async function submitRentalRequest(
  userId: string,
  driverRowId: string,
  payload: RentalRequestPayload,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('rental_program_requests').insert({
    requester_user_id:      userId,
    requester_type:         'driver',
    driver_id:              driverRowId,
    program_type:           'driver_delivery_rental',
    requested_vehicle_type: payload.requestedVehicleType.trim() || null,
    use_case:               payload.useCase.trim() || null,
    requested_start_at:     payload.requestedStartAt || null,
    estimated_days:         payload.estimatedDays,
    pickup_location:        payload.pickupLocation?.trim() || null,
    return_location:        payload.returnLocation?.trim() || null,
    status:                 'requested',
    updated_at:             new Date().toISOString(),
  });
  if (error) return { error: 'Failed to submit request. Please try again.' };
  return { error: null };
}

export async function listMyRentalRequests(userId: string): Promise<{
  requests: RentalProgramRequest[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('rental_program_requests')
    .select(
      'id, requester_user_id, driver_id, program_type, requested_vehicle_type, use_case, requested_start_at, estimated_days, pickup_location, return_location, status, eligibility_status, rejection_reason, provider_notes, created_at, updated_at',
    )
    .eq('requester_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') return { requests: [], error: null };
    return { requests: [], error: 'Unable to load rental requests.' };
  }
  return { requests: (data ?? []) as RentalProgramRequest[], error: null };
}
