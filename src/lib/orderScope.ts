// Builds a PostgREST `.or()` filter that scopes orders to a business OR one of
// its stores — matching the web canonical (businessService.listMyBusinessOrders
// uses `business_id.eq.X` OR `store_id.eq.Y`). Orders may be tagged with either,
// so filtering on store_id alone can miss business-tagged orders.

export interface OrderScope {
  businessId?: string | null;
  storeId?: string | null;
}

export function buildOrderScopeOr(scope: OrderScope): string | null {
  const parts: string[] = [];
  if (scope.businessId) parts.push(`business_id.eq.${scope.businessId}`);
  if (scope.storeId) parts.push(`store_id.eq.${scope.storeId}`);
  return parts.length ? parts.join(',') : null;
}
