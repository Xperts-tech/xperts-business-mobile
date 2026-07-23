import { supabase } from '@/lib/supabase';

// Per-business Meta (Facebook/Instagram) connections — mobile. Mirrors the web
// businessSocialService against the same tables/functions. Tokens live
// server-side only (channel_connection_secrets); never returned here.

export interface SocialConnection {
  id: string;
  channel: string;
  connection_status: string;
  account_name: string | null;
  external_account_id: string | null;
  permissions_granted: string | null;
  updated_at: string;
}

export async function getConnections(businessId: string): Promise<SocialConnection[]> {
  if (!businessId) return [];
  const { data } = await supabase
    .from('growth_channel_connections')
    .select('id, channel, connection_status, account_name, external_account_id, permissions_granted, updated_at')
    .eq('business_id', businessId)
    .in('channel', ['facebook', 'instagram']);
  return (data as SocialConnection[]) ?? [];
}

/** Begin Meta OAuth — returns the dialog URL to open in the system browser. */
export async function startConnect(businessId: string): Promise<{ ok: boolean; url?: string; reason?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('meta-oauth-start', { body: { business_id: businessId, return_to: 'app' } });
    if (error) return { ok: false, reason: error.message };
    if (!data?.url) return { ok: false, reason: (data?.error as string) ?? 'start_failed' };
    return { ok: true, url: data.url as string };
  } catch (err) {
    return { ok: false, reason: (err as Error)?.message ?? 'start_failed' };
  }
}

export async function disconnectChannel(connectionId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('disconnect_business_channel', { conn_id: connectionId });
  if (error) return false;
  return Boolean((data as { ok?: boolean })?.ok);
}

// Publish-scope readiness (mirror of the web channelState helper).
export function channelState(conn: SocialConnection | undefined): 'connected' | 'reauthorize' | 'expired' | 'not_connected' {
  if (!conn) return 'not_connected';
  if (conn.connection_status === 'token_expired') return 'expired';
  if (conn.connection_status === 'disconnected') return 'not_connected';
  const scopes = String(conn.permissions_granted || '');
  const need = conn.channel === 'instagram' ? 'instagram_content_publish' : 'pages_manage_posts';
  if (conn.connection_status === 'connected' && scopes.includes(need)) return 'connected';
  if (conn.connection_status === 'connected') return 'reauthorize';
  return 'not_connected';
}
