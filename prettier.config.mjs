/**
 * Prettier settings for this repo.
 *
 * There is no single config that reproduces the hand-wrapped style already in
 * `src/` (some files break a call into one argument per line, some mix quote
 * styles inside the same import block), so these settings are the closest fit
 * measured against the code that exists: at `printWidth: 80` a reformat touches
 * ~10.9k lines, versus ~11.3k at 100 and ~20k at 120. Everything else is
 * Prettier's default because that is what the code already does.
 *
 * `endOfLine: "auto"` is deliberate: the working tree holds a mix of LF and
 * CRLF files (no .gitattributes, `core.autocrlf=true`), and pinning "lf" would
 * rewrite half of them for no reason.
 */
const config = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  // Double quotes are the majority: 1727 import lines versus 954.
  singleQuote: false,
  jsxSingleQuote: false,
  // The repo never writes a trailing comma after the last function argument.
  trailingComma: "es5",
  bracketSpacing: true,
  bracketSameLine: false,
  // Arrow parameters are parenthesised nearly everywhere (5668 versus 31).
  arrowParens: "always",
  endOfLine: "auto",
};

export default config;
