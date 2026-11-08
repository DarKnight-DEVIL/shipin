/// <reference types="vite/client" />

// Augment vitest matchers for @testing-library/jest-dom
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): void;
    toBeVisible(): void;
    toBeDisabled(): void;
    toBeEnabled(): void;
    toHaveTextContent(text: string | RegExp): void;
    toHaveValue(value: string | string[] | RegExp): void;
    toHaveAttribute(attr: string, value?: string): void;
    toHaveClass(...classNames: string[]): void;
    toHaveFocus(): void;
    toBeChecked(): void;
    toBeEmpty(): void;
    toBeInvalid(): void;
    toBeRequired(): void;
    toBeValid(): void;
    toHaveStyle(styles: Record<string, string | number>): void;
    toContainHTML(html: string): void;
    toContainText(text: string | string[]): void;
    toHaveCount(count: number): void;
    toHaveDisplayValue(value: string | string[]): void;
    toHaveFormValues(values: Record<string, unknown>): void;
    toHaveRole(role: string, options?: Record<string, unknown>): void;
    toHaveTitle(title: string | RegExp): void;
    toHaveURL(url: string | RegExp, options?: Record<string, unknown>): void;
  }
}