# Xperts Business App — Deep Audit, Gap Analysis & Phased Plan
_Audit date: 2026-07-16 · Auditor: Claude · Scope: `xperts-business-mobile` (Expo/RN) + shared Supabase backend (`pliritynyqvxhcchgnke`) + `xperts-dispatch-system` web portal for cross-reference._

Evidence labels: **[Verified]** = confirmed against live DB / deployed edge functions / source. **[Code]** = inferred from reading source. **[Runtime]** = needs device/runtime test. **[Decision]** = product decision required.

---

## 1. Source state

- **App audited:** `/Users/user/Desktop/xperts-business-mobile` — Expo SDK 56 / RN 0.85.3 / TS 6 / React Navigation v7 / supabase-js v2. EAS project `3d28abfc-…`, bundle `com.xpertsxpress.business`, owner `xpertssmarttech`. **[Verified]**
- **Reality vs memory:** Memory said "Batch 1 (foundation) complete." **That is badly out of date.** The app now has **40 screens, 13 services, full navigation (27 stack + 5 tabs), push hook, upload studio, analytics, growth/creative studio, coins, shop, support, professional services.** **[Verified]**
- **TypeScript:** `tsc --noEmit` → **0 errors.** **[Verified]**
- **Backend:** All tables the app references **exist** and **all have RLS enabled with correctly-scoped policies**; all edge functions the app calls are **deployed and ACTIVE**. **[Verified]**
- **Web portal** (`xperts-dispatch-system/frontend`) is the mature sibling: `businessService.js` (1729 ln) already solved the hard problems (order-status mapping, accessible-business scoping). The mobile app diverged from it in a few important places. **[Verified]**

---

## 2. Executive summary

**The foundation is strong and much further along than expected.** This is not a scaffold — it is a near-complete merchant app with real backend wiring across orders, catalogue, specials, staff, finance, messaging, support, professional services, shop and coins. Navigation is clean, permission-gated, and TypeScript is clean. The backend it depends on is production-grade and secured.

**It is _not_ launch-ready, for three specific, fixable reasons — all in the core order loop:**

1. **P0 — Two of the four core order actions violate the DB check constraint and will fail.** The app writes `status='preparing'` and `status='ready'`, but `orders_status_check` only permits `pending, accepted, assigned, in_progress, picked_up, on_the_way, delivered, completed, cancelled, rejected`. "Start Preparing" and "Mark Ready" throw a `23514` and do nothing. **[Verified]**
2. **P0 — The app never writes `orders.merchant_status`**, which is the column the _rest of the platform_ (web dashboard, admin, customer notifications) reads for the merchant stage. So even actions that succeed (Accept/Reject) desync the merchant view from Customer/Admin. **[Verified]**
3. **P0 — There is no live new-order alerting.** No realtime subscriptions anywhere in the app, and although `business_push_tokens` is populated and a `send-business-push` function is deployed, **nothing in the order lifecycle ever invokes it.** A merchant with the app backgrounded is never told an order arrived. **[Verified]**

Everything else is P1 polish, two isolated broken-insert bugs (Promo/Creative studios), and growth/finance depth. **None of the "big" features need rebuilding.** The fixes are wiring and alignment, not reconstruction.

**Biggest gaps:** live order alerting (realtime + push); order-status model alignment with the web canonical mapping; a couple of hand-rolled inserts that bypass the working service layer.

**Do not rebuild:** the order/product/message/payout/specials/staff/shop/coins/services service layer, navigation, auth/business context, upload studio, or any edge function. They are correct and reused from proven web patterns.

---

## 3. What already exists (verified inventory)

### Navigation & shell **[Verified]**
- `RootNavigator` → auth gate → `AuthNavigator` | `BusinessNavigator` | `AccessDeniedScreen`.
- `BusinessTabs`: Home / Orders / Products / Messages / More — **Orders/Products/Messages tabs are permission-gated** (`orders.view`, `catalog.view`, `messages.view`) and hidden for staff without rights. **[Verified — server-side RLS also enforces, see §11]**
- `BusinessNavigator` stack: 27 screens incl. OrderDetail, ProductDetail, Specials, Staff, StoreProfile, LaunchChecklist, Payouts, UploadStudio, Services portal (+New/+Detail), Coins, Shop (+OrderDetail), Support (+CaseDetail), Notifications, Analytics, GrowthStudio (aliased as GrowthEngine), CreativeStudio, PromoRequests, StoreQRCode, BusinessSelector.

