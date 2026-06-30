import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Show notifications while the app is in foreground.
// Must be called at module load time — mirrors the Expo docs example.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Android 8+ requires a named channel before any notification can display.
// Call once when the driver stack mounts.
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Delivery Requests',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    showBadge: true,
  });
}

// Request notification permission and return the Expo push token string.
// Returns null if the user denies permission or token fetch fails.
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  try {
    // projectId comes from EAS config; falls back to undefined in Expo Go dev builds.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (err) {
    console.warn('[notifications] Could not get Expo push token:', err);
    return null;
  }
}

// Upsert the Expo push token into the existing driver_push_tokens table.
// We reuse this table (created for web FCM tokens) by storing the Expo token
// in fcm_token and using device_hint = 'expo-push' to distinguish it.
// driver_id = auth.uid() = profiles.id — same convention as the web SDK.
// Non-fatal: swallows errors so the app keeps working if the table doesn't exist yet.
export async function savePushToken(userId: string, token: string): Promise<void> {
  if (!userId || !token) return;
  try {
    const { error } = await supabase.from('driver_push_tokens').upsert(
      {
        driver_id:   userId,
        fcm_token:   token,
        device_hint: 'expo-push',
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'fcm_token' },
    );
    if (error) {
      console.warn('[notifications] savePushToken error:', error.message);
    }
  } catch {
    // Non-fatal — token registration is best-effort
  }
}
