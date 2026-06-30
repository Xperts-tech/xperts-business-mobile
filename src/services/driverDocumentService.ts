import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import type { DriverDocument } from '@/types/driver';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type PickResult = {
  uri: string | null;
  mimeType: string;
  error: string | null;
  cancelled: boolean;
};

// ── Camera pickers ─────────────────────────────────────────────────────────────

/** Camera-only (front-facing) for selfie-with-ID. No gallery fallback. */
export async function launchSelfieCamera(): Promise<PickResult> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    return {
      uri: null, mimeType: 'image/jpeg', cancelled: false,
      error:
        'Camera permission is required to take your selfie with ID. ' +
        'Please enable it in Settings and try again.',
    };
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    cameraType: ImagePicker.CameraType.front,
    allowsEditing: false,
    quality: 0.85,
  });
  if (result.canceled) return { uri: null, mimeType: 'image/jpeg', error: null, cancelled: true };
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: normalizeMime(asset.mimeType ?? 'image/jpeg'),
    error: null,
    cancelled: false,
  };
}

/** Front camera for profile photo. Falls back to photo library if camera permission denied. */
export async function launchProfileCamera(): Promise<PickResult> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    return launchImageLibraryPicker();
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    cameraType: ImagePicker.CameraType.front,
    allowsEditing: false,
    quality: 0.85,
  });
  if (result.canceled) return { uri: null, mimeType: 'image/jpeg', error: null, cancelled: true };
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: normalizeMime(asset.mimeType ?? 'image/jpeg'),
    error: null,
    cancelled: false,
  };
}

/** Rear camera for document photos. Returns error if permission denied. */
export async function launchDocCamera(): Promise<PickResult> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    return {
      uri: null, mimeType: 'image/jpeg', cancelled: false,
      error:
        'Camera permission required. Please enable it in Settings, or choose a file instead.',
    };
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    cameraType: ImagePicker.CameraType.back,
    allowsEditing: false,
    quality: 0.85,
  });
  if (result.canceled) return { uri: null, mimeType: 'image/jpeg', error: null, cancelled: true };
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: normalizeMime(asset.mimeType ?? 'image/jpeg'),
    error: null,
    cancelled: false,
  };
}

// ── File pickers ──────────────────────────────────────────────────────────────

/** Photo library picker (images only). */
export async function launchImageLibraryPicker(): Promise<PickResult> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    return {
      uri: null, mimeType: 'image/jpeg', cancelled: false,
      error: 'Photo library permission required. Please enable it in Settings.',
    };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.85,
  });
  if (result.canceled) return { uri: null, mimeType: 'image/jpeg', error: null, cancelled: true };
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: normalizeMime(asset.mimeType ?? 'image/jpeg'),
    error: null,
    cancelled: false,
  };
}

/** System document picker — accepts JPEG, PNG, and PDF. */
export async function launchDocumentFilePicker(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'application/pdf'],
    copyToCacheDirectory: true, // ensures file:// URI on Android
    multiple: false,
  });
  if (result.canceled) return { uri: null, mimeType: 'image/jpeg', error: null, cancelled: true };

  const asset = result.assets[0];
  if (!asset?.uri) {
    return { uri: null, mimeType: 'image/jpeg', cancelled: false, error: 'Could not access the selected file.' };
  }
  if ((asset.size ?? 0) > MAX_FILE_BYTES) {
    return { uri: null, mimeType: 'image/jpeg', cancelled: false, error: 'File too large. Please use a file under 20 MB.' };
  }

  return {
    uri: asset.uri,
    mimeType: normalizeMime(asset.mimeType ?? guessMimeFromName(asset.name)),
    error: null,
    cancelled: false,
  };
}

// ── Upload + record ───────────────────────────────────────────────────────────

/**
 * Uploads a picked file to Supabase Storage and inserts a driver_documents row.
 *
 * Storage path: drivers/{userId}/{docType}_{timestamp}.{ext}
 * Bucket:       driver-documents (private)
 * DB:           driver_id = driverRowId (drivers.id), NOT user.id
 */
export async function uploadAndRecord(
  userId: string,
  driverRowId: string,
  docType: string,
  uri: string,
  mimeType: string,
): Promise<{ document: DriverDocument | null; error: string | null }> {
  const mime = normalizeMime(mimeType);
  const ext = mimeToExt(mime);
  const storagePath = `drivers/${userId}/${docType}_${Date.now()}.${ext}`;

  // ArrayBuffer is more reliable than Blob on Android for local file:// URIs
  let fileData: ArrayBuffer;
  try {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fileData = await res.arrayBuffer();
  } catch (e) {
    return {
      document: null,
      error: `Could not read file: ${e instanceof Error ? e.message : 'unknown error'}`,
    };
  }

  const { error: uploadErr } = await supabase.storage
    .from('driver-documents')
    .upload(storagePath, fileData, { contentType: mime, upsert: false });

  if (uploadErr) {
    const msg = uploadErr.message.toLowerCase();
    if (msg.includes('permission') || msg.includes('policy') || msg.includes('violat') || msg.includes('rls')) {
      return { document: null, error: 'Upload not permitted. Please contact Xperts support.' };
    }
    if (msg.includes('invalid') && (msg.includes('type') || msg.includes('mime'))) {
      return { document: null, error: 'File type not accepted. Please use JPEG, PNG, or PDF.' };
    }
    return { document: null, error: `Upload failed: ${uploadErr.message}` };
  }

  const { data, error: insertErr } = await supabase
    .from('driver_documents')
    .insert({
      driver_id:     driverRowId,
      document_type: docType,
      file_url:      storagePath,
      status:        'pending',
    })
    .select('id, driver_id, document_type, status, notes, reviewed_at, created_at, updated_at')
    .single();

  if (insertErr) {
    return { document: null, error: 'File uploaded but record save failed. Please contact Xperts support.' };
  }

  return { document: data as DriverDocument, error: null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeMime(raw: string): string {
  const m = (raw ?? '').toLowerCase();
  if (m.includes('heic') || m.includes('heif')) return 'image/jpeg'; // HEIC → JPEG (Expo auto-converts at quality < 1)
  if (m.includes('jpeg') || m.includes('jpg')) return 'image/jpeg';
  if (m.includes('png')) return 'image/png';
  if (m.includes('pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function mimeToExt(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

function guessMimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  return 'image/jpeg';
}
