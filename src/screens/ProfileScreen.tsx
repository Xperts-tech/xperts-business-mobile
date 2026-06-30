import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  CORPORATE_DOC_DEFS,
  REQUIRED_DOC_DEFS,
  REQUIRED_DOC_TYPES,
  type Zone,
  applyForCorporateScreening,
  fetchZones,
  getOnboardingState,
  listMyDocuments,
  submitDriverForReview,
  updateDriverPhone,
  updateDriverServiceArea,
  updateDriverVehicle,
  updateDriverZone,
} from '@/services/driverProfileService';
import {
  type PickResult,
  launchDocCamera,
  launchDocumentFilePicker,
  launchProfileCamera,
  launchSelfieCamera,
  uploadAndRecord,
} from '@/services/driverDocumentService';
import {
  getCorporateExpiryWarnings,
  getCorporateStatus,
} from '@/lib/corporateDriver';
import type { DriverDocument } from '@/types/driver';
import type { DriverStackParamList, ProfileScreenProps } from '@/types/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

type DocStatusCfg = { label: string; bg: string; text: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function docStatusCfg(status: string | null | undefined): DocStatusCfg {
  switch (status) {
    case 'approved':  return { label: 'Approved',      bg: colors.successSurface, text: '#166534' };
    case 'rejected':  return { label: 'Rejected',      bg: colors.dangerSurface,  text: '#991B1B' };
    case 'pending':   return { label: 'Pending Review', bg: colors.warningSurface, text: '#92400E' };
    default:          return { label: 'Uploaded',      bg: colors.brandSurface,   text: colors.brand };
  }
}

// ── Small reusable components ─────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return <Text style={st.sectionTitle}>{children}</Text>;
}

function StatusPill({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <View style={[st.pill, { backgroundColor: bg }]}>
      <Text style={[st.pillText, { color: text }]}>{label}</Text>
    </View>
  );
}

