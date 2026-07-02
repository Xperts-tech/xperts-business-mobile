import { supabase } from '@/lib/supabase';

export const SERVICE_CATEGORIES = [
  { key: 'growth_campaign',     label: 'Growth Campaign',    icon: '🚀', description: 'Marketing campaigns to grow your customer base' },
  { key: 'crm_sales_agent',     label: 'Sales Agent',        icon: '🎯', description: 'CRM outreach and sales lead support' },
  { key: 'business_support',    label: 'Business Support',   icon: '🤝', description: 'General business help and guidance' },
  { key: 'creative_design',     label: 'Creative Design',    icon: '🎨', description: 'Logos, flyers, banners, and branded assets' },
  { key: 'whatsapp_broadcast',  label: 'WhatsApp Broadcast', icon: '📲', description: 'Send promotions to your customer list' },
  { key: 'social_media_post',   label: 'Social Media Post',  icon: '📱', description: 'Professional content for your social channels' },
  { key: 'promo_kit',           label: 'Promo Kit',          icon: '🎁', description: 'Promotional materials and campaign kits' },
  { key: 'store_setup_help',    label: 'Store Setup Help',   icon: '🏪', description: 'Help setting up your Xperts store profile' },
  { key: 'product_upload_help', label: 'Product Upload',     icon: '📷', description: 'AI-powered menu and product upload assistance' },
  { key: 'packaging_supply',    label: 'Packaging Supplies', icon: '📦', description: 'Branded packaging for your deliveries' },
  { key: 'office_supply',       label: 'Office Supplies',    icon: '📋', description: 'Office essentials delivered to you' },
  { key: 'branded_giveaway',    label: 'Branded Giveaway',   icon: '🎉', description: 'Branded items to promote your business' },
  { key: 'custom_request',      label: 'Custom Request',     icon: '✨', description: 'Something else? Tell us what you need' },
] as const;

export type RequestType = typeof SERVICE_CATEGORIES[number]['key'];

export interface ServiceRequest {
  id: string;
  business_id: string;
  store_id: string | null;
  submitted_by: string;
  request_type: string;
  title: string | null;
  description: string | null;
  business_notes: string | null;
  status: string;
  priority: string;
  payment_status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequestMessage {
  id: string;
  request_id: string;
  sender_role: 'business' | 'admin' | 'system';
  sender_id: string;
  sender_name: string | null;
  body: string;
  admin_only: boolean;
  created_at: string;
}

const BSR_SELECT =
  'id, business_id, store_id, submitted_by, request_type, title, description, business_notes, status, priority, payment_status, metadata, created_at, updated_at';

export async function listMyServiceRequests(
  businessId: string,
): Promise<{ requests: ServiceRequest[]; error: string | null }> {
  const { data, error } = await supabase
    .from('business_service_requests')
    .select(BSR_SELECT)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) return { requests: [], error: error.message };
  return { requests: (data ?? []) as ServiceRequest[], error: null };
}

export async function listMySupportRequests(
  businessId: string,
): Promise<{ requests: ServiceRequest[]; error: string | null }> {
  const { data, error } = await supabase
    .from('business_service_requests')
    .select(BSR_SELECT)
    .eq('business_id', businessId)
    .eq('request_type', 'business_support')
    .order('created_at', { ascending: false });

  if (error) return { requests: [], error: error.message };
  return { requests: (data ?? []) as ServiceRequest[], error: null };
}

export async function getServiceRequestDetail(
  requestId: string,
): Promise<{ request: ServiceRequest | null; error: string | null }> {
  const { data, error } = await supabase
    .from('business_service_requests')
    .select(BSR_SELECT)
    .eq('id', requestId)
    .single();

  if (error) return { request: null, error: error.message };
  return { request: data as ServiceRequest, error: null };
}

export interface SubmitServiceRequestParams {
  businessId: string;
  storeId?: string | null;
  submittedBy: string;
  requestType: string;
  title?: string | null;
  description: string;
  businessNotes?: string | null;
}

export async function submitServiceRequest(
  params: SubmitServiceRequestParams,
): Promise<{ requestId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('business_service_requests')
    .insert({
      business_id:    params.businessId,
      store_id:       params.storeId ?? null,
      submitted_by:   params.submittedBy,
      request_type:   params.requestType,
      title:          params.title ?? null,
      description:    params.description,
      business_notes: params.businessNotes ?? null,
    })
    .select('id')
    .single();

  if (error) return { requestId: null, error: error.message };
  return { requestId: (data as { id: string }).id, error: null };
}

export async function listRequestMessages(
  requestId: string,
): Promise<{ messages: ServiceRequestMessage[]; error: string | null }> {
  const { data, error } = await supabase
    .from('business_service_request_messages')
    .select('id, request_id, sender_role, sender_id, sender_name, body, admin_only, created_at')
    .eq('request_id', requestId)
    .eq('admin_only', false)
    .order('created_at', { ascending: true });

  if (error) return { messages: [], error: error.message };
  return { messages: (data ?? []) as ServiceRequestMessage[], error: null };
}

export async function sendRequestMessage(
  requestId: string,
  body: string,
  senderId: string,
  senderName: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('business_service_request_messages')
    .insert({
      request_id:  requestId,
      sender_role: 'business',
      sender_id:   senderId,
      sender_name: senderName,
      body,
      admin_only:  false,
    });

  if (error) return { error: error.message };
  return { error: null };
}

export function getCategoryMeta(requestType: string) {
  return (
    SERVICE_CATEGORIES.find((c) => c.key === requestType) ?? {
      key:         requestType,
      label:       requestType.replace(/_/g, ' '),
      icon:        '📋',
      description: '',
    }
  );
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'new':         return '#0284C7';
    case 'reviewing':   return '#D97706';
    case 'quoted':      return '#7C3AED';
    case 'approved':    return '#16A34A';
    case 'in_progress': return '#0284C7';
    case 'completed':   return '#16A34A';
    case 'cancelled':   return '#8FA3BA';
    case 'rejected':    return '#DC2626';
    default:            return '#8FA3BA';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'new':         return 'New';
    case 'reviewing':   return 'Under Review';
    case 'quoted':      return 'Quoted';
    case 'approved':    return 'Approved';
    case 'in_progress': return 'In Progress';
    case 'completed':   return 'Completed';
    case 'cancelled':   return 'Cancelled';
    case 'rejected':    return 'Rejected';
    default:            return status;
  }
}