### Services (backend integration) — all real, all hit live tables/functions **[Verified]**
| Service | Tables / functions | Status |
|---|---|---|
| `orderService` | `orders`, `order_items`, `profiles`, `order_message_threads`, `order-notify`, `business-flag-order-item` | Real; **status-write bug (§10)** |
| `businessDashboardService` | `orders`, `products`, `order_message_threads` | Real; reads `status` not `merchant_status` (§10) |
| `productService` | `products` | Real; sold-out toggle + quick edit work |
| `businessStoreService` | `stores.metadata` (open/paused, business_hours) | Real; matches web metadata contract |
| `specialsService` | `menu_specials` | Real |
| `messageService` | `order_messages`, `order_message_threads`, `business-send-order-message` | Real |
| `staffService` | `business_staff` | Real (read); mutations via edge fns (§14) |
| `payoutService` | `order_finance_settlements` | Real (read-only, correct) |
| `businessServicesService` | `business_service_requests`, `…_messages` | Real; **correct column contract** (`submitted_by`) |
| `coinsService` | `business_coins`, `business_coin_ledger` | Real; wallet not yet funded (coming-soon UI) |
| `shopService` | `xperts_shop_products`, `xperts_shop_orders` | Real |
| `notificationService` | `notifications`, `business_push_tokens` | Real (inbox); **push send unwired (§22)** |
| `uploadStudioService` | `menu-extract`, storage `product-images`, `products` | Real; AI menu-extract wired |

### Edge functions the app depends on — **all deployed & ACTIVE [Verified]**
`order-notify`, `business-flag-order-item`, `business-send-order-message`, `menu-extract`, `business-invite-staff`, `business-manage-staff`, `business-accept-staff-invite`, `create-item-resolution-request`, `resolve-item-resolution-request`, `upload-studio-quality-scan`, `upload-studio-description-cleanup`, `upload-studio-bg-remove`, `send-business-push` (deployed but uncalled), `business-owner-invite`.

### Screen-level feature reality **[Code + Verified]**
- **Analytics** — real: aggregates `orders` + `order_items` inline. Not fabricated.
- **GrowthStudio** — partial: reads `business_coins`, shows recommendations + a "Pro (Coming soon)" tier.
- **CreativeStudio** — request-to-Xperts model; **save-draft insert is broken (§17)**.
- **PromoRequests** — request model; **insert is broken (§16 bug)**.
- **Coins** — real read; shows "Coins launching soon" when no wallet row.
- **LaunchChecklist** — real: products + business_hours readiness.
- **StoreQRCode** — client-side render from store data. **[Runtime — confirm QR actually renders]**

---

## 4. What should NOT be rebuilt

1. **Service layer** — 13 services already encode the correct table/column/edge-fn contracts (except the 3 order/insert bugs below, which are _edits_, not rebuilds).
2. **Navigation, Auth/Business contexts, permission model** — clean, gated, TS-clean.
3. **All edge functions** — deployed, versioned, shared with web/customer/Pro. Reuse.
4. **RLS** — enabled and correctly scoped on every business table. Do not touch except the one legacy-policy cleanup already tracked in memory.
5. **Upload Studio / menu-extract AI** — the AI catalogue core; keep and extend.
6. **Web `businessService.js`** — it is the _canonical reference_ the mobile order code should converge to, not replace.

---

## 5. Current app architecture (how it connects)

```
Business Mobile ──(supabase-js, user JWT)──► Supabase (pliritynyqvxhcchgnke)
   orders/status writes ─────────────────► orders  ◄── web admin, dispatch-worker, customer app read here
   business-send-order-message (edge) ────► order_messages ──► order-notify ──► customer WhatsApp
   business-flag-order-item (edge) ───────► item issues ──► notify-item-unavailable ──► customer
   menu-extract (edge, Claude) ───────────► products (catalogue)
   business_service_requests ─────────────► Admin (Growth/Creative/Support queues)
   order_finance_settlements (read) ◄────── Admin finance (write-protected)
   business_push_tokens ──► send-business-push (DEPLOYED, NEVER CALLED)  ✗ broken link
   (no realtime channels)  ✗ missing link
```

