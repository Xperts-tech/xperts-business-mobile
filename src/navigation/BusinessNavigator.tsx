import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
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
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import type { BusinessStackParamList, BusinessTabParamList } from '@/types/navigation';

// ── Tab icon helpers ──────────────────────────────────────────────────────────

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize: 20, color: focused ? colors.tabActive : colors.tabInactive }}>{icon}</Text>
      <Text
        style={{
          fontSize: 10,
          fontWeight: focused ? '700' : '500',
          color: focused ? colors.tabActive : colors.tabInactive,
          letterSpacing: 0.2,
        }}
      >
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
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" label="Home" focused={focused} />,
        }}
      />
      {showOrders && (
        <Tab.Screen
          name="Orders"
          component={OrdersScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="📦" label="Orders" focused={focused} />,
          }}
        />
      )}
      {showProducts && (
        <Tab.Screen
          name="Products"
          component={ProductsScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="🛍️" label="Products" focused={focused} />,
          }}
        />
      )}
      {showMessages && (
        <Tab.Screen
          name="Messages"
          component={MessagesScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="💬" label="Messages" focused={focused} />,
          }}
        />
      )}
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="☰" label="More" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ── Business stack ────────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<BusinessStackParamList>();

export default function BusinessNavigator() {
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
    </Stack.Navigator>
  );
}
