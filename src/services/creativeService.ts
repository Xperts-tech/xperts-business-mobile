import { supabase } from '@/lib/supabase';

// Creative Studio service (mobile). Mirrors the web creativeStudioService against
// the same tables/edge function. Reads/writes go through the authenticated
// client, so RLS (can_access_business) enforces per-business isolation. Degrades
// gracefully: AI failures resolve to { aiUsed:false } so callers fall back to a
// local template. Never throws.

export interface CreativeGenResult {
  content: string | null;
  aiUsed: boolean;
  reason: string | null;
  creativeId?: string | null;
}

export async function generateCreativeContent(params: {
  businessId: string;
  channel: string;
  templateLabel: string;
  input: string;
  storeName: string;
  templateKey?: string | null;
  kind?: string;
  brandVoice?: string | null;
  tagline?: string | null;
  save?: boolean;
}): Promise<CreativeGenResult> {
  try {
    const { data, error } = await supabase.functions.invoke('business-creative-generate', {
      body: {
        business_id:    params.businessId,
        channel:        params.channel,
        template_label: params.templateLabel,
        template_key:   params.templateKey ?? null,
        kind:           params.kind ?? 'caption',
        input:          params.input,
        store_name:     params.storeName,
        brand_voice:    params.brandVoice ?? null,
        tagline:        params.tagline ?? null,
        save:           params.save ?? false,
      },
    });

    if (error) return { content: null, aiUsed: false, reason: 'ai_unavailable' };
    if (data && data.ok === true && typeof data.content === 'string' && data.content.trim()) {
      return { content: data.content, aiUsed: true, reason: null, creativeId: (data.creative_id as string) ?? null };
    }
    return { content: null, aiUsed: false, reason: (data?.reason as string) ?? 'ai_unavailable' };
  } catch {
    return { content: null, aiUsed: false, reason: 'ai_unavailable' };
  }
}

// ── Brand kit ──────────────────────────────────────────────────────────────────
export interface BrandKit {
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  font_heading?: string | null;
  font_body?: string | null;
  tagline?: string | null;
  brand_voice?: string | null;
  palette?: Record<string, unknown>;
}

export async function getBrandKit(businessId: string): Promise<BrandKit | null> {
  if (!businessId) return null;
  const { data } = await supabase
    .from('business_brand_kit')
    .select('*')
    .eq('business_id', businessId)
    .is('store_id', null)
    .maybeSingle();
  return (data as BrandKit) ?? null;
}

export async function saveBrandKit(businessId: string, kit: BrandKit): Promise<boolean> {
  if (!businessId) return false;
  const payload = {
    business_id:     businessId,
    logo_url:        kit.logo_url ?? null,
    primary_color:   kit.primary_color ?? null,
    secondary_color: kit.secondary_color ?? null,
    accent_color:    kit.accent_color ?? null,
    font_heading:    kit.font_heading ?? null,
    font_body:       kit.font_body ?? null,
    tagline:         kit.tagline ?? null,
    brand_voice:     kit.brand_voice ?? null,
    palette:         kit.palette ?? {},
  };
  const { data: existing } = await supabase
    .from('business_brand_kit')
    .select('id')
    .eq('business_id', businessId)
    .is('store_id', null)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from('business_brand_kit').update(payload).eq('id', existing.id);
    return !error;
  }
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('business_brand_kit').insert({ ...payload, created_by: auth?.user?.id ?? null });
  return !error;
}

// ── Creative history ────────────────────────────────────────────────────────────
export interface CreativeRecord {
  id: string;
  kind: string;
  channel: string | null;
  body_text: string | null;
  created_at: string;
}

export async function listCreatives(businessId: string, limit = 50): Promise<CreativeRecord[]> {
  if (!businessId) return [];
  const { data } = await supabase
    .from('creative_assets')
    .select('id, kind, channel, body_text, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as CreativeRecord[]) ?? [];
}

export async function saveCreative(
  businessId: string,
  creative: { kind?: string; templateKey?: string | null; channel?: string | null; bodyText?: string | null },
): Promise<boolean> {
  if (!businessId) return false;
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('creative_assets').insert({
    business_id:  businessId,
    kind:         creative.kind ?? 'caption',
    template_key: creative.templateKey ?? null,
    channel:      creative.channel ?? null,
    body_text:    creative.bodyText ?? null,
    status:       'final',
    created_by:   auth?.user?.id ?? null,
  });
  return !error;
}
