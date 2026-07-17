import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import {
  quickEditProduct,
  toggleProductAvailability,
  type QuickEditFields,
} from '@/services/productService';
import {
  formatPrice,
  getProductImageUrl,
  isProductAvailable,
  type Product,
} from '@/types/products';
import type { ProductDetailScreenProps } from '@/types/navigation';

async function fetchProduct(productId: string): Promise<Product | null> {
  const { data } = await supabase
    .from('products')
    .select(
      'id, store_id, name, description, price, is_available, category, image_url, photo_url, sort_order, metadata, created_at, updated_at',
    )
    .eq('id', productId)
    .maybeSingle();
  return (data as Product | null) ?? null;
}

export default function ProductDetailScreen({ route, navigation }: ProductDetailScreenProps) {
  const { productId } = route.params;
  const insets = useSafeAreaInsets();
  const { hasPermission, isOwner } = useBusiness();

  const canManage = isOwner || hasPermission('catalog.manage');
  const canToggleSoldOut = isOwner || hasPermission('catalog.sold_out');

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit fields
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftPrice, setDraftPrice] = useState('');

  const isDirty =
    product !== null &&
    (draftName !== product.name ||
      draftDesc !== (product.description ?? '') ||
      draftPrice !== String(product.price));

  const load = useCallback(async () => {
    setLoading(true);
    const p = await fetchProduct(productId);
    if (p) {
      setProduct(p);
      setDraftName(p.name);
      setDraftDesc(p.description ?? '');
      setDraftPrice(String(p.price));
    } else {
      setError('Product not found');
    }
    setLoading(false);
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    if (!product || !isDirty) return;
    const priceNum = parseFloat(draftPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      Alert.alert('Invalid price', 'Enter a valid price (e.g. 12.99)');
      return;
    }

    setSaving(true);
    const fields: QuickEditFields = {};
    if (draftName !== product.name) fields.name = draftName.trim();
    if (draftDesc !== (product.description ?? '')) fields.description = draftDesc.trim();
    if (priceNum !== product.price) fields.price = priceNum;

    const { error: err } = await quickEditProduct(product.id, fields);
    if (err) {
      Alert.alert('Save failed', err);
    } else {
      await load();
    }
    setSaving(false);
  }

  async function handleToggleAvailability(isAvailable: boolean) {
    if (!product) return;
    setToggling(true);
    const { error: err } = await toggleProductAvailability(product.id, isAvailable);
    if (err) {
      Alert.alert('Error', err);
    } else {
      setProduct((p) => p ? { ...p, is_available: isAvailable } : p);
    }
    setToggling(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Product</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.centered}><ActivityIndicator color={colors.brand} /></View>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Product</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Product not found'}</Text>
        </View>
      </View>
    );
  }

  const available = product.is_available !== false;
  const imageUrl = getProductImageUrl(product);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{product.name}</Text>
        {canManage && isDirty ? (
          <TouchableOpacity
            style={[styles.saveHeaderBtn, saving && styles.saveHeaderBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveHeaderBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Image ───────────────────────────────────────────── */}
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.productImage} resizeMode="cover" />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Text style={styles.productImageEmoji}>🛍️</Text>
            <Text style={styles.productImageNote}>Images managed in web portal</Text>
          </View>
        )}

        {/* ── Availability toggle ──────────────────────────────── */}
        {canToggleSoldOut && (
          <View style={styles.availCard}>
            <View style={styles.availLeft}>
              <View style={[styles.availDot, { backgroundColor: available ? colors.success : colors.danger }]} />
              <View>
                <Text style={styles.availTitle}>
                  {available ? 'In stock' : 'Sold out'}
                </Text>
                <Text style={styles.availSub}>
                  {available
                    ? 'Customers can order this item'
                    : 'Item hidden from new orders'}
                </Text>
              </View>
            </View>
            {toggling ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Switch
                value={available}
                onValueChange={handleToggleAvailability}
                trackColor={{ false: colors.danger + '60', true: colors.success + '60' }}
                thumbColor={available ? colors.success : colors.danger}
                ios_backgroundColor={colors.danger + '40'}
              />
            )}
          </View>
        )}

        {/* ── Edit fields ──────────────────────────────────────── */}
        <View style={styles.formCard}>
          <Text style={styles.sectionLabel}>Details</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={[styles.fieldInput, !canManage && styles.fieldInputReadOnly]}
              value={draftName}
              onChangeText={setDraftName}
              editable={canManage}
              placeholder="Product name"
              placeholderTextColor={colors.textMuted}
              maxLength={120}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMultiline, !canManage && styles.fieldInputReadOnly]}
              value={draftDesc}
              onChangeText={setDraftDesc}
              editable={canManage}
              placeholder="Product description"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              maxLength={500}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Price</Text>
            <TextInput
              style={[styles.fieldInput, !canManage && styles.fieldInputReadOnly]}
              value={draftPrice}
              onChangeText={setDraftPrice}
              editable={canManage}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {product.category && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Category</Text>
              <Text style={styles.fieldReadOnly}>{product.category}</Text>
            </View>
          )}
        </View>

        {/* ── Meta info ────────────────────────────────────────── */}
        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Product ID</Text>
            <Text style={styles.metaValue}>{product.id.slice(0, 16)}…</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Added</Text>
            <Text style={styles.metaValue}>
              {new Date(product.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>
          {product.updated_at && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Updated</Text>
              <Text style={styles.metaValue}>
                {new Date(product.updated_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </Text>
            </View>
          )}
        </View>

        {!canManage && (
          <Text style={styles.readOnlyNote}>
            You have view-only access to products. Contact your manager to edit.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 70 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },
  saveHeaderBtn: {
    width: 70, alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  saveHeaderBtnDisabled: { opacity: 0.6 },
  saveHeaderBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { gap: 12, paddingTop: 0, paddingHorizontal: 16, paddingBottom: 32 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },

  productImage: { width: '100%', height: 200, borderRadius: 14 },
  productImagePlaceholder: {
    width: '100%', height: 140, borderRadius: 14,
    backgroundColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  productImageEmoji: { fontSize: 40 },
  productImageNote: { fontSize: 12, color: colors.textMuted },

  availCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, gap: 12,
  },
  availLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  availDot: { width: 10, height: 10, borderRadius: 5 },
  availTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  availSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },

  formCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 16,
  },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.textPrimary, backgroundColor: colors.bg,
  },
  fieldInputReadOnly: { color: colors.textSecondary, backgroundColor: colors.borderLight },
  fieldInputMultiline: { minHeight: 80, paddingTop: 11 },
  fieldReadOnly: { fontSize: 14, color: colors.textSecondary, paddingVertical: 4 },

  metaCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 10,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  metaValue: { fontSize: 12, color: colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  readOnlyNote: {
    fontSize: 13, color: colors.textMuted, textAlign: 'center',
    paddingHorizontal: 16, lineHeight: 19,
  },
});
