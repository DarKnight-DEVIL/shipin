import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
