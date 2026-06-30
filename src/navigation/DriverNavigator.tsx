import { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import DriverHomeScreen from '@/screens/DriverHomeScreen';
import ActiveOrderScreen from '@/screens/ActiveOrderScreen';
import EarningsScreen from '@/screens/EarningsScreen';
import ContractRunsScreen from '@/screens/ContractRunsScreen';
import ContractRunDetailScreen from '@/screens/ContractRunDetailScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import IncomingOfferScreen from '@/screens/IncomingOfferScreen';
import OrderChatScreen from '@/screens/OrderChatScreen';
import VehicleRentalScreen from '@/screens/VehicleRentalScreen';

import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  ensureAndroidChannel,
  registerForPushNotificationsAsync,
  savePushToken,
} from '@/services/notificationService';
import type { DriverStackParamList, DriverTabParamList } from '@/types/navigation';

// ── Bottom tabs ───────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<DriverTabParamList>();

function DriverTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 62,
          shadowColor: '#0D1B2E',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={DriverHomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
        }}
      />
      <Tab.Screen
        name="ActiveOrder"
        component={ActiveOrderScreen}
        options={{
          tabBarLabel: 'Active Order',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📦</Text>,
        }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{
          tabBarLabel: 'Earnings',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💰</Text>,
        }}
      />
      <Tab.Screen
        name="ContractRuns"
        component={ContractRunsScreen}
        options={{
          tabBarLabel: 'Contracts',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🚚</Text>,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

// ── Driver root stack (tabs + modal screens) ───────────────────────────────────

const Stack = createNativeStackNavigator<DriverStackParamList>();

export default function DriverNavigator() {
  const { user } = useAuth();

  // Register for push notifications once per session.
  // Runs after login; re-runs if user.id changes (e.g. sign out + sign in as different driver).
  useEffect(() => {
    void (async () => {
      await ensureAndroidChannel();
      const token = await registerForPushNotificationsAsync();
      if (token && user?.id) {
        await savePushToken(user.id, token);
      }
    })();
  }, [user?.id]);

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="DriverTabs"
        component={DriverTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="IncomingOffer"
        component={IncomingOfferScreen}
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="OrderChat"
        component={OrderChatScreen}
        options={{
          headerShown: true,
          headerTitle: 'Customer Chat',
          headerBackTitle: 'Order',
          headerTintColor: colors.brand,
          headerTitleStyle: { fontSize: 16, fontWeight: '800' },
        }}
      />
      <Stack.Screen
        name="ContractRunDetail"
        component={ContractRunDetailScreen}
        options={{
          headerShown: true,
          headerTitle: 'Run Detail',
          headerBackTitle: 'Back',
          headerTintColor: colors.brand,
          headerTitleStyle: { fontSize: 16, fontWeight: '800' },
        }}
      />
      <Stack.Screen
        name="VehicleRental"
        component={VehicleRentalScreen}
        options={{
          headerShown: true,
          headerTitle: 'Vehicle Rental Program',
          headerBackTitle: 'Profile',
          headerTintColor: colors.brand,
          headerTitleStyle: { fontSize: 16, fontWeight: '800' },
        }}
      />
    </Stack.Navigator>
  );
}
