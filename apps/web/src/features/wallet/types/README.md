# Wallet Feature

Wallet balance reads, transaction history, and admin credit operations.

## Services

| Export | Description |
|--------|-------------|
| `getWalletBalance(uid)` | Current balance in USD cents |
| `listWalletTransactions(uid, limit?)` | Recent transactions |
| `creditWallet(uid, amount, reason)` | Admin-only credit (server-side) |
| `adminCreditWallet(request, body)` | Admin API handler wrapper |

## Types

Re-exported from `@/types/wallet`:
- `Wallet` — balance + metadata
- `WalletTransaction` — individual entry

## Conventions

- Always read from Firestore directly for real-time balance (`getWalletBalance`).
- Never trust client-reported balances — the server is authoritative.
- Credits are audit-tracked: every call must pass a `reason` string.
