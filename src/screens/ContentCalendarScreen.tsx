import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  listEntries,
  createEntry,
  markPostedManually,
  deleteEntry,
  setEntryAutoPublish,
  getAutoPublishEnabled,
  setAutoPublishEnabled,
  AUTO_CHANNELS,
  CALENDAR_CHANNELS,
  type CalendarEntry,
} from '@/services/calendarService';
import type { ContentCalendarScreenProps } from '@/types/navigation';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:           { label: 'Draft',     color: colors.textSecondary, bg: colors.borderLight },
  scheduled:       { label: 'Scheduled', color: '#1D4ED8', bg: '#EFF6FF' },
  ready:           { label: 'Ready',     color: '#4338CA', bg: '#EEF2FF' },
  posted_manually: { label: 'Posted',    color: colors.success, bg: colors.successSurface },
  posted_external: { label: 'Published', color: colors.success, bg: colors.successSurface },
  cancelled:       { label: 'Cancelled', color: colors.danger, bg: colors.dangerSurface },
};

// Dependency-free quick schedule options (avoids pulling a date-picker lib).
const SCHEDULE_OPTS: { key: string; label: string; at: () => string | null }[] = [
  { key: 'none', label: 'No date', at: () => null },
  { key: '1h',   label: 'In 1 hour', at: () => new Date(Date.now() + 3600e3).toISOString() },
  { key: 'tom',  label: 'Tomorrow 9am', at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); } },
  { key: 'wk',   label: 'Next week', at: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d.toISOString(); } },
];