- **Customer App sync:** customer reads `orders.status` + `merchant_status`; receives WhatsApp/push via `order-notify` / `order-status-notifier`. Business writes must feed these correctly (§7).
- **Pro App sync:** Pro writes driver stages into `orders.status` (`assigned`→`picked_up`→`on_the_way`→`delivered`) + `metadata.driver_stage`. Business must _read_ these to show pickup/driver state (it maps labels but the extended statuses never actually appear because the constraint forbids them — see §8). **[Verified]**
- **Admin sync:** service requests, staff, finance settlements, store approval all shared. Business correctly cannot self-approve or mark payouts paid (§11).

---

## 6. Feature-by-feature inventory

| Feature | Status | Files | Tables/Fns | Recommendation | Priority |
|---|---|---|---|---|---|
| Auth / business gating | Fully implemented | AuthContext, BusinessContext, RootNavigator | profiles, businesses, business_staff | Keep | — |
| Multi-business select | Fully implemented | BusinessSelectorScreen, BusinessContext | businesses | Keep | — |
| Home dashboard | Implemented, **stale (no realtime)** | HomeScreen, businessDashboardService | orders, products | Add realtime + read merchant_status | P0 |
| Orders list/filter | Implemented, **filters on wrong column** | OrdersScreen, orderService | orders | Filter on merchant_status/effective stage | P0 |
| Order detail | Implemented | OrderDetailScreen | orders, order_items, profiles | Keep; wire status fixes | P0 |
| Accept / Reject order | Implemented, **partial (no merchant_status/timeline)** | orderService.applyOrderAction | orders, order-notify | Port web `updateBusinessOrderStatus` | P0 |
| Start Preparing / Mark Ready | **Broken (constraint violation)** | orderService, types/orders | orders | Map to merchant_status + safe status | **P0** |
| Item issue resolve | Fully implemented | orderService.resolveItemIssue | business-flag-order-item | Keep | — |
| Order messaging | Fully implemented | messageService, MessageThreadScreen | order_messages, business-send-order-message | Add realtime to thread | P1 |
| Products list / sold-out / quick edit | Fully implemented | productService, ProductsScreen | products | Keep | — |
| Upload Studio (AI) | Fully implemented | uploadStudioService | menu-extract, storage, products | Keep/extend | P2 |
| Daily Specials | Fully implemented | specialsService, SpecialsScreen | menu_specials | Keep | — |
| Store profile / hours / open-pause | Fully implemented | businessStoreService, StoreProfileScreen | stores.metadata | Keep | — |
| Launch checklist / readiness | Fully implemented | LaunchChecklistScreen | products, stores | Keep | — |
| Staff & permissions | Implemented | staffService, StaffScreen | business_staff, business-*-staff fns | Verify mutation coverage | P1 |
| Payouts / finance | Implemented (read-only) | payoutService, PayoutsScreen | order_finance_settlements | Add fee/statement clarity | P1/P2 |
| Coins wallet | Implemented, **not funded** | coinsService, CoinsScreen | business_coins(_ledger) | Product decision on economy | P2/Decision |
| Xperts Shop | Implemented | shopService, ShopScreen | xperts_shop_products/orders | Keep | P2 |
| Service/Support requests | Implemented (correct) | businessServicesService, Services/Support screens | business_service_requests(_messages) | Keep | — |
| Creative Studio (save) | **Broken insert** | CreativeStudioScreen | business_service_requests | Route via submitServiceRequest() | P1 |
| Promo Requests (submit) | **Broken insert** | PromoRequestsScreen | business_service_requests | Route via submitServiceRequest() | P1 |
| Growth Studio | Partial (recommendations + coming-soon tier) | GrowthStudioScreen | business_coins | Feed real store data | P2 |
| Analytics | Implemented (real) | AnalyticsScreen | orders, order_items | Add repeat/conversion later | P2 |
| Notifications inbox | Implemented | notificationService, NotificationsScreen | notifications | Keep | — |
| Push notifications | **Registered but never sent** | usePushNotifications, send-business-push | business_push_tokens | Wire order events → push | P0/P1 |
| Store QR code | Implemented (client render) | StoreQRCodeScreen | stores | Runtime-verify | P2 |
| Professional Services portal | Implemented | businessServicesService, Services* | business_service_requests | Product decision on vendor mode (§23) | P2/Decision |

---

## 7. Customer App synchronization findings