function InfoRow({
  label,
  value,
  pill,
  onEdit,
}: {
  label: string;
  value: string;
  pill?: { bg: string; text: string };
  onEdit?: () => void;
}) {
  return (
    <View style={st.infoRow}>
      <Text style={st.infoLabel}>{label}</Text>
      <View style={st.infoRight}>
        {pill ? (
          <StatusPill label={value} bg={pill.bg} text={pill.text} />
        ) : (
          <Text style={st.infoValue} numberOfLines={1}>{value}</Text>
        )}
        {onEdit ? (
          <TouchableOpacity style={st.editBtn} onPress={onEdit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={st.editBtnText}>Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function CapRow({ label, enabled }: { label: string; enabled: boolean | null }) {
  return (
    <View style={st.capRow}>
      <Text style={st.capLabel}>{label}</Text>
      <StatusPill
        label={enabled ? 'Enabled' : 'Disabled'}
        bg={enabled ? colors.successSurface : '#F1F5F9'}
        text={enabled ? '#166534' : '#64748B'}
      />
    </View>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocRow({
  docType,
  label,
  hint,
  doc,
  uploading,
  buttonLabel = 'Add',
  onUpload,
}: {
  docType: string;
  label: string;
  hint: string;
  doc: DriverDocument | undefined;
  uploading: boolean;
  buttonLabel?: string;
  onUpload: () => void;
}) {
  const cfg = doc ? docStatusCfg(doc.status) : { label: 'Missing', bg: '#F1F5F9', text: '#94A3B8' };
  const isMissing = !doc;
  const isRejected = doc?.status === 'rejected';
  const canUpload = isMissing || isRejected;

  return (
    <View style={st.docRow}>
      <View style={st.docInfo}>
        <Text style={st.docLabel}>{label}</Text>
        <Text style={st.docHint}>{hint}</Text>
        {doc?.notes && isRejected ? (
          <Text style={st.docNote}>Note: {doc.notes}</Text>
        ) : null}
      </View>
      <View style={st.docRight}>
        <StatusPill label={cfg.label} bg={cfg.bg} text={cfg.text} />
        {canUpload ? (
          <TouchableOpacity
            style={[st.uploadBtn, uploading && { opacity: 0.5 }]}
            onPress={onUpload}
            disabled={uploading}
            activeOpacity={0.8}
          >
            {uploading
              ? <ActivityIndicator size="small" color={colors.brand} />
              : <Text style={st.uploadBtnText}>{buttonLabel}</Text>}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

type EditField = 'phone' | 'vehicle_type' | 'vehicle_plate' | 'service_area' | 'zone';

function EditModal({
  field,
  initialValue,
  zones,
  visible,
  saving,
  onSave,
  onClose,
}: {
  field: EditField | null;
  initialValue: string;
  zones: Zone[];
  visible: boolean;
  saving: boolean;
  onSave: (field: EditField, value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const labels: Record<EditField, string> = {
    phone:         'Phone Number',
    vehicle_type:  'Vehicle Type',
    vehicle_plate: 'Vehicle Plate',
    service_area:  'Service Area',
    zone:          'Dispatch Zone',
  };
  const placeholders: Record<EditField, string> = {
    phone:         'e.g. +18761234567',
    vehicle_type:  'e.g. motorcycle, car, van',
    vehicle_plate: 'e.g. AB1234',
    service_area:  'e.g. Kingston and St. Andrew',
    zone:          '',
  };

  if (!field) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={mod.overlay}>
        <View style={mod.sheet}>
          <Text style={mod.title}>{labels[field]}</Text>

          {field === 'zone' ? (
            <View style={mod.zoneList}>
              {zones.map((z) => (
                <TouchableOpacity
                  key={z.id}
                  style={[mod.zoneRow, value === z.id && mod.zoneRowSelected]}
                  onPress={() => setValue(z.id)}
                  activeOpacity={0.75}
                >
                  <Text style={[mod.zoneLabel, value === z.id && mod.zoneLabelSelected]}>
                    {z.name}
                  </Text>
                  {value === z.id ? <Text style={mod.zoneCheck}>✓</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <TextInput
              style={mod.input}
              value={value}
              onChangeText={setValue}
              placeholder={placeholders[field]}
              placeholderTextColor={colors.textMuted}
              autoCapitalize={field === 'phone' ? 'none' : 'words'}
              keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
              returnKeyType="done"
              editable={!saving}
            />
          )}

          <View style={mod.btnRow}>
            <TouchableOpacity style={mod.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={mod.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[mod.saveBtn, saving && { opacity: 0.6 }]}
              onPress={() => field && onSave(field, value)}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={mod.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Pick-method alert for general doc uploads ─────────────────────────────────

function chooseDocPickMethod(label: string): Promise<'camera' | 'file' | 'cancel'> {
  return new Promise((resolve) => {
    Alert.alert(
      `Add ${label}`,
      'Take a new photo or choose an existing file (image or PDF).',
      [
        { text: 'Take Photo', onPress: () => resolve('camera') },
        { text: 'Choose File (PDF / Image)', onPress: () => resolve('file') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
      ],
    );
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen(_props: ProfileScreenProps) {
  const { user, profile, driverRow, profilePhotoUrl, signOut, refreshDriverRow, refreshProfilePhoto } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<DriverStackParamList>>();

  // Documents state
  const [documents,    setDocuments]    = useState<DriverDocument[]>([]);
  const [loadingDocs,  setLoadingDocs]  = useState(true);
  const [docsError,    setDocsError]    = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  // Zones state
  const [zones, setZones] = useState<Zone[]>([]);

  // Edit modal state
  const [editField,     setEditField]     = useState<EditField | null>(null);
  const [editInitial,   setEditInitial]   = useState('');
  const [savingField,   setSavingField]   = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);

  // Refresh
  const [refreshing, setRefreshing] = useState(false);

  // Corporate
  const [applyingCorp, setApplyingCorp] = useState(false);

  // Selfie-with-ID preview state
  const [selfiePreviewUri, setSelfiePreviewUri] = useState<string | null>(null);
  const [selfieMimeType, setSelfieMimeType] = useState('image/jpeg');
  const [selfieUploading, setSelfieUploading] = useState(false);
  const [selfieError, setSelfieError] = useState<string | null>(null);

  // ── Load documents & zones ──────────────────────────────────────────────────
  const loadDocuments = useCallback(async () => {
    if (!driverRow?.id) { setLoadingDocs(false); return; }
    setDocsError(null);
    const { documents: docs, error } = await listMyDocuments(driverRow.id);
    setLoadingDocs(false);
    if (error) { setDocsError(error); return; }
    setDocuments(docs);
  }, [driverRow?.id]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  useEffect(() => {
    fetchZones().then(setZones).catch(() => {});
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      refreshDriverRow(),
      loadDocuments(),
    ]).finally(() => setRefreshing(false));
  }, [refreshDriverRow, loadDocuments]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const uploadedTypes = new Set(documents.map((d) => d.document_type));
  const documentsByType = new Map(documents.map((d) => [d.document_type, d]));
  const missingDocs = REQUIRED_DOC_TYPES.filter((t) => !uploadedTypes.has(t));
  const onboardingState = getOnboardingState({ driver: driverRow, uploadedTypes });

  const fullName       = profile?.full_name ?? '—';
  const email          = user?.email ?? '—';
  const phone          = driverRow?.phone ?? profile?.phone ?? '—';
  const approvalStatus = driverRow?.approval_status ?? 'pending';
  const avatarLetter   = (profile?.full_name ?? 'D').charAt(0).toUpperCase();
  const rating         = driverRow?.rating != null ? Number(driverRow.rating).toFixed(1) : null;
  const completedJobs  = driverRow?.completed_jobs ?? 0;
  const currentZoneName = zones.find((z) => z.id === driverRow?.zone_id)?.name ?? null;

  const approvalCfg: Record<string, { label: string; bg: string; text: string }> = {
    approved:  { label: 'Approved',  bg: colors.successSurface, text: '#166534' },
    pending:   { label: 'Pending',   bg: colors.warningSurface,  text: '#92400E' },
    rejected:  { label: 'Rejected',  bg: colors.dangerSurface,  text: '#991B1B' },
    suspended: { label: 'Suspended', bg: '#F3F4F6',              text: '#374151' },
  };
  const approvalBadge = approvalCfg[approvalStatus] ?? approvalCfg.pending;

  // getCorporateStatus checks metadata.corporate.status first, then corporate_driver_status column
  const corporateStatus = getCorporateStatus(driverRow);
  const corpExpiryWarnings = getCorporateExpiryWarnings(driverRow);
  const corpCfg: Record<string, { label: string; bg: string; text: string }> = {
    not_applied: { label: 'Not Applied',        bg: '#F1F5F9',             text: '#64748B' },
    pending:     { label: 'Under Review',       bg: colors.warningSurface, text: '#92400E' },
    approved:    { label: 'Corporate Approved', bg: colors.successSurface, text: '#166534' },
    rejected:    { label: 'Not Approved',       bg: colors.dangerSurface,  text: '#991B1B' },
    suspended:   { label: 'Suspended',          bg: '#F3F4F6',             text: '#374151' },
  };
  const corpBadge = corpCfg[corporateStatus] ?? corpCfg.not_applied;

  // ── Edit handlers ───────────────────────────────────────────────────────────
  function openEdit(field: EditField, initial: string) {
    setSaveError(null);
    setEditInitial(initial);
    setEditField(field);
  }

  const handleSave = useCallback(async (field: EditField, value: string) => {
    if (!user?.id || !driverRow) return;
    setSavingField(true);
    setSaveError(null);

    let err: string | null = null;
    switch (field) {
      case 'phone':
        ({ error: err } = await updateDriverPhone(user.id, value));
        break;
      case 'vehicle_type':
      case 'vehicle_plate': {
        const newType  = field === 'vehicle_type'  ? value : driverRow.vehicle_type  ?? '';
        const newPlate = field === 'vehicle_plate' ? value : driverRow.vehicle_plate ?? '';
        ({ error: err } = await updateDriverVehicle(user.id, newType, newPlate));
        break;
      }
      case 'service_area':
        ({ error: err } = await updateDriverServiceArea(user.id, value));
        break;
      case 'zone':
        if (!value) { err = 'Please select a zone.'; break; }
        ({ error: err } = await updateDriverZone(user.id, value));
        break;
    }

    setSavingField(false);
    if (err) { setSaveError(err); return; }
    setEditField(null);
    await refreshDriverRow();
  }, [user?.id, driverRow, refreshDriverRow]);

  // ── Document upload handler ─────────────────────────────────────────────────
  const handleUpload = useCallback(async (docType: string) => {
    if (!user?.id || !driverRow?.id) return;

    // selfie_with_id: camera-only with in-app preview before upload
    if (docType === 'selfie_with_id') {
      setSelfieError(null);
      const res = await launchSelfieCamera();
      if (res.cancelled) return;
      if (res.error) { Alert.alert('Camera Error', res.error); return; }
      if (res.uri) {
        setSelfiePreviewUri(res.uri);
        setSelfieMimeType(res.mimeType);
      }
      return;
    }

    // profile_photo: front camera, falls back to library on permission denial
    if (docType === 'profile_photo') {
      const res = await launchProfileCamera();
      if (res.cancelled || !res.uri) return;
      if (res.error) { Alert.alert('Upload Failed', res.error); return; }
      setUploadingDoc('profile_photo');
      const { document, error: uploadErr } = await uploadAndRecord(
        user.id, driverRow.id, 'profile_photo', res.uri, res.mimeType,
      );
      setUploadingDoc(null);
      if (uploadErr) { Alert.alert('Upload Failed', uploadErr); return; }
      if (document) {
        setDocuments((prev) => [document, ...prev.filter((d) => d.document_type !== 'profile_photo')]);
        void refreshProfilePhoto();
      }
      return;
    }

    // All other docs: action sheet → camera or file picker (PDF + image)
    const def = [...REQUIRED_DOC_DEFS, ...CORPORATE_DOC_DEFS].find((d) => d.type === docType);
    const choice = await chooseDocPickMethod(def?.label ?? 'Document');
    if (choice === 'cancel') return;

    const res: PickResult = choice === 'camera'
      ? await launchDocCamera()
      : await launchDocumentFilePicker();

    if (res.cancelled || !res.uri) return;
    if (res.error) { Alert.alert('Upload Failed', res.error); return; }

    setUploadingDoc(docType);
    const { document, error: uploadErr } = await uploadAndRecord(
      user.id, driverRow.id, docType, res.uri, res.mimeType,
    );
    setUploadingDoc(null);
    if (uploadErr) { Alert.alert('Upload Failed', uploadErr); return; }
    if (document) {
      setDocuments((prev) => [document, ...prev.filter((d) => d.document_type !== docType)]);
    }
  }, [user?.id, driverRow?.id, refreshProfilePhoto]);

  // ── Submit for review ───────────────────────────────────────────────────────
  const handleSubmitForReview = useCallback(async () => {
    if (!driverRow?.id) return;
    Alert.alert(
      'Submit for Review',
      'Are you ready to submit your application? Xperts will review your documents and contact you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'default',
          onPress: async () => {
            const { error } = await submitDriverForReview(driverRow.id);
            if (error) { Alert.alert('Error', error); return; }
            await refreshDriverRow();
          },
        },
      ],
    );
  }, [driverRow?.id, refreshDriverRow]);

  // ── Apply for corporate screening ───────────────────────────────────────────
  const handleApplyCorporate = useCallback(async () => {
    if (!driverRow?.id || applyingCorp) return;
    Alert.alert(
      'Apply for Corporate Screening',
      'Your account will be submitted for Xperts corporate background screening. Upload all 5 corporate documents before or after applying.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          style: 'default',
          onPress: async () => {
            setApplyingCorp(true);
            const { error, alreadyApplied } = await applyForCorporateScreening(driverRow.id);
            setApplyingCorp(false);
            if (error) { Alert.alert('Error', error); return; }
            if (alreadyApplied) {
              Alert.alert('Already Submitted', 'Your application is already pending or has been approved.');
              return;
            }
            await refreshDriverRow();
          },
        },
      ],
    );
  }, [driverRow?.id, applyingCorp, refreshDriverRow]);

  // ── Onboarding banner ───────────────────────────────────────────────────────
  function renderOnboardingBanner() {
    if (onboardingState === 'approved') return null;

    const bannerCfg: Record<string, { bg: string; border: string; title: string; body: string; titleColor: string; bodyColor: string }> = {
      draft:                 { bg: colors.brandSurface,   border: colors.borderLight, titleColor: colors.brand,     bodyColor: colors.textSecondary, title: 'Complete Your Profile',          body: 'Upload your required documents to activate your driver account.' },
      documents_incomplete:  { bg: colors.warningSurface, border: colors.warningBorder, titleColor: '#92400E', bodyColor: '#92400E', title: 'Documents Incomplete',           body: `${missingDocs.length} document${missingDocs.length === 1 ? '' : 's'} missing. See the Documents section below.` },
      ready_to_submit:       { bg: colors.successSurface, border: colors.successBorder, titleColor: '#166534', bodyColor: colors.textSecondary, title: 'Ready to Submit!',               body: 'All documents are uploaded. Submit your application for review.' },
      submitted_pending:     { bg: colors.brandSurface,   border: colors.borderLight, titleColor: colors.brand,     bodyColor: colors.textSecondary, title: 'Application Under Review',      body: 'Your documents have been submitted. We will contact you shortly.' },
      rejected:              { bg: colors.dangerSurface,  border: colors.dangerBorder, titleColor: '#991B1B', bodyColor: '#991B1B', title: 'Application Rejected',           body: driverRow?.rejected_reason ?? driverRow?.rejection_notes ?? 'See rejection notes below.' },
      suspended:             { bg: '#F3F4F6',             border: colors.border,       titleColor: '#374151', bodyColor: colors.textSecondary, title: 'Account Suspended',              body: driverRow?.suspension_reason ?? 'Contact Xperts support for details.' },
      no_profile:            { bg: colors.warningSurface, border: colors.warningBorder, titleColor: '#92400E', bodyColor: '#92400E', title: 'Profile Not Found',              body: 'No driver profile linked to this account.' },
    };

    const cfg = bannerCfg[onboardingState];
    if (!cfg) return null;

    return (
      <View style={[st.onboardBanner, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
        <Text style={[st.onboardTitle, { color: cfg.titleColor }]}>{cfg.title}</Text>
        <Text style={[st.onboardBody,  { color: cfg.bodyColor  }]}>{cfg.body}</Text>

        {onboardingState === 'rejected' && driverRow?.more_info_notes ? (
          <Text style={[st.onboardBody, { color: cfg.bodyColor, marginTop: 6 }]}>
            Info needed: {driverRow.more_info_notes}
          </Text>
        ) : null}

        {onboardingState === 'ready_to_submit' ? (
          <TouchableOpacity style={st.submitBtn} onPress={handleSubmitForReview} activeOpacity={0.85}>
            <Text style={st.submitBtnText}>Submit Application</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
    <ScrollView
      style={st.scroll}
      contentContainerStyle={[st.container, { paddingTop: insets.top + 16 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />
      }
    >
      {/* ── A: Hero card ────────────────────────────────────────── */}
      <View style={st.heroCard}>
        {/* Tappable avatar — tap to change profile photo */}
        <TouchableOpacity
          style={st.avatarRing}
          onPress={() => void handleUpload('profile_photo')}
          activeOpacity={0.85}
          disabled={uploadingDoc === 'profile_photo'}
        >
          {profilePhotoUrl ? (
            <Image source={{ uri: profilePhotoUrl }} style={st.avatarImage} />
          ) : (
            <View style={st.avatarCircle}>
              <Text style={st.avatarLetter}>{avatarLetter}</Text>
            </View>
          )}
          <View style={st.avatarCameraBadge}>
            {uploadingDoc === 'profile_photo'
              ? <ActivityIndicator size="small" color={colors.brand} />
              : <Text style={st.avatarCameraIcon}>✎</Text>}
          </View>
        </TouchableOpacity>

        <Text style={st.fullName}>{fullName}</Text>
        <Text style={st.roleTag}>Xperts Driver</Text>

        {/* Approval + online status badges */}
        <View style={st.heroBadgeRow}>
          <View style={[st.heroBadge, { backgroundColor: approvalBadge.bg }]}>
            <Text style={[st.heroBadgeText, { color: approvalBadge.text }]}>{approvalBadge.label}</Text>
          </View>
          <View style={[st.heroBadge, {
            backgroundColor: driverRow?.online_status === 'online'
              ? colors.successSurface
              : driverRow?.online_status === 'busy'
              ? colors.warningSurface
              : '#F1F5F9',
          }]}>
            <Text style={[st.heroBadgeText, {
              color: driverRow?.online_status === 'online'
                ? '#166534'
                : driverRow?.online_status === 'busy'
                ? '#92400E'
                : '#64748B',
            }]}>
              {driverRow?.online_status === 'online' ? 'Online'
                : driverRow?.online_status === 'busy' ? 'Busy'
                : 'Offline'}
            </Text>
          </View>
        </View>

        {rating !== null ? (
          <View style={st.heroStats}>
            <View style={st.heroStat}>
              <Text style={st.heroStatVal}>⭐ {rating}</Text>
              <Text style={st.heroStatLabel}>Rating</Text>
            </View>
            <View style={st.heroStatDivider} />
            <View style={st.heroStat}>
              <Text style={st.heroStatVal}>{completedJobs}</Text>
              <Text style={st.heroStatLabel}>Jobs Done</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* ── B: Onboarding banner ─────────────────────────────────── */}
      {renderOnboardingBanner()}

      {/* ── C: Account info ──────────────────────────────────────── */}
      <View style={st.card}>
        <SectionTitle>Account</SectionTitle>
        <InfoRow label="Email"   value={email} />
        <View style={st.divider} />
        <InfoRow
          label="Phone"
          value={phone}
          onEdit={() => openEdit('phone', driverRow?.phone ?? '')}
        />
        <View style={st.divider} />
        <InfoRow
          label="Account Status"
          value={approvalBadge.label}
          pill={approvalBadge}
        />
        <View style={st.divider} />
        <InfoRow
          label="Online Status"
          value={driverRow?.online_status === 'online' ? 'Online' : driverRow?.online_status === 'busy' ? 'Busy' : 'Offline'}
          pill={
            driverRow?.online_status === 'online'
              ? { bg: colors.successSurface, text: '#166534' }
              : driverRow?.online_status === 'busy'
              ? { bg: colors.warningSurface, text: '#92400E' }
              : { bg: '#F1F5F9', text: '#64748B' }
          }
        />
        {saveError ? (
          <View style={st.saveErrBox}>
            <Text style={st.saveErrText}>{saveError}</Text>
          </View>
        ) : null}
      </View>

      {/* ── D: Vehicle & area ────────────────────────────────────── */}
      <View style={st.card}>
        <SectionTitle>Vehicle & Area</SectionTitle>
        <InfoRow
          label="Vehicle Type"
          value={driverRow?.vehicle_type ?? '—'}
          onEdit={() => openEdit('vehicle_type', driverRow?.vehicle_type ?? '')}
        />
        <View style={st.divider} />
        <InfoRow
          label="Plate Number"
          value={driverRow?.vehicle_plate ?? '—'}
          onEdit={() => openEdit('vehicle_plate', driverRow?.vehicle_plate ?? '')}
        />
        <View style={st.divider} />
        <InfoRow
          label="Service Area"
          value={driverRow?.service_area ?? '—'}
          onEdit={() => openEdit('service_area', driverRow?.service_area ?? '')}
        />
        <View style={st.divider} />
        <InfoRow
          label="Dispatch Zone"
          value={currentZoneName ?? (driverRow?.zone_id ? 'Zone set' : '—')}
          onEdit={zones.length > 0 ? () => openEdit('zone', driverRow?.zone_id ?? '') : undefined}
        />
      </View>

      {/* ── E: Approved Services ────────────────────────────────── */}
      <View style={st.card}>
        <SectionTitle>Approved Services</SectionTitle>
        <CapRow label="Food Delivery"    enabled={driverRow?.can_deliver_food ?? true} />
        <View style={st.divider} />
        <CapRow label="Errands"          enabled={driverRow?.can_do_errands   ?? true} />
        <View style={st.divider} />
        <CapRow label="Courier/Packages" enabled={driverRow?.can_do_courier   ?? true} />
        {driverRow?.can_do_rides ? (
          <>
            <View style={st.divider} />
            <CapRow label="Ride Services" enabled={true} />
          </>
        ) : null}
        {driverRow?.max_active_orders != null ? (
          <>
            <View style={st.divider} />
            <InfoRow label="Max Active Orders" value={String(driverRow.max_active_orders)} />
          </>
        ) : null}
        <View style={st.capNote}>
          <Text style={st.capNoteText}>
            Your approved services are managed by Xperts admin. You can control which approved services you are available for from your home screen.{'\n'}Contact support to request changes to your approved services.
          </Text>
        </View>
      </View>

      {/* ── F: Documents ─────────────────────────────────────────── */}
      <View style={st.card}>
        <SectionTitle>Documents</SectionTitle>

        {loadingDocs ? (
          <View style={st.docsLoading}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text style={st.docsLoadingText}>Loading documents…</Text>
          </View>
        ) : docsError ? (
          <View style={st.docsErrBox}>
            <Text style={st.docsErrText}>{docsError}</Text>
            <TouchableOpacity onPress={() => void loadDocuments()} style={st.retryBtn}>
              <Text style={st.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          REQUIRED_DOC_DEFS.map((def, i) => (
            <View key={def.type}>
              {i > 0 ? <View style={st.divider} /> : null}
              <DocRow
                docType={def.type}
                label={def.label}
                hint={def.hint}
                doc={documentsByType.get(def.type)}
                uploading={uploadingDoc === def.type}
                buttonLabel={def.type === 'selfie_with_id' ? 'Take Selfie' : 'Add'}
                onUpload={() => void handleUpload(def.type)}
              />
            </View>
          ))
        )}

        {!loadingDocs && missingDocs.length === 0 && onboardingState === 'documents_incomplete' ? null : (
          !loadingDocs && missingDocs.length > 0 ? (
            <View style={st.docsSummary}>
              <Text style={st.docsSummaryText}>
                {missingDocs.length} of {REQUIRED_DOC_DEFS.length} documents still needed.
              </Text>
            </View>
          ) : null
        )}
      </View>

      {/* ── G: Corporate Screening ───────────────────────────────── */}
      {onboardingState === 'approved' ? (
        <View style={st.card}>
          <SectionTitle>Corporate Screening</SectionTitle>

          {/* Status badge */}
          <InfoRow
            label="Screening Status"
            value={corpBadge.label}
            pill={corpBadge}
          />

          {/* Police record expiry */}
          {driverRow?.corporate_police_record_expiry ? (
            <>
              <View style={st.divider} />
              <InfoRow
                label="Police Record Expiry"
                value={new Date(driverRow.corporate_police_record_expiry).toLocaleDateString()}
              />
            </>
          ) : null}

          {/* Expiry warnings */}
          {corpExpiryWarnings.length > 0 ? (
            <View style={st.corpWarnBox}>
              {corpExpiryWarnings.map((w) => (
                <Text key={w} style={st.corpWarnText}>{w}</Text>
              ))}
            </View>
          ) : null}

          {/* Corporate documents */}
          <View style={st.corpDocSection}>
            <Text style={st.corpDocSectionTitle}>Corporate Documents</Text>
            {CORPORATE_DOC_DEFS.map((def, i) => (
              <View key={def.type}>
                {i > 0 ? <View style={st.divider} /> : null}
                <DocRow
                  docType={def.type}
                  label={def.label}
                  hint={def.hint}
                  doc={documentsByType.get(def.type)}
                  uploading={uploadingDoc === def.type}
                  buttonLabel="Add"
                  onUpload={() => void handleUpload(def.type)}
                />
              </View>
            ))}
          </View>

          {/* Apply button — shown when not yet applied or rejected */}
          {(corporateStatus === 'not_applied' || corporateStatus === 'rejected') ? (
            <TouchableOpacity
              style={[st.corpApplyBtn, applyingCorp && { opacity: 0.6 }]}
              onPress={handleApplyCorporate}
              disabled={applyingCorp}
              activeOpacity={0.85}
            >
              {applyingCorp
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={st.corpApplyBtnText}>Apply for Corporate Screening</Text>}
            </TouchableOpacity>
          ) : null}

          <View style={st.corpNote}>
            <Text style={st.corpNoteText}>
              Corporate approval requires a police record, proof of address, two references, and a vehicle fitness certificate. Xperts admin reviews all applications.
            </Text>
          </View>
        </View>
      ) : null}

      {/* ── I: Rental Program ───────────────────────────────────── */}
      <TouchableOpacity
        style={st.rentalNavCard}
        onPress={() => navigation.navigate('VehicleRental')}
        activeOpacity={0.75}
      >
        <View style={{ flex: 1 }}>
          <Text style={st.rentalNavTitle}>Vehicle Rental Program</Text>
          <Text style={st.rentalNavSub}>Apply for a rental vehicle through Xperts</Text>
        </View>
        <Text style={st.rentalNavArrow}>›</Text>
      </TouchableOpacity>

      {/* ── H: Sign out ──────────────────────────────────────────── */}
      <TouchableOpacity style={st.signOutBtn} onPress={signOut} activeOpacity={0.85}>
        <Text style={st.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: insets.bottom + 16 }} />

      {/* ── Edit modal ───────────────────────────────────────────── */}
      <EditModal
        field={editField}
        initialValue={editInitial}
        zones={zones}
        visible={editField !== null}
        saving={savingField}
        onSave={handleSave}
        onClose={() => { setEditField(null); setSaveError(null); }}
      />
    </ScrollView>

    {/* ── Selfie-with-ID preview modal ─────────────────────────────── */}
    {selfiePreviewUri ? (
      <Modal
        visible
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => { setSelfiePreviewUri(null); setSelfieError(null); }}
      >
        <View style={selfieModal.root}>
          <Image
            source={{ uri: selfiePreviewUri }}
            style={selfieModal.preview}
            resizeMode="contain"
          />
          {selfieError ? (
            <View style={selfieModal.errBanner}>
              <Text style={selfieModal.errText}>{selfieError}</Text>
            </View>
          ) : null}
          <View style={[selfieModal.btnRow, { paddingBottom: insets.bottom + 24 }]}>
            <TouchableOpacity
              style={selfieModal.retakeBtn}
              onPress={() => {
                setSelfiePreviewUri(null);
                setSelfieError(null);
                void handleUpload('selfie_with_id');
              }}
              disabled={selfieUploading}
              activeOpacity={0.8}
            >
              <Text style={selfieModal.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[selfieModal.useBtn, selfieUploading && { opacity: 0.6 }]}
              onPress={async () => {
                if (!user?.id || !driverRow?.id) return;
                setSelfieUploading(true);
                setSelfieError(null);
                const { document, error } = await uploadAndRecord(
                  user.id, driverRow.id, 'selfie_with_id', selfiePreviewUri, selfieMimeType,
                );
                setSelfieUploading(false);
                if (error) { setSelfieError(error); return; }
                setSelfiePreviewUri(null);
                if (document) {
                  setDocuments((prev) => [document, ...prev.filter((d) => d.document_type !== 'selfie_with_id')]);
                }
              }}
              disabled={selfieUploading}
              activeOpacity={0.85}
            >
              {selfieUploading
                ? <ActivityIndicator color="#fff" />
                : <Text style={selfieModal.useBtnText}>Use Photo</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    ) : null}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 18, paddingBottom: 24 },

  // Hero
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  avatarRing: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 3, borderColor: colors.brandSurface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14, backgroundColor: colors.brandSurface,
  },
  avatarImage: {
    width: 82, height: 82, borderRadius: 41,
  },
  avatarCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontSize: 32, fontWeight: '900', color: '#FFFFFF' },
  avatarCameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.card,
  },
  avatarCameraIcon: { fontSize: 12, color: '#fff' },
  fullName:     { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  roleTag:      { fontSize: 13, color: colors.textMuted, fontWeight: '600', marginBottom: 10 },
  heroBadgeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  heroBadge:    { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  heroBadgeText:{ fontSize: 11, fontWeight: '800' },
  heroStats:    { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 14, width: '80%', justifyContent: 'center' },
  heroStat:     { flex: 1, alignItems: 'center' },
  heroStatDivider: { width: 1, height: 36, backgroundColor: colors.borderLight },
  heroStatVal:  { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  heroStatLabel:{ fontSize: 11, color: colors.textMuted, fontWeight: '600', marginTop: 2 },

  // Onboarding banner
  onboardBanner: {
    borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1.5,
  },
  onboardTitle: { fontSize: 14, fontWeight: '800', marginBottom: 5 },
  onboardBody:  { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  submitBtn: {
    backgroundColor: colors.brand, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginTop: 14,
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Card
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingBottom: 4,
    marginBottom: 14,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionTitle: {
    fontSize: 10, fontWeight: '900', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingTop: 16, paddingBottom: 10,
  },
  divider: { height: 1, backgroundColor: colors.borderLight },

  // Info rows
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 13, minHeight: 50,
  },
  infoLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '600', flex: 1 },
  infoRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  infoValue: { fontSize: 14, color: colors.textPrimary, fontWeight: '600', maxWidth: 160, textAlign: 'right' },
  pill:      { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pillText:  { fontSize: 11, fontWeight: '800' },
  editBtn:   { backgroundColor: colors.brandSurface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  editBtnText: { fontSize: 11, fontWeight: '800', color: colors.brand },

  saveErrBox:  { backgroundColor: colors.dangerSurface, borderRadius: 10, padding: 10, marginTop: 6, marginBottom: 4 },
  saveErrText: { fontSize: 12, color: colors.danger, fontWeight: '600' },

  // Capabilities
  capRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  capLabel:   { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  capNote:    { paddingVertical: 12 },
  capNoteText:{ fontSize: 11, color: colors.textMuted, fontWeight: '600', lineHeight: 17 },

  // Documents
  docRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', paddingVertical: 13, gap: 10,
  },
  docInfo:  { flex: 1 },
  docLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  docHint:  { fontSize: 11, color: colors.textMuted, fontWeight: '500', lineHeight: 16 },
  docNote:  { fontSize: 11, color: colors.danger, fontWeight: '600', marginTop: 4, lineHeight: 16 },
  docRight: { alignItems: 'flex-end', gap: 8 },
  uploadBtn: {
    backgroundColor: colors.brandSurface, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.brand, minWidth: 68, alignItems: 'center',
  },
  uploadBtnText: { fontSize: 11, fontWeight: '800', color: colors.brand },

  docsLoading:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, gap: 10 },
  docsLoadingText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  docsErrBox:      { paddingVertical: 14 },
  docsErrText:     { fontSize: 13, color: colors.danger, fontWeight: '600', marginBottom: 10 },
  retryBtn:        { backgroundColor: colors.brandSurface, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start' },
  retryBtnText:    { fontSize: 12, fontWeight: '800', color: colors.brand },
  docsSummary:     { backgroundColor: colors.warningSurface, borderRadius: 10, padding: 10, marginTop: 6, marginBottom: 6 },
  docsSummaryText: { fontSize: 12, fontWeight: '700', color: '#92400E' },

  // Corporate
  corpNote:     { paddingTop: 10, paddingBottom: 12 },
  corpNoteText: { fontSize: 11, color: colors.textMuted, fontWeight: '600', lineHeight: 17 },

  corpWarnBox: {
    backgroundColor: colors.warningSurface,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  corpWarnText: { fontSize: 12, color: '#92400E', fontWeight: '700', lineHeight: 18 },

  corpDocSection: { marginTop: 14 },
  corpDocSectionTitle: {
    fontSize: 10, fontWeight: '900', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },

  corpApplyBtn: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 4,
  },
  corpApplyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Rental nav card
  rentalNavCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  rentalNavTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 3 },
  rentalNavSub:   { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  rentalNavArrow: { fontSize: 22, color: colors.textMuted, fontWeight: '300', marginLeft: 8 },

  // Sign out
  signOutBtn: {
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 4,
    borderWidth: 1.5, borderColor: colors.dangerBorder,
  },
  signOutText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
});

// ── Edit modal styles ─────────────────────────────────────────────────────────

const mod = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(13,27,46,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  title: {
    fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 18,
  },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.textPrimary, backgroundColor: colors.bg,
    marginBottom: 20,
  },
  btnRow:    { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  cancelText:{ fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  saveBtn:   { flex: 1, backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveText:  { fontSize: 14, fontWeight: '800', color: '#fff' },

  zoneList: { marginBottom: 20 },
  zoneRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    marginBottom: 6, backgroundColor: colors.bg,
    borderWidth: 1.5, borderColor: colors.borderLight,
  },
  zoneRowSelected: { backgroundColor: colors.brandSurface, borderColor: colors.brand },
  zoneLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  zoneLabelSelected: { color: colors.brand, fontWeight: '800' },
  zoneCheck: { fontSize: 15, color: colors.brand, fontWeight: '900' },
});

// ── Selfie preview modal styles ───────────────────────────────────────────────

const selfieModal = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  preview: {
    flex: 1,
  },
  errBanner: {
    backgroundColor: 'rgba(220,38,38,0.92)',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  errText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: '#111',
  },
  retakeBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  retakeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  useBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: colors.brand,
  },
  useBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
