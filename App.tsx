import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/contexts/AuthContext';
import { BusinessProvider } from '@/contexts/BusinessContext';
import RootNavigator from '@/navigation/RootNavigator';
import { navigationRef } from '@/navigation/navigationRef';

export default function App() {
  return (
    <NavigationContainer ref={navigationRef}>
      <AuthProvider>
        <BusinessProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </BusinessProvider>
      </AuthProvider>
    </NavigationContainer>
  );
}
