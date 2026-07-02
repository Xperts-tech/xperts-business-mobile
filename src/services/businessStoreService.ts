import { supabase } from '@/lib/supabase';

export type StoreOpenStatus = 'open' | 'paused' | 'unknown';

export function getStoreOpenStatus(metadata: Record<string, unknown> | null): StoreOpenStatus {
  const mode = metadata?.open_status_mode;
  if (mode === 'paused') return 'paused';
  if (mode === 'open') return 'open';
  return 'unknown'; // treat as open if not explicitly set
}

export async function setStoreOpenStatus(
  storeId: string,
  nextStatus: 'open' | 'paused',
): Promise<{ error: string | null }> {
  // Read current metadata first to avoid clobbering other fields
  const { data: row, error: readErr } = await supabase
    .from('stores')
    .select('metadata')
    .eq('id', storeId)
    .maybeSingle();

  if (readErr) return { error: readErr.message };

  const currentMeta = (row?.metadata as Record<string, unknown>) ?? {};
  const patched = { ...currentMeta, open_status_mode: nextStatus };

  const { error: writeErr } = await supabase
    .from('stores')
    .update({ metadata: patched })
    .eq('id', storeId);

  if (writeErr) return { error: writeErr.message };
  return { error: null };
}

// ── Business hours day toggle ─────────────────────────────────────────────────
// Patches metadata.business_hours.{day}.open without disturbing other days or fields.

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type WeekDay = typeof DAYS[number];
export { DAYS as WEEK_DAYS };

export interface DayHours {
  open: boolean;
  from?: string | null;
  to?: string | null;
}

export type BusinessHours = Partial<Record<WeekDay, DayHours>>;

export function parseBusinessHours(metadata: Record<string, unknown> | null): BusinessHours {
  const raw = metadata?.business_hours;
  if (!raw || typeof raw !== 'object') return {};
  const hours = raw as Record<string, unknown>;
  const result: BusinessHours = {};
  for (const day of DAYS) {
    const entry = hours[day];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    result[day] = {
      open: e.open === true || e.is_open === true,
      from: (e.from ?? e.open_time ?? null) as string | null,
      to: (e.to ?? e.close_time ?? null) as string | null,
    };
  }
  return result;
}

export async function toggleBusinessHoursDay(
  storeId: string,
  day: WeekDay,
  isOpen: boolean,
): Promise<{ error: string | null }> {
  const { data: row, error: readErr } = await supabase
    .from('stores')
    .select('metadata')
    .eq('id', storeId)
    .maybeSingle();

  if (readErr) return { error: readErr.message };

  const meta = (row?.metadata as Record<string, unknown>) ?? {};
  const existingHours = (meta.business_hours as Record<string, unknown>) ?? {};
  const existingDay = (existingHours[day] as Record<string, unknown>) ?? {};

  const patched = {
    ...meta,
    business_hours: {
      ...existingHours,
      [day]: { ...existingDay, open: isOpen },
    },
  };

  const { error: writeErr } = await supabase
    .from('stores')
    .update({ metadata: patched })
    .eq('id', storeId);

  return { error: writeErr?.message ?? null };
}
