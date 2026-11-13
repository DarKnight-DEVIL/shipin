/**
 * DPDP Act 2023 - Data Subject Rights Management (Core Types)
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

/**
 * Response deadlines per DPDP Act (in days)
 */
export const RIGHTS_DEADLINES: Record<DataSubjectRight, number> = {
  access: 30,
  correction: 30,
  erasure: 30,
  portability: 30,
  grievance: 30,
  nominee: 30,
};

export interface RightsRequest {
  id: string;
  userId: string;
  right: DataSubjectRight;
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'on_hold';
  details?: string;
  response?: string;
  responseDeadline?: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  assignedTo?: string;
}