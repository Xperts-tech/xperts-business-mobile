import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// ── Root (auth gate) ─────────────────────────────────────────────────────────
export type RootStackParamList = {
  Auth: undefined;
  Driver: undefined;
  /** Shown when session exists but driver is not yet approved */
  ApplicationStatus: undefined;
};

// ── Auth stack ────────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Apply: undefined;
};

// ── Driver root stack (tabs + modals) ─────────────────────────────────────────
export type DriverStackParamList = {
  // Allow nested tab navigation: navigate('DriverTabs', { screen: 'ActiveOrder' })
  DriverTabs: NavigatorScreenParams<DriverTabParamList> | undefined;
  IncomingOffer: { attemptId: string };
  OrderChat: {
    orderId: string;
    conversationId: string;
    customerName: string | null;
    orderRef: string | null;
    customerId: string | null;
  };
  ContractRunDetail: { routeId: string; driverId: string };
  VehicleRental: undefined;
};

// ── Driver bottom tabs ────────────────────────────────────────────────────────
export type DriverTabParamList = {
  Home: undefined;
  ActiveOrder: undefined;
  Earnings: undefined;
  ContractRuns: undefined;
  Profile: undefined;
};

// ── Convenience screen prop types ─────────────────────────────────────────────
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type ApplyScreenProps = NativeStackScreenProps<AuthStackParamList, 'Apply'>;

export type DriverHomeScreenProps = BottomTabScreenProps<DriverTabParamList, 'Home'>;
export type ActiveOrderScreenProps = BottomTabScreenProps<DriverTabParamList, 'ActiveOrder'>;
export type EarningsScreenProps = BottomTabScreenProps<DriverTabParamList, 'Earnings'>;
export type ContractRunsScreenProps = BottomTabScreenProps<DriverTabParamList, 'ContractRuns'>;
export type ProfileScreenProps = BottomTabScreenProps<DriverTabParamList, 'Profile'>;

export type IncomingOfferScreenProps = NativeStackScreenProps<
  DriverStackParamList,
  'IncomingOffer'
>;

export type OrderChatScreenProps = NativeStackScreenProps<
  DriverStackParamList,
  'OrderChat'
>;

export type ContractRunDetailScreenProps = NativeStackScreenProps<
  DriverStackParamList,
  'ContractRunDetail'
>;

export type VehicleRentalScreenProps = NativeStackScreenProps<
  DriverStackParamList,
  'VehicleRental'
>;
