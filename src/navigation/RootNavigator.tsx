import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Text, View } from 'react-native';
import AuthNavigator from '@/navigation/AuthNavigator';
import BusinessNavigator from '@/navigation/BusinessNavigator';
import AccessDeniedScreen from '@/screens/AccessDeniedScreen';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/constants/colors';
import type { RootStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { session, initializing, isAuthenticated, isBusinessUser, isAdmin, isStaffMember } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.brand }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.2,
            shadowRadius: 10,
            elevation: 8,
          }}
        >
          <Text style={{ fontSize: 36, fontWeight: '900', color: colors.brand, letterSpacing: -1 }}>X</Text>
        </View>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 16, letterSpacing: 1 }}>
          XPERTS BUSINESS
        </Text>
      </View>
    );
  }

  const hasAccess = session && (isBusinessUser || isAdmin || isStaffMember);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!session ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : hasAccess ? (
        <Stack.Screen name="Business" component={BusinessNavigator} />
      ) : (
        <Stack.Screen name="AccessDenied" component={AccessDeniedScreen} />
      )}
    </Stack.Navigator>
  );
}
