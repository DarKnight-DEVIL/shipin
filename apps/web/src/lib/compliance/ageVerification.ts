/**
 * DPDP Act 2023 - Age Verification & Children's Data (Sec 9) - Core
 */

export function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function isChild(dateOfBirth?: string): boolean {
  if (!dateOfBirth) return false;
  return calculateAge(dateOfBirth) < 18;
}