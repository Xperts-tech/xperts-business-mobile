import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import {
  SHOP_CATEGORIES,
  listShopProducts,
  listMyShopOrders,
  placeShopOrder,
  getOrderStatusColor,
  getOrderStatusLabel,
  formatJmd,
  type ShopProduct,
  type ShopOrder,
  type ShopOrderItem,
} from '@/services/shopService';
import type { BusinessStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;
type Cart = Record<string, number>; // productId → quantity

// ── Order row ────────────────────────────────────────────────────────────────

function OrderRow({ order, onPress }: { order: ShopOrder; onPress: () => void }) {
  const color = getOrderStatusColor(order.status);
  const label = getOrderStatusLabel(order.status);
  const date  = new Date(order.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const itemCount = (order.items as ShopOrderItem[]).reduce((s, i) => s + i.quantity, 0);

  return (
    <TouchableOpacity style={styles.orderRow} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.orderRowLeft}>
        <Text style={styles.orderRowTitle}>
          {itemCount} item{itemCount !== 1 ? 's' : ''} · {formatJmd(order.total_jmd)}
        </Text>
        <Text style={styles.orderRowDate}>{date}</Text>
      </View>
      <View style={[styles.orderStatusPill, { backgroundColor: color + '18', borderColor: color + '40' }]}>
        <Text style={[styles.orderStatusText, { color }]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  qty,
  onInc,
  onDec,
}: {
  product: ShopProduct;
  qty: number;
  onInc: () => void;
  onDec: () => void;
}) {
  const atMax = product.max_per_order != null && qty >= product.max_per_order;

  return (
    <View style={styles.productCard}>
      <View style={styles.productInfo}>
        <View style={styles.productNameRow}>
          <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
          {product.is_free && (
            <View style={styles.freePill}>
              <Text style={styles.freePillText}>FREE</Text>
            </View>
          )}
          {product.requires_approval && (
            <View style={styles.approvalPill}>
              <Text style={styles.approvalPillText}>On request</Text>
            </View>
          )}
        </View>
        {product.description ? (
          <Text style={styles.productDesc} numberOfLines={2}>{product.description}</Text>
        ) : null}
        {!product.is_free && (
          <Text style={styles.productPrice}>{formatJmd(product.price_jmd)}</Text>
        )}
      </View>

      <View style={styles.stepper}>
        <TouchableOpacity
          style={[styles.stepBtn, qty === 0 && styles.stepBtnDisabled]}
          onPress={onDec}
          disabled={qty === 0}
          activeOpacity={0.7}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepQty}>{qty}</Text>
        <TouchableOpacity
          style={[styles.stepBtn, atMax && styles.stepBtnDisabled]}
          onPress={onInc}
          disabled={atMax}
          activeOpacity={0.7}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ShopScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user }   = useAuth();
  const { selectedBusinessId, selectedStoreId } = useBusiness();

  const [products,   setProducts]   = useState<ShopProduct[]>([]);
  const [orders,     setOrders]     = useState<ShopOrder[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cart,       setCart]       = useState<Cart>({});

  // Checkout overlay state
  const [showCheckout,     setShowCheckout]     = useState(false);
  const [deliveryAddress,  setDeliveryAddress]  = useState('');
  const [orderNotes,       setOrderNotes]       = useState('');
  const [placing,          setPlacing]          = useState(false);
  const [placeError,       setPlaceError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    const [pRes, oRes] = await Promise.all([
      listShopProducts(),
      selectedBusinessId ? listMyShopOrders(selectedBusinessId) : Promise.resolve({ orders: [], error: null }),
    ]);
    setProducts(pRes.products);
    setOrders(oRes.orders);
    setLoading(false);
  }, [selectedBusinessId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function incQty(product: ShopProduct) {
    const cur = cart[product.id] ?? 0;
    const max = product.max_per_order ?? 99;
    if (cur < max) setCart((prev) => ({ ...prev, [product.id]: cur + 1 }));
  }

  function decQty(productId: string) {
    const cur = cart[productId] ?? 0;
    if (cur <= 1) {
      setCart((prev) => { const next = { ...prev }; delete next[productId]; return next; });
    } else {
      setCart((prev) => ({ ...prev, [productId]: cur - 1 }));
    }
  }

  const cartItems: (ShopProduct & { qty: number })[] = products
    .filter((p) => (cart[p.id] ?? 0) > 0)
    .map((p) => ({ ...p, qty: cart[p.id]! }));

  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cartItems.reduce((s, i) => s + (i.is_free ? 0 : i.price_jmd * i.qty), 0);

  async function handlePlaceOrder() {
    if (!selectedBusinessId || !user) return;
    if (cartItems.length === 0) return;

    setPlacing(true);
    setPlaceError(null);

    const lineItems: ShopOrderItem[] = cartItems.map((p) => ({
      product_id: p.id,
      name:       p.name,
      price_jmd:  p.price_jmd,
      quantity:   p.qty,
      is_free:    p.is_free,
    }));

    const { order, error } = await placeShopOrder({
      businessId:      selectedBusinessId,
      storeId:         selectedStoreId ?? null,
      submittedBy:     user.id,
      items:           lineItems,
      totalJmd:        cartTotal,
      deliveryAddress,
      notes:           orderNotes,
    });

    setPlacing(false);

    if (error || !order) {
      setPlaceError(error ?? 'Failed to place order. Please try again.');
      return;
    }

    setCart({});
    setShowCheckout(false);
    setDeliveryAddress('');
    setOrderNotes('');
    setOrders((prev) => [order, ...prev]);

    Alert.alert(
      'Order placed! 🎉',
      'Your order has been received. We\'ll be in touch shortly.',
      [{ text: 'View order', onPress: () => navigation.navigate('ShopOrderDetail', { orderId: order.id }) },
       { text: 'Continue shopping', style: 'cancel' }],
    );
  }

  // ── Catalog list data ────────────────────────────────────────────────────

  type CatalogRow =
    | { type: 'orders_section'; orders: ShopOrder[] }
    | { type: 'catalog_header' }
    | { type: 'category_header'; label: string; icon: string }
    | { type: 'product'; product: ShopProduct }
    | { type: 'empty' };

  const productsByCategory = SHOP_CATEGORIES.reduce<Record<string, ShopProduct[]>>((acc, cat) => {
    acc[cat.key] = products.filter((p) => p.category === cat.key);
    return acc;
  }, {});

  const listData: CatalogRow[] = [];
  if (orders.length > 0) listData.push({ type: 'orders_section', orders: orders.slice(0, 3) });
  listData.push({ type: 'catalog_header' });

  let hasCatalogItems = false;
  for (const cat of SHOP_CATEGORIES) {
    const catProducts = productsByCategory[cat.key] ?? [];
    if (catProducts.length > 0) {
      hasCatalogItems = true;
      listData.push({ type: 'category_header', label: cat.label, icon: cat.icon });
      catProducts.forEach((p) => listData.push({ type: 'product', product: p }));
    }
  }
  if (!hasCatalogItems) listData.push({ type: 'empty' });

  function renderCatalogItem({ item }: { item: CatalogRow }) {
    if (item.type === 'orders_section') {
      return (
        <View style={styles.ordersSection}>
          <Text style={styles.sectionLabel}>Recent Orders</Text>
          {item.orders.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              onPress={() => navigation.navigate('ShopOrderDetail', { orderId: o.id })}
            />
          ))}
        </View>
      );
    }

    if (item.type === 'catalog_header') {
      return <Text style={styles.sectionLabel}>Shop Catalog</Text>;
    }

    if (item.type === 'category_header') {
      return (
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryIcon}>{item.icon}</Text>
          <Text style={styles.categoryLabel}>{item.label}</Text>
        </View>
      );
    }

    if (item.type === 'product') {
      return (
        <ProductCard
          product={item.product}
          qty={cart[item.product.id] ?? 0}
          onInc={() => incQty(item.product)}
          onDec={() => decQty(item.product.id)}
        />
      );
    }

    if (item.type === 'empty') {
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🏪</Text>
          <Text style={styles.emptyTitle}>Shop coming soon</Text>
          <Text style={styles.emptyBody}>
            Products will appear here once our catalog is ready. Check back shortly.
          </Text>
        </View>
      );
    }

    return null;
  }

  // ── Checkout overlay ──────────────────────────────────────────────────────

  if (showCheckout) {
    return (
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowCheckout(false)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Order</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          style={styles.checkoutScroll}
          contentContainerStyle={[styles.checkoutContent, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Items */}
          <Text style={styles.checkoutSectionLabel}>Items</Text>
          <View style={styles.checkoutCard}>
            {cartItems.map((item, idx) => (
              <View
                key={item.id}
                style={[styles.checkoutItem, idx < cartItems.length - 1 && styles.checkoutItemBorder]}
              >
                <View style={styles.checkoutItemLeft}>
                  <Text style={styles.checkoutItemName}>{item.name}</Text>
                  <Text style={styles.checkoutItemMeta}>
                    Qty: {item.qty}{item.is_free ? ' · Free' : ''}
                  </Text>
                </View>
                <Text style={styles.checkoutItemPrice}>
                  {item.is_free ? 'Free' : formatJmd(item.price_jmd * item.qty)}
                </Text>
              </View>
            ))}
            <View style={styles.checkoutTotal}>
              <Text style={styles.checkoutTotalLabel}>Total</Text>
              <Text style={styles.checkoutTotalValue}>{formatJmd(cartTotal)}</Text>
            </View>
          </View>

          {/* Delivery address */}
          <Text style={styles.checkoutSectionLabel}>Delivery Address</Text>
          <TextInput
            style={styles.checkoutInput}
            placeholder="Enter delivery address or location…"
            placeholderTextColor={colors.textMuted}
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
            multiline
            numberOfLines={2}
          />

          {/* Notes */}
          <Text style={styles.checkoutSectionLabel}>Notes (optional)</Text>
          <TextInput
            style={styles.checkoutInput}
            placeholder="Any special instructions or requests…"
            placeholderTextColor={colors.textMuted}
            value={orderNotes}
            onChangeText={setOrderNotes}
            multiline
            numberOfLines={2}
          />

          {placeError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{placeError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.placeOrderBtn, placing && styles.placeOrderBtnDisabled]}
            onPress={handlePlaceOrder}
            disabled={placing}
            activeOpacity={0.85}
          >
            {placing
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.placeOrderBtnText}>Place Order · {formatJmd(cartTotal)}</Text>
            }
          </TouchableOpacity>

          <Text style={styles.checkoutDisclaimer}>
            Our team will confirm your order and arrange delivery. Payment is handled on delivery or via invoice.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Catalog view ──────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Xperts Shop</Text>
        {cartCount > 0 ? (
          <TouchableOpacity style={styles.cartBadgeBtn} onPress={() => setShowCheckout(true)}>
            <Text style={styles.cartBadgeText}>{cartCount}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) => {
            if (item.type === 'product') return item.product.id;
            if (item.type === 'category_header') return `cat-${item.label}`;
            return `${item.type}-${i}`;
          }}
          renderItem={renderCatalogItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        />
      )}

      {/* Cart bar */}
      {cartCount > 0 && !loading && (
        <View style={[styles.cartBar, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.cartBarLeft}>
            <Text style={styles.cartBarCount}>{cartCount} item{cartCount !== 1 ? 's' : ''}</Text>
            <Text style={styles.cartBarTotal}>{formatJmd(cartTotal)}</Text>
          </View>
          <TouchableOpacity style={styles.checkoutBtn} onPress={() => setShowCheckout(true)} activeOpacity={0.85}>
            <Text style={styles.checkoutBtnText}>Checkout →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    backgroundColor:   colors.brand,
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
  backBtn:     { width: 64 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#fff' },
  cartBadgeBtn: {
    width: 64, alignItems: 'flex-end',
  },
  cartBadgeText: {
    fontSize: 13, fontWeight: '800', color: '#fff',
    backgroundColor: '#EF4444', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3,
    overflow: 'hidden',
  },

  listContent: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingTop: 8, paddingBottom: 4,
  },

  ordersSection: { gap: 8 },
  orderRow: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
    borderColor: colors.border, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  orderRowLeft:  { flex: 1 },
  orderRowTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  orderRowDate:  { fontSize: 11, color: colors.textMuted },
  orderStatusPill: {
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3,
  },
  orderStatusText: { fontSize: 10, fontWeight: '800' },

  categoryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 12, paddingBottom: 4,
  },
  categoryIcon:  { fontSize: 20 },
  categoryLabel: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },

  productCard: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
    borderColor: colors.border, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  productInfo: { flex: 1, gap: 4 },
  productNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' },
  productName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  freePill: {
    backgroundColor: '#D1FAE5', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  freePillText: { fontSize: 9, fontWeight: '800', color: '#065F46' },
  approvalPill: {
    backgroundColor: '#FEF3C7', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  approvalPillText: { fontSize: 9, fontWeight: '800', color: '#92400E' },
  productDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  productPrice: { fontSize: 13, fontWeight: '700', color: colors.brand },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled: { backgroundColor: colors.border },
  stepBtnText: { fontSize: 20, color: '#fff', fontWeight: '400', lineHeight: 24, marginTop: -2 },
  stepQty: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, minWidth: 20, textAlign: 'center' },

  emptyWrap: {
    alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 12,
  },
  emptyIcon:  { fontSize: 44 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  emptyBody:  { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, gap: 12,
  },
  cartBarLeft:  { flex: 1, gap: 2 },
  cartBarCount: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  cartBarTotal: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  checkoutBtn: {
    backgroundColor: colors.brand, borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  checkoutBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // Checkout overlay
  checkoutScroll: { flex: 1 },
  checkoutContent: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  checkoutSectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 12, marginBottom: 4,
  },
  checkoutCard: {
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  checkoutItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  checkoutItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  checkoutItemLeft:   { flex: 1, gap: 2 },
  checkoutItemName:   { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  checkoutItemMeta:   { fontSize: 12, color: colors.textSecondary },
  checkoutItemPrice:  { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  checkoutTotal: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: colors.border,
  },
  checkoutTotalLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  checkoutTotalValue: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },

  checkoutInput: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.textPrimary, lineHeight: 20,
    textAlignVertical: 'top', minHeight: 56,
  },

  errorBox: {
    backgroundColor: '#FEF2F2', borderRadius: 12, borderWidth: 1,
    borderColor: '#FECACA', padding: 12,
  },
  errorText: { fontSize: 13, color: colors.danger },

  placeOrderBtn: {
    backgroundColor: colors.brand, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  placeOrderBtnDisabled: { opacity: 0.6 },
  placeOrderBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  checkoutDisclaimer: {
    fontSize: 11, color: colors.textMuted, textAlign: 'center', lineHeight: 16, marginTop: 8,
  },
});
