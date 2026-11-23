/**
 * Country options for the address form.
 *
 * These used to come from `country-state-city` (GPL-3.0), whose dataset shipped
 * inside this form's client bundle — a copyleft distribution obligation for a
 * list of country names. The names now come from `react-phone-number-input`'s
 * English labels (MIT), a package this form already ships for its phone field,
 * so the list costs neither a new dependency nor a new download: it is the same
 * data the phone picker next to it already renders.
 *
 * Only the country list is replaced. The old package also offered states and
 * cities, and nothing in this repo used them — the state field is free text
 * (`AddressForm`), and no city picker exists.
 */

import labels from "react-phone-number-input/locale/en";

/**
 * Keys that are not destinations: the locale object's own UI strings, and
 * libphonenumber's pseudo-regions (`XA`/`XO` localisation testing, `ZZ`
 * unknown), which are placeholders rather than places.
 */
const NOT_COUNTRIES = new Set(["ext", "country", "phone", "XA", "XO", "ZZ"]);

export interface CountryOption {
  /** ISO 3166-1 alpha-2 code — the value stored on the address. */
  value: string;
  name: string;
  /** Flag emoji + name, so the select needs no image assets. */
  label: string;
}

/**
 * Flag emoji from the ISO code, per Unicode's regional-indicator scheme: no
 * table to keep in sync and nothing to download.
 */
function flagEmoji(isoCode: string): string {
  return isoCode.replace(/./g, (letter) =>
    String.fromCodePoint(127397 + letter.toUpperCase().charCodeAt(0))
  );
}

export const COUNTRIES: CountryOption[] = Object.entries(
  labels as Record<string, string>
)
  .filter(([code]) => !NOT_COUNTRIES.has(code))
  .map(([code, name]) => ({
    value: code,
    name,
    label: `${flagEmoji(code)}  ${name}`,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
