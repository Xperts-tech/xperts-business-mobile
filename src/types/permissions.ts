export type StaffRole =
  | 'owner'
  | 'manager'
  | 'cashier'
  | 'kitchen_staff'
  | 'inventory_staff'
  | 'finance_viewer';

export type PermissionKey =
  | 'orders.view'
  | 'orders.accept'
  | 'orders.reject'
  | 'orders.mark_ready'
  | 'orders.item_review'
  | 'catalog.view'
  | 'catalog.manage'
  | 'catalog.sold_out'
  | 'upload_studio.view'
  | 'upload_studio.manage'
  | 'specials.view'
  | 'specials.manage'
  | 'payouts.view'
  | 'staff.view'
  | 'staff.manage'
  | 'messages.view'
  | 'messages.reply'
  | 'settings.view'
  | 'settings.manage'
  | 'analytics.view';
