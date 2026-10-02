"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import {
  Search,
  User,
  Wallet,
  Package,
  CreditCard,
  RotateCcw,
  Clock,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

import { db } from "@/lib/firebase";
import type { Request } from "@/types/request";

interface Customer {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role?: string;
}

interface CustomerWallet {
  balance: number;
}

interface CustomerRecord
  extends Customer {
  walletBalance: number;
}

export default function AdminAuditPage() {
  const [customers, setCustomers] =
    useState<CustomerRecord[]>([]);

  const [requests, setRequests] =
    useState<Request[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] =
    useState<string | null>(null);

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    async function loadAuditData() {
      try {
        setLoading(true);

        const [
          usersSnapshot,
          walletsSnapshot,
          requestsSnapshot,
        ] = await Promise.all([
          getDocs(
            collection(db, "users")
          ),
          getDocs(
            collection(db, "wallets")
          ),
          getDocs(
            collection(db, "requests")
          ),
        ]);

        /*
         * ========================================
         * WALLETS
         * ========================================
         */

        const walletMap =
          new Map<string, number>();

        walletsSnapshot.docs.forEach(
          (walletDoc) => {
            const data =
              walletDoc.data();

            const balance =
              Number(
                data.balance ?? 0
              );

            walletMap.set(
              walletDoc.id,
              Number.isFinite(balance)
                ? balance
                : 0
            );
          }
        );

        /*
         * ========================================
         * CUSTOMERS
         * ========================================
         */

        const customerList =
          usersSnapshot.docs
            .map((userDoc) => {
              const data =
                userDoc.data();

              return {
                id: userDoc.id,

                displayName:
                  data.displayName ||
                  "Unnamed Customer",

                email:
                  data.email ||
                  "",

                photoURL:
                  data.photoURL ||
                  "",

                role:
                  data.role ||
                  "customer",

                walletBalance:
                  walletMap.get(
                    userDoc.id
                  ) ?? 0,
              };
            })
            .filter(
              (customer) =>
                customer.role !==
                "admin"
            );

        /*
         * ========================================
         * REQUESTS
         * ========================================
         */

        const requestList =
          requestsSnapshot.docs.map(
            (requestDoc) => ({
              id: requestDoc.id,
              ...requestDoc.data(),
            })
          ) as Request[];

        setCustomers(
          customerList
        );

        setRequests(
          requestList
        );

        /*
         * Automatically select first customer.
         */

        if (
          customerList.length > 0
        ) {
          setSelectedCustomerId(
            customerList[0].id
          );
        }
      } catch (error) {
        console.error(
          "Failed to load audit data:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadAuditData();
  }, []);

  /*
   * ========================================
   * CUSTOMER SEARCH
   * ========================================
   */

  const filteredCustomers =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return customers;
      }

      return customers.filter(
        (customer) =>
          customer.displayName
            .toLowerCase()
            .includes(query) ||
          customer.email
            .toLowerCase()
            .includes(query) ||
          customer.id
            .toLowerCase()
            .includes(query)
      );
    }, [
      customers,
      search,
    ]);

  /*
   * ========================================
   * SELECTED CUSTOMER
   * ========================================
   */

  const selectedCustomer =
    customers.find(
      (customer) =>
        customer.id ===
        selectedCustomerId
    ) || null;

  /*
   * ========================================
   * CUSTOMER REQUESTS
   * ========================================
   */

  const customerRequests =
    useMemo(() => {
      if (!selectedCustomerId) {
        return [];
      }

      return requests
        .filter(
          (request) =>
            request.userId ===
            selectedCustomerId
        )
        .sort(
          (a, b) => {
            const aTime =
              a.updatedAt?.toMillis?.() ??
              a.createdAt?.toMillis?.() ??
              0;

            const bTime =
              b.updatedAt?.toMillis?.() ??
              b.createdAt?.toMillis?.() ??
              0;

            return bTime - aTime;
          }
        );
    }, [
      requests,
      selectedCustomerId,
    ]);

  /*
   * ========================================
   * DATE FORMATTER
   * ========================================
   */

  function formatDate(
    value: any
  ) {
    if (!value) {
      return "—";
    }

    try {
      if (
        typeof value.toDate ===
        "function"
      ) {
        return value
          .toDate()
          .toLocaleString();
      }

      if (
        typeof value ===
        "string"
      ) {
        return new Date(
          value
        ).toLocaleString();
      }

      if (
        value instanceof Date
      ) {
        return value.toLocaleString();
      }

      return "—";
    } catch {
      return "—";
    }
  }

  /*
   * ========================================
   * STATUS LABEL
   * ========================================
   */

  function statusLabel(
    status: string
  ) {
    return status
      .replaceAll(
        "_",
        " "
      )
      .replace(
        /\b\w/g,
        (char) =>
          char.toUpperCase()
      );
  }

  /*
   * ========================================
   * STATUS COLOR
   * ========================================
   */

  function statusClass(
    status: string
  ) {
    switch (status) {
      case "refunded":
        return "bg-green-500/10 text-green-400 border-green-500/20";

      case "refund_requested":
        return "bg-red-500/10 text-red-400 border-red-500/20";

      case "refund_offered":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";

      case "paid":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";

      case "delivered":
        return "bg-green-500/10 text-green-400 border-green-500/20";

      case "rejected":
        return "bg-red-500/10 text-red-400 border-red-500/20";

      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  }

  /*
   * ========================================
   * LOADING
   * ========================================
   */

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <ShieldCheck
            size={20}
            className="animate-pulse"
          />

          Loading audit data...
        </div>
      </div>
    );
  }

  /*
   * ========================================
   * PAGE
   * ========================================
   */

  return (
    <div className="flex min-h-[calc(100vh-40px)] flex-col gap-6">
      {/* HEADER */}

      <div>
        <div className="flex items-center gap-3">
          <ShieldCheck
            size={26}
            className="text-red-400"
          />

          <h1 className="text-2xl font-bold text-white">
            Audit
          </h1>
        </div>

        <p className="mt-1 text-sm text-slate-400">
          Review customers, requests,
          payments and refund activity.
        </p>
      </div>

      {/* CONTENT */}

      <div className="grid min-h-[650px] flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 lg:grid-cols-[340px_1fr]">
        {/* ========================================
            CUSTOMER SIDEBAR
        ======================================== */}

        <aside className="flex flex-col border-b border-slate-800 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-800 p-4">
            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search customers..."
                className="
                  w-full
                  rounded-xl
                  border
                  border-slate-800
                  bg-slate-950
                  py-3
                  pl-10
                  pr-4
                  text-sm
                  text-white
                  outline-none
                  placeholder:text-slate-600
                  focus:border-slate-700
                "
              />
            </div>

            <p className="mt-3 text-xs text-slate-500">
              {filteredCustomers.length}{" "}
              customers
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredCustomers.length ===
            0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No customers found.
              </div>
            ) : (
              filteredCustomers.map(
                (customer) => {
                  const selected =
                    customer.id ===
                    selectedCustomerId;

                  const requestCount =
                    requests.filter(
                      (request) =>
                        request.userId ===
                        customer.id
                    ).length;

                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() =>
                        setSelectedCustomerId(
                          customer.id
                        )
                      }
                      className={`
                        flex
                        w-full
                        items-center
                        gap-3
                        border-b
                        border-slate-800
                        p-4
                        text-left
                        transition
                        ${
                          selected
                            ? "bg-slate-800"
                            : "hover:bg-slate-950"
                        }
                      `}
                    >
                      {/* AVATAR */}

                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800">
                        {customer.photoURL ? (
                          <img
                            src={
                              customer.photoURL
                            }
                            alt={
                              customer.displayName
                            }
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User
                            size={18}
                            className="text-slate-500"
                          />
                        )}
                      </div>

                      {/* INFO */}

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">
                          {
                            customer.displayName
                          }
                        </p>

                        <p className="truncate text-xs text-slate-500">
                          {customer.email}
                        </p>

                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                          <span>
                            {requestCount}{" "}
                            request
                            {requestCount ===
                            1
                              ? ""
                              : "s"}
                          </span>

                          <span>
                            •
                          </span>

                          <span>
                            $
                            {customer.walletBalance.toFixed(
                              2
                            )}
                          </span>
                        </div>
                      </div>

                      <ChevronRight
                        size={17}
                        className={
                          selected
                            ? "text-red-400"
                            : "text-slate-700"
                        }
                      />
                    </button>
                  );
                }
              )
            )}
          </div>
        </aside>

        {/* ========================================
            CUSTOMER DETAIL
        ======================================== */}

        <main className="flex min-w-0 flex-col overflow-hidden">
          {!selectedCustomer ? (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              Select a customer.
            </div>
          ) : (
            <>
              {/* CUSTOMER HEADER */}

              <div className="border-b border-slate-800 p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800">
                    {selectedCustomer.photoURL ? (
                      <img
                        src={
                          selectedCustomer.photoURL
                        }
                        alt={
                          selectedCustomer.displayName
                        }
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User
                        size={22}
                        className="text-slate-500"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-xl font-bold text-white">
                      {
                        selectedCustomer.displayName
                      }
                    </h2>

                    <p className="truncate text-sm text-slate-400">
                      {
                        selectedCustomer.email
                      }
                    </p>

                    <p className="mt-1 text-xs text-slate-600">
                      Customer ID:{" "}
                      {
                        selectedCustomer.id
                      }
                    </p>
                  </div>

                  <div className="hidden rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 sm:block">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Wallet size={16} />

                      <span className="text-xs">
                        Wallet
                      </span>
                    </div>

                    <p className="mt-1 text-lg font-bold text-white">
                      $
                      {selectedCustomer.walletBalance.toFixed(
                        2
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* REQUEST HISTORY */}

              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-white">
                      Request History
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      {
                        customerRequests.length
                      }{" "}
                      total request
                      {customerRequests.length ===
                      1
                        ? ""
                        : "s"}
                    </p>
                  </div>
                </div>

                {customerRequests.length ===
                0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center">
                    <Package
                      size={30}
                      className="mx-auto text-slate-700"
                    />

                    <p className="mt-3 text-sm text-slate-500">
                      No requests found
                      for this customer.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {customerRequests.map(
                      (request) => (
                        <div
                          key={request.id}
                          className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5"
                        >
                          {/* REQUEST HEADER */}

                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Request #
                                {request.id
                                  .slice(
                                    0,
                                    8
                                  )
                                  .toUpperCase()}
                              </p>

                              <p className="mt-1 font-semibold text-white">
                                {request.items
                                  ?.map(
                                    (item) =>
                                      item.name
                                  )
                                  .filter(
                                    Boolean
                                  )
                                  .join(
                                    ", "
                                  ) ||
                                  "Request"}
                              </p>
                            </div>

                            <span
                              className={`
                                inline-flex
                                w-fit
                                rounded-full
                                border
                                px-3
                                py-1
                                text-xs
                                font-semibold
                                ${statusClass(
                                  request.status
                                )}
                              `}
                            >
                              {statusLabel(
                                request.status
                              )}
                            </span>
                          </div>

                          {/* REQUEST META */}

                          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <AuditField
                              icon={
                                <Clock
                                  size={15}
                                />
                              }
                              label="Created"
                              value={formatDate(
                                request.createdAt
                              )}
                            />

                            <AuditField
                              icon={
                                <Clock
                                  size={15}
                                />
                              }
                              label="Updated"
                              value={formatDate(
                                request.updatedAt
                              )}
                            />

                            <AuditField
                              icon={
                                <CreditCard
                                  size={15}
                                />
                              }
                              label="Payment"
                              value={
                                request.payment
                                  ? `$${Number(
                                      request
                                        .payment
                                        .amount ??
                                        0
                                    ).toFixed(
                                      2
                                    )}`
                                  : "No payment"
                              }
                            />

                            <AuditField
                              icon={
                                <RotateCcw
                                  size={15}
                                />
                              }
                              label="Refund"
                              value={
                                request
                                  .refundRequest
                                  ?.status ||
                                request
                                  .refundOffer
                                  ?.offered
                                  ? request
                                      .refundRequest
                                      ?.status ||
                                    "offered"
                                  : "None"
                              }
                            />
                          </div>

                          {/* STATUS HISTORY */}

                          {request.statusHistory && (
                            <div className="mt-5 border-t border-slate-800 pt-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Status History
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {Object.entries(
                                  request.statusHistory
                                )
                                  .filter(
                                    ([, value]) =>
                                      value
                                  )
                                  .map(
                                    ([
                                      status,
                                      timestamp,
                                    ]) => (
                                      <div
                                        key={
                                          status
                                        }
                                        className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
                                      >
                                        <p className="text-xs font-semibold text-slate-300">
                                          {statusLabel(
                                            status
                                          )}
                                        </p>

                                        <p className="mt-1 text-[10px] text-slate-600">
                                          {formatDate(
                                            timestamp
                                          )}
                                        </p>
                                      </div>
                                    )
                                  )}
                              </div>
                            </div>
                          )}

                          {/* REFUND DETAILS */}

                          {request.refundRequest && (
                            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                              <div className="flex items-center gap-2">
                                <RotateCcw
                                  size={16}
                                  className="text-red-400"
                                />

                                <p className="text-sm font-semibold text-red-300">
                                  Refund Request
                                </p>
                              </div>

                              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <AuditField
                                  label="Status"
                                  value={
                                    request
                                      .refundRequest
                                      .status
                                  }
                                />

                                <AuditField
                                  label="Preference"
                                  value={
                                    request
                                      .refundRequest
                                      .preference
                                  }
                                />

                                <AuditField
                                  label="Amount"
                                  value={`$${Number(
                                    request
                                      .refundRequest
                                      .amount ??
                                      0
                                  ).toFixed(
                                    2
                                  )}`}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/*
 * ========================================
 * AUDIT FIELD
 * ========================================
 */

function AuditField({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center gap-2 text-slate-600">
        {icon}

        <span className="text-[11px] font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>

      <p className="mt-1 truncate text-sm font-medium text-slate-300">
        {value}
      </p>
    </div>
  );
}