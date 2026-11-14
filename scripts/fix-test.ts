import { describe, it, expect, vi, beforeEach } from 'vitest';

import { calculateAge, isChild } from './ageVerification';
import { hasLegalHold, shouldHardDelete, getCollectionsForCategory } from './retentionCore';
import { recordBreach, updateBreach, getBreach, getAllBreaches, getActiveBreaches } from './breach';
import { logRightsRequest, getUserRightsRequests, updateRightsRequest, getPendingRightsRequests, getAllRightsRequests } from './rightsOps2';
import { logConsent, getUserConsentState, updateUserConsent, getConsentLog, getGrantedCategories, hasValidConsent, withdrawConsent } from './consent';
import { verifyParentalConsent, verifyParentalConsentOTP, hasParentalConsent, enforceAgeGate } from './ageOps';