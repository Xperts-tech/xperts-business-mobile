import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/contexts/AuthContext';
import { BusinessProvider } from '@/contexts/BusinessContext';
import RootNavigator from '@/navigation/RootNavigator';
import { navigationRef } from '@/navigation/navigationRef';
import type { RootStackParamList } from '@/types/navigation';

// Deep links (custom scheme xperts-business://). Used by the Meta OAuth return:
// the callback bounces to xperts-business://social?meta=connected → Social screen.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['xperts-business://'],
  config: {
    screens: {
      Business: {
        screens: {
          Social: 'social',
        },
      },
    },
  },
};

export default function App() {
  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <AuthProvider>
        <BusinessProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </BusinessProvider>
      </AuthProvider>
    </NavigationContainer>
  );
}
