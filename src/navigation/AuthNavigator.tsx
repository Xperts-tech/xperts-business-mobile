import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '@/screens/LoginScreen';
import ApplyScreen from '@/screens/ApplyScreen';
import { colors } from '@/constants/colors';
import type { AuthStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen
        name="Apply"
        component={ApplyScreen}
        options={{
          headerShown: false,
          animation: 'slide_from_right',
          // Custom header is rendered inside ApplyScreen to match brand styling.
        }}
      />
    </Stack.Navigator>
  );
}
