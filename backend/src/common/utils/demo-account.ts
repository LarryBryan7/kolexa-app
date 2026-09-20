export const DEMO_EMAIL_DOMAIN = '@demo.kolexa.app';
export const DEMO_SCHOOL_EMAIL = `colegio${DEMO_EMAIL_DOMAIN}`;
export const DEMO_PASSWORD = 'Demo1234';

export function isDemoEmail(email?: string | null): boolean {
  return !!email && email.toLowerCase().endsWith(DEMO_EMAIL_DOMAIN);
}
