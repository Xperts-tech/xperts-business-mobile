export type UserProfile = {
  id: string;
  role: string;
  full_name: string | null;
  phone: string | null;
};

export type DriverRow = {
  id: string;
  profile_id: string;
  zone_id: string | null;
  phone: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  approval_status: 'pending' | 'approved' | 'rejected' | 'suspended' | string;
  enforcement_status: 'active' | 'suspended' | string;
  online_status: 'online' | 'offline' | 'busy' | string;
  active_order_id: string | null;
  rating: number | null;
  completed_jobs: number | null;
  service_area: string | null;
  corporate_driver_status: 'not_applied' | 'pending' | 'approved' | 'rejected' | 'suspended' | string | null;
  corporate_police_record_expiry: string | null;
  can_deliver_food: boolean | null;
  can_do_errands: boolean | null;
  can_do_courier: boolean | null;
  can_do_rides: boolean | null;
  max_active_orders: number | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  rejected_reason: string | null;
  rejection_notes: string | null;
  more_info_requested_at: string | null;
  more_info_notes: string | null;
  metadata: Record<string, unknown>;
};

export type DriverDocument = {
  id: string;
  driver_id: string;
  document_type: string;
  file_url?: string | null;
  status: 'pending' | 'approved' | 'rejected' | string | null;
  notes: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DriverAvailabilityRow = {
  driver_id: string;
  status: string;
  availability_status: string;
  accepts_delivery: boolean;
  accepts_rides: boolean;
  accepts_courier: boolean;
  accepts_gas: boolean;
  last_whatsapp_command: string | null;
  last_whatsapp_at: string | null;
  updated_at: string | null;
};

export type ServiceAvailabilityFlags = {
  accepts_delivery: boolean;
  accepts_rides: boolean;
  accepts_courier: boolean;
  accepts_gas: boolean;
};

// Roles permitted to use this driver app
export const DRIVER_APP_ROLES = ['driver'] as const;
export type DriverAppRole = typeof DRIVER_APP_ROLES[number];

export function isDriverAppRole(role: string | null | undefined): boolean {
  return DRIVER_APP_ROLES.includes((role ?? '') as DriverAppRole);
}
