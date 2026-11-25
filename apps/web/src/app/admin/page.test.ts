import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.fn();

vi.mock("next/navigation", () => ({ redirect }));

describe("/admin", () => {
  beforeEach(() => {
    redirect.mockReset();
  });

  it("sends the bare admin path to the dashboard", async () => {
    // The admin layout renders its sidebar around whatever the page returns, so
    // a missing page looked like a working screen with a 404 body and logged a
    // failed document request on every visit.
    const { default: AdminIndexPage } = await import("./page");

    AdminIndexPage();

    expect(redirect).toHaveBeenCalledWith("/admin/dashboard");
  });
});
