// ── Corporate Driver Screening — shared constants and utilities ────────────────
// TypeScript port of web/src/lib/corporateDriver.js
// CSS class fields removed (not applicable in React Native).

import type { DriverRow } from '@/types/driver';

// ── Corporate ride types requiring clearance ───────────────────────────────────
export const CORPORATE_RIDE_TYPES = new Set([
  'airport',
  'charter',
  'business',
  'corporate',
  'staff_ride',
  'executive',
  'family_care',
]);

// ── Corporate-specific required documents ─────────────────────────────────────
export const CORPORATE_DOC_TYPES = [
  'corp_police_record',
  'corp_proof_of_address',
  'corp_reference_1',
  'corp_reference_2',
  'corp_vehicle_fitness',
] as const;

export const CORPORATE_DOC_LABELS: Record<string, string> = {
  corp_police_record:    'Police Record Certificate',
  corp_proof_of_address: 'Proof of Address',
  corp_reference_1:      'Reference 1',
  corp_reference_2:      'Reference 2',
  corp_vehicle_fitness:  'Vehicle Fitness Certificate',
};

// Standard onboarding docs that must also be valid for corporate work
export const CORPORATE_REQUIRED_ONBOARDING_DOCS = [
  'drivers_license',
  'insurance',
  'registration',
  'profile_photo',
  'selfie_with_id',
];

// ── Status label maps ─────────────────────────────────────────────────────────

export const CORPORATE_STATUS_META: Record<string, { label: string }> = {
  not_applied: { label: 'Not applied' },
  pending:     { label: 'Screening in review' },
  approved:    { label: 'Corporate approved' },
  rejected:    { label: 'Screening rejected' },
  suspended:   { label: 'Corporate suspended' },
  expired:     { label: 'Clearance expired' },
};

export const POLICE_RECORD_STATUS_META: Record<string, { label: string }> = {
  missing:       { label: 'Not submitted' },
  pending:       { label: 'Pending review' },
  clear:         { label: 'Clear' },
  review_needed: { label: 'Review needed' },
  rejected:      { label: 'Rejected' },
  expired:       { label: 'Expired' },
};

// ── Eligibility result type ───────────────────────────────────────────────────

export type CorporateEligibilityStatus = {
  eligible: boolean;
  status: string;
  label: string;
  adminReason: string;
};

// ── Internal status payload map ───────────────────────────────────────────────

const SAFE_STATUS_MAP: Record<string, { label: string; adminReason: string }> = {
  eligible: {
    label: 'Corporate Approved',
    adminReason: 'Driver is approved, active, corporate approved, and has a clear non-expired police record.',
  },
  not_approved: {
    label: 'Driver not approved',
    adminReason: 'Driver profile is missing or not available for corporate dispatch.',
  },
  normal_driver_not_approved: {
    label: 'Driver account not approved',
    adminReason: 'Driver must be normally approved before corporate dispatch.',
  },
  corporate_not_applied: {
    label: 'Corporate clearance required',
    adminReason: 'Driver has not applied for Corporate Driver screening.',
  },
  corporate_pending: {
    label: 'Corporate screening pending',
    adminReason: 'Corporate Driver screening is still under review.',
  },
  corporate_rejected: {
    label: 'Corporate screening not approved',
    adminReason: 'Corporate Driver screening was not approved.',
  },
  corporate_suspended: {
    label: 'Corporate access suspended',
    adminReason: 'Corporate Driver access is suspended.',
  },
  police_record_missing: {
    label: 'Police record missing',
    adminReason: 'A clear police record with an expiry date is required for corporate dispatch.',
  },
  police_record_expired: {
    label: 'Police record expired',
    adminReason: 'Police record has expired. Corporate access is paused until renewed.',
  },
  police_record_not_clear: {
    label: 'Police record not clear',
    adminReason: 'Police record status is not clear.',
  },
  driver_suspended: {
    label: 'Driver suspended',
    adminReason: 'Driver account is suspended.',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isTrueFlag(value: unknown): boolean {
  return value === true || normalizeValue(value) === 'true';
}

function buildStatus(key: string): CorporateEligibilityStatus {
  const meta = SAFE_STATUS_MAP[key] ?? SAFE_STATUS_MAP.not_approved;
  return { eligible: key === 'eligible', status: key, label: meta.label, adminReason: meta.adminReason };
}

// ── Data accessors ────────────────────────────────────────────────────────────

export function getCorporateData(driver: DriverRow | null): Record<string, unknown> {
  return (driver?.metadata?.corporate as Record<string, unknown> | undefined) ?? {};
}

export function getCorporateStatus(driver: DriverRow | null): string {
  const corp = getCorporateData(driver);
  return normalizeValue(corp.status ?? driver?.corporate_driver_status ?? 'not_applied');
}

function getPoliceRecordExpiry(
  driver: DriverRow | null,
  corp: Record<string, unknown>,
): string | null {
  return (
    (corp.police_record_expiry_date as string | undefined) ??
    (corp.police_record_expiry as string | undefined) ??
    driver?.corporate_police_record_expiry ??
    null
  );
}

function isExpiredDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime())) return true;
  const endOfDay = new Date(expiry);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay < new Date();
}

