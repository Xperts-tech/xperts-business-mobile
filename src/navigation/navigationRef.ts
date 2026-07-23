import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '@/types/navigation';

// Container ref so non-component code (e.g. push-notification handlers) can
// navigate. Typed to the container root; nested screens are reached through the
// Business navigator.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToOrder(orderId: string): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Business', { screen: 'OrderDetail', params: { orderId } });
  }
}
