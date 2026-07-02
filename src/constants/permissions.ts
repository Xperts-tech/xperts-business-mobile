import type { PermissionKey, StaffRole } from '@/types/permissions';

export { type StaffRole, type PermissionKey };

export const BUSINESS_ROLE_LABELS: Record<StaffRole, string> = {
  owner:           'Owner',
  manager:         'Manager',
  cashier:         'Cashier',
  kitchen_staff:   'Kitchen Staff',
  inventory_staff: 'Inventory Staff',
  finance_viewer:  'Finance Viewer',
};

export const BUSINESS_ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  owner:
    'Full access. Can invite, suspend, and manage all staff.',
  manager:
    'Day-to-day operations — orders, catalog, specials, Upload Studio. Cannot change payout details.',
  cashier:
    'Can view and accept/reject orders. Cannot edit catalog or manage staff.',
  kitchen_staff:
    'View orders and mark preparing/ready. Can flag item availability.',
  inventory_staff:
    'Manage catalog, products, and Upload Studio. Cannot reject orders or view payouts.',
  finance_viewer:
    'Read-only access to payouts and order summaries. No write access.',
};

export const ROLE_PERMISSIONS: Record<StaffRole, PermissionKey[]> = {
  owner: [
    'orders.view', 'orders.accept', 'orders.reject', 'orders.mark_ready', 'orders.item_review',
    'catalog.view', 'catalog.manage', 'catalog.sold_out',
    'upload_studio.view', 'upload_studio.manage',
    'specials.view', 'specials.manage',
    'payouts.view',
    'staff.view', 'staff.manage',
    'messages.view', 'messages.reply',
    'settings.view', 'settings.manage',
    'analytics.view',
  ],
  manager: [
    'orders.view', 'orders.accept', 'orders.reject', 'orders.mark_ready', 'orders.item_review',
    'catalog.view', 'catalog.manage', 'catalog.sold_out',
    'upload_studio.view', 'upload_studio.manage',
    'specials.view', 'specials.manage',
    'payouts.view',
    'staff.view',
    'messages.view', 'messages.reply',
    'settings.view',
    'analytics.view',
  ],
  cashier: [
    'orders.view', 'orders.accept', 'orders.reject', 'orders.mark_ready',
    'messages.view', 'messages.reply',
    'settings.view',
  ],
  kitchen_staff: [
    'orders.view', 'orders.mark_ready', 'orders.item_review',
    'messages.view',
    'settings.view',
  ],
  inventory_staff: [
    'orders.view',
    'catalog.view', 'catalog.manage', 'catalog.sold_out',
    'upload_studio.view', 'upload_studio.manage',
    'specials.view', 'specials.manage',
    'settings.view',
  ],
  finance_viewer: [
    'payouts.view',
    'orders.view',
    'analytics.view',
    'settings.view',
  ],
};

export function getBusinessRoleLabel(role: StaffRole): string {
  return BUSINESS_ROLE_LABELS[role] ?? role;
}

export function getBusinessRoleDescription(role: StaffRole): string {
  return BUSINESS_ROLE_DESCRIPTIONS[role] ?? '';
}

export function getBusinessRolePermissions(role: StaffRole): PermissionKey[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasBusinessPermission(role: StaffRole, permission: PermissionKey): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