// ── Corporate eligibility status ──────────────────────────────────────────────

export function getCorporateEligibilityStatus(
  driver: DriverRow | null,
): CorporateEligibilityStatus {
  if (!driver) return buildStatus('not_approved');

  if (normalizeValue(driver.approval_status) !== 'approved') {
    return buildStatus('normal_driver_not_approved');
  }
  if (normalizeValue(driver.enforcement_status) === 'suspended') {
    return buildStatus('driver_suspended');
  }

  const corp = getCorporateData(driver);
  const corporateStatus = getCorporateStatus(driver);

  if (!corporateStatus || corporateStatus === 'not_applied') return buildStatus('corporate_not_applied');
  if (corporateStatus === 'pending')   return buildStatus('corporate_pending');
  if (corporateStatus === 'rejected')  return buildStatus('corporate_rejected');
  if (corporateStatus === 'suspended') return buildStatus('corporate_suspended');
  if (corporateStatus === 'expired')   return buildStatus('police_record_expired');
  if (corporateStatus !== 'approved')  return buildStatus('corporate_not_applied');

  const policeStatus = normalizeValue(String(corp.police_record_status ?? corp.police_status ?? ''));
  if (!policeStatus)                 return buildStatus('police_record_missing');
  if (policeStatus === 'expired')    return buildStatus('police_record_expired');
  if (policeStatus !== 'clear')      return buildStatus('police_record_not_clear');

  const expiry = getPoliceRecordExpiry(driver, corp);
  if (!expiry)               return buildStatus('police_record_missing');
  if (isExpiredDate(expiry)) return buildStatus('police_record_expired');

  return buildStatus('eligible');
}

export function isCorporateEligible(driver: DriverRow | null): boolean {
  return getCorporateEligibilityStatus(driver).eligible;
}

// ── Order sensitivity check ───────────────────────────────────────────────────

type OrderLike = {
  order_type?:   string | null;
  service_type?: string | null;
  metadata?:     Record<string, unknown> | null;
};

export function isCorporateSensitiveOrder(order: OrderLike | null | undefined): boolean {
  if (!order) return false;
  const metadata     = order.metadata ?? {};
  const errandDetails = (metadata.errand_details as Record<string, unknown> | undefined) ?? {};

  if (isTrueFlag(metadata.corporate_sensitive)) return true;
  if (isTrueFlag(metadata.high_trust) || isTrueFlag(metadata.is_high_trust)) return true;

  const orderType   = normalizeValue(order.order_type ?? '');
  const serviceType = normalizeValue(order.service_type ?? '');

  if (orderType   && CORPORATE_RIDE_TYPES.has(orderType))   return true;
  if (serviceType && CORPORATE_RIDE_TYPES.has(serviceType)) return true;

  const rideType = normalizeValue(String(
    metadata.ride_type ?? metadata.rideType ?? metadata.service_type ?? metadata.serviceType ?? '',
  ));
  if (rideType && CORPORATE_RIDE_TYPES.has(rideType)) return true;

  if (serviceType === 'senior_care' || serviceType === 'xperts_care') return true;
  if (isTrueFlag(errandDetails.is_high_trust)) return true;
  if (isTrueFlag(errandDetails.is_sensitive_care_request)) return true;
  if (normalizeValue(String(errandDetails.service_family ?? '')) === 'xperts_care') return true;
  if (normalizeValue(String(errandDetails.errand_subtype ?? '')) === 'senior_care')  return true;

  return false;
}

// ── Expiry warnings ───────────────────────────────────────────────────────────

export function getCorporateExpiryWarnings(driver: DriverRow | null): string[] {
  const corp = getCorporateData(driver);
  const warnings: string[] = [];
  const now = new Date();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const expiryValue = getPoliceRecordExpiry(driver, corp);
  if (expiryValue) {
    const expiry = new Date(expiryValue);
    if (Number.isNaN(expiry.getTime()) || expiry < now) {
      warnings.push('Police record expired');
    } else if (expiry.getTime() - now.getTime() < thirtyDays) {
      warnings.push('Police record expires soon');
      warnings.push('Corporate access will pause after expiry');
    }
  } else if (getCorporateStatus(driver) === 'approved') {
    warnings.push('Police record expiry date missing');
  }

  return warnings;
}
