import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PickedImage {
  uri: string;
  base64: string | null;
  mimeType: string;
  width: number;
  height: number;
}

export interface ExtractedProduct {
  name: string;
  description: string;
  price: string;          // string so editable in TextInput without parsing
  category: string;
  confidence?: number;    // 0–1 if the edge function returns it
}

export interface SaveProductParams {
  storeId: string;
  name: string;
  description: string;
  price: string;
  category: string;
  imageUri: string | null;
}

// ── Image picking ─────────────────────────────────────────────────────────────

export async function requestImagePermissions(
  source: 'camera' | 'library',
): Promise<{ granted: boolean }> {
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return { granted: status === 'granted' };
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return { granted: status === 'granted' };
}

export async function pickImage(
  source: 'camera' | 'library',
): Promise<{ image: PickedImage | null; cancelled: boolean; error: string | null }> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.65,
    base64: true,
    exif: false,
  };

  let result: ImagePicker.ImagePickerResult;
  try {
    result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
  } catch (err: unknown) {
    return { image: null, cancelled: false, error: err instanceof Error ? err.message : 'Failed to open picker' };
  }

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return { image: null, cancelled: true, error: null };
  }

  const asset = result.assets[0];
  return {
    image: {
      uri: asset.uri,
      base64: asset.base64 ?? null,
      mimeType: asset.mimeType ?? 'image/jpeg',
      width: asset.width,
      height: asset.height,
    },
    cancelled: false,
    error: null,
  };
}

// ── AI extraction via menu-extract edge function ───────────────────────────────
// Calls the existing deployed menu-extract function.
// Expected request body: { image_base64, mime_type, store_id }
// Expected response: { name?, description?, price?, category?, products?: [...] }

export async function extractProductFromImage(
  image: PickedImage,
  storeId: string,
): Promise<{ extracted: ExtractedProduct | null; error: string | null }> {
  if (!image.base64) {
    return { extracted: null, error: 'No image data available for extraction' };
  }

  const { data, error } = await supabase.functions.invoke('menu-extract', {
    body: {
      image_base64: image.base64,
      mime_type: image.mimeType,
      store_id: storeId,
    },
  });

  if (error) {
    // AI extraction may be unavailable for business accounts — caller shows empty form
    return { extracted: null, error: 'AI extraction unavailable. Fill in the details manually.' };
  }

  // Handle single-product or multi-product response shapes
  const raw = (data?.products?.[0] ?? data) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') {
    return { extracted: null, error: 'No product data returned by AI' };
  }

  return {
    extracted: {
      name: String(raw.name ?? ''),
      description: String(raw.description ?? ''),
      price: raw.price != null ? String(raw.price) : '',
      category: String(raw.category ?? ''),
      confidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
    },
    error: null,
  };
}

// ── Image upload to Supabase Storage ──────────────────────────────────────────
// Storage bucket: product-images (adjust if your project uses a different bucket)

const STORAGE_BUCKET = 'product-images';

export async function uploadProductImage(
  imageUri: string,
  storeId: string,
): Promise<{ imageUrl: string | null; storagePath: string | null; error: string | null }> {
  const ext = imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${storeId}/${Date.now()}.${ext}`;
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  let blob: Blob;
  try {
    const res = await fetch(imageUri);
    blob = await res.blob();
  } catch (err: unknown) {
    return { imageUrl: null, storagePath: null, error: 'Failed to read image file' };
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, { contentType, upsert: false });

  if (error) return { imageUrl: null, storagePath: null, error: error.message };

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  return {
    imageUrl: urlData.publicUrl,
    storagePath: data.path,
    error: null,
  };
}

// ── Save product ──────────────────────────────────────────────────────────────

export async function saveExtractedProduct(
  params: SaveProductParams,
): Promise<{ productId: string | null; imageUrl: string | null; error: string | null }> {
  const { storeId, name, description, price, category, imageUri } = params;

  if (!name.trim()) return { productId: null, imageUrl: null, error: 'Product name is required' };

  const priceNum = parseFloat(price);
  if (price.trim() && isNaN(priceNum)) {
    return { productId: null, imageUrl: null, error: 'Invalid price' };
  }

  // Try image upload — non-blocking if it fails
  let imageUrl: string | null = null;
  if (imageUri) {
    const uploadRes = await uploadProductImage(imageUri, storeId);
    imageUrl = uploadRes.imageUrl; // null if upload failed — product still saves without image
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      store_id: storeId,
      name: name.trim(),
      description: description.trim() || null,
      price: isNaN(priceNum) ? 0 : priceNum,
      category: category.trim() || null,
      is_available: true,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) return { productId: null, imageUrl, error: error.message };
  return { productId: (data as { id: string }).id, imageUrl, error: null };
}
