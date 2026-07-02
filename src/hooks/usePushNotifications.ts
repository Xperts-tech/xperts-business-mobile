import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { registerPushToken } from '@/services/notificationService';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
    shouldShowBanner: true,
    shouldShowList:  true,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:       'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1A3558',
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.expoConfig?.extra?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('[usePushNotifications] No projectId found — skipping token registration');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (err) {
    console.warn('[usePushNotifications] Token registration failed:', err);
    return null;
  }
}

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let receivedSub: Notifications.EventSubscription | null = null;
    let responseSub: Notifications.EventSubscription | null = null;

    void getExpoPushToken().then((token) => {
      if (token) {
        const hint = Platform.OS + '@' + (Constants.deviceName ?? 'unknown');
        void registerPushToken(user.id, token, hint);
      }
    });

    receivedSub = Notifications.addNotificationReceivedListener((_notification) => {
      // Foreground notification received — badge + alert handled by handler above.
    });

    responseSub = Notifications.addNotificationResponseReceivedListener((_response) => {
      // User tapped a notification — could navigate to relevant screen in future batches.
    });

    return () => {
      receivedSub?.remove();
      responseSub?.remove();
    };
  }, [user?.id]);
}
