/**
 * DPDP Act 2023 Compliance Utilities - Core Types & Register
 * 
 * Digital Personal Data Protection Act 2023 (India) compliance helpers.
 */

/**
 * Categories of personal data processed by ShipIN
 * Used for ROPA (Record of Processing Activities) and consent granularity
 */
export const PERSONAL_DATA_CATEGORIES = {
  ACCOUNT: 'account',
  SHIPPING: 'shipping',
  ORDER: 'order',
  PAYMENT: 'payment',
  SUPPORT: 'support',
  AUTH: 'auth',
  ANALYTICS: 'analytics',
  MARKETING: 'marketing',
  COOKIE: 'cookie',
} as const;

export type PersonalDataCategory = typeof PERSONAL_DATA_CATEGORIES[keyof typeof PERSONAL_DATA_CATEGORIES];

/**
 * Lawful bases under DPDP Act Sec 4-7
 */
export const LAWFUL_BASES = {
  CONSENT: 'consent',
  CONTRACT: 'contract',
  LEGAL_OBLIGATION: 'legal_obligation',
  VITAL_INTERESTS: 'vital_interests',
  PUBLIC_TASK: 'public_task',
  LEGITIMATE_INTERESTS: 'legitimate_interests',
} as const;

export type LawfulBasis = typeof LAWFUL_BASES[keyof typeof LAWFUL_BASES];

/**
 * Mapping of data categories to lawful bases and retention periods
 * This constitutes the ROPA (Record of Processing Activities) core
 */
export const PROCESSING_REGISTER: Record<PersonalDataCategory, {
  lawfulBasis: LawfulBasis;
  purposes: string[];
  retentionPeriod: string;
  retentionDays: number;
  thirdParties: string[];
  crossBorder: boolean;
  safeguards: string[];
}> = {
  [PERSONAL_DATA_CATEGORIES.ACCOUNT]: {
    lawfulBasis: LAWFUL_BASES.CONTRACT,
    purposes: ['Authentication', 'Profile management', 'Communication'],
    retentionPeriod: 'Account lifetime + 2 years after deletion request',
    retentionDays: 365 * 2,
    thirdParties: ['Firebase Auth', 'Firebase Firestore'],
    crossBorder: true,
    safeguards: ['Firebase SCCs', 'Encryption at rest', 'Encryption in transit'],
  },
  [PERSONAL_DATA_CATEGORIES.SHIPPING]: {
    lawfulBasis: LAWFUL_BASES.CONTRACT,
    purposes: ['Order fulfillment', 'Customs clearance', 'Delivery coordination'],
    retentionPeriod: '7 years (tax/customs compliance)',
    retentionDays: 365 * 7,
    thirdParties: ['Carriers', 'Customs authorities', 'Firebase Firestore'],
    crossBorder: true,
    safeguards: ['Firebase SCCs', 'Carrier DPAs', 'Minimal data sharing'],
  },
  [PERSONAL_DATA_CATEGORIES.ORDER]: {
    lawfulBasis: LAWFUL_BASES.CONTRACT,
    purposes: ['Procurement', 'Inspection', 'Consolidation', 'Freight forwarding'],
    retentionPeriod: '7 years (tax/commercial records)',
    retentionDays: 365 * 7,
    thirdParties: ['Indian retailers', 'Firebase Firestore'],
    crossBorder: true,
    safeguards: ['Firebase SCCs', 'Minimal data sharing'],
  },
  [PERSONAL_DATA_CATEGORIES.PAYMENT]: {
    lawfulBasis: LAWFUL_BASES.CONTRACT,
    purposes: ['Payment processing', 'Refunds', 'Wallet management', 'Reconciliation'],
    retentionPeriod: '7 years (tax/financial regulations)',
    retentionDays: 365 * 7,
    thirdParties: ['PayPal', 'Firebase Firestore'],
    crossBorder: true,
    safeguards: ['PayPal PCI-DSS', 'Firebase SCCs', 'No card data stored'],
  },
  [PERSONAL_DATA_CATEGORIES.SUPPORT]: {
    lawfulBasis: LAWFUL_BASES.CONTRACT,
    purposes: ['Customer support', 'Dispute resolution', 'Quality improvement'],
    retentionPeriod: '3 years after ticket closure',
    retentionDays: 365 * 3,
    thirdParties: ['Firebase Firestore', 'WhatsApp Business API (opt-in)'],
    crossBorder: true,
    safeguards: ['Firebase SCCs', 'WhatsApp DPAs'],
  },
  [PERSONAL_DATA_CATEGORIES.AUTH]: {
    lawfulBasis: LAWFUL_BASES.CONSENT,
    purposes: ['Multi-factor authentication', 'Account security', 'Fraud prevention'],
    retentionPeriod: 'Account lifetime + 90 days after revocation',
    retentionDays: 90,
    thirdParties: ['Firebase Auth', 'Firebase Firestore'],
    crossBorder: true,
    safeguards: ['Hashed storage (TOTP, backup codes)', 'Firebase SCCs', 'WebAuthn credentials'],
  },
  [PERSONAL_DATA_CATEGORIES.ANALYTICS]: {
    lawfulBasis: LAWFUL_BASES.LEGITIMATE_INTERESTS,
    purposes: ['Service improvement', 'Performance monitoring', 'Usage analytics'],
    retentionPeriod: '26 months (Vercel default)',
    retentionDays: 30 * 26,
    thirdParties: ['Vercel Analytics', 'Vercel Speed Insights'],
    crossBorder: true,
    safeguards: ['Anonymized data', 'No PII', 'Vercel DPAs'],
  },
  [PERSONAL_DATA_CATEGORIES.MARKETING]: {
    lawfulBasis: LAWFUL_BASES.CONSENT,
    purposes: ['Promotional communications', 'Product updates', 'Offers'],
    retentionPeriod: 'Until consent withdrawn',
    retentionDays: 0,
    thirdParties: ['Email provider (Gmail SMTP)'],
    crossBorder: true,
    safeguards: ['Explicit opt-in', 'Easy unsubscribe', 'Firebase SCCs'],
  },
  [PERSONAL_DATA_CATEGORIES.COOKIE]: {
    lawfulBasis: LAWFUL_BASES.LEGITIMATE_INTERESTS,
    purposes: ['CSRF protection', 'Session security'],
    retentionPeriod: 'Session + 24 hours',
    retentionDays: 1,
    thirdParties: [],
    crossBorder: false,
    safeguards: ['HttpOnly', 'Secure', 'SameSite=Strict', 'No tracking'],
  },
};

/**
 * Data Subject Rights under DPDP Act Sec 11-14
 */
export const DATA_SUBJECT_RIGHTS = {
  ACCESS: 'access',
  CORRECTION: 'correction',
  ERASURE: 'erasure',
  PORTABILITY: 'portability',
  GRIEVANCE: 'grievance',
  NOMINEE: 'nominee',
} as const;

export type DataSubjectRight = typeof DATA_SUBJECT_RIGHTS[keyof typeof DATA_SUBJECT_RIGHTS];