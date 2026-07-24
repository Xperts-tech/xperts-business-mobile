import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { saveVehicle, uploadVehiclePhoto, addAvailabilityBlock, type HostVehicle } from '@/services/rentalHostService';
import type { RentalVehicleEditorScreenProps } from '@/types/navigation';

const TYPES = ['sedan', 'suv', 'pickup', 'van', 'luxury', 'economy'];

export default function RentalVehicleEditorScreen({ route, navigation }: RentalVehicleEditorScreenProps) {
  const insets = useSafeAreaInsets();
  const { partnerId, vehicle } = route.params;
  const [make, setMake] = useState(vehicle?.make ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [year, setYear] = useState(vehicle?.year ? String(vehicle.year) : '');
  const [plate, setPlate] = useState(vehicle?.plate_number ?? '');
  const [type, setType] = useState(vehicle?.vehicle_type ?? 'sedan');
  const [daily, setDaily] = useState(vehicle?.daily_rate ? String(vehicle.daily_rate) : '');
  const [deposit, setDeposit] = useState(vehicle?.deposit_amount ? String(vehicle.deposit_amount) : '');
  const [photo, setPhoto] = useState<string | null>(vehicle?.main_image_url ?? null);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | undefined>(vehicle?.id);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add a vehicle photo.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!res.canceled && res.assets?.[0]?.uri) setLocalPhoto(res.assets[0].uri);
  }

  async function onSave() {
    if (!make.trim() || !model.trim()) { Alert.alert('Missing', 'Make and model are required.'); return; }
    setSaving(true);
    const patch: Partial<HostVehicle> & { id?: string } = {
      id: vehicleId, make: make.trim(), model: model.trim(),
      year: year ? Number(year) : null, plate_number: plate.trim() || null, vehicle_type: type,
      daily_rate: daily ? Number(daily) : null, deposit_amount: deposit ? Number(deposit) : null,
    };
    const res = await saveVehicle(partnerId, patch);
    if (!res.ok || !res.id) { setSaving(false); Alert.alert('Could not save', res.reason ?? 'Try again.'); return; }
    setVehicleId(res.id);
    if (localPhoto) {
      const up = await uploadVehiclePhoto(res.id, localPhoto);
      if (up.ok && up.url) setPhoto(up.url);
    }
    setSaving(false);
    Alert.alert('Saved', 'Your vehicle is saved and available for booking.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
  }

  async function blockAvailability() {
    if (!vehicleId) { Alert.alert('Save first', 'Save the vehicle before blocking dates.'); return; }
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 86400000);
    const ok = await addAvailabilityBlock(vehicleId, start.toISOString(), end.toISOString(), 'unavailable');
    Alert.alert(ok ? 'Blocked' : 'Failed', ok ? 'The next 2 days are marked unavailable.' : 'Could not block dates.');
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.inner, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{vehicle ? 'Edit Vehicle' : 'Add Vehicle'}</Text>
          <View style={s.backBtn} />
        </View>
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={s.photoBtn} onPress={pickPhoto}>
            {localPhoto || photo ? <Image source={{ uri: localPhoto ?? photo ?? undefined }} style={s.photo} /> : <Text style={s.photoTxt}>＋ Add vehicle photo</Text>}
          </TouchableOpacity>

          <View style={s.card}>
            <Field label="Make" value={make} onChangeText={setMake} placeholder="Toyota" />
            <Field label="Model" value={model} onChangeText={setModel} placeholder="Corolla" />
            <Field label="Year" value={year} onChangeText={setYear} placeholder="2020" keyboardType="number-pad" />
            <Field label="Plate number" value={plate} onChangeText={setPlate} placeholder="ABCD 12" />
            <Text style={s.label}>Type</Text>
            <View style={s.chipRow}>{TYPES.map((t) => <TouchableOpacity key={t} style={[s.chip, type === t && s.chipActive]} onPress={() => setType(t)}><Text style={[s.chipTxt, type === t && s.chipTxtActive]}>{t}</Text></TouchableOpacity>)}</View>
            <Field label="Daily rate (J$)" value={daily} onChangeText={setDaily} placeholder="8000" keyboardType="number-pad" />
            <Field label="Deposit (J$)" value={deposit} onChangeText={setDeposit} placeholder="20000" keyboardType="number-pad" />
          </View>

          <TouchableOpacity style={[s.cta, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaTxt}>Save vehicle</Text>}</TouchableOpacity>
          <TouchableOpacity style={s.block} onPress={blockAvailability}><Text style={s.blockTxt}>Block next 2 days (unavailable)</Text></TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (<><Text style={s.label}>{label}</Text><TextInput style={s.input} placeholderTextColor={colors.textMuted} {...props} /></>);
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  backBtn: { width: 40, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  scroll: { padding: 16 },
  photoBtn: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, minHeight: 150, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 14 },
  photo: { width: '100%', height: 180 },
  photoTxt: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: colors.textPrimary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: colors.brandSurface, borderColor: colors.brand },
  chipTxt: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary, textTransform: 'capitalize' },
  chipTxtActive: { color: colors.brand },
  cta: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  ctaTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  block: { marginTop: 10, alignItems: 'center', paddingVertical: 10 },
  blockTxt: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textDecorationLine: 'underline' },
});
