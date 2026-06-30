import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import type { ActiveOrder, OrderReceipt, PurchaseApprovalRequest, PurchaseRecord } from '@/types/order';

// Mirrors PURCHASE_EXCLUDED_TYPES from web receiptService.js
const PURCHASE_EXCLUDED_TYPES = new Set([
  'ride', 'send_it', 'package', 'service_booking', 'business_support',
]);

export function isPurchaseBasedOrder(order: Pick<ActiveOrder, 'service_type' | 'order_type'>): boolean {
  const t = (order.service_type ?? order.order_type ?? '').toLowerCase();
  return !PURCHASE_EXCLUDED_TYPES.has(t);
}

// ── Image picker ──────────────────────────────────────────────────────────────

export async function pickReceiptImage(): Promise<{
  uri: string;
  mimeType: string;
  fileName: string;
} | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.85,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const fileName = `receipt-${Date.now()}.${ext}`;

  return { uri: asset.uri, mimeType, fileName };
}

// ── Receipt upload ────────────────────────────────────────────────────────────
// Mirrors uploadOrderReceipt() from web receiptService.js.
// React Native: fetch(uri) → Blob → Supabase storage upload.

export async function uploadOrderReceipt({
  orderId,
  userId,
  driverId = null,
  customerId = null,
  totalAmount = null,
  storeName = null,
  notes = null,
  uri,
  mimeType = 'image/jpeg',
  fileName,
}: {
  orderId: string;
  userId: string;
  driverId?: string | null;
  customerId?: string | null;
  totalAmount?: number | null;
  storeName?: string | null;
  notes?: string | null;
  uri: string;
  mimeType?: string;
  fileName: string;
}): Promise<{ receipt: OrderReceipt | null; error: string | null }> {
  let blob: Blob;
  try {
    const res = await fetch(uri);
    blob = await res.blob();
  } catch {
    return { receipt: null, error: 'Could not read image. Try again.' };
  }

  const storagePath = `${userId}/orders/${orderId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('order-receipts')
    .upload(storagePath, blob, {
      cacheControl: '3600',
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    const m = uploadError.message?.toLowerCase() ?? '';
    if (m.includes('bucket') || m.includes('not found')) {
      return { receipt: null, error: 'Receipt storage not set up. Contact Xperts.' };
    }
    if (m.includes('permission') || m.includes('policy')) {
      return { receipt: null, error: 'Storage permission denied. Contact Xperts.' };
    }
    return { receipt: null, error: 'Unable to upload receipt. Try again.' };
  }

  const { data: signedData } = await supabase.storage
    .from('order-receipts')
    .createSignedUrl(storagePath, 3600);
  const signedUrl = signedData?.signedUrl ?? null;

  const { data: receiptRow, error: insertError } = await supabase
    .from('order_receipts')
    .insert({
      order_id: orderId,
      driver_id: driverId,
      customer_id: customerId,
      receipt_storage_path: storagePath,
      receipt_image_url: signedUrl ?? storagePath,
      store_name: storeName?.trim() ?? null,
      total_amount: totalAmount,
      notes: notes?.trim() ?? null,
      scan_status: 'uploaded',
      extraction_status: 'not_started',
      admin_review_status: 'pending',
      metadata: {
        source: 'driver_receipt_upload',
        future_use: 'price_intelligence',
        extraction_pending: true,
        uploaded_by: userId,
      },
    })
    .select('*')
    .single();

  if (insertError) {
    return { receipt: null, error: 'Unable to save receipt record. Try again.' };
  }

  const receipt: OrderReceipt = {
    ...(receiptRow as OrderReceipt),
    signedUrl,
  };

  // Non-fatal: update orders.metadata + timeline event
  void (async () => {
    try {
      const { data: ord } = await supabase
        .from('orders')
        .select('metadata')
        .eq('id', orderId)
        .single();
      await supabase.from('orders').update({
        updated_at: new Date().toISOString(),
        metadata: {
          ...(ord?.metadata ?? {}),
          receipt_uploaded: true,
          actual_receipt_total: totalAmount ?? (ord?.metadata?.actual_receipt_total ?? null),
          receipt_store_name: storeName?.trim() ?? (ord?.metadata?.receipt_store_name ?? null),
        },
      }).eq('id', orderId);
      await supabase.from('order_timeline_events').insert({
        order_id: orderId,
        actor_id: userId,
        event_type: 'receipt_uploaded',
        title: 'Receipt uploaded by driver',
        description: storeName ? `Receipt from ${storeName}` : 'Driver uploaded purchase receipt',
        metadata: {
          source: 'driver_receipt_upload',
          receipt_id: (receiptRow as { id?: string }).id,
          storage_path: storagePath,
          total_amount: totalAmount,
          store_name: storeName,
        },
      });
    } catch { /* non-fatal */ }
  })();

  return { receipt, error: null };
}

// ── List receipts ─────────────────────────────────────────────────────────────

export async function listOrderReceipts(orderId: string): Promise<{
  receipts: OrderReceipt[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('order_receipts')
    .select('id, order_id, receipt_storage_path, receipt_image_url, total_amount, store_name, notes, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) return { receipts: [], error: 'Unable to load receipts.' };

  const rows = data ?? [];
  const receipts = await Promise.all(
    rows.map(async (r: { receipt_storage_path?: string | null; [key: string]: unknown }) => {
      if (!r.receipt_storage_path) return { ...(r as OrderReceipt), signedUrl: null };
      const { data: sd } = await supabase.storage
        .from('order-receipts')
        .createSignedUrl(r.receipt_storage_path, 3600);
      return { ...(r as OrderReceipt), signedUrl: sd?.signedUrl ?? null };
    }),
  );

  return { receipts, error: null };
}

// ── Submit purchase total ─────────────────────────────────────────────────────
// Mirrors submitPurchaseTotal() from web driverService.js.
// Calls driver_submit_purchase_total RPC — recomputes within_limit /
// over_limit_pending_approval / receipt_required server-side.

export async function submitPurchaseTotal(
  orderId: string,
  actualTotal: number,
  note: string | null = null,
): Promise<{ record: PurchaseRecord | null; error: string | null }> {
  const { data, error } = await supabase.rpc('driver_submit_purchase_total', {
    p_order_id: orderId,
    p_actual_total: actualTotal,
    p_note: note,
  });

  if (error) return { record: null, error: 'Unable to save store total. Try again.' };

  const result = data as { success?: boolean; error?: string; record?: PurchaseRecord } | null;
  if (result?.success === false) {
    return { record: null, error: result.error ?? 'Unable to save store total. Try again.' };
  }

  return { record: (result?.record ?? null) as PurchaseRecord | null, error: null };
}

// ── Mark receipt uploaded ─────────────────────────────────────────────────────
// Called after a receipt upload on a purchase_required order so the
// reconciliation status advances (e.g. receipt_required → within_limit).

export async function markPurchaseReceiptUploaded(
  orderId: string,
): Promise<{ record: PurchaseRecord | null; error: string | null }> {
  const { data, error } = await supabase.rpc('driver_mark_purchase_receipt_uploaded', {
    p_order_id: orderId,
  });

  if (error) return { record: null, error: 'Unable to update receipt status.' };

  const result = data as { success?: boolean; error?: string; record?: PurchaseRecord } | null;
  if (result?.success === false) {
    return { record: null, error: result.error ?? 'Unable to update receipt status.' };
  }

  return { record: (result?.record ?? null) as PurchaseRecord | null, error: null };
}

// ── Customer over-limit approval ──────────────────────────────────────────────
// Mirrors createPurchaseApprovalRequest() from web purchaseApprovalService.js.
// Edge function generates a one-time token; link is only returned once.

export async function createPurchaseApprovalRequest(
  orderId: string,
): Promise<{
  data: { link?: string | null; message?: string | null } | null;
  approvalRequest: PurchaseApprovalRequest | null;
  error: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('create-purchase-approval-request', {
    body: { order_id: orderId },
  });

  if (error) {
    return { data: null, approvalRequest: null, error: 'Could not create approval request. Try again.' };
  }

  const result = data as {
    success?: boolean;
    error?: string;
    link?: string | null;
    message?: string | null;
    approval_request?: PurchaseApprovalRequest | null;
  } | null;

  if (result?.success === false) {
    return { data: null, approvalRequest: null, error: result?.error ?? 'Could not create approval request.' };
  }

  return {
    data: { link: result?.link ?? null, message: result?.message ?? null },
    approvalRequest: result?.approval_request ?? null,
    error: null,
  };
}

// ── Delivery proof upload ─────────────────────────────────────────────────────
// Mirrors handleProofUpload() from web DriverActiveOrderPage.jsx.
// Bucket is public → getPublicUrl (no signed URL needed).
// upsert: true — re-upload replaces the previous proof for the same order.
// Saves proof_url + driver_stage to orders.metadata (direct UPDATE, same as web).

export async function uploadDeliveryProof({
  orderId,
  driverId,
  currentMetadata,
  uri,
  mimeType = 'image/jpeg',
}: {
  orderId: string;
  driverId: string;
  currentMetadata: Record<string, unknown> | null | undefined;
  uri: string;
  mimeType?: string;
}): Promise<{ publicUrl: string | null; error: string | null }> {
  let blob: Blob;
  try {
    const res = await fetch(uri);
    blob = await res.blob();
  } catch {
    return { publicUrl: null, error: 'Could not read image. Try again.' };
  }

  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const storagePath = `${orderId}/${driverId}-proof.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('delivery-proofs')
    .upload(storagePath, blob, {
      cacheControl: '3600',
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    const m = uploadError.message?.toLowerCase() ?? '';
    if (m.includes('bucket') || m.includes('not found')) {
      return { publicUrl: null, error: 'Delivery proof storage not set up. Contact Xperts.' };
    }
    if (m.includes('policy') || m.includes('403') || m.includes('permission')) {
      return { publicUrl: null, error: 'Storage permission denied. Contact Xperts.' };
    }
    return { publicUrl: null, error: 'Unable to upload proof image. Try again.' };
  }

  const { data: urlData } = supabase.storage.from('delivery-proofs').getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl ?? null;

  if (!publicUrl) {
    return { publicUrl: null, error: 'Uploaded but could not get image URL.' };
  }

  // Update orders.metadata with proof_url + driver_stage (same as web)
  const newMetadata: Record<string, unknown> = {
    ...(currentMetadata ?? {}),
    proof_url: publicUrl,
    driver_stage: 'proof_uploaded',
  };
  await supabase
    .from('orders')
    .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  // Non-fatal timeline event
  void (async () => {
    try {
      await supabase.from('order_timeline_events').insert({
        order_id: orderId,
        event_type: 'proof_uploaded',
        title: 'Delivery proof uploaded',
        description: publicUrl,
        metadata: { proof_url: publicUrl, driver_id: driverId, source: 'driver_active_order' },
      });
    } catch { /* non-fatal */ }
  })();

  return { publicUrl, error: null };
}
