import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '@/screens/HomeScreen';
import OrdersScreen from '@/screens/OrdersScreen';
import OrderDetailScreen from '@/screens/OrderDetailScreen';
import ProductsScreen from '@/screens/ProductsScreen';
import ProductDetailScreen from '@/screens/ProductDetailScreen';
import SpecialsScreen from '@/screens/SpecialsScreen';
import StaffScreen from '@/screens/StaffScreen';
import StoreProfileScreen from '@/screens/StoreProfileScreen';
import LaunchChecklistScreen from '@/screens/LaunchChecklistScreen';
import PayoutsScreen from '@/screens/PayoutsScreen';
import UploadStudioScreen from '@/screens/UploadStudioScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import MessageThreadScreen from '@/screens/MessageThreadScreen';
import MoreScreen from '@/screens/MoreScreen';
import BusinessSelectorScreen from '@/screens/BusinessSelectorScreen';
import ServicesPortalScreen from '@/screens/ServicesPortalScreen';
import ServiceRequestNewScreen from '@/screens/ServiceRequestNewScreen';
import ServiceRequestDetailScreen from '@/screens/ServiceRequestDetailScreen';
import NotificationsScreen from '@/screens/NotificationsScreen';
import CoinsScreen from '@/screens/CoinsScreen';
import ShopScreen from '@/screens/ShopScreen';
import ShopOrderDetailScreen from '@/screens/ShopOrderDetailScreen';
import SupportScreen from '@/screens/SupportScreen';
import SupportCaseDetailScreen from '@/screens/SupportCaseDetailScreen';
import AnalyticsScreen from '@/screens/AnalyticsScreen';
import GrowthStudioScreen from '@/screens/GrowthStudioScreen';
import CreativeStudioScreen from '@/screens/CreativeStudioScreen';
import PromoRequestsScreen from '@/screens/PromoRequestsScreen';
import StoreQRCodeScreen from '@/screens/StoreQRCodeScreen';
import SocialScreen from '@/screens/SocialScreen';
import ContentCalendarScreen from '@/screens/ContentCalendarScreen';
import RentalHostScreen from '@/screens/RentalHostScreen';
import RentalVehicleEditorScreen from '@/screens/RentalVehicleEditorScreen';
import PromoteStoreScreen from '@/screens/PromoteStoreScreen';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import type { BusinessStackParamList, BusinessTabParamList } from '@/types/navigation';

// ── Tab icon helpers ──────────────────────────────────────────────────────────

import { Text } from 'react-native';

function TabIcon({
  icon,
  iconFocused,
  label,
  focused,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  label: string;
  focused: boolean;
}) {
  const tint = focused ? colors.tabActive : colors.tabInactive;
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Ionicons name={focused ? iconFocused : icon} size={22} color={tint} />
      <Text style={{ fontSize: 10, fontWeight: focused ? '700' : '500', color: tint, letterSpacing: 0.2 }}>
        {label}
      </Text>
    </View>
  );
}

// ── Bottom tabs ───────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<BusinessTabParamList>();

function BusinessTabs() {
  const { isAdmin } = useAuth();
  const { hasPermission } = useBusiness();

  const showOrders   = isAdmin || hasPermission('orders.view');
  const showProducts = isAdmin || hasPermission('catalog.view');
  const showMessages = isAdmin || hasPermission('messages.view');

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="home-outline" iconFocused="home" label="Home" focused={focused} />
          ),
        }}
      />
      {showOrders && (
        <Tab.Screen
          name="Orders"
          component={OrdersScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="receipt-outline" iconFocused="receipt" label="Orders" focused={focused} />
            ),
          }}
        />
      )}
      {showProducts && (
        <Tab.Screen
          name="Products"
          component={ProductsScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="storefront-outline" iconFocused="storefront" label="Products" focused={focused} />
            ),
          }}
        />
      )}
      {showMessages && (
        <Tab.Screen
          name="Messages"
          component={MessagesScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="chatbubbles-outline" iconFocused="chatbubbles" label="Messages" focused={focused} />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="menu-outline" iconFocused="menu" label="More" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ── Business stack ────────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<BusinessStackParamList>();

export default function BusinessNavigator() {
  usePushNotifications();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BusinessTabs" component={BusinessTabs} />
      <Stack.Screen
        name="BusinessSelector"
        component={BusinessSelectorScreen}
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="MessageThread"
        component={MessageThreadScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Specials"
        component={SpecialsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Staff"
        component={StaffScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="StoreProfile"
        component={StoreProfileScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="LaunchChecklist"
        component={LaunchChecklistScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Payouts"
        component={PayoutsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="UploadStudio"
        component={UploadStudioScreen}
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />
      <Stack.Screen
        name="ServicesPortal"
        component={ServicesPortalScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ServiceRequestNew"
        component={ServiceRequestNewScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ServiceRequestDetail"
        component={ServiceRequestDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Coins"
        component={CoinsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Shop"
        component={ShopScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ShopOrderDetail"
        component={ShopOrderDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="SupportCaseDetail"
        component={SupportCaseDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="GrowthStudio"
        component={GrowthStudioScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="CreativeStudio"
        component={CreativeStudioScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="PromoRequests"
        component={PromoRequestsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="StoreQRCode"
        component={StoreQRCodeScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Social"
        component={SocialScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ContentCalendar"
        component={ContentCalendarScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen name="RentalHost" component={RentalHostScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="RentalVehicleEditor" component={RentalVehicleEditorScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="PromoteStore"
        component={PromoteStoreScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
