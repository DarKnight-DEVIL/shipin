import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  emailSchema,
  whatsappPhoneSchema,
  moneySchema,
  idSchema,
  messageSchema,
  paymentTypeSchema,
  refundMethodSchema,
  requestStatusBodySchema,
  sendEmailBodySchema,
  captureOrderBodySchema,
  createOrderBodySchema,
  validateBody,
  readAndValidateBody,
  mfaSessionBodySchema,
  shipmentBodySchema,
  totpCodeSchema,
  consentBodySchema,
} from "@/lib/validation";

describe("emailSchema", () => {
  it("accepts valid emails", () => {
    expect(emailSchema.safeParse("user@example.com").success).toBe(true);
    expect(emailSchema.safeParse("first.last+tag@sub.example.co").success).toBe(
      true
    );
    expect(emailSchema.safeParse("  spaced@ex.com  ").success).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(emailSchema.safeParse("").success).toBe(false);
    expect(emailSchema.safeParse("no-at-sign.com").success).toBe(false);
    expect(emailSchema.safeParse("user@").success).toBe(false);
    expect(emailSchema.safeParse("@example.com").success).toBe(false);
    expect(emailSchema.safeParse("user@.com").success).toBe(false);
    expect(
      emailSchema.safeParse("a".repeat(256) + "@example.com").success
    ).toBe(false);
    expect(emailSchema.safeParse("user@@example.com").success).toBe(false);
  });
});

describe("whatsappPhoneSchema", () => {
  it("strips non-digits and accepts valid phone numbers", () => {
    const parsed = whatsappPhoneSchema.safeParse("+1 (555) 123-4567");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("15551234567");
  });

  it("rejects too short / too long numbers", () => {
    expect(whatsappPhoneSchema.safeParse("12345").success).toBe(false);
    expect(whatsappPhoneSchema.safeParse("1".repeat(16)).success).toBe(false);
    expect(whatsappPhoneSchema.safeParse("").success).toBe(false);
  });
});

describe("messageSchema", () => {
  it("trims and bounds length", () => {
    expect(messageSchema.safeParse("   hello   ").success).toBe(true);
    expect(messageSchema.safeParse("x".repeat(2001)).success).toBe(false);
    expect(messageSchema.safeParse("   ").success).toBe(false);
  });
});

describe("enum schemas", () => {
  it("paymentTypeSchema is a closed set", () => {
    expect(paymentTypeSchema.safeParse("main").success).toBe(true);
    expect(paymentTypeSchema.safeParse("additional_item").success).toBe(true);
    expect(paymentTypeSchema.safeParse("admin").success).toBe(false);
  });

  it("refundMethodSchema is a closed set", () => {
    expect(refundMethodSchema.safeParse("wallet").success).toBe(true);
    expect(refundMethodSchema.safeParse("paypal").success).toBe(true);
    expect(refundMethodSchema.safeParse("bitcoin").success).toBe(false);
  });

  it("requestStatusBodySchema is a closed set", () => {
    // The status is validated inside the PATCH body, not as a bare string.
    expect(
      requestStatusBodySchema.safeParse({ status: "submitted" }).success
    ).toBe(true);
    expect(requestStatusBodySchema.safeParse({ status: "magic" }).success).toBe(
      false
    );
    expect(requestStatusBodySchema.safeParse("submitted").success).toBe(false);
  });
});

