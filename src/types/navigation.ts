import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// ── Root stack ────────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Auth: undefined;
  Business: undefined;
  AccessDenied: undefined;
};

// ── Auth stack ────────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  StaffInviteAccept: { token?: string };
};

// ── Business stack (tabs + modal screens) ─────────────────────────────────────

export type BusinessStackParamList = {
  BusinessTabs: undefined;
  BusinessSelector: undefined;
  OrderDetail: { orderId: string };
  MessageThread: { orderId: string; threadId: string; orderNumber?: string };
  ProductDetail: { productId: string };
  Specials: undefined;
  Staff: undefined;
  StoreProfile: undefined;
  LaunchChecklist: undefined;
  Payouts: undefined;
  UploadStudio: undefined;
  ServicesPortal: undefined;
  ServiceRequestNew: { requestType: string };
  ServiceRequestDetail: { requestId: string };
  Coins: undefined;
  Shop: undefined;
  ShopOrderDetail: { orderId: string };
  Support: undefined;
  SupportCaseDetail: { requestId: string };
  Notifications: undefined;
};

// ── Business bottom tabs ──────────────────────────────────────────────────────

export type BusinessTabParamList = {
  Home: undefined;
  Orders: undefined;
  Products: undefined;
  Messages: undefined;
  More: undefined;
};

// ── Screen prop types ─────────────────────────────────────────────────────────

export type LoginScreenProps            = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type RegisterScreenProps         = NativeStackScreenProps<AuthStackParamList, 'Register'>;
export type ForgotPasswordScreenProps   = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;
export type StaffInviteAcceptScreenProps = NativeStackScreenProps<AuthStackParamList, 'StaffInviteAccept'>;

export type HomeScreenProps     = BottomTabScreenProps<BusinessTabParamList, 'Home'>;
export type OrdersScreenProps   = BottomTabScreenProps<BusinessTabParamList, 'Orders'>;
export type ProductsScreenProps = BottomTabScreenProps<BusinessTabParamList, 'Products'>;
export type MessagesScreenProps = BottomTabScreenProps<BusinessTabParamList, 'Messages'>;
export type MoreScreenProps     = BottomTabScreenProps<BusinessTabParamList, 'More'>;

export type BusinessSelectorScreenProps = NativeStackScreenProps<BusinessStackParamList, 'BusinessSelector'>;
export type OrderDetailScreenProps     = NativeStackScreenProps<BusinessStackParamList, 'OrderDetail'>;
export type MessageThreadScreenProps   = NativeStackScreenProps<BusinessStackParamList, 'MessageThread'>;
export type ProductDetailScreenProps   = NativeStackScreenProps<BusinessStackParamList, 'ProductDetail'>;
export type SpecialsScreenProps        = NativeStackScreenProps<BusinessStackParamList, 'Specials'>;
export type StaffScreenProps           = NativeStackScreenProps<BusinessStackParamList, 'Staff'>;
export type StoreProfileScreenProps    = NativeStackScreenProps<BusinessStackParamList, 'StoreProfile'>;
export type LaunchChecklistScreenProps = NativeStackScreenProps<BusinessStackParamList, 'LaunchChecklist'>;
export type PayoutsScreenProps         = NativeStackScreenProps<BusinessStackParamList, 'Payouts'>;
export type UploadStudioScreenProps         = NativeStackScreenProps<BusinessStackParamList, 'UploadStudio'>;
export type ServicesPortalScreenProps       = NativeStackScreenProps<BusinessStackParamList, 'ServicesPortal'>;
export type ServiceRequestNewScreenProps    = NativeStackScreenProps<BusinessStackParamList, 'ServiceRequestNew'>;
export type ServiceRequestDetailScreenProps = NativeStackScreenProps<BusinessStackParamList, 'ServiceRequestDetail'>;
export type CoinsScreenProps               = NativeStackScreenProps<BusinessStackParamList, 'Coins'>;
export type ShopScreenProps                = NativeStackScreenProps<BusinessStackParamList, 'Shop'>;
export type ShopOrderDetailScreenProps     = NativeStackScreenProps<BusinessStackParamList, 'ShopOrderDetail'>;
export type SupportScreenProps             = NativeStackScreenProps<BusinessStackParamList, 'Support'>;
export type SupportCaseDetailScreenProps   = NativeStackScreenProps<BusinessStackParamList, 'SupportCaseDetail'>;
export type NotificationsScreenProps       = NativeStackScreenProps<BusinessStackParamList, 'Notifications'>;
