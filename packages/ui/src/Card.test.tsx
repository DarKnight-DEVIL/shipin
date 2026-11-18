// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./Card";

afterEach(cleanup);

describe("Card", () => {
  it("applies the padding shorthand", () => {
    const { container, rerender } = render(<Card>Body</Card>);
    expect(container.firstElementChild?.className).toContain("p-6");

    rerender(<Card padding="none">Body</Card>);
    expect(container.firstElementChild?.className).not.toContain("p-6");
    expect(container.firstElementChild?.className).not.toContain("p-4");
  });

  it("applies the variant classes", () => {
    const { container } = render(<Card variant="elevated">Body</Card>);

    expect(container.firstElementChild?.className).toContain("shadow-lg");
  });

  it("composes with its sections", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Order #42</CardTitle>
          <CardDescription>Placed yesterday</CardDescription>
        </CardHeader>
        <CardContent>Two items</CardContent>
        <CardFooter>Total $10.00</CardFooter>
      </Card>
    );

    expect(screen.getByRole("heading", { name: "Order #42" })).toBeTruthy();
    expect(screen.getByText("Placed yesterday")).toBeTruthy();
    expect(screen.getByText("Two items")).toBeTruthy();
    expect(screen.getByText("Total $10.00")).toBeTruthy();
  });
});
