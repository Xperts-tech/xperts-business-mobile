import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { BusinessStaffMembership, UserProfile } from '@/types/business';
import type { StaffRole } from '@/types/permissions';

// ── Types ─────────────────────────────────────────────────────────────────────

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /** True only during the one-time boot session check */
  initializing: boolean;
  isAuthenticated: boolean;
  /** profile.role === 'business' */
  isBusinessUser: boolean;
  /** profile.role === 'admin' or 'superadmin' */
  isAdmin: boolean;
  /** Has an active business_staff membership */
  isStaffMember: boolean;
  /** The staff role from business_staff (null for owners/admins) */
  staffRole: StaffRole | null;
  /** business_id from the staff membership */
  staffBusinessId: string | null;
  /** store_id from the staff membership (null if not scoped to a store) */
  staffStoreId: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── Business role guard ───────────────────────────────────────────────────────

function isBusinessAppRole(role: string | null | undefined): boolean {
  const r = (role ?? '').toLowerCase();
  return r === 'business' || r === 'admin' || r === 'superadmin';
}

// ── Data fetcher ──────────────────────────────────────────────────────────────

async function fetchUserData(userId: string): Promise<{
  profile: UserProfile | null;
  staffMembership: BusinessStaffMembership | null;
}> {
  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, role, full_name, phone')
    .eq('id', userId)
    .maybeSingle();

  const profile = (profileData as UserProfile) ?? null;

  // For business/admin roles no staff lookup needed — they have full access.
  // For any other role, check if they have an active business_staff membership.
  let staffMembership: BusinessStaffMembership | null = null;

  if (profile && !isBusinessAppRole(profile.role)) {
    const { data: staffData } = await supabase
      .from('business_staff')
      .select('id, business_id, store_id, profile_id, email, full_name, role, status, accepted_at, invite_expires_at')
      .eq('profile_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    staffMembership = (staffData as BusinessStaffMembership) ?? null;
  }

  return { profile, staffMembership };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [staffMembership, setStaffMembership] = useState<BusinessStaffMembership | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function boot() {
      const { data } = await supabase.auth.getSession();
      if (!mountedRef.current) return;

      if (data.session) {
        const { profile: p, staffMembership: sm } = await fetchUserData(data.session.user.id);
        if (!mountedRef.current) return;

        const hasAccess = isBusinessAppRole(p?.role) || sm !== null;

        if (!hasAccess) {
          // Not a business user and no staff membership — boot them out.
          await supabase.auth.signOut();
          if (mountedRef.current) setInitializing(false);
          return;
        }

        setProfile(p);
        setStaffMembership(sm);
        setSession(data.session);
      }

      setInitializing(false);
    }

    void boot();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mountedRef.current) return;
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setStaffMembership(null);
      }
    });

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // ── signIn ────────────────────────────────────────────────────────────────

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setLoading(false);
      return { error: friendlyAuthError(authError.message) };
    }

    const userId = authData.user?.id;
    if (!userId) {
      setLoading(false);
      return { error: 'Sign in succeeded but no user returned. Please try again.' };
    }

    const { profile: p, staffMembership: sm } = await fetchUserData(userId);
    const hasAccess = isBusinessAppRole(p?.role) || sm !== null;

    if (!hasAccess) {
      await supabase.auth.signOut();
      setLoading(false);
      return {
        error:
          'This app is for Xperts Business partners only. If you are a driver or service worker, please use the Xperts Pro app.',
      };
    }

    if (mountedRef.current) {
      setProfile(p);
      setStaffMembership(sm);
      setLoading(false);
    }

    return { error: null };
  }

  // ── signOut ───────────────────────────────────────────────────────────────

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ── refreshProfile ────────────────────────────────────────────────────────

  async function refreshProfile() {
    const userId = session?.user?.id;
    if (!userId) return;
    const { profile: p, staffMembership: sm } = await fetchUserData(userId);
    if (mountedRef.current) {
      setProfile(p);
      setStaffMembership(sm);
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const isAdmin      = profile?.role === 'admin' || profile?.role === 'superadmin';
  const isBusinessUser = profile?.role === 'business';
  const isStaffMember  = staffMembership !== null;
  const staffRole      = (staffMembership?.role as StaffRole) ?? null;
  const staffBusinessId = staffMembership?.business_id ?? null;
  const staffStoreId    = staffMembership?.store_id ?? null;
  const isAuthenticated = session !== null && profile !== null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        initializing,
        isAuthenticated,
        isBusinessUser,
        isAdmin,
        isStaffMember,
        staffRole,
        staffBusinessId,
        staffStoreId,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// ── Error helpers ─────────────────────────────────────────────────────────────

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('email not confirmed'))
    return 'Please confirm your email before signing in.';
  if (m.includes('invalid login') || m.includes('invalid credentials'))
    return 'Incorrect email or password. Please check and try again.';
  if (m.includes('too many requests') || m.includes('rate limit'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (m.includes('network') || m.includes('fetch'))
    return 'No connection. Check your internet and try again.';
  return message || 'Sign in failed. Please try again.';
}
