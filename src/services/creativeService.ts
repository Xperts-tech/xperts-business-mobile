import { supabase } from '@/lib/supabase';

// Calls the business-creative-generate edge function for real AI copy.
// Degrades gracefully: any error, a missing function, or an unset ANTHROPIC key
// all resolve to { aiUsed: false } so the caller can fall back to a local
// template. Never throws.

export interface CreativeGenResult {
  content: string | null;
  aiUsed: boolean;
  reason: string | null;
}

export async function generateCreativeContent(params: {
  businessId: string;
  channel: string;
  templateLabel: string;
  input: string;
  storeName: string;
}): Promise<CreativeGenResult> {
  try {
    const { data, error } = await supabase.functions.invoke('business-creative-generate', {
      body: {
        business_id:    params.businessId,
        channel:        params.channel,
        template_label: params.templateLabel,
        input:          params.input,
        store_name:     params.storeName,
      },
    });

    if (error) return { content: null, aiUsed: false, reason: 'ai_unavailable' };
    if (data && data.ok === true && typeof data.content === 'string' && data.content.trim()) {
      return { content: data.content, aiUsed: true, reason: null };
    }
    return { content: null, aiUsed: false, reason: (data?.reason as string) ?? 'ai_unavailable' };
  } catch {
    return { content: null, aiUsed: false, reason: 'ai_unavailable' };
  }
}
