import { supabase } from '@/lib/supabase';

export interface AppNotification {
  id: string;
  user_id: string | null;
  audience_role: string | null;
  title: string;
  body: string;
  notification_type: string;
  action_url: string | null;
  is_read: boolean;
  archived_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const NOTIF_SELECT =
  'id, user_id, audience_role, title, body, notification_type, action_url, is_read, archived_at, metadata, created_at';

export async function listMyNotifications(
  userId: string,
): Promise<{ notifications: AppNotification[]; error: string | null }> {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIF_SELECT)
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) return { notifications: [], error: error.message };
  return { notifications: (data ?? []) as AppNotification[], error: null };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('archived_at', null);

  if (error) return 0;
  return count ?? 0;
}

export async function markOneRead(
  notificationId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function markAllRead(
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) return { error: error.message };
  return { error: null };
}

export async function registerPushToken(
  userId: string,
  expoToken: string,
  deviceHint?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('business_push_tokens')
    .upsert(
      { user_id: userId, expo_token: expoToken, device_hint: deviceHint ?? null },
      { onConflict: 'user_id,expo_token' },
    );

  if (error) return { error: error.message };
  return { error: null };
}
