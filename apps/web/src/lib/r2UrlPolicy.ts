/**
 * How long a presigned R2 URL stays valid, per purpose.
 *
 * One number for every object was wrong in both directions. A warehouse reviewer
 * opens an inspection gallery and works through it, so 15 minutes could expire under
 * them mid-review; a shipping label is fetched once and used immediately, so an hour
 * of validity is only extra exposure for a document that contains an address.
 *
 * The purpose is DERIVED FROM THE OBJECT KEY, never taken from the request. A caller
 * that could ask for a longer lifetime would just ask for one, which would make this
 * table decorative.
 *
 * Both purposes are tunable without a deploy: `R2_INSPECTION_URL_TTL_SECONDS` and
 * `R2_LABEL_URL_TTL_SECONDS`. Values outside the range SigV4 allows are ignored in
 * favour of the default rather than failing the request - a typo in an environment
 * variable should not blank the gallery.
 */

export type R2UrlPurpose = "inspection" | "shippingLabel";

/** Warehouse review spans minutes, so the default allows for a full pass. */
const DEFAULT_TTL_SECONDS: Record<R2UrlPurpose, number> = {
  inspection: 60 * 60,
  shippingLabel: 15 * 60,
};

const ENV_VAR: Record<R2UrlPurpose, string> = {
  inspection: "R2_INSPECTION_URL_TTL_SECONDS",
  shippingLabel: "R2_LABEL_URL_TTL_SECONDS",
};

/** SigV4 presigned GETs cannot outlive seven days. */
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Key prefix → purpose. Anything else is not served by this app. */
const PREFIX_PURPOSE: ReadonlyArray<readonly [string, R2UrlPurpose]> = [
  ["inspection/", "inspection"],
  ["labels/", "shippingLabel"],
];

/** The purpose an object key belongs to, or null when the prefix is unknown. */
export function purposeForKey(key: string): R2UrlPurpose | null {
  for (const [prefix, purpose] of PREFIX_PURPOSE) {
    if (key.startsWith(prefix)) return purpose;
  }

  return null;
}

export function r2UrlTtlSeconds(
  purpose: R2UrlPurpose,
  env: Record<string, string | undefined> = process.env
): number {
  const configured = Number(env[ENV_VAR[purpose]]);

  if (
    !Number.isFinite(configured) ||
    configured < MIN_TTL_SECONDS ||
    configured > MAX_TTL_SECONDS
  ) {
    return DEFAULT_TTL_SECONDS[purpose];
  }

  return Math.floor(configured);
}

/** The variable that controls a purpose, for messages and docs. */
export function r2UrlTtlEnvVar(purpose: R2UrlPurpose): string {
  return ENV_VAR[purpose];
}

export function r2UrlDefaultTtlSeconds(purpose: R2UrlPurpose): number {
  return DEFAULT_TTL_SECONDS[purpose];
}
