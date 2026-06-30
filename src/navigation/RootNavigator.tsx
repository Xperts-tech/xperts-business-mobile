import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, Text } from 'react-native';

import AuthNavigator from './AuthNavigator';
import DriverNavigator from './DriverNavigator';
import ApplicationStatusScreen from '@/screens/ApplicationStatusScreen';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/constants/colors';
import type { RootStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { session, initializing, driverRow } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.brand }}>
        <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Text style={{ fontSize: 32, fontWeight: '900', color: colors.brand }}>X</Text>
        </View>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
      </View>
    );
  }

  // Approved drivers only get full app access.
  // Any other session state (pending, rejected, suspended, no driverRow yet) → status screen.
  const isApproved = driverRow?.approval_status === 'approved';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!session ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : isApproved ? (
        <Stack.Screen name="Driver" component={DriverNavigator} />
      ) : (
        <Stack.Screen name="ApplicationStatus" component={ApplicationStatusScreen} />
      )}
    </Stack.Navigator>
  );
}