- **[Verified]** Customer notifications for merchant actions are keyed on the web's `MERCHANT_NOTIFY_EVENT` names: `store_accepted`, `store_preparing`, `ready_for_pickup`, `rejected_by_store`. The mobile app fires **different event names** (`order_accepted`, `order_ready`, …) via its own `NOTIFY_EVENT` map, keyed on statuses that partly don't exist. Result: customer WhatsApp/push for "preparing"/"ready" from a mobile merchant is **wrong or never sent**.
- **Fix:** converge on the web event vocabulary (adopt `updateBusinessOrderStatus`).

## 8. Pro App synchronization findings

- **[Verified]** Pro app advances `orders.status` through `assigned → picked_up → on_the_way → delivered`. Business app's label map handles these for _display_, which is correct and needs no change.
- **[Verified]** The business app's richer intermediate statuses (`accepted_by_driver`, `en_route_to_pickup`, `arrived_at_pickup`, `en_route_to_dropoff`) are **not in the DB constraint** and never occur; those label branches are dead but harmless. Driver micro-stage lives in `metadata.driver_stage`. No action required beyond awareness.

## 9. Admin synchronization findings

- **[Verified]** `business_service_requests` is the shared Growth/Creative/Support queue Admin already consumes (`assigned_to`, `admin_notes`, `quote_amount`, `linked_growth_request_id`). The mobile Services/Support screens use the correct contract; **Promo/Creative screens bypass it with wrong columns (§16/§17).**
- **[Verified]** Finance: `order_finance_settlements` is read-only to business (admin-guarded writes). Correct — do not add self-serve "mark paid."
- Store approval remains admin-only (V26 trigger). Business `LaunchChecklist` correctly only _requests_ review.

---

## 10. Core order-management audit (the P0 cluster)

**Canonical web pattern (`businessService.js` L499–587) — the target:**
- `merchant_status` column holds the business stage (`accepted_by_store`, `preparing`, `ready_for_pickup`, `rejected_by_store`).
- Mapped to a constraint-safe `status` via `MERCHANT_TO_ORDER_STATUS` (all preparing/ready → `accepted`; rejected → `rejected`).
- Inserts `order_timeline_events` (audit + customer timeline).
- Fires `order-notify` with the correct `MERCHANT_NOTIFY_EVENT`.

**Mobile deviations [Verified]:**
1. Writes `status` directly to `preparing`/`ready` → **`23514` constraint violation** → action fails.
2. Never writes `merchant_status` → desyncs web/admin/customer.
3. No `order_timeline_events` insert → no audit/customer timeline entry.
4. Wrong notify event names → wrong/absent customer messaging.
5. Dashboard/list filter on `status` only → can't distinguish accepted/preparing/ready; needs-action counts wrong.
6. No realtime → merchant doesn't see new orders live.

**Recommended shared status model:** adopt the web mapping verbatim. Best: extract `updateBusinessOrderStatus` into a shared edge function (`business-update-order-status`) so mobile + web + admin share one write path and one notify path. Minimum viable: port the mapping into `orderService.applyOrderAction`.

---

## 11. Security findings **[Verified]**

- **RLS enabled on every business table.** Policy counts: businesses 9, orders 15, products 8, stores 6, menu_specials 4, business_service_requests 5, order_messages 3, business_coins 2, order_finance_settlements 3, xperts_shop_orders 3, business_staff 3, business_push_tokens 3.
- **Correct owner+staff scoping** (spot-checked): `business_coins` SELECT = `businesses.owner_id = auth.uid()`; `order_messages` SELECT = owner OR active `business_staff` OR admin. **No cross-business leakage found.**
- **Finance write-protection intact:** business has no write path to `order_finance_settlements` (admin-guarded). Coins are admin-granted (owner SELECT only). Correct.
- **Store approval protected:** V26 trigger blocks self-approval; mobile only requests review.
- **Staff mutations go through edge functions** (`business-invite-staff`, `-manage-staff`, `-accept-staff-invite`) — server-side authority, not client gating. Good.
- **Known housekeeping (from memory, not a vuln):** `businesses` has 5 legacy duplicate policies to drop in a future cleanup migration. Non-recursive, safe.
- **Tab gating is UX-only but backed by RLS** — hiding Orders/Products/Messages tabs for staff is cosmetic; the DB enforces the real boundary. Acceptable.

