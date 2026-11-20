export interface PaymentFailure {
  /**
   * Literal `false` (or absent) so a `PaymentFailure` stays out of the success
   * arm of every `{ ok: true, ... } | PaymentFailure` union: `if (!result.ok)`
   * must narrow to the failure, which `ok?: boolean` prevented.
   */
  ok?: false;
  error: string;
  status: number;
  code?: string;
}

export type PaymentType = "main" | "additional_item";

export interface AdditionalItemPayment {
  requestId: string;
  orderID: string;
  additionalItemRequestId: string;
  paymentType: PaymentType;
  paypalAmount: number;
  userId: string;
}

export interface MainPayment {
  requestId: string;
  orderID: string;
  paymentType: PaymentType;
  paypalAmount: number;
  userId: string;
}
