/**
 * Password policy — shared by the client form and the server route that
 * actually changes the password.
 *
 * The browser check is a courtesy so the user sees the problem immediately; the
 * authoritative check runs in `POST /api/user/password`, which is the only path
 * the app uses to change a password. Identity Platform's own password policy
 * remains the final backstop.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

/** Common passwords that pass the shape rules but are trivially guessable. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "qwerty123",
  "letmein1",
  "welcome1",
  "admin123",
]);

export function validatePassword(
  password: string,
  context: { email?: string | null } = {}
): PasswordPolicyResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  }

  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    errors.push("Include at least one letter and one number.");
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("That password is too common.");
  }

  const emailLocalPart = context.email?.split("@")[0]?.trim().toLowerCase();
  if (
    emailLocalPart &&
    emailLocalPart.length >= 3 &&
    password.toLowerCase().includes(emailLocalPart)
  ) {
    errors.push("Do not reuse your email address in the password.");
  }

  return { valid: errors.length === 0, errors };
}
