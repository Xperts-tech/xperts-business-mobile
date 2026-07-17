import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { submitServiceRequest } from '@/services/businessServicesService';
import { generateCreativeContent } from '@/services/creativeService';
import type { CreativeStudioScreenProps } from '@/types/navigation';

type Channel = 'instagram' | 'facebook' | 'whatsapp' | 'general';
type Template = {
  key: string;
  label: string;
  prompt: string;
  isPremium: boolean;
};

const CHANNELS: Array<{ key: Channel; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
  { key: 'instagram', label: 'Instagram', icon: 'camera-outline', color: '#E1306C' },
  { key: 'facebook',  label: 'Facebook',  icon: 'logo-facebook',  color: '#1877F2' },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: 'logo-whatsapp',  color: '#25D366' },
  { key: 'general',   label: 'General',   icon: 'create-outline', color: colors.brand },
];

const TEMPLATES: Template[] = [
  { key: 'new_product',  label: 'New Product Launch',  prompt: 'Write a short, exciting post announcing a new product: {input}',                   isPremium: false },
  { key: 'daily_special',label: 'Daily Special',        prompt: 'Write an enticing post for today\'s special offer: {input}',                         isPremium: false },
  { key: 'promo',        label: 'Promo / Sale',         prompt: 'Write a promotional post for this offer: {input}. Include urgency and a CTA.',       isPremium: false },
  { key: 'caption',      label: 'Product Caption',      prompt: 'Write an engaging product caption for: {input}. Keep it under 100 words.',            isPremium: false },
  { key: 'story_cta',    label: 'Story with CTA',       prompt: 'Create a short Instagram Story caption with a strong call-to-action for: {input}',   isPremium: true },
  { key: 'testimonial',  label: 'Customer Highlight',   prompt: 'Write a post celebrating a happy customer experience involving: {input}',             isPremium: true },
  { key: 'flash_sale',   label: 'Flash Sale',           prompt: 'Create a high-energy flash sale post for: {input}. Add fire and urgency.',            isPremium: true },
  { key: 'whatsapp_status', label: 'WhatsApp Status',   prompt: 'Write a short WhatsApp status update to promote: {input}. Under 40 words.',           isPremium: false },
];

const CHANNEL_HASHTAGS: Record<Channel, string> = {
  instagram: '\n\n#XpertsExpress #ShopLocal #Deals',
  facebook:  '\n\nShop now on Xperts Express! 🛍️',
  whatsapp:  '\n\nOrder via Xperts Express 📲',
  general:   '',
};

function generateCaption(template: Template, input: string, channel: Channel, storeName: string): string {
  const base = template.prompt.replace('{input}', input || 'our store');
  const storeTag = storeName ? `\n\n— ${storeName}` : '';
  const hashtag = CHANNEL_HASHTAGS[channel];
  return `[Generated for ${CHANNELS.find((c) => c.key === channel)?.label ?? channel}]\n\n${base}${storeTag}${hashtag}\n\n(Tip: Personalise this before posting for best results.)`;
}

