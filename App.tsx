import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/contexts/AuthContext';
import RootNavigator from '@/navigation/RootNavigator';

export default function App() {
  return (
    <NavigationContainer>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </NavigationContainer>
  );
}
