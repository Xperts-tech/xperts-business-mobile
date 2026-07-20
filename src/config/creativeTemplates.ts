// Creative Studio templates — mirror of the web config so both apps share the
// same catalog + render spec. Visuals are template-rendered (web canvas / mobile
// view-shot); AI generates the text. Keep in sync with the web copy.

export interface CreativeTemplate {
  key: string;
  label: string;
  kind: 'caption' | 'post' | 'flyer' | 'story';
  channel: string;
  aspectRatio: string | null;
  isPremium: boolean;
  prompt: string;
  layout: { bg: string; textColor: string; elements: string[] } | null;
}

export const CREATIVE_TEMPLATES: CreativeTemplate[] = [
  { key: 'caption_promo', label: 'Promotional Caption', kind: 'caption', channel: 'any', aspectRatio: null, isPremium: false,
    prompt: 'Write ONE short, punchy promotional caption for: {input}. Friendly, on-brand, 1-2 sentences.', layout: null },
  { key: 'ig_post', label: 'Instagram Post', kind: 'post', channel: 'instagram', aspectRatio: '1:1', isPremium: false,
    prompt: 'Write a punchy Instagram caption for: {input}. Include a short hook and 3-5 relevant hashtags including #XpertsXpress.',
    layout: { bg: 'primary', textColor: 'onPrimary', elements: ['logo', 'headline', 'tagline'] } },
  { key: 'fb_post', label: 'Facebook Post', kind: 'post', channel: 'facebook', aspectRatio: '1.91:1', isPremium: false,
    prompt: 'Write a clear, friendly Facebook post for: {input}. One short paragraph + a call to action.',
    layout: { bg: 'white', textColor: 'primary', elements: ['logo', 'headline', 'body'] } },
  { key: 'ig_story', label: 'Instagram Story', kind: 'story', channel: 'instagram', aspectRatio: '9:16', isPremium: true,
    prompt: 'Write a short Instagram Story caption with a strong call-to-action for: {input}.',
    layout: { bg: 'accent', textColor: 'onAccent', elements: ['logo', 'headline', 'cta'] } },
  { key: 'whatsapp_status', label: 'WhatsApp Status', kind: 'story', channel: 'whatsapp', aspectRatio: '9:16', isPremium: false,
    prompt: 'Write a brief, upbeat WhatsApp status promoting: {input}. One line + emoji.',
    layout: { bg: 'primary', textColor: 'onPrimary', elements: ['logo', 'headline'] } },
  { key: 'flyer_sale', label: 'Sale Flyer', kind: 'flyer', channel: 'any', aspectRatio: '4:5', isPremium: true,
    prompt: 'Write a bold sale flyer headline + one supporting line + a call-to-action for: {input}.',
    layout: { bg: 'white', textColor: 'primary', elements: ['logo', 'headline', 'body', 'cta', 'tagline'] } },
];

export function getTemplate(key: string): CreativeTemplate | null {
  return CREATIVE_TEMPLATES.find((t) => t.key === key) ?? null;
}

export const DEFAULT_BRAND = {
  primary_color: '#0F7A3D',
  secondary_color: '#0B5C2E',
  accent_color: '#F5B301',
  font_heading: 'System',
  font_body: 'System',
  tagline: '',
  logo_url: null as string | null,
};

// Resolve a template + brand kit + content into a flat spec the mobile renderer
// (a styled <View> captured via react-native-view-shot) consumes.
export function buildCreativeRenderSpec(
  template: CreativeTemplate | null,
  brandKit: Record<string, any> | null,
  content: { headline?: string; caption?: string; body?: string; cta?: string; tagline?: string } = {},
) {
  if (!template || !template.layout) return null;
  const b = { ...DEFAULT_BRAND, ...(brandKit || {}) };
  const colorFor = (token: string): string => {
    switch (token) {
      case 'primary':   return b.primary_color;
      case 'accent':    return b.accent_color;
      case 'white':     return '#FFFFFF';
      case 'onPrimary': return '#FFFFFF';
      case 'onAccent':  return '#1A1A1A';
      default:          return '#FFFFFF';
    }
  };
  const has = (el: string) => template.layout!.elements.includes(el);
  return {
    key: template.key,
    kind: template.kind,
    aspectRatio: template.aspectRatio,
    background: colorFor(template.layout.bg),
    textColor: colorFor(template.layout.textColor),
    logoUrl: has('logo') ? b.logo_url : null,
    headline: has('headline') ? (content.headline || content.caption || '').slice(0, 90) : null,
    body: has('body') ? (content.body || content.caption || '') : null,
    cta: has('cta') ? (content.cta || 'Order now on Xperts Xpress') : null,
    tagline: has('tagline') ? (content.tagline || b.tagline || '') : null,
  };
}
