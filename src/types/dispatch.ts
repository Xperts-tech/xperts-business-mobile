export type Order = {
  id?: string;
  service_type?: string | null;
  order_type?: string | null;
  status?: string | null;
  customer_id?: string | null;
  order_number?: string | null;
  pickup?: unknown;
  pickup_address?: unknown;
  dropoff?: unknown;
  dropoff_address?: unknown;
  store_name?: string | null;
  business_name?: string | null;
  provider_name?: string | null;
  delivery_fee?: number | null;
  service_fee?: number | null;
  fee?: number | null;
  notes?: string | null;
  delivery_note?: string | null;
  payment_method?: string | null;
  contact_details?: { name?: string | null; phone?: string | null } | null;
  customer_name?: string | null;
  contact_name?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type DispatchAttempt = {
  id: string;
  driver_id: string;
  order_id: string;
  status: 'offered' | 'accepted' | 'declined' | 'expired' | 'cancelled' | string;
  expires_at: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  // Supabase join — returned as orders(*) in the select
  orders?: Order | null;
  order?: Order | null;
};

export type AcceptRpcResult = {
  status: 'accepted' | 'already_taken' | string;
  message?: string | null;
};
