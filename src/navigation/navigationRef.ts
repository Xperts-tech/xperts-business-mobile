import { createNavigationContainerRef } from '@react-navigation/native';
import type { BusinessStackParamList } from '@/types/navigation';

// Container ref so non-component code (e.g. push-notification handlers) can
// navigate. Screen names are unique across the tree, so navigating by name
// resolves into the mounted Business navigator.
export const navigationRef = createNavigationContainerRef<BusinessStackParamList>();

export function navigateToOrder(orderId: string): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate('OrderDetail', { orderId });
  }
}
