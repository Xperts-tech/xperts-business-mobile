import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isDriverAppRole, type DriverRow, type UserProfile } from '@/types/driver';
import { fetchProfilePhotoUrl } from '@/services/driverProfileService';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  driverRow: DriverRow | null;
  /** True only during the initial boot session check — never toggled by signIn/signOut */
  initializing: boolean;
  /** Signed URL for the driver's profile_photo document (1-hour TTL). Null if no photo uploaded. */
  profilePhotoUrl: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Re-fetches the drivers row and updates driverRow in context. Call after any status update. */
  refreshDriverRow: () => Promise<void>;
  /** Re-fetches the profile photo signed URL. Call after uploading a new profile_photo document. */
  refreshProfilePhoto: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchUserData(userId: string): Promise<{
  profile: UserProfile | null;
  driverRow: DriverRow | null;
}> {
  const [{ data: profile }, { data: driverRow }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, role, full_name, phone')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('drivers')
      .select('id, profile_id, zone_id, phone, vehicle_type, vehicle_plate, approval_status, enforcement_status, online_status, active_order_id, rating, completed_jobs, service_area, corporate_driver_status, corporate_police_record_expiry, can_deliver_food, can_do_errands, can_do_courier, can_do_rides, max_active_orders, suspended_at, suspension_reason, rejected_reason, rejection_notes, more_info_requested_at, more_info_notes, metadata')
      .eq('profile_id', userId)
      .maybeSingle(),
  ]);
  return { profile: profile ?? null, driverRow: driverRow ?? null };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [driverRow, setDriverRow] = useState<DriverRow | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function boot() {
      const { data } = await supabase.auth.getSession();
      if (!mountedRef.current) return;

      if (data.session) {
        const { profile: p, driverRow: d } = await fetchUserData(data.session.user.id);
        if (!mountedRef.current) return;

        if (!isDriverAppRole(p?.role)) {
          // Persisted session belongs to a non-driver account — clear it.
          await supabase.auth.signOut();
          if (mountedRef.current) setInitializing(false);
          return;
        }
        setProfile(p);
        setDriverRow(d);
        setSession(data.session);

        if (d?.id) {
          const url = await fetchProfilePhotoUrl(data.session.user.id, d.id);
          if (mountedRef.current) setProfilePhotoUrl(url);
        }
      }

      setInitializing(false);
    }

    boot();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mountedRef.current) return;
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setDriverRow(null);
        setProfilePhotoUrl(null);
      }
    });

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      return { error: friendlyAuthError(authError.message) };
    }

    const userId = authData.user?.id;
    if (!userId) {
      return { error: 'Sign in succeeded but no user returned. Please try again.' };
    }

    const { profile: p, driverRow: d } = await fetchUserData(userId);

    if (!isDriverAppRole(p?.role)) {
      await supabase.auth.signOut();
      return {
        error: p?.role === 'delivery_partner'
          ? 'The partner dashboard is available on the Xperts Xpress web dashboard. This mobile app is for approved drivers only.'
          : 'This app is for Xperts drivers only.',
      };
    }

    setProfile(p);
    setDriverRow(d);

    if (d?.id) {
      const url = await fetchProfilePhotoUrl(userId, d.id);
      if (mountedRef.current) setProfilePhotoUrl(url);
    }

    // session state is updated by onAuthStateChange listener above
    return { error: null };
  }

  async function refreshDriverRow() {
    const userId = session?.user?.id;
    if (!userId) return;
    const { data } = await supabase
      .from('drivers')
      .select('id, profile_id, zone_id, phone, vehicle_type, vehicle_plate, approval_status, enforcement_status, online_status, active_order_id, rating, completed_jobs, service_area, corporate_driver_status, corporate_police_record_expiry, can_deliver_food, can_do_errands, can_do_courier, can_do_rides, max_active_orders, suspended_at, suspension_reason, rejected_reason, rejection_notes, more_info_requested_at, more_info_notes, metadata')
      .eq('profile_id', userId)
      .maybeSingle();
    if (mountedRef.current) {
      setDriverRow(data ?? null);
    }
  }

  async function refreshProfilePhoto() {
    const driverId = driverRow?.id;
    const userId = session?.user?.id;
    if (!driverId || !userId) return;
    const url = await fetchProfilePhotoUrl(userId, driverId);
    if (mountedRef.current) setProfilePhotoUrl(url);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        driverRow,
        profilePhotoUrl,
        initializing,
        signIn,
        signOut,
        refreshDriverRow,
        refreshProfilePhoto,
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

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'Incorrect email or password. Please check and try again.';
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'No connection. Check your internet and try again.';
  }
  return message || 'Sign in failed. Please try again.';
}
