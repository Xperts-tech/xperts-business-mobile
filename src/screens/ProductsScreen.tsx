import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import {
  loadProducts,
  toggleProductAvailability,
  bulkSetStoreAvailability,
} from '@/services/productService';
import {
  formatPrice,
  getProductImageUrl,
  isProductAvailable,
  type Product,
  type ProductAvailabilityFilter,
} from '@/types/products';
import type { BusinessStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;

const FILTERS: { key: ProductAvailabilityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'sold_out', label: 'Sold Out' },
];

function ProductCard({
  product,
  canToggle,
  onToggle,
  onPress,
}: {
  product: Product;
  canToggle: boolean;
  onToggle: (isAvailable: boolean) => void;
  onPress: () => void;
}) {
  const available = isProductAvailable(product);
  const imageUrl = getProductImageUrl(product);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardLeft}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.productImage} resizeMode="cover" />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Text style={styles.productImageEmoji}>🛍️</Text>
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        {product.category && (
          <Text style={styles.productCategory}>{product.category}</Text>
        )}
        <Text style={styles.productPrice}>{formatPrice(product.price)}</Text>
      </View>

      <View style={styles.cardRight}>
        {canToggle ? (
          <View style={styles.toggleWrapper}>
            <Switch
              value={available}
              onValueChange={onToggle}
              trackColor={{ false: colors.danger + '60', true: colors.success + '60' }}
              thumbColor={available ? colors.success : colors.danger}
              ios_backgroundColor={colors.danger + '40'}
            />
            <Text style={[styles.availLabel, { color: available ? colors.success : colors.danger }]}>
              {available ? 'In stock' : 'Sold out'}
            </Text>
          </View>
        ) : (
          <View style={[styles.availChip, { borderColor: available ? colors.success + '50' : colors.danger + '50', backgroundColor: available ? colors.success + '12' : colors.danger + '12' }]}>
            <Text style={[styles.availChipText, { color: available ? colors.success : colors.danger }]}>
              {available ? 'In stock' : 'Sold out'}
            </Text>
          </View>
        )}
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { selectedStoreId, hasPermission, isOwner } = useBusiness();

  const canToggle = isOwner || hasPermission('catalog.sold_out');
  const canViewSpecials = isOwner || hasPermission('specials.view');

  const [filter, setFilter] = useState<ProductAvailabilityFilter>('all');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistic availability map: productId → overridden boolean
  const [optimisticAvail, setOptimisticAvail] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);

  const activeFilter = useRef(filter);
  activeFilter.current = filter;

  const fetchProducts = useCallback(
    async (nextFilter: ProductAvailabilityFilter, nextPage: number, append: boolean) => {
      if (!selectedStoreId) return;
      if (nextPage === 0 && !append) setLoading(true);
      else setLoadingMore(true);

      const { products: rows, hasMore: more, error: err } = await loadProducts(
        selectedStoreId,
        nextFilter,
        nextPage,
      );

      if (activeFilter.current === nextFilter) {
        setProducts((prev) => (append ? [...prev, ...rows] : rows));
        setHasMore(more);
        setPage(nextPage);
        setError(err);
        if (!append) setOptimisticAvail({});
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [selectedStoreId],
  );

  useEffect(() => {
    setProducts([]);
    setPage(0);
    void fetchProducts(filter, 0, false);
  }, [filter, fetchProducts]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchProducts(filter, 0, false);
    setRefreshing(false);
  }

  async function handleToggle(product: Product, isAvailable: boolean) {
    // Optimistic update
    setOptimisticAvail((prev) => ({ ...prev, [product.id]: isAvailable }));
    const { error: err } = await toggleProductAvailability(product.id, isAvailable);
    if (err) {
      // Revert on error
      setOptimisticAvail((prev) => ({ ...prev, [product.id]: !isAvailable }));
    }
    // If filter is 'sold_out' or 'available', a toggle makes that item disappear — refresh
    if (filter !== 'all') {
      await fetchProducts(filter, 0, false);
    }
  }

  function handleBulk(isAvailable: boolean) {
    if (!selectedStoreId || bulkBusy) return;
    Alert.alert(
      isAvailable ? 'Mark all available?' : 'Mark all sold out?',
      isAvailable
        ? 'Every product in this store will be marked as available.'
        : 'Every product in this store will be marked as sold out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isAvailable ? 'Mark available' : 'Mark sold out',
          style: isAvailable ? 'default' : 'destructive',
          onPress: async () => {
            setBulkBusy(true);
            const { error: err } = await bulkSetStoreAvailability(selectedStoreId, isAvailable);
            setBulkBusy(false);
            if (err) Alert.alert('Could not update', err);
            else await fetchProducts(activeFilter.current, 0, false);
          },
        },
      ],
    );
  }

  const noStore = !selectedStoreId;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Products</Text>
        {canViewSpecials && (
          <TouchableOpacity
            style={styles.specialsBtn}
            onPress={() => navigation.navigate('Specials')}
            activeOpacity={0.8}
          >
            <Text style={styles.specialsBtnText}>⭐ Specials</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filter tabs ─────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Bulk availability bar ───────────────────────────────── */}
      {canToggle && !noStore && !loading && !error && products.length > 0 && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkLabel}>Set all:</Text>
          <TouchableOpacity
            style={[styles.bulkBtn, styles.bulkBtnAvail, bulkBusy && styles.bulkBtnDisabled]}
            onPress={() => handleBulk(true)}
            disabled={bulkBusy}
            activeOpacity={0.8}
          >
            <Text style={[styles.bulkBtnText, { color: colors.success }]}>✓ Available</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkBtn, styles.bulkBtnSold, bulkBusy && styles.bulkBtnDisabled]}
            onPress={() => handleBulk(false)}
            disabled={bulkBusy}
            activeOpacity={0.8}
          >
            <Text style={[styles.bulkBtnText, { color: colors.danger }]}>Sold out</Text>
          </TouchableOpacity>
          {bulkBusy && <ActivityIndicator size="small" color={colors.brand} style={{ marginLeft: 4 }} />}
        </View>
      )}

      {/* ── Content ─────────────────────────────────────────────── */}
      {noStore ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏪</Text>
          <Text style={styles.emptyTitle}>No store selected</Text>
          <Text style={styles.emptyText}>Select a store to manage its products.</Text>
        </View>
      ) : loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not load products</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => {
            const overrideAvail = optimisticAvail[item.id];
            const displayProduct: Product =
              overrideAvail !== undefined
                ? { ...item, is_available: overrideAvail }
                : item;
            return (
              <ProductCard
                product={displayProduct}
                canToggle={canToggle}
                onToggle={(isAvail) => void handleToggle(item, isAvail)}
                onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              />
            );
          }}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
          onEndReached={() => {
            if (!hasMore || loadingMore || loading) return;
            void fetchProducts(filter, page + 1, true);
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={colors.brand} size="small" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🛍️</Text>
              <Text style={styles.emptyTitle}>No products</Text>
              <Text style={styles.emptyText}>
                {filter === 'sold_out'
                  ? 'No items are currently marked as sold out.'
                  : filter === 'available'
                    ? 'No available products found.'
                    : 'Add products using the web portal to populate your catalog.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    backgroundColor: colors.brand,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  specialsBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  specialsBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  filterRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    gap: 4,
  },
  filterTab: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabActive: { borderBottomColor: colors.brand },
  filterTabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterTabTextActive: { color: colors.brand },

  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bulkLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  bulkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  bulkBtnAvail: { backgroundColor: colors.success + '12', borderColor: colors.success + '45' },
  bulkBtnSold: { backgroundColor: colors.danger + '12', borderColor: colors.danger + '45' },
  bulkBtnDisabled: { opacity: 0.5 },
  bulkBtnText: { fontSize: 12, fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 10, gap: 8 },

  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLeft: {},
  cardBody: { flex: 1, gap: 4 },
  cardRight: { alignItems: 'flex-end', gap: 8 },

  productImage: { width: 56, height: 56, borderRadius: 10 },
  productImagePlaceholder: {
    width: 56, height: 56, borderRadius: 10,
    backgroundColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  productImageEmoji: { fontSize: 24 },

  productName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, lineHeight: 20 },
  productCategory: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  productPrice: { fontSize: 14, fontWeight: '800', color: colors.brand },

  toggleWrapper: { alignItems: 'center', gap: 2 },
  availLabel: { fontSize: 10, fontWeight: '700' },

  availChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  availChipText: { fontSize: 11, fontWeight: '700' },

  chevron: { fontSize: 18, color: colors.textMuted, fontWeight: '300' },

  footerLoader: { paddingVertical: 20, alignItems: 'center' },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingTop: 60, gap: 10,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  retryBtn: {
    marginTop: 8, backgroundColor: colors.brand, borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 10,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
