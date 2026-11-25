# Firestore list reads — cap inventory

A bounded list read is a product decision, not an implementation detail. The
failure this document exists to prevent is a screen that looks complete while
showing only the newest N rows.

Every `.limit()` / `limitToLast()` in the app now carries one of three tags, and
`npm run check:firestore-list-caps` fails CI when one is missing:

```ts
// firestore-list: visible — the caller receives { truncated, limit }
limit(REQUEST_SUBSCRIPTION_LIMIT + 1)
```

| Tag | Meaning |
|---|---|
| `visible` | The caller receives truncation metadata and the UI shows it. Fetch `N + 1` so "more than N" is knowable. |
| `pagination` | The caller can fetch the next page with a cursor (`hasMore`, `lastDoc`, `startAfter`). |
| `internal` | A cron, purge, admin-only helper or single-row probe. It never renders as a user's complete list. |

A read with **no limit** cannot be caught by that check. Those rows are listed
below and need a `// firestore-list: unbounded — reason` comment when added or
changed, so the decision is reviewable.

## Customer-facing reads

| Read | Location | Bound | Decision | Evidence / rationale |
|---|---|---|---|---|
| Requests live list | `subscribeToRequests` (`features/requests/services/requests.ts`) | `limit(200 + 1)` | **visible** | Header shows `200+`; `/requests` and the support customer card show a "newest 200" notice; `meta.truncated` |
| Requests paged helper | `getRequests` (same file) | `limit(pageSize + 1)` + `startAfter` | **pagination** | Returns `hasMore` and `lastDoc` |
| Shipments | `getShipmentPage` (`features/shipments/services/shipments.ts`) | `limit(pageSize)` + cursor | **pagination** | Returns `nextPageAfter` |
| Wallet activity | `getWalletTransactions` (`features/wallet/services/wallet.ts`) | `limit(100 + 1)` | **visible** | Header shows `100+`; notice says older activity is not loaded |
| Notifications page | `getNotifications` (`features/notifications/services/index.ts`) | none by default; an optional caller limit is applied **in the query** | **unbounded** | Filters run client-side, so the page wants the full set. Per-user volume is small today; paginate before it is not. |
| Unread badge | `subscribeToNotifications` | `limit(30)` | **internal** | Badge window, not a list. Saturation at 30 is documented in `useUnreadNotifications`. |
| Support thread | `subscribeToSupportMessages`, `getSupportMessages` | none | **unbounded** | A conversation must be complete; association-bounded by ticket |
| Tickets for a request/customer | `getSupportTicketsByRequest`, `getSupportTicketsByCustomer` | none | **unbounded** | Association-bounded; a customer's ticket count is small |
| Addresses | `getAddresses` (`features/addresses/services/addresses.ts`) | none | **unbounded** | Per-user subcollection; small by product design |
| Shipment → requests | `getShipmentRequests` | none | **unbounded** | `__name__ in shipment.requestIds`; Firestore caps an `in` list at 30 |
| Warehouse inventory | `getWarehouseInventory` (`features/requests/services/warehouse.ts`) | none | **unbounded** | Operational list; must contain every request in the warehouse statuses |
| Notification maintenance | `read-all`, `clear-read` routes | none | **internal** | Per-user batch. Known ceiling: a Firestore batch is 500 writes; large histories need chunking (follow-up). |
| User export / access | `/api/user/export`, `/api/user/data` | none | **unbounded** | A portability/access response must be complete. Consent logs and rights requests were previously capped at 100/50 with no indication; both caps were removed. |

## Admin reads

| Read | Location | Bound | Decision | Evidence / rationale |
|---|---|---|---|---|
| Request queue | `/api/admin/requests` → `getAdminRequestQueue` | **pagination** | Priority ordering, status filters and search now run server-side with cursor-based pagination. Each page returns `hasMore` and `nextCursor`. **Trigger for pagination removal:** queue under ~5,000 rows and API latency below ~200 ms. |
| Customers | `/api/admin/customers` | **pagination** | Directory now uses cursor-based pagination with server-side filtering. Search and wallet balance are joined per-page. **Trigger for pagination removal:** customer count makes two reads inexpensive. |
| Users / roles | `/api/admin/users` | `limit(params.limit)` + cursor | **pagination** | Cursor-based pages with `hasMore`; the role audit reads every account page by page |
| Analytics | `/api/admin/analytics` | none (all requests) | **unbounded** | Aggregate dashboard. Correct end state is counters/aggregation documents, not a full scan; tracked as follow-up |
| Support inbox | `subscribeToAllSupportTickets` | none | **unbounded** | Admin needs the active queue plus resolved context; resolved tickets are removed by the retention purge, which bounds the set |
| Rights requests / breaches | `lib/compliance/rightsOps2.ts`, `breach.ts` | caller-supplied `limit` | **internal** | Admin listing, not a customer's complete history |
| Consent logs | `lib/compliance/consent.ts` | caller-supplied `limit` (50 from settings) | **visible** | The route fetches 51 and returns `consentLogMeta.truncated`; Settings renders the history and a "showing 50 most recent" notice. The complete log is in `/api/user/export` |

## Internal scans

| Read | Location | Bound | Decision | Evidence / rationale |
|---|---|---|---|---|
| Retention purge | `/api/admin/compliance/retention/purge` (requests, tickets, users, logs) | `PAGE_SIZE` + cursor loop | **internal** | Each run deletes a page and reports counts |
| Payment reconciliation | `/api/admin/payments/reconcile` | `PAGE_SIZE` × `MAX_PAGES` | **internal** | A full final page sets `scan.truncated`, which the report/alerts carry |
| Quote expiry cron | `/api/admin/requests/quotes/expire` | `SWEEP_LIMIT` | **internal** | Marks up to N per hourly run; the next run continues the backlog |
| Tracking lookups | `findRequest` (`features/shipments/services/trackingSync.ts`) | `limit(1)` ×2 | **internal** | Uniqueness probe, not a list |
| Open rights request check | `retentionOps.ts` | `limit(1)` | **internal** | Existence probe |
| System logs | retention purge | `PAGE_SIZE` + cursor | **internal** | No user-facing reader; logs are read only by the sweep |

## Rules for new reads

1. **User history defaults to pagination.** Cursors and `hasMore`; do not add a
   newest-N cap unless the product explicitly says "latest N".
2. **A visible cap must be visible.** Fetch `N + 1`, return
   `{ truncated, limit }`, and render a count (`200+`) or notice. A cap with no
   UI is a bug.
3. **Never fetch everything and slice in memory.** Apply the limit in the query;
   otherwise the cost is already paid.
4. **Unbounded is allowed only when the set is association-bounded**  
   (per-ticket, per-user addresses), **retention-bounded**, or **admin-wide by
   necessity** — and then it gets a table row here plus a comment at the call
   site.
5. **Cron scans must state truncation.** If a sweep stops at a page limit, the
   response/alert must say so (`scan.truncated`).

Run the check directly:

```bash
npm run check:firestore-list-caps
```