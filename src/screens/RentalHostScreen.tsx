import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import {
  getMyHostAccess, applyAsHost, listMyVehicles, listBookingRequests,
  decideBooking, acknowledgePayment,
  type PartnerAccess, type HostVehicle, type HostBooking,
} from '@/services/rentalHostService';
import type { RentalHostScreenProps } from '@/types/navigation';

const money = (n: number | null) => `J$${Number(n ?? 0).toLocaleString('en-JM')}`;
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-JM', { month: 'short', day: 'numeric' });

export default function RentalHostScreen({ navigation }: RentalHostScreenProps) {
  const insets = useSafeAreaInsets();
  const [access, setAccess] = useState<PartnerAccess | null>(null);
  const [vehicles, setVehicles] = useState<HostVehicle[]>([]);
  const [requests, setRequests] = useState<HostBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'vehicles' | 'requests'>('requests');
  const [kind, setKind] = useState<'individual' | 'company'>('individual');
  const [form, setForm] = useState({ owner_name: '', company_name: '', phone: '', parish: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const a = await getMyHostAccess();
    setAccess(a);
    if (a?.partner_id && a.approval_status === 'approved') {
      const [v, r] = await Promise.all([listMyVehicles(a.partner_id), listBookingRequests(a.partner_id)]);
      setVehicles(v); setRequests(r);
    }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function onApply() {
    if (kind === 'individual' && !form.owner_name.trim()) { Alert.alert('Name needed', 'Enter your name.'); return; }
    if (kind === 'company' && !form.company_name.trim()) { Alert.alert('Company needed', 'Enter your company name.'); return; }
    setBusy(true);
    const res = await applyAsHost(kind, form);
    setBusy(false);
    if (!res.ok) { Alert.alert('Could not apply', res.reason ?? 'Please try again.'); return; }
    Alert.alert('Application sent', 'Xperts will review and approve your host account. You\'ll be able to list vehicles once approved.');
    load();
  }

  async function onDecide(r: HostBooking, action: 'approve' | 'reject') {
    let reason: string | undefined;
    const ok = await decideBooking(r.id, action, reason);
    if (!ok) { Alert.alert('Failed', 'Could not update the request.'); return; }
    load();
  }
  async function onAck(r: HostBooking) {
    Alert.alert('Confirm payment received?', 'Only confirm once the renter\'s payment has cleared.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => { const ok = await acknowledgePayment(r.id); if (!ok) Alert.alert('Failed'); load(); } },
    ]);
  }

  const header = (
    <View style={s.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Rental Hosting</Text>
      <View style={s.backBtn} />
    </View>
  );

  if (loading) {
    return <View style={[s.root, { paddingTop: insets.top }]}>{header}<View style={s.center}><ActivityIndicator color={colors.brand} /></View></View>;
  }

  // Not a host yet → apply
  if (!access) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {header}
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.introCard}>
            <Text style={s.introIcon}>🚗</Text>
            <Text style={s.introTitle}>List your car on Xperts</Text>
            <Text style={s.introSub}>Earn by renting out your vehicle. Apply as an individual or a company — Xperts reviews and approves hosts.</Text>
          </View>
          <View style={s.tabRow}>
            <TouchableOpacity style={[s.kindChip, kind === 'individual' && s.kindActive]} onPress={() => setKind('individual')}><Text style={[s.kindTxt, kind === 'individual' && s.kindTxtActive]}>Individual</Text></TouchableOpacity>
            <TouchableOpacity style={[s.kindChip, kind === 'company' && s.kindActive]} onPress={() => setKind('company')}><Text style={[s.kindTxt, kind === 'company' && s.kindTxtActive]}>Company</Text></TouchableOpacity>
          </View>
          <View style={s.card}>
            {kind === 'individual' ? (
              <><Text style={s.label}>Your name</Text><TextInput style={s.input} value={form.owner_name} onChangeText={(t) => setForm((f) => ({ ...f, owner_name: t }))} placeholder="Full name" placeholderTextColor={colors.textMuted} /></>
            ) : (
              <><Text style={s.label}>Company name</Text><TextInput style={s.input} value={form.company_name} onChangeText={(t) => setForm((f) => ({ ...f, company_name: t }))} placeholder="Company name" placeholderTextColor={colors.textMuted} /></>
            )}
            <Text style={s.label}>Phone</Text><TextInput style={s.input} value={form.phone} onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))} placeholder="Phone" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />
            <Text style={s.label}>Parish / area</Text><TextInput style={s.input} value={form.parish} onChangeText={(t) => setForm((f) => ({ ...f, parish: t }))} placeholder="e.g. Kingston" placeholderTextColor={colors.textMuted} />
            <TouchableOpacity style={[s.cta, busy && { opacity: 0.6 }]} onPress={onApply} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaTxt}>Apply to host</Text>}</TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Host pending
  if (access.approval_status !== 'approved') {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {header}
        <View style={s.scroll}><View style={s.introCard}><Text style={s.introIcon}>⏳</Text><Text style={s.introTitle}>Host application under review</Text><Text style={s.introSub}>{`We're reviewing ${access.company_name}. You'll be able to list vehicles and accept bookings once approved.`}</Text></View></View>
      </View>
    );
  }

  // Approved host → dashboard
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {header}
      <View style={s.tabRow}>
        <TouchableOpacity style={[s.tab, tab === 'requests' && s.tabActive]} onPress={() => setTab('requests')}><Text style={[s.tabTxt, tab === 'requests' && s.tabTxtActive]}>Requests</Text></TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'vehicles' && s.tabActive]} onPress={() => setTab('vehicles')}><Text style={[s.tabTxt, tab === 'vehicles' && s.tabTxtActive]}>My Cars</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}>
        {tab === 'requests' ? (
          requests.length === 0 ? <Text style={s.empty}>No booking requests yet.</Text> : requests.map((r) => {
            const pending = r.provider_decision === 'pending';
            const canAck = r.provider_decision === 'approved' && r.payment_status === 'submitted';
            return (
              <View key={r.id} style={s.reqCard}>
                <View style={s.reqTop}>
                  <Text style={s.reqName}>{r.requester_name || 'Renter'}</Text>
                  <Text style={s.reqTotal}>{money(r.estimated_total)}</Text>
                </View>
                <Text style={s.reqMeta}>{fmt(r.requested_start_at)} → {fmt(r.requested_end_at)} · {r.estimated_days ?? 1}d{r.pickup_location ? ` · ${r.pickup_location}` : ''}</Text>
                <Text style={s.reqVerif}>Renter verification: {r.verification_status ?? 'unknown'}</Text>
                {pending ? (
                  <View style={s.actions}>
                    <TouchableOpacity style={s.approve} onPress={() => onDecide(r, 'approve')}><Text style={s.approveTxt}>Approve</Text></TouchableOpacity>
                    <TouchableOpacity style={s.reject} onPress={() => onDecide(r, 'reject')}><Text style={s.rejectTxt}>Reject</Text></TouchableOpacity>
                  </View>
                ) : canAck ? (
                  <TouchableOpacity style={s.approve} onPress={() => onAck(r)}><Text style={s.approveTxt}>Confirm payment received</Text></TouchableOpacity>
                ) : (
                  <Text style={s.reqStatus}>{r.status === 'confirmed' ? 'Confirmed ✓' : r.provider_decision === 'rejected' ? 'Rejected' : r.provider_decision === 'approved' ? 'Approved — awaiting payment' : r.status}</Text>
                )}
              </View>
            );
          })
        ) : (
          <>
            <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('RentalVehicleEditor', { partnerId: access.partner_id })}><Text style={s.addTxt}>＋ Add a vehicle</Text></TouchableOpacity>
            {vehicles.length === 0 ? <Text style={s.empty}>No vehicles yet. Add your first car.</Text> : vehicles.map((v) => (
              <TouchableOpacity key={v.id} style={s.vehCard} onPress={() => navigation.navigate('RentalVehicleEditor', { partnerId: access.partner_id, vehicle: v })}>
                <Text style={s.vehTitle}>{v.make} {v.model}{v.year ? ` · ${v.year}` : ''}</Text>
                <Text style={s.vehMeta}>{money(v.daily_rate)}/day · {v.status}{v.plate_number ? ` · ${v.plate_number}` : ''}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  backBtn: { width: 40, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },
  introCard: { backgroundColor: colors.card, borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  introIcon: { fontSize: 40, marginBottom: 8 },
  introTitle: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  introSub: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.textSecondary, textAlign: 'center' },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  kindChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  kindActive: { backgroundColor: colors.brandSurface, borderColor: colors.brand },
  kindTxt: { fontSize: 13.5, fontWeight: '800', color: colors.textSecondary },
  kindTxtActive: { color: colors.brand },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabTxt: { fontSize: 13.5, fontWeight: '800', color: colors.textSecondary },
  tabTxtActive: { color: '#fff' },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: colors.textPrimary },
  cta: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  ctaTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  empty: { fontSize: 13, color: colors.textMuted, paddingVertical: 20, textAlign: 'center' },
  addBtn: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  addTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
  vehCard: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  vehTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  vehMeta: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },
  reqCard: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  reqTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reqName: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  reqTotal: { fontSize: 15, fontWeight: '900', color: colors.textPrimary },
  reqMeta: { marginTop: 4, fontSize: 12.5, color: colors.textSecondary },
  reqVerif: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  approve: { flex: 1, backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveTxt: { fontSize: 13.5, fontWeight: '800', color: '#fff' },
  reject: { flex: 1, borderWidth: 1, borderColor: colors.danger + '33', backgroundColor: colors.dangerSurface, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  rejectTxt: { fontSize: 13.5, fontWeight: '800', color: colors.danger },
  reqStatus: { marginTop: 10, fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
});
