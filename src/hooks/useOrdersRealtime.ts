import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to live order changes for a store and invokes `onChange` on any
 * INSERT/UPDATE. Backed by the `orders` table's Supabase Realtime publication
 * (RLS-scoped, so a business only receives its own store's events).
 *
 * The callback is kept in a ref so the subscription isn't torn down/rebuilt on
 * every render — it only re-subscribes when the store changes.
 */
export function useOrdersRealtime(storeId: string | null, onChange: () => void): void {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!storeId) return;

    const channel = supabase
      .channel(`business-orders-${storeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        () => cb.current(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        () => cb.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId]);
}
