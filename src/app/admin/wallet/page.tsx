"use client";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Wallet,
  Plus,
  User,
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
interface Customer {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
}
interface CustomerWallet {
  balance: number;
}
interface CustomerWithWallet
  extends Customer {
  balance: number;
}
export default function AdminWalletPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refundRequestId =
    searchParams.get("refundRequest");
  const [refundMode, setRefundMode] =
    useState(false);
  const [refundLoading, setRefundLoading] =
    useState(false);
  const [refundRequestData, setRefundRequestData] =
    useState<any>(null);
  const [customers, setCustomers] =
    useState<CustomerWithWallet[]>(
      []
    );
  const [loading, setLoading] =
    useState(true);
  const [search, setSearch] =
    useState("");
  const [
    selectedCustomer,
    setSelectedCustomer,
  ] =
    useState<CustomerWithWallet | null>(
      null
    );
  const [amount, setAmount] =
    useState("");
  const [
    description,
    setDescription,
  ] = useState("");
  const [adding, setAdding] =
    useState(false);
  const [successMessage, setSuccessMessage] =
    useState("");
  const [errorMessage, setErrorMessage] =
    useState("");
  /*
   * ========================================
   * LOAD CUSTOMERS
   * ========================================
   */
  useEffect(() => {
    async function loadCustomers() {
      try {
        setLoading(true);
        /*
         * Get users.
         */
        const usersSnapshot =
          await getDocs(
            collection(db, "users")
          );
        /*
         * Get wallets.
         */
        const walletsSnapshot =
          await getDocs(
            collection(db, "wallets")
          );
        /*
         * Build wallet lookup.
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
         * Only show customers.
         *
         * Admin accounts are excluded
         * from this wallet-management UI.
         */
        const customerData =
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
              };
            })
            .filter(
              (user) =>
                user.role !== "admin"
            )
            .map((user) => ({
              id: user.id,
              displayName:
                user.displayName,
              email:
                user.email,
              photoURL:
                user.photoURL,
              balance:
                walletMap.get(
                  user.id
                ) ?? 0,
            }));
        setCustomers(
          customerData
        );
      } catch (error) {
        console.error(
          "Failed to load customers:",
          error
        );
        setErrorMessage(
          "Unable to load customers."
        );
      } finally {
        setLoading(false);
      }
    }
    loadCustomers();
  }, []);
  /*
   * ========================================
   * AUTOMATICALLY LOAD REFUND REQUEST
   * ========================================
   */
  useEffect(() => {
    if (!refundRequestId) {
      setRefundMode(false);
      return;
    }
    async function loadRefundRequest() {
      try {
        setRefundLoading(true);
        setErrorMessage("");
        const snapshot = await getDoc(
          doc(db, "requests", refundRequestId!)
        );
        if (!snapshot.exists()) {
          throw new Error("Refund request not found.");
        }
        const data = snapshot.data();
        /*
         * Example breakdown:
         * Wallet: $100.00
         * PayPal:  $15.38
         */
        const preference =
          data.refundRequest?.preference ??
          data.preference ??
          "wallet";
        const totalRefundAmount = Number(
          data.refundRequest?.amount ??
            data.amount ??
            0
        );
        const originalWalletAmount = Number(
          data.refundRequest?.walletAmount ??
            data.payment?.walletAmount ??
            data.walletAmount ??
            0
        );
        let walletRefundAmount = 0;
        /*
         * ========================================
         * CUSTOMER CHOSE SHIPIN WALLET
         * ========================================
         *
         * The customer wants the ENTIRE refund
         * credited to their ShipIN Wallet.
         *
         * Therefore we refund the FULL amount,
         * not merely the amount originally paid
         * using the wallet.
         *
         * $100 Wallet + $15.38 PayPal
         *                ↓
         *         $115.38 Wallet
         */
        if (preference === "wallet") {
          walletRefundAmount =
            totalRefundAmount;
        }
        /*
         * ========================================
         * CUSTOMER CHOSE ORIGINAL SOURCES
         * ========================================
         *
         * Only the amount originally paid from
         * the wallet comes back to the wallet.
         *
         * $100 Wallet + $15.38 PayPal
         *                ↓
         * $100 Wallet + $15.38 PayPal
         */
        else if (
          preference === "original_sources"
        ) {
          walletRefundAmount =
            originalWalletAmount;
        }
        /*
         * ========================================
         * ORIGINAL PAYMENT METHOD
         * ========================================
         *
         * Keep compatibility with the existing
         * preference.
         *
         * If there was an original wallet
         * contribution, that portion is handled
         * through the wallet refund flow.
         */
        else if (
          preference === "original_payment"
        ) {
          walletRefundAmount =
            originalWalletAmount;
        }
        /*
         * ========================================
         * VALIDATE WALLET REFUND
         * ========================================
         */
        if (
          !Number.isFinite(
            walletRefundAmount
          ) ||
          walletRefundAmount <= 0
        ) {
          throw new Error(
            "This refund does not contain a wallet refund amount."
          );
        }
        setRefundRequestData({
          id: snapshot.id,
          ...data,
        });
        setRefundMode(true);
        /*
         * ========================================
         * SELECT CUSTOMER
         * ========================================
         */
        const customer =
          customers.find(
            (item) =>
              item.id === data.userId
          );
        if (customer) {
          setSelectedCustomer(
            customer
          );
          /*
           * IMPORTANT:
           *
           * The amount is now based on the
           * customer's refund preference.
           */
          setAmount(
            walletRefundAmount.toFixed(2)
          );
          setDescription(
            `Refund for Request #${snapshot.id}`
          );
        }
      } catch (error) {
        console.error(
          "Failed to load refund request:",
          error
        );
        setRefundMode(false);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load refund request."
        );
      } finally {
        setRefundLoading(false);
      }
    }
    loadRefundRequest();
  }, [
    refundRequestId,
    customers,
  ]);
  /*
   * ========================================
   * FILTER CUSTOMERS
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
   * SELECT CUSTOMER
   * ========================================
   */
  function handleSelectCustomer(
    customer: CustomerWithWallet
  ) {
    /*
     * In refund mode the customer is determined
     * by the refund request.
     *
     * Never allow the admin to accidentally
     * switch the refund to another customer.
     */
    if (refundMode) {
      return;
    }
    setSelectedCustomer(customer);
    setAmount("");
    setDescription("");
    setSuccessMessage("");
    setErrorMessage("");
  }
  /*
   * ========================================
   * ADD CREDITS / AUTHORIZE REFUND
   * ========================================
   */
  async function handleAddCredits() {
    if (!selectedCustomer) {
      setErrorMessage(
        "Please select a customer."
      );
      return;
    }
    const numericAmount =
      Number(amount);
    if (
      !Number.isFinite(
        numericAmount
      ) ||
      numericAmount <= 0
    ) {
      setErrorMessage(
        "Enter a valid credit amount."
      );
      return;
    }
    if (numericAmount > 10000) {
      setErrorMessage(
        "You can add a maximum of 10,000 credits at once."
      );
      return;
    }
    try {
      setAdding(true);
      setErrorMessage("");
      setSuccessMessage("");
      /*
       * Get the current Firebase ID token.
       */
      const user =
        auth.currentUser;
      if (!user) {
        throw new Error(
          "Your admin session has expired. Please log in again."
        );
      }
      const idToken =
        await user.getIdToken();
      /*
       * Call protected admin API.
       */
      const response =
        await fetch(
          "/api/admin/wallet/credit",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              customerId:
                selectedCustomer.id,
              amount:
                numericAmount,
              description:
                description.trim() ||
                (
                  refundMode
                    ? `Refund for Request #${refundRequestId}`
                    : "Credit issued by admin"
                ),
              type:
                refundMode
                  ? "refund"
                  : "admin_credit",
              requestId:
                refundMode
                  ? refundRequestId
                  : undefined,
            }),
          }
        );
      const data =
        await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to add credits."
        );
      }
      /*
       * Update local customer balance
       * immediately.
       */
      const newBalance =
        Number(
          data.newBalance
        );
      setCustomers(
        (currentCustomers) =>
          currentCustomers.map(
            (customer) =>
              customer.id ===
              selectedCustomer.id
                ? {
                    ...customer,
                    balance:
                      newBalance,
                  }
                : customer
          )
      );
      setSelectedCustomer(
        (current) =>
          current
            ? {
                ...current,
                balance:
                  newBalance,
              }
            : null
      );
      setAmount("");
      setDescription("");
      setSuccessMessage(
        refundMode
          ? `$${numericAmount.toFixed(
              2
            )} wallet refund authorized successfully.`
          : `${numericAmount.toFixed(
              2
            )} credits added successfully.`
      );
      if (
        refundMode &&
        refundRequestId
      ) {
        setTimeout(() => {
          router.push(
            `/admin/requests/${refundRequestId}`
          );
        }, 1200);
      }
    } catch (error) {
      console.error(
        "Add wallet credits error:",
        error
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to add wallet credits."
      );
    } finally {
      setAdding(false);
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
          <Loader2
            size={20}
            className="animate-spin"
          />
          <span>
            Loading customers...
          </span>
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
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-blue-500/10 p-3">
            <Wallet
              size={28}
              className="text-blue-400"
            />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white">
              {refundMode
                ? "Refund Authorization"
                : "Wallet Credits"}
            </h1>
            <p className="mt-2 text-slate-400">
              {refundMode
                ? "Authorize the customer's wallet refund."
                : "Add ShipIN credits to customer wallets."}
            </p>
          </div>
        </div>
      </div>
      {/* REFUND WARNING */}
      {refundMode && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex gap-3">
            <AlertCircle
              size={20}
              className="mt-0.5 shrink-0 text-amber-400"
            />
            <div>
              <p className="font-semibold text-amber-300">
                Refund Authorization
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                You are about to credit the customer's
                ShipIN Wallet for refund request{" "}
                <span className="font-medium text-white">
                  #{refundRequestId}
                </span>
                .
                The amount below has been taken directly
                from the refund request.
              </p>
            </div>
          </div>
        </div>
      )}
      {/* INFO NOTICE */}
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
        <div className="flex gap-3">
          <Wallet
            size={20}
            className="mt-0.5 shrink-0 text-blue-400"
          />
          <div>
            <p className="font-semibold text-blue-300">
              ShipIN Internal Credits
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Credits are issued internally by
              ShipIN. They are not a customer
              cash deposit or PayPal transaction.
              At checkout, each credit is applied
              as $1.00 toward the customer's
              order total.
            </p>
          </div>
        </div>
      </div>
      {/* MAIN GRID */}
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        {/* ====================================
            CUSTOMER LIST
        ==================================== */}
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          {/* LIST HEADING */}
          <div className="border-b border-slate-800 px-5 py-4">
            <p className="text-sm font-semibold text-white">
              {refundMode
                ? "Refund Customer"
                : "Customers"}
            </p>
            {refundMode && (
              <p className="mt-1 text-xs text-slate-500">
                Customer selection is locked during refund processing.
              </p>
            )}
          </div>
          {/* SEARCH */}
          <div className="border-b border-slate-800 p-5">
            <div className="relative">
              <Search
                size={19}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search customers by name, email, or ID..."
                className="
                  w-full
                  rounded-xl
                  border
                  border-slate-700
                  bg-slate-950
                  py-3
                  pl-11
                  pr-4
                  text-white
                  outline-none
                  transition
                  placeholder:text-slate-600
                  focus:border-blue-500
                "
              />
            </div>
          </div>
          {/* CUSTOMER COUNT */}
          <div className="border-b border-slate-800 px-5 py-4">
            <p className="text-sm text-slate-500">
              {filteredCustomers.length}{" "}
              customer
              {filteredCustomers.length ===
              1
                ? ""
                : "s"}{" "}
              found
            </p>
          </div>
          {/* CUSTOMER LIST */}
          <div className="divide-y divide-slate-800">
            {filteredCustomers.length ===
            0 ? (
              <div className="p-10 text-center">
                <User
                  size={30}
                  className="mx-auto text-slate-600"
                />
                <p className="mt-3 font-medium text-slate-300">
                  No customers found
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Try a different search.
                </p>
              </div>
            ) : (
              filteredCustomers.map(
                (customer) => {
                  const selected =
                    selectedCustomer?.id ===
                    customer.id;
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() =>
                        handleSelectCustomer(
                          customer
                        )
                      }
                      disabled={refundMode}
                      className={`
                        flex
                        w-full
                        items-center
                        justify-between
                        gap-4
                        px-5
                        py-5
                        text-left
                        transition
                        ${
                          selected
                            ? "bg-blue-500/10"
                            : "hover:bg-slate-800/60"
                        }
                        ${
                          refundMode
                            ? "cursor-default"
                            : ""
                        }
                      `}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        {/* AVATAR */}
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800">
                          {customer.photoURL ? (
                            <img
                              src={customer.photoURL}
                              alt={customer.displayName}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <User
                              size={19}
                              className="text-slate-500"
                            />
                          )}
                        </div>
                        {/* CUSTOMER */}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">
                            {
                              customer.displayName
                            }
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-500">
                            <Mail
                              size={13}
                            />
                            {
                              customer.email
                            }
                          </p>
                        </div>
                      </div>
                      {/* BALANCE */}
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-slate-500">
                          Credits
                        </p>
                        <p className="mt-1 text-lg font-bold text-blue-400">
                          {customer.balance.toFixed(
                            2
                          )}
                        </p>
                      </div>
                    </button>
                  );
                }
              )
            )}
          </div>
        </section>
        {/* ====================================
            ADD CREDITS / AUTHORIZE REFUND PANEL
        ==================================== */}
        <section className="h-fit rounded-2xl border border-slate-800 bg-slate-900">
          {!selectedCustomer ? (
            <div className="p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
                <Wallet
                  size={25}
                  className="text-slate-500"
                />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-white">
                Select a customer
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Select a customer from the list
                to manage their ShipIN credits.
              </p>
            </div>
          ) : (
            <>
              {/* SELECTED CUSTOMER */}
              <div className="border-b border-slate-800 p-6">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Selected Customer
                </p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-slate-800">
                    {selectedCustomer.photoURL ? (
                      <img
                        src={selectedCustomer.photoURL}
                        alt={selectedCustomer.displayName}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User
                        size={20}
                        className="text-slate-500"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {
                        selectedCustomer.displayName
                      }
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {
                        selectedCustomer.email
                      }
                    </p>
                  </div>
                </div>
                {/* CURRENT BALANCE */}
                <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-5">
                  <p className="text-sm text-slate-500">
                    Current Credits
                  </p>
                  <p className="mt-2 text-3xl font-bold text-blue-400">
                    {selectedCustomer.balance.toFixed(
                      2
                    )}
                  </p>
                </div>
              </div>
              {/* FORM */}
              <div className="space-y-5 p-6">
                <div>
                  <label
                    htmlFor="creditAmount"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    {refundMode
                      ? "Refund Amount"
                      : "Credits to Add"}
                  </label>
                  <input
                    id="creditAmount"
                    type="number"
                    min="0.01"
                    max="10000"
                    step="0.01"
                    value={amount}
                    onChange={(event) =>
                      setAmount(
                        event.target.value
                      )
                    }
                    placeholder="25.00"
                    disabled={
                      adding ||
                      refundMode
                    }
                    className="
                      w-full
                      rounded-xl
                      border
                      border-slate-700
                      bg-slate-950
                      px-4
                      py-3
                      text-white
                      outline-none
                      transition
                      placeholder:text-slate-700
                      focus:border-blue-500
                      disabled:opacity-50
                    "
                  />
                  <p className="mt-2 text-xs text-slate-600">
                    1 credit = $1.00 at checkout.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="creditDescription"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Reason
                    <span className="ml-1 text-slate-600">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="creditDescription"
                    type="text"
                    maxLength={200}
                    value={description}
                    onChange={(event) =>
                      setDescription(
                        event.target.value
                      )
                    }
                    placeholder="Customer compensation"
                    disabled={
                      adding ||
                      refundMode
                    }
                    className="
                      w-full
                      rounded-xl
                      border
                      border-slate-700
                      bg-slate-950
                      px-4
                      py-3
                      text-white
                      outline-none
                      transition
                      placeholder:text-slate-700
                      focus:border-blue-500
                      disabled:opacity-50
                    "
                  />
                </div>
                {/* PREVIEW */}
                {amount &&
                  Number(amount) > 0 && (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">
                          Current Credits
                        </span>
                        <span className="font-medium text-white">
                          {selectedCustomer.balance.toFixed(
                            2
                          )}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm">
                        <span className="text-slate-500">
                          {refundMode
                            ? "Refund Amount"
                            : "Credits to Add"}
                        </span>
                        <span className="font-medium text-blue-400">
                          +
                          {Number(
                            amount
                          ).toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-3 border-t border-slate-800 pt-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-300">
                            New Balance
                          </span>
                          <span className="text-xl font-bold text-white">
                            {(
                              selectedCustomer.balance +
                              Number(
                                amount
                              )
                            ).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                {/* SUCCESS */}
                {successMessage && (
                  <div className="flex gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                    <CheckCircle2
                      size={19}
                      className="mt-0.5 shrink-0 text-green-400"
                    />
                    <p className="text-sm text-green-300">
                      {
                        successMessage
                      }
                    </p>
                  </div>
                )}
                {/* ERROR */}
                {errorMessage && (
                  <div className="flex gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    <AlertCircle
                      size={19}
                      className="mt-0.5 shrink-0 text-red-400"
                    />
                    <p className="text-sm text-red-300">
                      {
                        errorMessage
                      }
                    </p>
                  </div>
                )}
                {/* ADD / AUTHORIZE BUTTON */}
                <button
                  type="button"
                  onClick={
                    handleAddCredits
                  }
                  disabled={
                    adding ||
                    !amount ||
                    Number(amount) <= 0
                  }
                  className="
                    flex
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    bg-blue-600
                    px-5
                    py-3.5
                    font-semibold
                    text-white
                    transition
                    hover:bg-blue-500
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  {adding ? (
                    <>
                      <Loader2
                        size={18}
                        className="animate-spin"
                      />
                      {refundMode
                        ? "Authorizing Refund..."
                        : "Adding Credits..."}
                    </>
                  ) : refundMode ? (
                    <>
                      <CheckCircle2
                        size={18}
                      />
                      Authorize Refund
                    </>
                  ) : (
                    <>
                      <Plus
                        size={18}
                      />
                      Add Credits
                    </>
                  )}
                </button>
                <p className="text-center text-xs leading-5 text-slate-600">
                  {refundMode
                    ? "This refund will be recorded in the customer's wallet transaction history and linked to this request."
                    : "This action will be recorded in the customer's wallet transaction history."}
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}