function fmt(iso: string | null): string {
  if (!iso) return 'Unscheduled';
  try { return new Date(iso).toLocaleString('en-JM', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return 'Unscheduled'; }
}

export default function ContentCalendarScreen({ navigation }: ContentCalendarScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedBusiness, selectedStoreId } = useBusiness();
  const businessId = selectedBusiness?.id ?? '';

  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState<string>('instagram');
  const [body, setBody] = useState('');
  const [scheduleKey, setScheduleKey] = useState('none');
  const [autoFlag, setAutoFlag] = useState(false);

  const canAutoChannel = useMemo(() => (AUTO_CHANNELS as readonly string[]).includes(channel), [channel]);

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    const [rows, enabled] = await Promise.all([listEntries(businessId), getAutoPublishEnabled(businessId)]);
    setEntries(rows);
    setAutoEnabled(enabled);
    setLoading(false);
  }, [businessId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleToggleAuto(next: boolean) {
    setAutoEnabled(next); // optimistic
    const ok = await setAutoPublishEnabled(businessId, next);
    if (!ok) { setAutoEnabled(!next); Alert.alert('Could not update the setting.'); }
  }

  async function handleCreate() {
    if (!businessId) { Alert.alert('Select a business first.'); return; }
    if (!title.trim()) { Alert.alert('Add a title.'); return; }
    setSaving(true);
    const at = SCHEDULE_OPTS.find((o) => o.key === scheduleKey)?.at() ?? null;
    const res = await createEntry(businessId, {
      title: title.trim(),
      channel,
      content_body: body || null,
      scheduled_for: at,
      storeId: selectedStoreId ?? null,
      autoPublish: autoFlag && canAutoChannel,
    });
    setSaving(false);
    if (res.ok) {
      setTitle(''); setBody(''); setChannel('instagram'); setScheduleKey('none'); setAutoFlag(false);
      load();
    } else {
      Alert.alert(res.limitReached ? 'Limit reached' : 'Could not add', res.reason ?? 'Please try again.');
    }
  }

  function confirmDelete(id: string) {
    Alert.alert('Delete this post?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteEntry(id); load(); } },
    ]);
  }

  async function toggleEntryAuto(entry: CalendarEntry, next: boolean) {
    const ok = await setEntryAutoPublish(entry.id, next);
    if (ok) load(); else Alert.alert('Could not update the post.');
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.rootInner, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Content Calendar</Text>
          <View style={s.backBtn} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        >
          {/* Automated publishing opt-in */}
          <View style={s.card}>
            <View style={s.rowBetween}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.cardTitle}>Automated publishing</Text>
                <Text style={s.cardHint}>
                  When on, posts you flag Auto-publish go out to your connected Facebook/Instagram at their scheduled time. Off by default.
                </Text>
              </View>
              <Switch
                value={autoEnabled}
                onValueChange={handleToggleAuto}
                trackColor={{ true: colors.brand, false: colors.border }}
              />
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Social')} style={s.linkRow} activeOpacity={0.7}>
              <Ionicons name="share-social-outline" size={14} color={colors.brand} />
              <Text style={s.linkText}>Connect an account first</Text>
            </TouchableOpacity>
          </View>

          {/* Plan a post */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>PLAN A POST</Text>
            <TextInput
              style={s.input}
              placeholder="Title (e.g. Weekend jerk special)"
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
            />
            <View style={s.chipRow}>
              {CALENDAR_CHANNELS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[s.chip, channel === c && s.chipActive]}
                  onPress={() => setChannel(c)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipText, channel === c && s.chipTextActive]}>{c.replace(/_/g, ' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.input, s.inputMultiline]}
              placeholder="Caption / content"
              placeholderTextColor={colors.textSecondary}
              value={body}
              onChangeText={setBody}
              multiline
            />
            <Text style={s.miniLabel}>Schedule</Text>
            <View style={s.chipRow}>
              {SCHEDULE_OPTS.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={[s.chip, scheduleKey === o.key && s.chipActive]}
                  onPress={() => setScheduleKey(o.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipText, scheduleKey === o.key && s.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {canAutoChannel && (
              <TouchableOpacity style={s.autoRow} onPress={() => setAutoFlag((v) => !v)} activeOpacity={0.7}>
                <Ionicons
                  name={autoFlag ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={autoFlag ? colors.brand : colors.textSecondary}
                />
                <Text style={s.autoRowText}>
                  Auto-publish at the scheduled time
                  {!autoEnabled && autoFlag ? '  (turn on Automated publishing above)' : ''}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.primaryBtn, saving && s.primaryBtnDisabled]} onPress={handleCreate} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={colors.white} /> : <Text style={s.primaryBtnText}>Add to calendar</Text>}
            </TouchableOpacity>
          </View>

          {/* Entries */}
          {loading ? (
            <View style={s.loading}><ActivityIndicator color={colors.brand} /></View>
          ) : entries.length === 0 ? (
            <Text style={s.empty}>No planned content yet.</Text>
          ) : (
            entries.map((e) => {
              const st = STATUS_META[e.status] ?? STATUS_META.draft;
              const autoFlagged = String((e.metadata as { auto_publish?: unknown } | null)?.auto_publish) === 'true';
              const canAuto = (AUTO_CHANNELS as readonly string[]).includes(e.channel);
              const posted = e.status === 'posted_manually' || e.status === 'posted_external';
              return (
                <View key={e.id} style={s.entry}>
                  <View style={s.entryTop}>
                    <View style={[s.badge, { backgroundColor: st.bg }]}><Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text></View>
                    <View style={[s.badge, { backgroundColor: colors.borderLight }]}><Text style={[s.badgeText, { color: colors.textSecondary }]}>{e.channel.replace(/_/g, ' ')}</Text></View>
                    {autoFlagged && (
                      <View style={[s.badge, { backgroundColor: autoEnabled ? colors.successSurface : colors.warningSurface }]}>
                        <Text style={[s.badgeText, { color: autoEnabled ? colors.success : colors.warning }]}>{autoEnabled ? 'Auto-publish' : 'Auto (paused)'}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.entryTitle}>{e.title}</Text>
                  <Text style={s.entryWhen}>{fmt(e.scheduled_for)}</Text>
                  {e.content_body ? <Text style={s.entryBody} numberOfLines={2}>{e.content_body}</Text> : null}
                  <View style={s.entryActions}>
                    {!posted && (
                      <TouchableOpacity style={s.smallBtnPrimary} onPress={async () => { await markPostedManually(e.id); load(); }} activeOpacity={0.8}>
                        <Text style={s.smallBtnPrimaryText}>Mark posted</Text>
                      </TouchableOpacity>
                    )}
                    {canAuto && !posted && (
                      <TouchableOpacity style={s.smallBtn} onPress={() => toggleEntryAuto(e, !autoFlagged)} activeOpacity={0.8}>
                        <Text style={s.smallBtnText}>{autoFlagged ? 'Turn off auto' : 'Auto-publish this'}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={s.smallBtn} onPress={() => confirmDelete(e.id)} activeOpacity={0.8}>
                      <Text style={[s.smallBtnText, { color: colors.danger }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootInner: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  scroll: { padding: 16 },
  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  cardHint: { marginTop: 3, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  linkText: { fontSize: 12.5, fontWeight: '700', color: colors.brand },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.textSecondary, marginBottom: 10 },
  miniLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 4, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary, marginBottom: 10,
  },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.bg,
  },
  chipActive: { backgroundColor: colors.brandSurface, borderColor: colors.brand },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary, textTransform: 'capitalize' },
  chipTextActive: { color: colors.brand },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  autoRowText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  primaryBtn: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  loading: { paddingVertical: 30, alignItems: 'center' },
  empty: { fontSize: 13, color: colors.textSecondary, paddingVertical: 12 },
  entry: {
    backgroundColor: colors.card, borderRadius: 14, padding: 13, marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight,
  },
  entryTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10.5, fontWeight: '800', textTransform: 'capitalize' },
  entryTitle: { fontSize: 14.5, fontWeight: '800', color: colors.textPrimary },
  entryWhen: { marginTop: 2, fontSize: 11.5, color: colors.textSecondary },
  entryBody: { marginTop: 4, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  entryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  smallBtnPrimary: { backgroundColor: colors.brand, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  smallBtnPrimaryText: { fontSize: 12, fontWeight: '800', color: colors.white },
  smallBtn: {
    borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card,
  },
  smallBtnText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
});
