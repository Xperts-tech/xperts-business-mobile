import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { hasBusinessPermission, ROLE_PERMISSIONS } from '@/constants/permissions';
import type { Business, BusinessStaffMembership, Store } from '@/types/business';
import type { PermissionKey, StaffRole } from '@/types/permissions';

// ── Types ─────────────────────────────────────────────────────────────────────

type BusinessContextValue = {
  businesses: Business[];
  selectedBusiness: Business | null;
  selectedBusinessId: string | null;
  selectedStore: Store | null;
  selectedStoreId: string | null;
  stores: Store[];
  loading: boolean;
  error: string | null;
  setSelectedBusinessId: (id: string) => void;
  refreshBusinessContext: () => Promise<void>;
  isOwner: boolean;
  effectiveRole: StaffRole;
  hasPermission: (permission: PermissionKey) => boolean;
  activeStaffMembership: BusinessStaffMembership | null;
};

const BusinessContext = createContext<BusinessContextValue | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin, isBusinessUser, isStaffMember, staffRole, staffBusinessId, staffStoreId } = useAuth();
  const userId = profile?.id ?? null;

  const storageKey = userId ? `xperts_business:selectedBusinessId:${userId}` : null;

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedBusinessId, setSelectedBusinessIdState] = useState<string | null>(null);
  const [staffMembership, setStaffMembership] = useState<BusinessStaffMembership | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!userId) {
      setBusinesses([]);
      setStores([]);
      setSelectedBusinessIdState(null);
      setStaffMembership(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isBusinessUser || isAdmin) {
        // Owner/admin path — load businesses owned by this user
        const { data: bizData, error: bizErr } = await supabase
          .from('businesses')
          .select('id, name, owner_id, approval_status, status, business_type, created_at')
          .eq('owner_id', userId)
          .order('created_at', { ascending: true });

        if (bizErr) throw bizErr;
        const biz = (bizData as Business[]) ?? [];
        setBusinesses(biz);

        // Restore persisted selection or default to first
        const persisted = storageKey ? await AsyncStorage.getItem(storageKey) : null;
        const targetId =
          persisted && biz.some((b) => b.id === persisted)
            ? persisted
            : biz[0]?.id ?? null;
        setSelectedBusinessIdState(targetId);

        // Load stores for the selected business
        if (targetId) {
          const { data: storeData } = await supabase
            .from('stores')
            .select('id, business_id, name, slug, cover_url, description, is_approved, approval_status, deleted_at, metadata')
            .eq('business_id', targetId)
            .is('deleted_at', null);
          setStores((storeData as Store[]) ?? []);
        }
      } else if (isStaffMember && staffBusinessId) {
        // Staff path — load the staff's assigned business only
        const { data: bizData } = await supabase
          .from('businesses')
          .select('id, name, owner_id, approval_status, status, business_type, created_at')
          .eq('id', staffBusinessId)
          .maybeSingle();

        const biz = bizData ? [bizData as Business] : [];
        setBusinesses(biz);
        setSelectedBusinessIdState(staffBusinessId);

        // Load staff membership details for permission resolution
        const { data: memberData } = await supabase
          .from('business_staff')
          .select('id, business_id, store_id, profile_id, email, full_name, role, status, accepted_at, invite_expires_at')
          .eq('profile_id', userId)
          .eq('status', 'active')
          .maybeSingle();
        setStaffMembership((memberData as BusinessStaffMembership) ?? null);

        // Load stores — if staff has a store_id, scope to that store only
        const storeQuery = supabase
          .from('stores')
          .select('id, business_id, name, slug, cover_url, description, is_approved, approval_status, deleted_at, metadata')
          .eq('business_id', staffBusinessId)
          .is('deleted_at', null);

        const { data: storeData } = await storeQuery;
        const allStores = (storeData as Store[]) ?? [];

        // If staff is scoped to a specific store, filter to that store
        if (staffStoreId) {
          setStores(allStores.filter((s) => s.id === staffStoreId));
        } else {
          setStores(allStores);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load business data');
    } finally {
      setLoading(false);
    }
  }, [userId, isBusinessUser, isAdmin, isStaffMember, staffBusinessId, staffStoreId, storageKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── setSelectedBusinessId ─────────────────────────────────────────────────

  const setSelectedBusinessId = useCallback(
    (id: string) => {
      // Staff cannot switch businesses — they are bound to their assigned business
      if (isStaffMember && !isAdmin) return;

      setSelectedBusinessIdState(id);
      if (storageKey) void AsyncStorage.setItem(storageKey, id);

      // Reload stores for newly selected business
      void (async () => {
        const { data: storeData } = await supabase
          .from('stores')
          .select('id, business_id, name, slug, cover_url, description, is_approved, approval_status, deleted_at, metadata')
          .eq('business_id', id)
          .is('deleted_at', null);
        setStores((storeData as Store[]) ?? []);
      })();
    },
    [isStaffMember, isAdmin, storageKey],
  );

  // ── Derived values ────────────────────────────────────────────────────────

  const selectedBusiness = useMemo(
    () => businesses.find((b) => b.id === selectedBusinessId) ?? null,
    [businesses, selectedBusinessId],
  );

  const selectedStoreId = useMemo(() => {
    if (staffStoreId) return staffStoreId;
    if (stores.length === 1) return stores[0].id;
    return null;
  }, [staffStoreId, stores]);

  const selectedStore = useMemo(
    () => (selectedStoreId ? stores.find((s) => s.id === selectedStoreId) ?? null : null),
    [stores, selectedStoreId],
  );

  const isOwner = useMemo(
    () => isAdmin || (isBusinessUser && selectedBusiness?.owner_id === userId),
    [isAdmin, isBusinessUser, selectedBusiness, userId],
  );

  const effectiveRole: StaffRole = useMemo(() => {
    if (isOwner) return 'owner';
    return (staffMembership?.role as StaffRole) ?? (staffRole as StaffRole) ?? 'cashier';
  }, [isOwner, staffMembership, staffRole]);

  const activeStaffMembership = staffMembership;

  const hasPermission = useCallback(
    (permission: PermissionKey): boolean => {
      if (isAdmin || isOwner) return true;
      return hasBusinessPermission(effectiveRole, permission);
    },
    [isAdmin, isOwner, effectiveRole],
  );

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        selectedBusiness,
        selectedBusinessId,
        selectedStore,
        selectedStoreId,
        stores,
        loading,
        error,
        setSelectedBusinessId,
        refreshBusinessContext: load,
        isOwner,
        effectiveRole,
        hasPermission,
        activeStaffMembership,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used inside BusinessProvider');
  return ctx;
}
