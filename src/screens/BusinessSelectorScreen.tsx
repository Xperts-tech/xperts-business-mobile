import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';

export default function BusinessSelectorScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { businesses, selectedBusinessId, setSelectedBusinessId } = useBusiness();

  function handleSelect(id: string) {
    setSelectedBusinessId(id);
    navigation.goBack();
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Select business</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {businesses.map((b) => {
          const selected = b.id === selectedBusinessId;
          return (
            <TouchableOpacity
              key={b.id}
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => handleSelect(b.id)}
              activeOpacity={0.75}
            >
              <View style={[styles.avatar, selected && styles.avatarSelected]}>
                <Text style={[styles.avatarText, selected && styles.avatarTextSelected]}>
                  {(b.name ?? 'B')[0].toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowName, selected && styles.rowNameSelected]}>{b.name}</Text>
                <Text style={styles.rowStatus}>
                  {(b.approval_status ?? b.status ?? 'draft').replace(/_/g, ' ')}
                </Text>
              </View>
              {selected && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          );
        })}
        {businesses.length === 0 && (
          <Text style={styles.emptyText}>No businesses found for your account.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  closeBtn: { fontSize: 20, color: colors.textMuted, padding: 4 },
  list: { gap: 10 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card,
    borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: colors.border,
  },
  rowSelected: { borderColor: colors.brand, backgroundColor: colors.brandSurface },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  avatarSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  avatarText: { fontSize: 18, fontWeight: '800', color: colors.textSecondary },
  avatarTextSelected: { color: '#fff' },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  rowNameSelected: { color: colors.brand },
  rowStatus: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  checkmark: { fontSize: 18, color: colors.brand, fontWeight: '700' },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 32 },
});
