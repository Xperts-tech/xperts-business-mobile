import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import type { DriverDocument, DriverRow } from '@/types/driver';

// ── Document type definitions ─────────────────────────────────────────────────

export type DocDef = { type: string; label: string; hint: string };

export const REQUIRED_DOC_DEFS: DocDef[] = [
  { type: 'gov_id_front',    label: 'Government ID',       hint: 'Front of your national ID or passport' },
  { type: 'selfie_with_id',  label: 'Selfie with ID',      hint: 'Live selfie holding your government ID' },
  { type: 'profile_photo',   label: 'Profile Photo',       hint: 'Clear face photo in good lighting' },
  { type: 'drivers_license', label: "Driver's License",    hint: 'Full driver\'s license (front)' },
  { type: 'insurance',       label: 'Insurance',           hint: 'Vehicle insurance certificate' },
  { type: 'registration',    label: 'Registration',        hint: 'Vehicle registration document' },
  { type: 'vehicle_photo',   label: 'Vehicle Photo',       hint: 'Photo of your vehicle (clearly visible)' },
  { type: 'plate_photo',     label: 'Plate Photo',         hint: 'Close-up of your license plate' },
];

export const REQUIRED_DOC_TYPES = REQUIRED_DOC_DEFS.map((d) => d.type);

// ── Corporate document type definitions ───────────────────────────────────────

export const CORPORATE_DOC_DEFS: DocDef[] = [
  { type: 'corp_police_record',    label: 'Police Record Certificate', hint: 'Original police record certificate (must include expiry date)' },
  { type: 'corp_proof_of_address', label: 'Proof of Address',          hint: 'Utility bill or bank statement — max 3 months old' },
  { type: 'corp_reference_1',      label: 'Reference 1',               hint: 'Character reference from a responsible person' },
  { type: 'corp_reference_2',      label: 'Reference 2',               hint: 'Second character reference' },
  { type: 'corp_vehicle_fitness',  label: 'Vehicle Fitness Certificate', hint: 'Current vehicle fitness / roadworthiness certificate' },
];

export const CORPORATE_DOC_TYPES = CORPORATE_DOC_DEFS.map((d) => d.type);

export type OnboardingState =
  | 'no_profile'
  | 'draft'
  | 'documents_incomplete'
  | 'ready_to_submit'
  | 'submitted_pending'
  | 'approved'
  | 'rejected'
  | 'suspended';

// ── Onboarding state (pure, mirrors web's getDriverApplicationState) ──────────

export function getOnboardingState({
  driver,
  uploadedTypes,
}: {
  driver: DriverRow | null;
  uploadedTypes: Set<string>;
}): OnboardingState {
  if (!driver) return 'no_profile';
  const status = (driver.approval_status ?? '').toLowerCase();
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if ((driver.enforcement_status ?? '').toLowerCase() === 'suspended') return 'suspended';

  const hasAllRequired = REQUIRED_DOC_TYPES.every((t) => uploadedTypes.has(t));
  const meta = driver.metadata ?? {};
  const hasSubmittedMeta =
    meta.onboarding_status === 'submitted' && Boolean(meta.onboarding_submitted_at);

  if (status === 'pending' && hasSubmittedMeta && hasAllRequired) return 'submitted_pending';
  if (hasAllRequired) return 'ready_to_submit';
  if (uploadedTypes.size > 0) return 'documents_incomplete';
  return 'draft';
}

// ── Zone list ─────────────────────────────────────────────────────────────────

export type Zone = { id: string; name: string };

export async function fetchZones(): Promise<Zone[]> {
  const { data } = await supabase.from('zones').select('id, name').order('name');
  return (data ?? []) as Zone[];
}

// ── Safe profile updates ──────────────────────────────────────────────────────

export async function updateDriverPhone(
  profileId: string,
  phone: string,
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const clean = phone.trim();
  const { error: dErr } = await supabase
    .from('drivers')
    .update({ phone: clean, updated_at: now })
    .eq('profile_id', profileId);
  if (dErr) return { error: 'Unable to update phone.' };
  const { error: pErr } = await supabase
    .from('profiles')
    .update({ phone: clean, updated_at: now })
    .eq('id', profileId);
  if (pErr) return { error: 'Phone updated on driver profile, but could not sync to account.' };
  return { error: null };
}

export async function updateDriverVehicle(
  profileId: string,
  vehicleType: string,
  vehiclePlate: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('drivers')
    .update({
      vehicle_type:  vehicleType.trim()  || null,
      vehicle_plate: vehiclePlate.trim() || null,
      updated_at:    new Date().toISOString(),
    })
    .eq('profile_id', profileId);
  if (error) return { error: 'Unable to update vehicle info.' };
  return { error: null };
}

export async function updateDriverServiceArea(
  profileId: string,
  serviceArea: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('drivers')
    .update({ service_area: serviceArea.trim() || null, updated_at: new Date().toISOString() })
    .eq('profile_id', profileId);
  if (error) return { error: 'Unable to update service area.' };
  return { error: null };
}

export async function updateDriverZone(
  profileId: string,
  zoneId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('drivers')
    .update({ zone_id: zoneId, updated_at: new Date().toISOString() })
    .eq('profile_id', profileId);
  if (error) return { error: 'Unable to update zone.' };
  return { error: null };
}

// ── Submit for review ─────────────────────────────────────────────────────────

