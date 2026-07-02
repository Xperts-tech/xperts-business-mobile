export interface UserProfile {
  id: string;
  role: string;
  full_name: string | null;
  phone: string | null;
  email?: string | null;
}

export interface Business {
  id: string;
  name: string;
  owner_id: string | null;
  approval_status: string | null;
  status: string | null;
  business_type: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Store {
  id: string;
  business_id: string | null;
  name: string;
  slug: string | null;
  cover_url: string | null;
  description: string | null;
  is_approved: boolean | null;
  approval_status: string | null;
  deleted_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface BusinessStaffMembership {
  id: string;
  business_id: string;
  store_id: string | null;
  profile_id: string | null;
  email: string | null;
  full_name: string | null;
  role: string;
  status: string;
  accepted_at: string | null;
  invite_expires_at: string | null;
}
