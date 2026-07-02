import { supabase } from '@/lib/supabase';

export interface StaffMember {
  id: string;
  business_id: string;
  store_id?: string | null;
  profile_id?: string | null;
  email: string;
  full_name?: string | null;
  role: string;
  status: 'active' | 'invited' | 'suspended' | 'pending';
  accepted_at?: string | null;
  invite_expires_at?: string | null;
  created_at?: string | null;
}

export async function loadStaff(
  businessId: string,
): Promise<{ staff: StaffMember[]; error: string | null }> {
  const { data, error } = await supabase
    .from('business_staff')
    .select(
      'id, business_id, store_id, profile_id, email, full_name, role, status, accepted_at, invite_expires_at, created_at',
    )
    .eq('business_id', businessId)
    .in('status', ['active', 'invited', 'pending', 'suspended'])
    .order('status', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return { staff: [], error: error.message };
  return { staff: (data ?? []) as StaffMember[], error: null };
}

export function getStaffStatusColor(status: StaffMember['status']): string {
  switch (status) {
    case 'active': return '#16A34A';
    case 'invited':
    case 'pending': return '#D97706';
    case 'suspended': return '#DC2626';
    default: return '#8FA3BA';
  }
}

export function getStaffStatusLabel(status: StaffMember['status']): string {
  switch (status) {
    case 'active': return 'Active';
    case 'invited': return 'Invited';
    case 'pending': return 'Pending';
    case 'suspended': return 'Suspended';
    default: return status;
  }
}
