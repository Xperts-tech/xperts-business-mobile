import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/contexts/AuthContext';
import { BusinessProvider } from '@/contexts/BusinessContext';
import RootNavigator from '@/navigation/RootNavigator';

export default function App() {
  return (
    <NavigationContainer>
      <AuthProvider>
        <BusinessProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </BusinessProvider>
      </AuthProvider>
    </NavigationContainer>
  );
}
