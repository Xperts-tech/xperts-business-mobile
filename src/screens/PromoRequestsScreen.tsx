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
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { supabase } from '@/lib/supabase';
import type { PromoRequestsScreenProps } from '@/types/navigation';

type ServiceType =
  | 'featured_listing'
  | 'social_media_ads'
  | 'email_campaign'
  | 'push_notification'
  | 'storefront_banner'
  | 'seo_boost'
  | 'loyalty_program'
  | 'flash_sale';

const SERVICES: Array<{
  key: ServiceType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge: string;
  badgeColor: string;
}> = [
  {
    key: 'featured_listing',
    title: 'Featured Store Listing',
    description: 'Get prime placement at the top of the app home screen and Explore page.',
    icon: 'star-outline',
    badge: 'Popular',
    badgeColor: colors.brand,
  },
  {
    key: 'social_media_ads',
    title: 'Social Media Ads',
    description: 'Xperts runs targeted ads for your store on Instagram and Facebook.',
    icon: 'megaphone-outline',
    badge: 'High ROI',
    badgeColor: colors.info,
  },
  {
    key: 'push_notification',
    title: 'Push Notification Campaign',
    description: 'Send a targeted promotion to customers who ordered from you or nearby stores.',
    icon: 'notifications-outline',
    badge: 'Fast Reach',
    badgeColor: colors.success,
  },
  {
    key: 'storefront_banner',
    title: 'App Banner Ad',
    description: 'Display a full-width promotional banner inside the Xperts customer app.',
    icon: 'image-outline',
    badge: 'High Visibility',
    badgeColor: colors.warning,
  },
  {
    key: 'email_campaign',
    title: 'Email Marketing',
    description: 'Xperts sends a promotional email blast to relevant customers in your area.',
    icon: 'mail-outline',
    badge: 'Affordable',
    badgeColor: '#8B5CF6',
  },
  {
    key: 'loyalty_program',
    title: 'Loyalty Rewards Setup',
    description: 'Set up a points-based loyalty program for repeat customers.',
    icon: 'heart-outline',
    badge: 'Retention',
    badgeColor: '#EC4899',
  },
  {
    key: 'flash_sale',
    title: 'Flash Sale Event',
    description: 'Xperts team creates a timed flash sale to drive burst traffic to your store.',
    icon: 'flash-outline',
    badge: 'Conversion',
    badgeColor: colors.danger,
  },
  {
    key: 'seo_boost',
    title: 'Discoverability Boost',
    description: 'We improve your store tags, categories, and metadata to rank higher in search.',
    icon: 'search-outline',
    badge: 'Long-term',
    badgeColor: '#14B8A6',
  },
];

export default function PromoRequestsScreen({ navigation }: PromoRequestsScreenProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { selectedBusiness } = useBusiness();
  const [selected, setSelected] = useState<ServiceType | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const handleSubmit = useCallback(async () => {
    if (!selected || submittingRef.current) return;
    if (!selectedBusiness?.id) {
      Alert.alert('No business selected', 'Please select a business first.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('business_service_requests').insert({
        business_id: selectedBusiness.id,
        requester_id: profile?.id,
        request_type: 'growth_engine',
        service_type: selected,
        notes: notes.trim() || null,
        status: 'pending',
        metadata: {
          source: 'business_mobile',
          service_label: SERVICES.find((s) => s.key === selected)?.title,
        },
      });

      if (error) {
        // Fallback: table might not exist yet
        if (error.code === '42P01') {
          await supabase.from('service_requests').insert({
            business_id: selectedBusiness.id,
            customer_id: profile?.id,
            request_type: selected,
            description: `Growth Engine: ${SERVICES.find((s) => s.key === selected)?.title}\n\n${notes}`,
            status: 'pending',
            metadata: { growth_engine: true, source: 'business_mobile' },
          });
        } else {
          throw new Error(error.message);
        }
      }

      Alert.alert(
        'Request submitted!',
        'Our team will review your request and contact you within 1–2 business days.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
      setSelected(null);
      setNotes('');
    } catch (err) {
      Alert.alert('Error', 'Could not submit request. Please try again or contact support.');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [selected, notes, selectedBusiness?.id, profile?.id, navigation]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Growth Engine</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
      >
        <View style={s.heroCard}>
          <Ionicons name="rocket-outline" size={28} color={colors.brand} />
          <View style={s.heroText}>
            <Text style={s.heroTitle}>Grow your business</Text>
            <Text style={s.heroSub}>
              Request a growth service and the Xperts team will implement it for you.
              All services are admin-reviewed and priced individually.
            </Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Select a service</Text>

        {SERVICES.map((svc) => {
          const isSelected = selected === svc.key;
          return (
            <TouchableOpacity
              key={svc.key}
              style={[s.serviceCard, isSelected && s.serviceCardSelected]}
              onPress={() => setSelected(isSelected ? null : svc.key)}
              activeOpacity={0.85}
            >
              <View style={[s.serviceIconWrap, isSelected && { backgroundColor: colors.brand }]}>
                <Ionicons
                  name={svc.icon}
                  size={20}
                  color={isSelected ? colors.white : colors.brand}
                />
              </View>
              <View style={s.serviceBody}>
                <View style={s.serviceTitleRow}>
                  <Text style={s.serviceTitle}>{svc.title}</Text>
                  <View style={[s.badge, { backgroundColor: svc.badgeColor + '18' }]}>
                    <Text style={[s.badgeText, { color: svc.badgeColor }]}>{svc.badge}</Text>
                  </View>
                </View>
                <Text style={s.serviceDesc}>{svc.description}</Text>
              </View>
              <Ionicons
                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={isSelected ? colors.brand : colors.tabInactive}
              />
            </TouchableOpacity>
          );
        })}

        {selected && (
          <View style={s.notesSection}>
            <Text style={s.notesLabel}>Additional notes (optional)</Text>
            <TextInput
              style={s.notesInput}
              placeholder="Describe your goal, target audience, budget, or any specific requirements..."
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              maxLength={500}
            />
            <Text style={s.notesCount}>{notes.length}/500</Text>
          </View>
        )}
      </ScrollView>

      {selected && (
        <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[s.submitBtn, submitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color={colors.white} />
                <Text style={s.submitBtnTxt}>
                  Request: {SERVICES.find((s) => s.key === selected)?.title}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
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

  heroCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.brandSurface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.brand + '30',
    alignItems: 'flex-start',
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  heroSub: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },

  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  serviceCardSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSurface,
  },
  serviceIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.brandSurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  serviceBody: { flex: 1 },
  serviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
    flexWrap: 'wrap',
  },
  serviceTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  serviceDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },

  notesSection: { marginTop: 8, marginBottom: 16 },
  notesLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  notesInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  notesCount: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },

  footer: {
    padding: 16,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
  },
  submitBtnTxt: { color: colors.white, fontWeight: '700', fontSize: 14, flex: 1 },
});
