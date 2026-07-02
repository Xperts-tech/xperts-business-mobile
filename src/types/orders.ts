export interface OrderItem {
  id: string;
  order_id: string;
  product_id?: string | null;
  name: string;
  item_name?: string | null;
  quantity: number;
  unit_price: number;
  line_total?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ItemIssue {
  item_id: string;
  name: string;
  issue_type?: string;
  status: 'unresolved' | 'pending_customer' | 'resolved';
  customer_message?: string;
  resolution?: string;
  substitute_product_id?: string;
  substitute_name?: string;
}

export interface OrderCustomer {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface Order {
  id: string;
  store_id: string;
  customer_id?: string | null;
  status: string;
  total_amount?: number | null;
  subtotal?: number | null;
  delivery_fee?: number | null;
  order_number?: string | null;
  special_instructions?: string | null;
  created_at: string;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
  items?: OrderItem[];
  customer?: OrderCustomer | null;
}

export interface MessageThread {
  id: string;
  order_id: string;
  created_at: string;
  order?: {
    id: string;
    order_number?: string | null;
    status: string;
    store_id: string;
  } | null;
}

export interface Message {
  id: string;
  order_id?: string | null;
  thread_id?: string | null;
  sender_id?: string | null;
  sender_role: 'business' | 'customer' | 'system' | 'admin';
  sender_name?: string | null;
  body: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

// ── Status transitions ────────────────────────────────────────────────────────

export type OrderStatusAction =
  | 'accept'
  | 'reject'
  | 'mark_preparing'
  | 'mark_ready';

export const ORDER_ACTION_TO_STATUS: Record<OrderStatusAction, string> = {
  accept: 'accepted',
  reject: 'rejected',
  mark_preparing: 'preparing',
  mark_ready: 'ready',
};

export const ORDER_ACTION_LABELS: Record<OrderStatusAction, string> = {
  accept: 'Accept Order',
  reject: 'Reject Order',
  mark_preparing: 'Start Preparing',
  mark_ready: 'Mark Ready',
};

// Actions available per status (before permission filtering)
export const AVAILABLE_ACTIONS: Record<string, OrderStatusAction[]> = {
  pending: ['accept', 'reject'],
  accepted: ['mark_preparing', 'reject'],
  preparing: ['mark_ready'],
};

// ── Display helpers ───────────────────────────────────────────────────────────

export function getOrderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    preparing: 'Preparing',
    ready: 'Ready',
    accepted_by_driver: 'Driver Assigned',
    assigned: 'Driver Assigned',
    assigned_to_driver: 'Driver Assigned',
    en_route_to_pickup: 'Driver En Route',
    arrived_at_pickup: 'Driver Arrived',
    in_progress: 'On the Way',
    picked_up: 'On the Way',
    on_the_way: 'On the Way',
    en_route_to_dropoff: 'On the Way',
    delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
  };
  return map[status] ?? status;
}

export function getOrderStatusColor(status: string): string {
  if (['pending'].includes(status)) return '#D97706';
  if (['accepted', 'preparing'].includes(status)) return '#0284C7';
  if (['ready'].includes(status)) return '#0891B2';
  if (status.includes('driver') || status.includes('route') || status.includes('pickup') || status.includes('way') || status.includes('progress') || status.includes('dropoff')) return '#1A3558';
  if (['delivered', 'completed'].includes(status)) return '#16A34A';
  if (['cancelled', 'rejected'].includes(status)) return '#DC2626';
  return '#4A6080';
}

export function formatOrderNumber(order: Pick<Order, 'id' | 'order_number'>): string {
  if (order.order_number) return `#${order.order_number}`;
  return `#${order.id.slice(0, 8).toUpperCase()}`;
}
