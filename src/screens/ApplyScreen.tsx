import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  registerDriverApplicant,
  type ApplicationFormData,
} from '@/services/driverApplicationService';
import type { ApplyScreenProps } from '@/types/navigation';

const VEHICLE_TYPES = [
  'Car',
  'Motorcycle',
  'Van / Minivan',
  'Pickup Truck',
  'Bicycle / Scooter',
  'On Foot',
] as const;

type Step = 1 | 2 | 3;

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  serviceArea: string;
  vehicleType: string;
  vehiclePlate: string;
  canDeliverFood: boolean;
  canDoErrands: boolean;
  canDoCourier: boolean;
};

const INITIAL_FORM: FormState = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  serviceArea: '',
  vehicleType: '',
  vehiclePlate: '',
  canDeliverFood: false,
  canDoErrands: false,
  canDoCourier: false,
};

export default function ApplyScreen({ navigation }: ApplyScreenProps) {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const plateRef = useRef<TextInput>(null);

  function set(field: keyof FormState, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
    if (error) setError(null);
  }

  // ── Step validation ───────────────────────────────────────────────────────

  function validateStep1(): string | null {
    if (!form.fullName.trim()) return 'Please enter your full name.';
    if (!form.email.trim()) return 'Please enter your email address.';
    if (!/\S+@\S+\.\S+/.test(form.email)) return 'Please enter a valid email address.';
    if (!form.phone.trim()) return 'Please enter your phone number.';
    if (!form.password) return 'Please enter a password.';
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    return null;
  }

  function validateStep2(): string | null {
    if (!form.serviceArea.trim()) return 'Please enter your parish or service area.';
    if (!form.vehicleType) return 'Please select your vehicle type.';
    return null;
  }

  function validateStep3(): string | null {
    if (!form.canDeliverFood && !form.canDoErrands && !form.canDoCourier) {
      return 'Please select at least one service you can provide.';
    }
    return null;
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function handleNext() {
    const err = step === 1 ? validateStep1() : validateStep2();
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => (s + 1) as Step);
  }

  function handleBack() {
    setError(null);
    if (step === 1) {
      navigation.goBack();
    } else {
      setStep((s) => (s - 1) as Step);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const err = validateStep3();
    if (err) { setError(err); return; }

    setError(null);
    setLoading(true);

    const payload: ApplicationFormData = {
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      password: form.password,
      serviceArea: form.serviceArea.trim(),
      vehicleType: form.vehicleType,
      vehiclePlate: form.vehiclePlate.trim(),
      canDeliverFood: form.canDeliverFood,
      canDoErrands: form.canDoErrands,
      canDoCourier: form.canDoCourier,
    };

    const result = await registerDriverApplicant(payload);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (result.needsEmailConfirmation) {
      setNeedsEmailConfirmation(true);
      setSubmitted(true);
      setLoading(false);
      return;
    }

    // Session is live — sign in to populate AuthContext profile + driverRow.
    // This triggers RootNavigator to route to ApplicationStatusScreen automatically.
    const { error: signInErr } = await signIn(payload.email, payload.password);
    if (signInErr) {
      // Registration succeeded but auto-sign-in failed. Show success anyway.
      setSubmitted(true);
      setLoading(false);
      return;
    }

    // signIn sets session → RootNavigator rerenders → navigates to ApplicationStatus.
    // No explicit navigation needed.
    setLoading(false);
  }

  // ── Submitted state ───────────────────────────────────────────────────────

  if (submitted) {
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        <View style={st.successCard}>
          <View style={st.successIcon}>
            <Text style={st.successIconText}>✓</Text>
          </View>
          <Text style={st.successTitle}>Application Submitted!</Text>
          {needsEmailConfirmation ? (
            <>
              <Text style={st.successBody}>
                Please check your email and confirm your account. Once confirmed, come
                back and sign in — we'll contact you once your application is reviewed.
              </Text>
              <TouchableOpacity
                style={st.successBtn}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.85}
              >
                <Text style={st.successBtnText}>Back to Sign In</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={st.successBody}>
              Your application has been received. Our team will review it and contact
              you within a few business days. You can check your application status by
              signing in at any time.
            </Text>
          )}
        </View>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={st.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={st.backBtn} onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={st.backBtnText}>‹ {step === 1 ? 'Back' : step === 2 ? 'Account' : 'Vehicle'}</Text>
        </TouchableOpacity>
        <View style={st.stepDots}>
          {([1, 2, 3] as Step[]).map((s) => (
            <View key={s} style={[st.dot, step >= s && st.dotActive]} />
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={st.stepLabel}>Step {step} of 3</Text>
        <Text style={st.stepTitle}>{STEP_TITLES[step]}</Text>

        {/* Error banner */}
        {error ? (
          <View style={st.errorBanner}>
            <Text style={st.errorIcon}>⚠</Text>
            <Text style={st.errorText}>{error}</Text>
          </View>
        ) : null}

        {step === 1 && <Step1 form={form} set={set}
          emailRef={emailRef} phoneRef={phoneRef}
          passwordRef={passwordRef} confirmRef={confirmRef} />}
        {step === 2 && <Step2 form={form} set={set} plateRef={plateRef} />}
        {step === 3 && <Step3 form={form} set={set} />}

        {/* Action button */}
        {step < 3 ? (
          <TouchableOpacity style={st.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={st.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[st.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={st.submitBtnText}>Submit Application</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Step sub-components ───────────────────────────────────────────────────────

const STEP_TITLES: Record<Step, string> = {
  1: 'Create your account',
  2: 'Location & vehicle',
  3: 'Services you offer',
};

type SetFn = (field: keyof FormState, value: string | boolean) => void;

function Step1({
  form, set, emailRef, phoneRef, passwordRef, confirmRef,
}: {
  form: FormState;
  set: SetFn;
  emailRef: React.RefObject<TextInput | null>;
  phoneRef: React.RefObject<TextInput | null>;
  passwordRef: React.RefObject<TextInput | null>;
  confirmRef: React.RefObject<TextInput | null>;
}) {
  return (
    <>
      <Field label="Full Name *">
        <TextInput
          style={st.input}
          placeholder="Your legal full name"
          placeholderTextColor={colors.textMuted}
          value={form.fullName}
          onChangeText={(v) => set('fullName', v)}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
      </Field>
      <Field label="Email Address *">
        <TextInput
          ref={emailRef}
          style={st.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          value={form.email}
          onChangeText={(v) => set('email', v)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()}
        />
      </Field>
      <Field label="Phone Number *">
        <TextInput
          ref={phoneRef}
          style={st.input}
          placeholder="+1 (876) 000-0000"
          placeholderTextColor={colors.textMuted}
          value={form.phone}
          onChangeText={(v) => set('phone', v)}
          keyboardType="phone-pad"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
      </Field>
      <Field label="Password *" hint="Minimum 6 characters">
        <TextInput
          ref={passwordRef}
          style={st.input}
          placeholder="Create a password"
          placeholderTextColor={colors.textMuted}
          value={form.password}
          onChangeText={(v) => set('password', v)}
          secureTextEntry
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
      </Field>
      <Field label="Confirm Password *">
        <TextInput
          ref={confirmRef}
          style={st.input}
          placeholder="Re-enter your password"
          placeholderTextColor={colors.textMuted}
          value={form.confirmPassword}
          onChangeText={(v) => set('confirmPassword', v)}
          secureTextEntry
          returnKeyType="done"
        />
      </Field>
    </>
  );
}

function Step2({
  form, set, plateRef,
}: {
  form: FormState;
  set: SetFn;
  plateRef: React.RefObject<TextInput | null>;
}) {
  return (
    <>
      <Field label="Parish / Service Area *" hint="e.g. Kingston, St. Catherine, Manchester">
        <TextInput
          style={st.input}
          placeholder="Where will you be delivering?"
          placeholderTextColor={colors.textMuted}
          value={form.serviceArea}
          onChangeText={(v) => set('serviceArea', v)}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => plateRef.current?.focus()}
        />
      </Field>

      <Field label="Vehicle Type *">
        <View style={st.chipRow}>
          {VEHICLE_TYPES.map((vt) => (
            <TouchableOpacity
              key={vt}
              style={[st.chip, form.vehicleType === vt && st.chipSelected]}
              onPress={() => set('vehicleType', vt)}
              activeOpacity={0.75}
            >
              <Text style={[st.chipText, form.vehicleType === vt && st.chipTextSelected]}>
                {vt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>

      <Field label="License Plate" hint="Optional — you can add this later">
        <TextInput
          ref={plateRef}
          style={st.input}
          placeholder="e.g. AB 1234"
          placeholderTextColor={colors.textMuted}
          value={form.vehiclePlate}
          onChangeText={(v) => set('vehiclePlate', v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
        />
      </Field>
    </>
  );
}

function Step3({ form, set }: { form: FormState; set: SetFn }) {
  return (
    <>
      <Text style={st.servicesNote}>
        Select the services you are able to provide. At least one is required.
        Your capabilities will be confirmed by Xperts during approval.
      </Text>

      <ServiceToggle
        label="Food & Grocery Delivery"
        description="Deliver orders from restaurants and grocery stores."
        value={form.canDeliverFood}
        onToggle={(v) => set('canDeliverFood', v)}
      />
      <ServiceToggle
        label="Errands"
        description="Complete errand runs and pickups for customers."
        value={form.canDoErrands}
        onToggle={(v) => set('canDoErrands', v)}
      />
      <ServiceToggle
        label="Courier / Packages"
        description="Transport packages and documents across the city."
        value={form.canDoCourier}
        onToggle={(v) => set('canDoCourier', v)}
      />

      <View style={st.ridesFuture}>
        <Text style={st.ridesFutureLabel}>Rides</Text>
        <Text style={st.ridesFutureSub}>
          Coming soon — ride services are not yet available for new driver sign-ups.
        </Text>
      </View>
    </>
  );
}

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={st.fieldWrap}>
      <Text style={st.fieldLabel}>{label}</Text>
      {hint ? <Text style={st.fieldHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function ServiceToggle({
  label, description, value, onToggle,
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <TouchableOpacity
      style={[st.toggleRow, value && st.toggleRowActive]}
      onPress={() => onToggle(!value)}
      activeOpacity={0.8}
    >
      <View style={st.toggleText}>
        <Text style={[st.toggleLabel, value && st.toggleLabelActive]}>{label}</Text>
        <Text style={st.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.brand }}
        thumbColor="#fff"
      />
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.brand,
  },
  backBtn: {
    paddingVertical: 4,
  },
  backBtnText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  stepDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  dotActive: {
    backgroundColor: '#fff',
  },

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 22,
  },

  // ── Error ──────────────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  errorIcon: {
    fontSize: 14,
    color: colors.danger,
    marginTop: 1,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },

  // ── Fields ─────────────────────────────────────────────────────────────────
  fieldWrap: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
  },

  // ── Vehicle type chips ──────────────────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: '#fff',
  },

  // ── Services ───────────────────────────────────────────────────────────────
  servicesNote: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 12,
  },
  toggleRowActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSurface,
  },
  toggleText: {
    flex: 1,
    gap: 3,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  toggleLabelActive: {
    color: colors.brand,
  },
  toggleDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  ridesFuture: {
    backgroundColor: '#F8F9FB',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  ridesFutureLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 2,
  },
  ridesFutureSub: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },

  // ── Buttons ────────────────────────────────────────────────────────────────
  nextBtn: {
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  submitBtn: {
    backgroundColor: colors.success,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ── Success state ──────────────────────────────────────────────────────────
  successCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
    gap: 16,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.successSurface,
    borderWidth: 2,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successIconText: {
    fontSize: 30,
    color: colors.success,
    fontWeight: '900',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  successBody: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  successBtn: {
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  successBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
