import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { OrderScope } from '@/lib/orderScope';

/**
 * Subscribes to live order changes for a business/store and invokes `onChange`
 * on any INSERT/UPDATE. Realtime `postgres_changes` filters only support a single
 * `column=eq.value`, so to match the `business_id OR store_id` scoping we register
 * a listener per non-null scope column. RLS still applies, so a business only
 * receives its own orders' events.
 *
 * The callback is kept in a ref so the subscription isn't rebuilt every render —
 * it only re-subscribes when the scope changes.
 */
export function useOrdersRealtime(scope: OrderScope, onChange: () => void): void {
  const cb = useRef(onChange);
  cb.current = onChange;

  const { businessId, storeId } = scope;

  useEffect(() => {
    if (!businessId && !storeId) return;

    const channelName = `business-orders-${businessId ?? 'x'}-${storeId ?? 'x'}`;
    let channel: RealtimeChannel = supabase.channel(channelName);

    const cols: Array<{ key: string; value: string }> = [];
    if (businessId) cols.push({ key: 'business_id', value: businessId });
    if (storeId) cols.push({ key: 'store_id', value: storeId });

    for (const c of cols) {
      channel = channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'orders', filter: `${c.key}=eq.${c.value}` },
          () => cb.current(),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `${c.key}=eq.${c.value}` },
          () => cb.current(),
        );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, storeId]);
}
