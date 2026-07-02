import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import {
  extractProductFromImage,
  pickImage,
  requestImagePermissions,
  saveExtractedProduct,
  type ExtractedProduct,
  type PickedImage,
} from '@/services/uploadStudioService';
import type { UploadStudioScreenProps } from '@/types/navigation';

type Step = 'pick' | 'processing' | 'review' | 'saving' | 'saved';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StepHeader({
  step,
  onBack,
  onClose,
}: {
  step: Step;
  onBack?: () => void;
  onClose: () => void;
}) {
  const titles: Record<Step, string> = {
    pick: 'Upload Studio',
    processing: 'Extracting Info',
    review: 'Review Product',
    saving: 'Saving…',
    saved: 'Product Added',
  };

  return (
    <View style={styles.header}>
      {onBack && step === 'review' ? (
        <TouchableOpacity onPress={onBack} style={styles.headerSideBtn}>
          <Text style={styles.headerSideBtnText}>‹ Back</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSideBtn} />
      )}
      <Text style={styles.headerTitle}>{titles[step]}</Text>
      <TouchableOpacity onPress={onClose} style={styles.headerSideBtn}>
        <Text style={styles.headerCloseBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function UploadStudioScreen({ navigation }: UploadStudioScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedStoreId, hasPermission, isOwner } = useBusiness();

  const canManage = isOwner || hasPermission('upload_studio.manage');

  const [step, setStep] = useState<Step>('pick');
  const [pickedImage, setPickedImage] = useState<PickedImage | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Review form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [confidence, setConfidence] = useState<number | undefined>(undefined);
  const [wasExtracted, setWasExtracted] = useState(false);

  // Saved result
  const [savedProductId, setSavedProductId] = useState<string | null>(null);
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleClose() {
    navigation.goBack();
  }

  function resetToStart() {
    setStep('pick');
    setPickedImage(null);
    setExtractError(null);
    setName('');
    setDescription('');
    setPrice('');
    setCategory('');
    setConfidence(undefined);
    setWasExtracted(false);
    setSaveError(null);
  }

  // ── Step 1: Pick image ────────────────────────────────────────────────────

  async function handlePick(source: 'camera' | 'library') {
    if (!selectedStoreId) {
      Alert.alert('No store', 'Select a store before adding products.');
      return;
    }

    const { granted } = await requestImagePermissions(source);
    if (!granted) {
      Alert.alert(
        'Permission required',
        `Please grant ${source === 'camera' ? 'camera' : 'photo library'} access in your device settings.`,
      );
      return;
    }

    const { image, cancelled, error } = await pickImage(source);
    if (cancelled) return;
    if (error || !image) {
      Alert.alert('Error', error ?? 'Could not open image picker');
      return;
    }

    setPickedImage(image);
    setStep('processing');
    void handleExtract(image);
  }

  // ── Step 2: Extract ───────────────────────────────────────────────────────

  async function handleExtract(image: PickedImage) {
    setExtractError(null);
    const { extracted, error } = await extractProductFromImage(image, selectedStoreId!);

    if (error || !extracted) {
      setExtractError(error ?? 'AI extraction failed');
      // Still go to review — user fills in manually
      setName('');
      setDescription('');
      setPrice('');
      setCategory('');
      setWasExtracted(false);
    } else {
      setName(extracted.name);
      setDescription(extracted.description);
      setPrice(extracted.price);
      setCategory(extracted.category);
      setConfidence(extracted.confidence);
      setWasExtracted(true);
    }

    setStep('review');
  }

  // ── Step 3: Save ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selectedStoreId || !canManage) return;
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a product name before saving.');
      return;
    }

    setStep('saving');
    setSaveError(null);

    const { productId, imageUrl, error } = await saveExtractedProduct({
      storeId: selectedStoreId,
      name,
      description,
      price,
      category,
      imageUri: pickedImage?.uri ?? null,
    });

    if (error) {
      setSaveError(error);
      setStep('review');
      return;
    }

    setSavedProductId(productId);
    setSavedImageUrl(imageUrl);
    setStep('saved');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <StepHeader
        step={step}
        onBack={step === 'review' ? resetToStart : undefined}
        onClose={handleClose}
      />

      {/* ── Step: Pick ──────────────────────────────────────────── */}
      {step === 'pick' && (
        <View style={styles.pickContainer}>
          <View style={styles.pickHero}>
            <Text style={styles.pickHeroEmoji}>📷</Text>
            <Text style={styles.pickTitle}>Add a product with AI</Text>
            <Text style={styles.pickSubtitle}>
              Take a photo or choose from your library. Our AI will extract the product name,
              description, price, and category automatically.
            </Text>
          </View>

          {!selectedStoreId && (
            <View style={styles.noStoreBanner}>
              <Text style={styles.noStoreBannerText}>⚠ Select a store first from the Home tab.</Text>
            </View>
          )}

          <View style={styles.pickActions}>
            <TouchableOpacity
              style={[styles.pickBtn, styles.pickBtnPrimary, !selectedStoreId && styles.pickBtnDisabled]}
              onPress={() => void handlePick('camera')}
              disabled={!selectedStoreId}
              activeOpacity={0.85}
            >
              <Text style={styles.pickBtnIcon}>📸</Text>
              <Text style={styles.pickBtnLabel}>Take Photo</Text>
              <Text style={styles.pickBtnSub}>Use your camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pickBtn, styles.pickBtnSecondary, !selectedStoreId && styles.pickBtnDisabled]}
              onPress={() => void handlePick('library')}
              disabled={!selectedStoreId}
              activeOpacity={0.85}
            >
              <Text style={styles.pickBtnIcon}>🖼️</Text>
              <Text style={styles.pickBtnLabel}>Choose Photo</Text>
              <Text style={styles.pickBtnSub}>From your library</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.pickNote}>
            Works best with a clear photo of your product on a neutral background.
          </Text>
        </View>
      )}

      {/* ── Step: Processing ────────────────────────────────────── */}
      {step === 'processing' && (
        <View style={styles.processingContainer}>
          {pickedImage && (
            <Image source={{ uri: pickedImage.uri }} style={styles.processingPreview} resizeMode="cover" />
          )}
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.processingTitle}>Extracting product info…</Text>
            <Text style={styles.processingSubtitle}>
              AI is reading your image to identify the product details.
            </Text>
          </View>
        </View>
      )}

      {/* ── Step: Review ────────────────────────────────────────── */}
      {(step === 'review' || step === 'saving') && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Image preview */}
          {pickedImage && (
            <Image source={{ uri: pickedImage.uri }} style={styles.reviewImage} resizeMode="cover" />
          )}

          {/* Extraction result banner */}
          {extractError ? (
            <View style={styles.extractWarnBanner}>
              <Text style={styles.extractWarnText}>
                ⚠ AI extraction failed — fill in the details manually.
              </Text>
            </View>
          ) : wasExtracted && confidence !== undefined && confidence < 0.7 ? (
            <View style={styles.extractInfoBanner}>
              <Text style={styles.extractInfoText}>
                ℹ AI extracted this info — please review and correct any errors.
              </Text>
            </View>
          ) : wasExtracted ? (
            <View style={styles.extractSuccessBanner}>
              <Text style={styles.extractSuccessText}>
                ✓ Info extracted. Review and save when ready.
              </Text>
            </View>
          ) : null}

          {/* Form */}
          <View style={styles.formCard}>
            <Text style={styles.sectionLabel}>Product Details</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.fieldInput}
                value={name}
                onChangeText={setName}
                placeholder="Product name"
                placeholderTextColor={colors.textMuted}
                maxLength={120}
                editable={step !== 'saving'}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMultiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Short product description"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={500}
                textAlignVertical="top"
                editable={step !== 'saving'}
              />
            </View>

            <View style={styles.fieldRow}>
              <View style={[styles.fieldGroup, styles.fieldHalf]}>
                <Text style={styles.fieldLabel}>Price ($)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  editable={step !== 'saving'}
                />
              </View>
              <View style={[styles.fieldGroup, styles.fieldHalf]}>
                <Text style={styles.fieldLabel}>Category</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={category}
                  onChangeText={setCategory}
                  placeholder="e.g. Mains"
                  placeholderTextColor={colors.textMuted}
                  maxLength={60}
                  editable={step !== 'saving'}
                />
              </View>
            </View>
          </View>

          {/* Save error */}
          {saveError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>⚠ {saveError}</Text>
            </View>
          )}

          {/* Actions */}
          {canManage ? (
            <TouchableOpacity
              style={[styles.saveBtn, step === 'saving' && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={step === 'saving'}
              activeOpacity={0.85}
            >
              {step === 'saving' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Product</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.noPermBanner}>
              <Text style={styles.noPermText}>
                You have view-only access. Contact your manager to save products.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.retryLink} onPress={resetToStart} disabled={step === 'saving'}>
            <Text style={styles.retryLinkText}>Try a different photo</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Step: Saved ─────────────────────────────────────────── */}
      {step === 'saved' && (
        <View style={styles.savedContainer}>
          {savedImageUrl && (
            <Image source={{ uri: savedImageUrl }} style={styles.savedImage} resizeMode="cover" />
          )}
          <View style={styles.savedCard}>
            <Text style={styles.savedIcon}>✅</Text>
            <Text style={styles.savedTitle}>Product Added!</Text>
            <Text style={styles.savedName}>{name}</Text>
            {price && <Text style={styles.savedPrice}>${parseFloat(price).toFixed(2)}</Text>}
            <Text style={styles.savedSub}>
              Your product has been saved to your catalog.
            </Text>
          </View>

          <View style={styles.savedActions}>
            <TouchableOpacity style={styles.addAnotherBtn} onPress={resetToStart} activeOpacity={0.85}>
              <Text style={styles.addAnotherBtnText}>Add Another Product</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={handleClose} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  headerSideBtn: { width: 70 },
  headerSideBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerCloseBtnText: { fontSize: 18, color: 'rgba(255,255,255,0.85)', fontWeight: '600', textAlign: 'right' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },

  // ── Pick step
  pickContainer: {
    flex: 1, paddingHorizontal: 24, paddingTop: 32, gap: 24,
  },
  pickHero: { alignItems: 'center', gap: 12 },
  pickHeroEmoji: { fontSize: 52 },
  pickTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  pickSubtitle: {
    fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21,
    paddingHorizontal: 8,
  },

  noStoreBanner: {
    backgroundColor: colors.warningSurface, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.warningBorder,
  },
  noStoreBannerText: { fontSize: 13, color: colors.warning, fontWeight: '600', textAlign: 'center' },

  pickActions: { flexDirection: 'row', gap: 12 },
  pickBtn: {
    flex: 1, borderRadius: 16, padding: 20,
    alignItems: 'center', gap: 8,
    borderWidth: 1,
  },
  pickBtnPrimary: { backgroundColor: colors.brand, borderColor: colors.brandDark },
  pickBtnSecondary: { backgroundColor: colors.card, borderColor: colors.border },
  pickBtnDisabled: { opacity: 0.45 },
  pickBtnIcon: { fontSize: 32 },
  pickBtnLabel: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  pickBtnSub: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },

  pickNote: {
    fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18,
    paddingHorizontal: 16,
  },

  // ── Processing step
  processingContainer: {
    flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 32, gap: 24,
  },
  processingPreview: {
    width: 160, height: 160, borderRadius: 20,
    borderWidth: 2, borderColor: colors.border,
  },
  processingCard: { alignItems: 'center', gap: 14 },
  processingTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  processingSubtitle: {
    fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21,
  },

  // ── Review step
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  reviewImage: { width: '100%', height: 200, borderRadius: 14 },

  extractSuccessBanner: {
    backgroundColor: colors.success + '12', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.success + '40',
  },
  extractSuccessText: { fontSize: 13, color: colors.success, fontWeight: '600' },

  extractInfoBanner: {
    backgroundColor: colors.info + '12', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.info + '40',
  },
  extractInfoText: { fontSize: 13, color: colors.info, fontWeight: '500' },

  extractWarnBanner: {
    backgroundColor: colors.warningSurface, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.warningBorder,
  },
  extractWarnText: { fontSize: 13, color: colors.warning, fontWeight: '600' },

  formCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 16,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  fieldGroup: { gap: 6 },
  fieldHalf: { flex: 1 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  fieldInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.textPrimary, backgroundColor: colors.bg,
  },
  fieldInputMultiline: { minHeight: 80, paddingTop: 11 },

  errorBanner: {
    backgroundColor: colors.dangerSurface, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.dangerBorder,
  },
  errorBannerText: { fontSize: 13, color: colors.danger, fontWeight: '600' },

  saveBtn: {
    backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  noPermBanner: {
    backgroundColor: colors.borderLight, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  noPermText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },

  retryLink: { alignItems: 'center', paddingVertical: 8 },
  retryLinkText: { fontSize: 14, color: colors.brand, fontWeight: '600' },

  // ── Saved step
  savedContainer: {
    flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 32, gap: 20,
  },
  savedImage: { width: 160, height: 160, borderRadius: 20 },
  savedCard: { alignItems: 'center', gap: 8 },
  savedIcon: { fontSize: 48 },
  savedTitle: { fontSize: 22, fontWeight: '900', color: colors.success },
  savedName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  savedPrice: { fontSize: 20, fontWeight: '900', color: colors.brand },
  savedSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginTop: 4 },

  savedActions: { width: '100%', gap: 10 },
  addAnotherBtn: {
    backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center',
  },
  addAnotherBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  doneBtn: {
    backgroundColor: colors.card, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
});
