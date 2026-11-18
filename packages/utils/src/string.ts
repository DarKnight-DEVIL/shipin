export const slugify = (str: string): string => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const truncate = (
  str: string,
  length: number,
  suffix = "..."
): string => {
  if (str.length <= length) return str;
  return str.slice(0, length - suffix.length) + suffix;
};

export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const titleCase = (str: string): string => {
  return str
    .split(" ")
    .map((word) => capitalize(word))
    .join(" ");
};

/**
 * A random identifier, optionally prefixed (`usr_`, `ord_`, …).
 *
 * Backed by `crypto.randomUUID()`: v4 UUIDs come from the platform CSPRNG.
 * `Math.random()` is not a CSPRNG and is seeded predictably enough that ids
 * built from it can be guessed, which makes them unfit for anything an attacker
 * might probe — lookups, tokens, filenames — and the prefix argument invites
 * exactly that kind of use. Reach for `randomUUID()` directly when a prefix is
 * not needed.
 */
export const generateId = (prefix = ""): string => {
  return `${prefix}${crypto.randomUUID()}`;
};

export const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local}@${domain}`;
  return `${local[0]}${"".padEnd(local.length - 2, "*")}${local[local.length - 1]}@${domain}`;
};

export const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
};