No P0 security issues. This is a genuinely well-secured backend.

---

## 12. Recommended information architecture

Current 5-tab + deep stack is sound. **Keep it.** Minimal reorg only:
- **Home** — add live order strip (realtime), read `merchant_status` for accurate "needs action."
- **Orders** — filter on effective stage (merchant_status ?? status).
- **Products** — as-is.
- **Messages** — as-is (add realtime to thread).
- **More** — already the hub for Store, Staff, Finance/Payouts, Growth, Creative, Promo, Coins, Shop, Support, Analytics, Notifications, QR. Consider grouping under headers (Store · Finance · Growth · Support) for scan-ability. **[Decision — low priority]**

No screens need to be removed. No merges required. Rename "GrowthEngine" alias out (duplicate route to same screen) to avoid confusion. **[Code]**

---

## 13. Recommended features (by tier)

- **Essential (P0/P1):** realtime new-order channel; business push on new order + issue + payout; order-status alignment; fix Promo/Creative inserts.
- **High value (P2):** Growth Studio fed by real analytics (best sellers, slow days, reorder prompts); fee/statement clarity in Finance; product bulk sold-out; customer-facing store preview.
- **Optional (P2/P3):** Coins economy activation; Smart Marketing assistant (reuse `growth-campaign-assistant` edge fn already deployed); multi-location aggregate view.
- **Future (P3):** professional-services vendor mode (booking calendar/quotes); Xperts Shop coin redemption; advanced quality center.

---

## 14. Priority buckets

### P0 — Launch blockers
1. **Order status write is broken** — port web `updateBusinessOrderStatus` (merchant_status + safe status + timeline + correct notify). _Files:_ `orderService.ts`, `types/orders.ts`. **[Verified]**
2. **No live new-order alerting** — add Supabase realtime channel on `orders` (filter `store_id`) in Home/Orders; **wire order lifecycle → `send-business-push`**. _Files:_ new realtime hook; backend: call `send-business-push` from order creation / `order-notify` fan-out. **[Verified]**
3. **Dashboard/orders read `status` not effective stage** — accurate needs-action/counts. _Files:_ `businessDashboardService.ts`, `orderService.ts`, `OrdersScreen.tsx`. **[Verified]**

### P1 — Required for professional launch
4. Fix `PromoRequestsScreen` insert (use `submitServiceRequest`). **[Verified]**
5. Fix `CreativeStudioScreen` save insert (same). **[Verified]**
6. Push deep-links → correct screens (order → OrderDetail). **[Code]**
7. Realtime on message threads. **[Code]**
8. Verify staff add/role-change/remove mutation coverage end-to-end. **[Runtime]**
9. Finance: label fees/commissions in business language; explain next-payout. **[Code]**

### P2 — Growth & efficiency
10. Growth Studio fed by real store analytics. 11. Repeat-customer/conversion analytics. 12. Bulk sold-out / category reorder. 13. Customer-facing store preview. 14. Coins economy decision + activation. 15. Smart Marketing assistant via `growth-campaign-assistant`.

### P3 — Expansion
16. Professional-services vendor mode. 17. Multi-location aggregate. 18. Shop coin redemption. 19. Quality center.

---

## 15. Phased implementation roadmap

**Phase 1 — Fix the order loop (P0, ~2–4 days).**
- Port `updateBusinessOrderStatus` (prefer a shared `business-update-order-status` edge fn).
- Add realtime `orders` channel + refetch; wire `send-business-push` into new-order + issue + payout events.
- Switch dashboard/list to effective stage.
- _Verify:_ create test order → app receives push+realtime → Accept/Preparing/Ready/Reject each succeed, set `merchant_status`, insert timeline, fire correct customer notify; Customer/Admin views match. **[Verified criteria]**

**Phase 2 — Request flows & staff (P1, ~2 days).** Fix Promo/Creative inserts; message-thread realtime; staff mutation QA; push deep-links.

**Phase 3 — Finance clarity (P1/P2, ~2 days).** Business-language fees/commission/next-payout; downloadable statement (deferred if backend absent).

**Phase 4 — Growth & Creative depth (P2).** Growth Studio on real analytics; Smart Marketing via existing edge fn; keep Creative as request model.

**Phase 5 — Analytics & quality (P2).** Repeat/conversion metrics; quality center from existing issue/refund data.