export async function submitDriverForReview(
  driverRowId: string,
): Promise<{ error: string | null }> {
  const { data: current, error: fetchErr } = await supabase
    .from('drivers')
    .select('metadata')
    .eq('id', driverRowId)
    .maybeSingle();
  if (fetchErr || !current) return { error: 'Unable to load profile for submission.' };

  const existing = (current.metadata as Record<string, unknown>) ?? {};
  const { error } = await supabase
    .from('drivers')
    .update({
      metadata: {
        ...existing,
        onboarding_status:      'submitted',
        onboarding_submitted_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', driverRowId);
  if (error) return { error: 'Unable to submit application. Please try again.' };
  return { error: null };
}

// ── Apply for corporate screening ─────────────────────────────────────────────
// Mirrors web applyForCorporateScreening() from corporateDriverService.js.
// Sets metadata.corporate = { ...existing, status: 'pending', screening_started_at }.
// Never sets corporate_driver_status directly — that is admin-only.
export async function applyForCorporateScreening(
  driverRowId: string,
): Promise<{ error: string | null; alreadyApplied?: boolean }> {
  const { data: current, error: fetchErr } = await supabase
    .from('drivers')
    .select('metadata')
    .eq('id', driverRowId)
    .maybeSingle();

  if (fetchErr || !current) return { error: 'Unable to load profile.' };

  const existing = (current.metadata as Record<string, unknown>) ?? {};
  const corp = (existing.corporate as Record<string, unknown> | undefined) ?? {};

  if (corp.status === 'pending' || corp.status === 'approved') {
    return { error: null, alreadyApplied: true };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('drivers')
    .update({
      metadata: {
        ...existing,
        corporate: {
          ...corp,
          status: 'pending',
          screening_started_at: (corp.screening_started_at as string | undefined) ?? now,
        },
      },
      updated_at: now,
    })
    .eq('id', driverRowId);

  if (error) return { error: 'Unable to start corporate screening. Please try again.' };
  return { error: null };
}

// ── Document operations ───────────────────────────────────────────────────────

export async function listMyDocuments(
  driverRowId: string,
): Promise<{ documents: DriverDocument[]; error: string | null }> {
  const { data, error } = await supabase
    .from('driver_documents')
    .select('id, driver_id, document_type, status, notes, reviewed_at, created_at, updated_at')
    .eq('driver_id', driverRowId)
    .order('created_at', { ascending: false });
  if (error) return { documents: [], error: 'Unable to load documents.' };
  return { documents: (data ?? []) as DriverDocument[], error: null };
}

// Fetches a short-lived signed URL for the driver's profile_photo document only.
// Called at boot/signIn and after profile photo upload — never for other doc types.
export async function fetchProfilePhotoUrl(
  profileId: string,
  driverRowId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('driver_documents')
    .select('file_url')
    .eq('driver_id', driverRowId)
    .eq('document_type', 'profile_photo')
    .not('file_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.file_url) return null;

  const { data: signed } = await supabase.storage
    .from('driver-documents')
    .createSignedUrl(data.file_url, 3600);

  return signed?.signedUrl ?? null;
}

/**
 * Launches the device image library, then uploads the chosen image to
 * driver-documents storage and inserts a driver_documents row.
 *
 * Returns null for `document` when the user cancels (no error either).
 *
 * Storage path: drivers/{userId}/{docType}_{timestamp}.{ext}
 * This mirrors the web's corporateDriverService path convention.
 *
 * RLS note: driver_documents has no DELETE policy for drivers.
 * We always INSERT a new row — admin reviews the most recent upload.
 */
export async function pickAndUploadDocument(
  userId: string,
  driverRowId: string,
  docType: string,
): Promise<{ document: DriverDocument | null; error: string | null; cancelled?: boolean }> {
  // Request permission
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    return { document: null, error: 'Photo library permission is required to upload documents.' };
  }

  // Launch picker
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.85,
  });

  if (result.canceled) {
    return { document: null, error: null, cancelled: true };
  }

  const asset = result.assets[0];
  const uri = asset.uri;
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const rawExt = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const ext = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'].includes(rawExt) ? rawExt : 'jpg';
  const path = `drivers/${userId}/${docType}_${Date.now()}.${ext}`;

  // Fetch blob for upload
  let blob: Blob;
  try {
    const response = await fetch(uri);
    blob = await response.blob();
  } catch {
    return { document: null, error: 'Could not read file for upload. Please try again.' };
  }

  const { error: uploadErr } = await supabase.storage
    .from('driver-documents')
    .upload(path, blob, { contentType: mimeType, upsert: false });

  if (uploadErr) {
    const msg = uploadErr.message.toLowerCase();
    if (msg.includes('permission') || msg.includes('policy'))
      return { document: null, error: 'Upload not permitted. Contact support.' };
    return { document: null, error: `Upload failed: ${uploadErr.message}` };
  }

  // Insert document record — do not select file_url back; it stays server-side
  const { data, error: insertErr } = await supabase
    .from('driver_documents')
    .insert({
      driver_id:     driverRowId,
      document_type: docType,
      file_url:      path,
      status:        'pending',
    })
    .select('id, driver_id, document_type, status, notes, reviewed_at, created_at, updated_at')
    .single();

  if (insertErr) {
    return { document: null, error: 'File uploaded but record save failed. Contact support.' };
  }

  return { document: data as DriverDocument, error: null };
}
