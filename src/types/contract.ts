export type ContractBatchRef = {
  id: string;
  title: string;
  batch_code: string | null;
  status?: string;
  delivery_deadline_at?: string | null;
};

export type ContractRoute = {
  id: string;
  batch_id: string;
  title: string;
  zone: string | null;
  pickup_location: string | null;
  assigned_driver_id: string | null;
  package_count: number;
  estimated_earnings: number;
  status: string;
  available_to_driver_pool: boolean;
  requires_admin_approval: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  batch?: ContractBatchRef;
};

export type ContractPackage = {
  id: string;
  batch_id: string;
  tracking_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  zone: string | null;
  package_size: string | null;
  assigned_driver_id: string | null;
  current_custody_driver_id: string | null;
  status: string;
  proof_photo_url: string | null;
  failure_reason: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ContractHandoff = {
  id: string;
  batch_id: string;
  route_id: string | null;
  from_driver_id: string | null;
  to_driver_id: string | null;
  package_count: number;
  package_ids: string[];
  pickup_location: string | null;
  proof_photo_url: string | null;
  status: string;
  confirmed_by_from_driver_at: string | null;
  confirmed_by_to_driver_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  route?: { id: string; title: string; zone: string | null; package_count: number };
  batch?: ContractBatchRef;
};

export type ContractEarnings = {
  id: string;
  batch_id: string | null;
  route_id: string | null;
  driver_id: string;
  packages_assigned: number;
  packages_delivered: number;
  packages_failed_with_proof: number;
  packages_returned: number;
  base_pay: number;
  per_package_pay: number;
  bonus_amount: number;
  deduction_amount: number;
  total_earnings: number;
  status: string;
  wallet_ledger_entry_id: string | null;
  wallet_synced_at: string | null;
  wallet_sync_status: 'unsynced' | 'synced' | 'sync_failed' | 'reversed';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  batch?: ContractBatchRef;
  route?: { id: string; title: string };
};

export type ContractDriverRole = {
  id: string;
  driver_id: string;
  batch_id: string;
  role: string;
  permissions: Record<string, boolean>;
  status: string;
  assigned_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractRental = {
  id: string;
  batch_id: string | null;
  route_id: string | null;
  rental_company_name: string;
  rental_company_contact: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  assigned_driver_id: string | null;
  logistics_lead_driver_id: string | null;
  pickup_at: string | null;
  expected_return_at: string | null;
  actual_return_at: string | null;
  pickup_mileage: number | null;
  return_mileage: number | null;
  pickup_fuel_level: string | null;
  return_fuel_level: string | null;
  pickup_condition_notes: string | null;
  return_condition_notes: string | null;
  pickup_photos: string[];
  return_photos: string[];
  packages_collected_count: number;
  packages_delivered_count: number;
  packages_failed_count: number;
  packages_returned_count: number;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  batch?: ContractBatchRef;
};

export type ContractBatch = {
  id: string;
  partner_id: string | null;
  batch_code: string | null;
  title: string;
  warehouse_address: string | null;
  sorting_location: string | null;
  expected_package_count: number;
  collected_package_count: number;
  delivered_package_count: number;
  failed_package_count: number;
  returned_package_count: number;
  logistics_lead_driver_id: string | null;
  pickup_driver_id: string | null;
  pickup_scheduled_at: string | null;
  delivery_deadline_at: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  partner?: { id: string; name: string } | null;
};

export type PackageStatusUpdate = {
  status: 'delivered' | 'failed_attempt' | 'returned_to_xperts';
  failure_reason?: string | null;
  delivered_at?: string | null;
  returned_at?: string | null;
};

export const CONTRACT_PACKAGE_STATUS_LABELS: Record<string, string> = {
  expected:                  'Expected',
  collected_from_warehouse:  'At Warehouse',
  at_sorting_point:          'Sorting',
  ready_for_driver:          'Ready',
  offered_to_driver:         'Offered',
  assigned_to_driver:        'Assigned',
  picked_up_by_driver:       'Picked Up',
  out_for_delivery:          'Out for Delivery',
  delivered:                 'Delivered',
  failed_attempt:            'Failed Attempt',
  returned_to_xperts:        'Returned to Xperts',
  returned_to_partner:       'Returned to Partner',
  missing:                   'Missing',
  damaged:                   'Damaged',
  disputed:                  'Disputed',
  closed:                    'Closed',
};

export const CONTRACT_ROUTE_STATUS_LABELS: Record<string, string> = {
  draft:       'Draft',
  available:   'Available',
  requested:   'Requested',
  assigned:    'Assigned',
  picked_up:   'Picked Up',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

export const CONTRACT_EARNINGS_STATUS_LABELS: Record<string, string> = {
  pending:    'Pending',
  calculated: 'Calculated',
  approved:   'Approved',
  paid:       'Paid',
  disputed:   'Disputed',
  cancelled:  'Cancelled',
};

export const CONTRACT_HANDOFF_STATUS_LABELS: Record<string, string> = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  disputed:  'Disputed',
  cancelled: 'Cancelled',
};
