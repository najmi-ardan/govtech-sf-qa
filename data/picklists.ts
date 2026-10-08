/**
 * Ordered picklist preferences. The form selects the first value the org offers.
 * Lead Status on a new Developer Edition is often "Open - Not Contacted", not "Unqualified".
 */
import { config } from '../config/env';

export const SALUTATIONS = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'];

export const LEAD_SOURCES = ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other'];

export const INDUSTRIES = ['Technology', 'Banking', 'Consulting', 'Education', 'Government', 'Healthcare', 'Manufacturing', 'Retail'];

export const RATINGS = ['Hot', 'Warm', 'Cold'];

export const LEAD_STATUS = {
  initial: ['Open - Not Contacted', 'New'],
  updated: ['Working - Contacted', 'Working'],
};

/** Stage name configured for an Opportunity created by conversion. */
export const DEFAULT_OPPORTUNITY_STAGE = config.opportunityStage;
