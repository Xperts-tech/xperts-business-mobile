import { supabase } from '@/lib/supabase';

// Per-business content calendar + automated-publishing opt-in — mobile.
// Mirrors the web businessCalendarService / businessPublishingService against the
// same tables. Every write stamps business_id (RLS keeps businesses to their own).
// Publishing tokens live server-side only; nothing here ever touches them.

export const AUTO_CHANNELS = ['facebook', 'instagram'] as const;
export const CALENDAR_CHANNELS = ['instagram', 'facebook', 'whatsapp', 'google_business', 'other'] as const;

export interface CalendarEntry {
  id: string;
  title: string;
  channel: string;
  content_body: string | null;
  scheduled_for: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
}

const SELECT = 'id, title, channel, content_body, scheduled_for, status, metadata';

export async function listEntries(businessId: string): Promise<CalendarEntry[]> {
  if (!businessId) return [];
  const { data } = await supabase
    .from('growth_content_calendar')
    .select(SELECT)
    .eq('business_id', businessId)
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .limit(200);
  return (data as CalendarEntry[]) ?? [];
}

export interface NewEntry {
  title: string;
  channel: string;
  content_body?: string | null;
  scheduled_for?: string | null;
  storeId?: string | null;
  autoPublish?: boolean;
}

export async function createEntry(
  businessId: string,
  entry: NewEntry,
): Promise<{ ok: boolean; reason?: string; limitReached?: boolean }> {
  if (!businessId) return { ok: false, reason: 'business_id required' };
  const { data: { session } } = await supabase.auth.getSession();
  const metadata: Record<string, unknown> = {};
  // Per-entry opt-in: only "true" makes the server auto-enqueue this post.
  if (entry.autoPublish) metadata.auto_publish = 'true';
  const { error } = await supabase.from('growth_content_calendar').insert({
    business_id: businessId,
    store_id: entry.storeId ?? null,
    title: entry.title || 'Untitled post',
    channel: entry.channel || 'other',
    content_type: 'post',
    content_body: entry.content_body ?? null,
    scheduled_for: entry.scheduled_for ?? null,
    status: entry.scheduled_for ? 'scheduled' : 'draft',
    approval_status: 'approved', // business-owned manual content is self-approved
    created_by: session?.user?.id ?? null,
    metadata,
  });
  if (error) {
    if (String(error.message || '').includes('calendar_free_limit_reached')) {
      return { ok: false, limitReached: true, reason: 'You have reached the free content calendar limit (10). Upgrade for unlimited posts.' };
    }
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

export async function markPostedManually(entryId: string): Promise<boolean> {
  const { error } = await supabase
    .from('growth_content_calendar')
    .update({ status: 'posted_manually', posted_at: new Date().toISOString() })
    .eq('id', entryId);
  return !error;
}

export async function deleteEntry(entryId: string): Promise<boolean> {
  const { error } = await supabase.from('growth_content_calendar').delete().eq('id', entryId);
  return !error;
}

/** Toggle the per-entry auto-publish flag on an existing entry (merges metadata). */
export async function setEntryAutoPublish(entryId: string, enabled: boolean): Promise<boolean> {
  const { data: row } = await supabase
    .from('growth_content_calendar').select('metadata').eq('id', entryId).maybeSingle();
  const meta: Record<string, unknown> = { ...((row as { metadata?: Record<string, unknown> } | null)?.metadata || {}) };
  if (enabled) meta.auto_publish = 'true'; else delete meta.auto_publish;
  const { error } = await supabase.from('growth_content_calendar').update({ metadata: meta }).eq('id', entryId);
  return !error;
}

// ── Automated-publishing opt-in (business_publishing_settings, default OFF) ──

export async function getAutoPublishEnabled(businessId: string): Promise<boolean> {
  if (!businessId) return false;
  const { data } = await supabase
    .from('business_publishing_settings')
    .select('auto_publish_enabled')
    .eq('business_id', businessId)
    .maybeSingle();
  return Boolean((data as { auto_publish_enabled?: boolean } | null)?.auto_publish_enabled);
}

export async function setAutoPublishEnabled(businessId: string, enabled: boolean): Promise<boolean> {
  if (!businessId) return false;
  const { error } = await supabase
    .from('business_publishing_settings')
    .upsert({ business_id: businessId, auto_publish_enabled: enabled, updated_at: new Date().toISOString() });
  return !error;
}
