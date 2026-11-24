import { describe, it, expect } from "vitest";
import type {
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  ADMIN_PAGE_DEFAULT,
  ADMIN_PAGE_MAX,
  InvalidAdminPageParamError,
  encodeCursor,
  parseAdminPageParams,
  toAdminPage,
} from "./adminPagination";

const url = (search = "") =>
  new URL(`https://shipin.test/api/admin/requests${search}`);

const snap = (id: string, createdAtMs: number) =>
  ({
    id,
    get: (field: string) =>
      field === "createdAt" ? { toMillis: () => createdAtMs } : undefined,
  }) as unknown as QueryDocumentSnapshot<DocumentData>;

describe("parseAdminPageParams", () => {
  it("defaults the limit when no query is present", () => {
    expect(parseAdminPageParams(url())).toEqual({
      limit: ADMIN_PAGE_DEFAULT,
      cursorMs: null,
    });
  });

  it("clamps an over-large limit to the page maximum", () => {
    expect(parseAdminPageParams(url("?limit=100000")).limit).toBe(
      ADMIN_PAGE_MAX
    );
  });

  it.each(["0", "-5", "12.5", "abc"])("rejects a limit of %s", (raw) => {
    expect(() => parseAdminPageParams(url(`?limit=${raw}`))).toThrow(
      InvalidAdminPageParamError
    );
  });

  it("round-trips a cursor", () => {
    const cursor = encodeCursor(1_700_000_000_000);
    expect(parseAdminPageParams(url(`?cursor=${cursor}`))).toEqual({
      limit: ADMIN_PAGE_DEFAULT,
      cursorMs: 1_700_000_000_000,
    });
  });

  it.each(["not-a-cursor", "eyJ0Ijo", "eyJ0IjoiNjQifQ", "eyJ0IjotMX0"])(
    "rejects a cursor of %s",
    (raw) => {
      expect(() => parseAdminPageParams(url(`?cursor=${raw}`))).toThrow(
        InvalidAdminPageParamError
      );
    }
  );
});

describe("toAdminPage", () => {
  it("marks a full page as having more and carries the cursor", () => {
    const page = toAdminPage(
      [snap("a", 1_000), snap("b", 2_000)],
      2,
      (d) => d.id
    );

    expect(page.items).toEqual(["a", "b"]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(encodeCursor(2_000));
  });

  it("marks a short page as the last one", () => {
    const page = toAdminPage([snap("a", 1_000)], 2, (d) => d.id);

    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