export default function CreativeStudioScreen({ navigation }: CreativeStudioScreenProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { selectedBusiness, selectedStoreId } = useBusiness();

  const [channel, setChannel] = useState<Channel>('instagram');
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0]);
  const [input, setInput] = useState('');
  const [generated, setGenerated] = useState('');
  const [aiUsed, setAiUsed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const submittingRef = useRef(false);

  const coinLocked = selectedTemplate.isPremium;

  const handleGenerate = useCallback(async () => {
    if (!input.trim()) {
      Alert.alert('Add details', 'Please describe your product, offer, or store to generate content.');
      return;
    }
    setGenerating(true);

    // Try real AI first; fall back to the local template if it isn't available.
    let text = '';
    let usedAi = false;
    if (selectedBusiness?.id) {
      const res = await generateCreativeContent({
        businessId:    selectedBusiness.id,
        channel,
        templateLabel: selectedTemplate.label,
        input:         input.trim(),
        storeName:     selectedBusiness.name ?? '',
      });
      if (res.content) { text = res.content; usedAi = true; }
    }
    if (!text) {
      text = generateCaption(selectedTemplate, input.trim(), channel, selectedBusiness?.name ?? '');
    }

    setGenerated(text);
    setAiUsed(usedAi);
    setGenerating(false);
  }, [input, selectedTemplate, channel, selectedBusiness?.id, selectedBusiness?.name]);

  const handleCopy = useCallback(async () => {
    if (!generated) return;
    await Clipboard.setStringAsync(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generated]);

  const handleSaveDraft = useCallback(async () => {
    if (!generated || submittingRef.current) return;
    if (!selectedBusiness?.id) {
      Alert.alert('No business', 'Please select a business first.');
      return;
    }
    if (!profile?.id) {
      Alert.alert('Not signed in', 'Please sign in again and retry.');
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      const { error } = await submitServiceRequest({
        businessId: selectedBusiness.id,
        storeId: selectedStoreId ?? null,
        submittedBy: profile.id,
        // request_type must match bsr_request_type_check; status defaults to
        // 'new' (the table has no 'draft' status) — flagged in metadata instead.
        requestType: 'creative_design',
        title: `${selectedTemplate.label} (${channel})`,
        description: `[${channel.toUpperCase()} — ${selectedTemplate.label}]\n\nInput: ${input}\n\nGenerated:\n${generated}`,
        metadata: {
          channel,
          template_key: selectedTemplate.key,
          source: 'creative_studio',
          saved_as_draft: true,
        },
      });
      if (error) throw new Error(error);
      Alert.alert('Saved!', 'Your draft was saved. You can find it in Service Requests.');
    } catch {
      Alert.alert('Error', 'Could not save draft. Please try again.');
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }, [generated, selectedBusiness?.id, selectedStoreId, profile?.id, channel, selectedTemplate, input]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Creative Studio</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* Channel picker */}
        <Text style={s.sectionLabel}>Channel</Text>
        <View style={s.channelRow}>
          {CHANNELS.map((ch) => (
            <TouchableOpacity
              key={ch.key}
              style={[s.channelBtn, channel === ch.key && { borderColor: ch.color, backgroundColor: ch.color + '18' }]}
              onPress={() => setChannel(ch.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={ch.icon} size={16} color={channel === ch.key ? ch.color : colors.textMuted} />
              <Text style={[s.channelBtnLabel, channel === ch.key && { color: ch.color }]}>{ch.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Template picker */}
        <Text style={s.sectionLabel}>Template</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.templateScroll} contentContainerStyle={s.templateRow}>
          {TEMPLATES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[s.templateChip, selectedTemplate.key === t.key && s.templateChipActive]}
              onPress={() => { setSelectedTemplate(t); setGenerated(''); }}
              activeOpacity={0.8}
            >
              {t.isPremium && (
                <Ionicons
                  name="ellipse"
                  size={8}
                  color={selectedTemplate.key === t.key ? colors.white : '#D97706'}
                  style={{ marginRight: 3 }}
                />
              )}
              <Text style={[s.templateChipLabel, selectedTemplate.key === t.key && s.templateChipLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Premium lock notice */}
        {coinLocked && (
          <View style={s.premiumNotice}>
            <Ionicons name="ellipse" size={14} color="#D97706" />
            <Text style={s.premiumNoticeText}>
              Premium template — uses 1 Xperts Coin per generation
            </Text>
          </View>
        )}

        {/* Input */}
        <Text style={s.sectionLabel}>What are you promoting?</Text>
        <TextInput
          style={s.input}
          placeholder="e.g. Jerk Chicken combo, 20% off groceries, new pharmacy opening..."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={(t) => { setInput(t); setGenerated(''); }}
          multiline
          numberOfLines={3}
          maxLength={300}
        />
        <Text style={s.inputCount}>{input.length}/300</Text>

        {/* Generate button */}
        <TouchableOpacity
          style={[s.generateBtn, generating && { opacity: 0.7 }]}
          onPress={handleGenerate}
          disabled={generating}
          activeOpacity={0.85}
        >
          {generating ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="sparkles-outline" size={18} color={colors.white} />
              <Text style={s.generateBtnText}>Generate Content</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Generated output */}
        {!!generated && (
          <View style={s.outputCard}>
            <View style={s.outputHeader}>
              <Text style={s.outputTitle}>{aiUsed ? '✨ AI draft' : 'Draft'}</Text>
              <View style={s.outputActions}>
                <TouchableOpacity onPress={handleCopy} style={s.outputActionBtn} activeOpacity={0.8}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? colors.brand : colors.textMuted} />
                  <Text style={[s.outputActionLabel, copied && { color: colors.brand }]}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveDraft}
                  style={s.outputActionBtn}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  ) : (
                    <>
                      <Ionicons name="bookmark-outline" size={16} color={colors.textMuted} />
                      <Text style={s.outputActionLabel}>Save Draft</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              style={s.outputInput}
              value={generated}
              onChangeText={setGenerated}
              multiline
              textAlignVertical="top"
            />
            <Text style={s.outputHint}>
              Edit this before you post — {aiUsed ? 'AI-generated, so double-check the details.' : 'personalise it for best results.'}
            </Text>

            <TouchableOpacity
              style={s.regenerateBtn}
              onPress={handleGenerate}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={14} color={colors.brand} />
              <Text style={s.regenerateBtnText}>Regenerate</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tips */}
        <View style={s.tipsCard}>
          <Text style={s.tipsTitle}>Tips for better content</Text>
          {[
            'Be specific — "20% off Red Stripe on Friday" beats "special offer"',
            'Add your store name and any discount codes before posting',
            'Tailor WhatsApp content to feel personal, not like an ad',
            'For Instagram, use the generated hashtags and add 2–3 local ones',
          ].map((tip, i) => (
            <View key={i} style={s.tipRow}>
              <View style={s.tipDot} />
              <Text style={s.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },

  scroll: { padding: 16 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 12,
  },

  channelRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  channelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  channelBtnLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },

  templateScroll: { marginHorizontal: -16, marginBottom: 4 },
  templateRow: { paddingHorizontal: 16, gap: 8, paddingRight: 32 },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  templateChipActive: { borderColor: colors.brand, backgroundColor: colors.brandSurface },
  templateChipLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  templateChipLabelActive: { color: colors.brand },

  premiumNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  premiumNoticeText: { fontSize: 12, color: '#D97706', fontWeight: '600', flex: 1 },

  input: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 4 },

  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  generateBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },

  outputCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: colors.brand + '40',
  },
  outputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  outputTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  outputActions: { flexDirection: 'row', gap: 14 },
  outputActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  outputActionLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  outputText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  outputInput: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 21,
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    minHeight: 120,
    marginBottom: 8,
  },
  outputHint: { fontSize: 11, color: colors.textMuted, marginBottom: 12, lineHeight: 16 },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brand + '50',
    backgroundColor: colors.brandSurface,
  },
  regenerateBtnText: { fontSize: 12, fontWeight: '700', color: colors.brand },

  tipsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipsTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  tipRow: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 6, flexShrink: 0 },
  tipText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, flex: 1 },
});
