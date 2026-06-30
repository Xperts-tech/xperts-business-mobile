import { supabase } from '@/lib/supabase';

export type ApplicationFormData = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  serviceArea: string;
  vehicleType: string;
  vehiclePlate: string;
  canDeliverFood: boolean;
  canDoErrands: boolean;
  canDoCourier: boolean;
};

export type RegisterResult = {
  error: string | null;
  /** true when Supabase requires email confirmation before sign-in works */
  needsEmailConfirmation: boolean;
};

export async function registerDriverApplicant(
  data: ApplicationFormData,
): Promise<RegisterResult> {
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: data.email.trim().toLowerCase(),
    password: data.password,
    options: {
      data: {
        full_name: data.fullName.trim(),
        phone: data.phone.trim() || null,
      },
      emailRedirectTo: 'xperts-driver://auth/callback',
    },
  });

  if (signUpError) {
    return { error: friendlySignUpError(signUpError.message), needsEmailConfirmation: false };
  }

  const userId = authData.user?.id;
  if (!userId) {
    return { error: 'Registration failed. Please try again.', needsEmailConfirmation: false };
  }

  if (!authData.session) {
    // Email confirmation is required. A DB trigger may create the profiles row from
    // raw_user_meta_data. The drivers row will be created by Xperts staff or on next sign-in.
    return { error: null, needsEmailConfirmation: true };
  }

  // Session available — create profiles + drivers rows directly.
  const rowErr = await createDriverRows(userId, data);
  if (rowErr) return { error: rowErr, needsEmailConfirmation: false };

  return { error: null, needsEmailConfirmation: false };
}

async function createDriverRows(
  userId: string,
  data: ApplicationFormData,
): Promise<string | null> {
  const { error: profileErr } = await supabase.from('profiles').insert({
    id: userId,
    role: 'driver',
    full_name: data.fullName.trim(),
    phone: data.phone.trim() || null,
  });

  // 23505 = unique_violation: row already exists (possibly from a DB trigger) — fine.
  if (profileErr && profileErr.code !== '23505') {
    return 'Could not save your profile. Please contact Xperts support.';
  }

  const { error: driverErr } = await supabase.from('drivers').insert({
    profile_id: userId,
    phone: data.phone.trim() || null,
    vehicle_type: data.vehicleType.trim() || null,
    vehicle_plate: data.vehiclePlate.trim() || null,
    service_area: data.serviceArea.trim() || null,
    can_deliver_food: data.canDeliverFood,
    can_do_errands: data.canDoErrands,
    can_do_courier: data.canDoCourier,
    can_do_rides: false,
    approval_status: 'pending',
    enforcement_status: 'active',
    online_status: 'offline',
  });

  if (driverErr && driverErr.code !== '23505') {
    return 'Could not save your driver profile. Please contact Xperts support.';
  }

  return null;
}

function friendlySignUpError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes('already registered') ||
    m.includes('user already') ||
    m.includes('already exists')
  ) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (m.includes('password') && (m.includes('length') || m.includes('short') || m.includes('weak'))) {
    return 'Password must be at least 6 characters.';
  }
  if (m.includes('invalid email') || m.includes('email format') || m.includes('valid email')) {
    return 'Please enter a valid email address.';
  }
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to fetch')) {
    return 'No connection. Check your internet and try again.';
  }
  return 'Registration failed. Please try again.';
}
