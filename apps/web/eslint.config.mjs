import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// eslint-config-next already includes jsx-a11y; we only configure additional rules below.

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Intentionally unused declarations and parameters may be prefixed
      // with an underscore (e.g. `_target` in a Proxy trap, `_exhaustive`
      // in a `never` exhaustiveness check).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Ban raw console.log / console.debug in application code.
      // Use the structured logger from @/lib/logger instead so all logs
      // are consistently formatted and can be routed to observability
      // tooling. console.error / console.warn are temporarily allowed
      // (error and warn levels only); migrate call sites to logger
      // incrementally.
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
  // Accessibility: enforce ARIA attributes and semantic HTML on JSX files
  // only. The jsx-a11y plugin reaches these rules through eslint-config-next,
  // which registers it for component files; declaring them without that
  // files scope made eslint abort repo-wide ("could not find plugin
  // jsx-a11y") as soon as a stray .cjs/.mjs file existed at the root.
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], minLength: 2 }],
      "jsx-a11y/anchor-has-content": "warn",
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/heading-has-content": "warn",
      "jsx-a11y/no-autofocus": "off", // Next.js apps often need programmatic focus
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
    },
  },
  // Override for the logger implementation — it must use console.*.
  {
    files: ["src/lib/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    // Agent tooling and imported scratch artifacts are not project source.
    ".claude/**",
    ".cloud-attachments/**",
    ".freebuff/**",
  ]),
]);

export default eslintConfig;