**Phase 6 — Professional services & expansion (P3).** Vendor mode; multi-location; shop redemption. All **[Decision]**-gated.

---

## 16. Prioritized backlog

| ID | Task | Area | Pri | Reason | Dep | Cx | Done-when |
|---|---|---|---|---|---|---|---|
| B-01 | Port order-status write to merchant_status+safe status+timeline+notify | Orders | P0 | 2/4 actions fail on constraint; desync | — | M | All 4 actions succeed; merchant_status set; customer notified correctly; matches web |
| B-02 | Realtime `orders` channel in Home/Orders | Orders | P0 | No live new-order alert | — | M | New order appears without manual refresh |
| B-03 | Wire order events → `send-business-push` | Notif | P0 | Push infra unused | B-02 backend | M | Backgrounded merchant gets new-order push |
| B-04 | Dashboard/list use effective stage | Orders | P0 | Wrong counts | B-01 | S | Needs-action/counts correct across stages |
| B-05 | Fix PromoRequests insert → submitServiceRequest | Growth | P1 | 42703 silent failure | — | S | Request row created; visible in Admin |
| B-06 | Fix CreativeStudio save → submitServiceRequest | Growth | P1 | Same | — | S | Draft row created |
| B-07 | Push deep-links to OrderDetail/thread | Notif | P1 | UX | B-03 | S | Tap push → correct screen |
| B-08 | Message-thread realtime | Msg | P1 | Live chat | — | S | New message appears live |
| B-09 | Staff mutation E2E QA | Staff | P1 | Unverified | — | S | Invite/role/remove all work + audited |
| B-10 | Finance business-language labels + next-payout | Finance | P1 | Clarity | — | M | Merchant understands deductions/payout |
| B-11 | Growth Studio on real analytics | Growth | P2 | Generic now | AnalyticsScreen | M | Recommendations cite real data |
| B-12 | Remove GrowthEngine duplicate route | Nav | P2 | Confusing alias | — | XS | Single Growth route |
| B-13 | Coins economy decision + activation | Coins | P2 | Not funded | Decision | M | Wallet funds on real events |
| B-14 | Repeat/conversion analytics | Analytics | P2 | Depth | — | M | Metrics with sources |
| B-15 | Professional-services vendor mode | ProServ | P3 | Vendor UX | Decision | L | Booking/quote flow |

---

## 17. Verification evidence

- **DB constraint** `orders_status_check` = `{pending, accepted, assigned, in_progress, picked_up, on_the_way, delivered, completed, cancelled, rejected}`. **[Verified via SQL]**
- **All app tables exist** (17/17 checked). **[Verified]**
- **RLS on + policy counts** (§11). **[Verified]**
- **`business_service_requests` columns** = submitted_by/request_type/title/description/business_notes/… — **no requester_id, no service_type, no notes** → Promo/Creative inserts fail. **[Verified]**
- **`send-business-push` deployed but zero invokers** in `supabase/functions/`. **[Verified]**
- **No realtime** (`grep .channel(/postgres_changes/.subscribe(` → none). **[Verified]**
- **TypeScript** 0 errors. **[Verified]**
- **All required edge functions ACTIVE.** **[Verified]**
- Not run: lint, expo-doctor, unit/integration tests (none present), device tests. **[Not performed]**

---

## 18. Remaining product decisions

1. **Coins economy** — activate now or defer? What earns/spends coins? **[Decision]**
2. **Professional-services vendor mode** — separate mode vs shared nav; booking/quote depth for launch? **[Decision]**
3. **Creative generation** — keep request-to-Xperts model, or add in-app/Canva generation? **[Decision]**
4. **Self-serve payouts** — keep scheduled-only (recommended) or add request? **[Decision — recommend keep scheduled]**
5. **Multi-location** — needed for Old Harbour launch? (Data model supports brand/branch already.) **[Decision — likely defer]**

---

## 19. Final recommendation

Ship a **Phase 1 order-loop fix** and this app is launch-viable for Old Harbour. The merchant-facing surface is broad and real; the only thing standing between it and a trustworthy launch is the order write/alert path — a few hundred lines of alignment with code that already exists on the web side. Reuse the web's `updateBusinessOrderStatus` and the deployed `send-business-push`; add one realtime channel. Do not rebuild anything. Then iterate P1 → P3 in the phased order above.