describe("body schemas", () => {
  it("sendEmailBodySchema requires a valid email", () => {
    const ok = sendEmailBodySchema.safeParse({
      email: "a@b.co",
      type: "quote",
    });
    expect(ok.success).toBe(true);
    const bad = sendEmailBodySchema.safeParse({ email: "nope" });
    expect(bad.success).toBe(false);
  });

  it("captureOrderBodySchema validates all payment fields", () => {
    const ok = captureOrderBodySchema.safeParse({
      requestId: "req_1",
      orderID: "ORDER123",
      amount: 42.5,
    });
    expect(ok.success).toBe(true);

    const missingOrderId = captureOrderBodySchema.safeParse({
      requestId: "req_1",
      amount: 42.5,
    });
    expect(missingOrderId.success).toBe(false);

    const badAmount = captureOrderBodySchema.safeParse({
      requestId: "req_1",
      orderID: "ORDER123",
      amount: -1,
    });
    expect(badAmount.success).toBe(false);
  });

  it("createOrderBodySchema applies default paymentType", () => {
    const parsed = createOrderBodySchema.safeParse({
      requestId: "req_1",
      amount: 10,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.paymentType).toBe("main");
  });
});

describe("validateBody", () => {
  it("returns success with typed data", () => {
    const result = validateBody(
      { requestId: "abc", amount: 5 },
      createOrderBodySchema
    );
    expect(result.success).toBe(true);
  });

  it("returns structured errors on failure", () => {
    const result = validateBody(
      { amount: "not-a-number" },
      createOrderBodySchema
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty("message");
    }
  });

  it("rejects non-object input", () => {
    const result = validateBody(null, createOrderBodySchema);
    expect(result.success).toBe(false);
    const result2 = validateBody("string", createOrderBodySchema);
    expect(result2.success).toBe(false);
  });
});

describe("moneySchema", () => {
  it("accepts positive finite amounts with max 2 decimals", () => {
    expect(moneySchema.safeParse(10).success).toBe(true);
    expect(moneySchema.safeParse(0.01).success).toBe(true);
    expect(moneySchema.safeParse(999999999).success).toBe(true);
  });

  it("rejects a third decimal instead of rounding it away", () => {
    /*
     * The guard is a validator, not a rounder: 10.005 must fail, not become 10.01. A
     * schema that silently repaired an amount would charge a customer something they
     * never asked for, and the caller would never learn it happened.
     */
    expect(moneySchema.safeParse(10.005).success).toBe(false);
    expect(moneySchema.safeParse(1.005).success).toBe(false);
    expect(moneySchema.safeParse(0.001).success).toBe(false);
    expect(moneySchema.safeParse(0.009).success).toBe(false);
  });

  it("accepts the two-decimal amounts floats represent imprecisely", () => {
    // 4.35 and 0.07 are not exact in binary; a naive `n * 100 % 1 === 0` check would
    // reject real prices, which is the failure that strands a customer at checkout.
    for (const amount of [4.35, 0.07, 0.29, 1.1, 19.99, 1234.56, 0.01]) {
      expect(moneySchema.safeParse(amount).success).toBe(true);
    }
  });

  it("rejects a float that arrived as the result of arithmetic", () => {
    // 0.1 + 0.2 is 0.30000000000000004: the client should be sending minor units, and
    // accepting this would carry the drift into the ledger.
    expect(moneySchema.safeParse(0.1 + 0.2).success).toBe(false);
  });

  it("holds at both ends of the range", () => {
    expect(moneySchema.safeParse(0.01).success).toBe(true);
    expect(moneySchema.safeParse(999999999).success).toBe(true);
    // Two decimals still work where the float step is coarse (ulp ~1.2e-7 here).
    expect(moneySchema.safeParse(999999998.99).success).toBe(true);
    expect(moneySchema.safeParse(999999998.995).success).toBe(false);
    // And the cap is the cap: a fraction above it is refused for its size, not its
    // precision.
    expect(moneySchema.safeParse(999999999.01).success).toBe(false);
  });

  it("rejects invalid amounts", () => {
    expect(moneySchema.safeParse(0).success).toBe(false);
    expect(moneySchema.safeParse(-5).success).toBe(false);
    expect(moneySchema.safeParse(NaN).success).toBe(false);
    expect(moneySchema.safeParse(Infinity).success).toBe(false);
    expect(moneySchema.safeParse(10.123).success).toBe(false);
    expect(moneySchema.safeParse(1000000000).success).toBe(false);
  });
});

describe("idSchema", () => {
  it("accepts safe document IDs", () => {
    expect(idSchema.safeParse("abc-123_XYZ").success).toBe(true);
  });

  it("rejects dangerous or oversized IDs (prevents path/selector injection)", () => {
    expect(idSchema.safeParse("a/b").success).toBe(false);
    expect(idSchema.safeParse("a..b").success).toBe(false);
    expect(idSchema.safeParse("").success).toBe(false);
    expect(idSchema.safeParse("x".repeat(65)).success).toBe(false);
    expect(idSchema.safeParse("id; delete from users").success).toBe(false);
  });
});

describe("readAndValidateBody", () => {
  const jsonRequest = (payload: unknown) =>
    new Request("http://localhost/api/test", {
      method: "POST",
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });

  const schema = z.object({ amount: moneySchema });

  it("returns the parsed data for a valid body", async () => {
    const parsed = await readAndValidateBody(
      jsonRequest({ amount: 10 }),
      schema
    );

    expect(parsed).toEqual({ success: true, data: { amount: 10 } });
  });

  it("reports an unreadable body as a parse failure", async () => {
    const parsed = await readAndValidateBody(jsonRequest("{nope"), schema);

    expect(parsed).toEqual({
      success: false,
      reason: "parse",
      error: "Invalid JSON body.",
    });
  });

  it("reports a schema failure distinctly from a parse failure", async () => {
    const parsed = await readAndValidateBody(
      jsonRequest({ amount: -1 }),
      schema
    );

    const expectedIssue = schema.safeParse({ amount: -1 });

    expect(parsed).toEqual({
      success: false,
      reason: "schema",
      error: "Invalid request body.",
      // The first issue, verbatim, for routes that talk to a human.
      message: expectedIssue.success ? undefined : expectedIssue.error.issues[0]
        .message,
    });
  });
});

describe("route body schemas added for §2.7", () => {
  it("accepts a backup code in the MFA session body", () => {
    expect(
      mfaSessionBodySchema.safeParse({
        method: "backup",
        code: "ABCD-EFGH-IJKL-MNOP",
      }).success
    ).toBe(true);
  });

  it("strips spaces from a TOTP code and rejects anything else", () => {
    expect(totpCodeSchema.safeParse("123 456").success).toBe(true);
    expect(totpCodeSchema.safeParse("12345").success).toBe(false);
    expect(totpCodeSchema.safeParse("abcdef").success).toBe(false);
  });

  it("keeps the shipment createdAt as an opaque passthrough", () => {
    const parsed = shipmentBodySchema.safeParse({
      carrier: "DHL",
      trackingNumber: "ABC123",
      createdAt: { seconds: 1, nanoseconds: 0 },
    });

    expect(parsed.success).toBe(true);
  });

  it("defaults the consent method to explicit", () => {
    const parsed = consentBodySchema.safeParse({
      category: "marketing",
      granted: true,
      version: "v2",
    });

    expect(parsed).toMatchObject({
      success: true,
      data: { method: "explicit" },
    });
  });
});
