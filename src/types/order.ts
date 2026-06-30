export type OrderItem = {
  id: string;
  order_id?: string;
  name?: string | null;
  item_name?: string | null;
  quantity?: number | null;
  qty?: number | null;
  notes?: string | null;
  selected_options?: string | null;
  backup_option?: string | null;
  second_choice?: string | null;
  unavailable_preference?: string | null;
  driver_verification_status?: string | null;
  metadata?: {
    selected_variant?: { variant_label?: string } | string | null;
    selected_modifiers?: Array<{ option_name?: string; name?: string }>;
    note?: string | null;
    special_instruction?: string | null;
    backup_item_name?: string | null;
  } | null;
};

export type PurchaseRecord = {
  id: string;
  order_id?: string | null;
  actual_store_total?: number | null;
  spending_limit_amount?: number | null;
  paid_by?: string | null;
  driver_paid_amount?: number | null;
  status?: string | null;
  note?: string | null;
  reimbursement_status?: string | null;
  reimbursement_amount?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PurchaseApprovalRequest = {
  id: string;
  order_id?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type OrderReceipt = {
  id: string;
  order_id?: string | null;
  receipt_storage_path?: string | null;
  receipt_image_url?: string | null;
  total_amount?: number | null;
  store_name?: string | null;
  notes?: string | null;
  created_at?: string | null;
  signedUrl?: string | null;
};

export type ActiveOrder = {
  id: string;
  status: string;
  order_type?: string | null;
  service_type?: string | null;
  order_mode?: string | null;
  order_number?: string | null;
  assigned_driver_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  contact_name?: string | null;
  customer_phone?: string | null;
  contact_phone?: string | null;
  contact_details?: { name?: string | null; phone?: string | null } | null;
  store_name?: string | null;
  business_name?: string | null;
  provider_name?: string | null;
  pickup?: unknown;
  pickup_address?: unknown;
  dropoff?: unknown;
  dropoff_address?: unknown;
  notes?: string | null;
  delivery_note?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  purchase_required?: boolean | null;
  place_order_required?: boolean | null;
  spending_limit_amount?: number | null;
  store_order_placed_at?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  total_amount?: number | null;
  final_price?: number | null;
  price_estimate?: number | null;
  delivery_fee?: number | null;
  items: OrderItem[];
  purchase_record?: PurchaseRecord | null;
  purchase_approval_request?: PurchaseApprovalRequest | null;
};
