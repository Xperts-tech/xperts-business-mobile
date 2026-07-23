import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { openBillingPortal } from '@/services/billingService';

// View-only billing entry point. There is intentionally NO price or buy CTA here
// (Apple App Store compliance) — purchases and plan upgrades happen on the web
// billing portal, which this card opens in the browser.
export default function ManageBillingCard({ note }: { note?: string }) {
  return (
    <View style={s.card}>
      <View style={s.iconWrap}>
        <Ionicons name="card-outline" size={20} color={colors.brand} />
      </View>
      <View style={s.body}>
        <Text style={s.title}>Manage Billing</Text>
        <Text style={s.sub}>
          {note ?? 'Upgrade your plan, top up Growth Coins, and view invoices on the Xperts Business web portal.'}
        </Text>
        <TouchableOpacity style={s.btn} onPress={openBillingPortal} activeOpacity={0.85}>
          <Text style={s.btnText}>Open billing portal</Text>
          <Ionicons name="open-outline" size={15} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderRadius: 16,
    padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  sub: { marginTop: 3, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  btn: {
    marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
  },
  btnText: { fontSize: 13, fontWeight: '800', color: colors.white },
});
