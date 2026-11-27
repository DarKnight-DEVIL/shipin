/**
 * DPDP Act 2023 - Age Verification & Children's Data (Sec 9) - Core
 */

export function calculateAge(dateOfBirth: string): number {
  // Compare calendar dates in UTC rather than Date objects: `new Date(
  // 'YYYY-MM-DD')` parses as UTC midnight while `new Date()` is server-local,
  // so a customer one day either side of their 18th birthday could flip with
  // the deployment region's timezone.
  const [birthYear, birthMonth, birthDay] = dateOfBirth
    .slice(0, 10)
    .split("-")
    .map(Number);
  const [todayYear, todayMonth, todayDay] = new Date()
    .toISOString()
    .slice(0, 10)
    .split("-")
    .map(Number);

  let age = todayYear - birthYear;
  if (
    todayMonth < birthMonth ||
    (todayMonth === birthMonth && todayDay < birthDay)
  ) {
    age -= 1;
  }
  return age;
}

export function isChild(dateOfBirth?: string): boolean {
  if (!dateOfBirth) return false;
  return calculateAge(dateOfBirth) < 18;
}
