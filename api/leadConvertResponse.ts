import { expect } from '@playwright/test';
import type { AuraRequestAction, AuraResponseAction } from '../utils/aura';
import type { CapturedCall, ObservedAuraPost } from '../utils/networkRecorder';
import { isValid18CharId, KEY_PREFIX } from '../utils/salesforceId';

/**
 * Assertions on the Aura convertLeadServer call.
 * returnValue carries accountId, contactId, and opportunityId.
 * Stage is not in this payload. It is checked on the Opportunity.
 */

export const CONVERT_DESCRIPTOR =
  'serviceComponent://ui.lead.runtime.components.controllers.LeadConvertDesktopController/ACTION$convertLeadServer';

export interface ConvertReturnValue {
  accountId: string;
  contactId: string;
  opportunityId: string;
  isPersonAccount: boolean;
  hasError: boolean;
}

export interface ConvertExpectations {
  leadId: string;
  opportunityId: string;
  accountId: string;
  contactId: string;
  convertedStatus: string;
  opportunityName: string;
}

export interface ConvertResponseEvidence {
  url: string;
  descriptor: string;
  actionId: string;
  state: string;
  returnValue: ConvertReturnValue;
  request: { leadId: unknown; convertedStatus: unknown; opportunityName: unknown; doNotCreateOpportunity: unknown };
}

interface Pair {
  call: CapturedCall;
  request: AuraRequestAction;
  response?: AuraResponseAction;
}

export function findConvertAction(calls: CapturedCall[]): Pair[] {
  const pairs: Pair[] = [];
  for (const call of calls) {
    for (const request of call.requestActions.filter((a) => a.descriptor === CONVERT_DESCRIPTOR)) {
      pairs.push({ call, request, response: call.responseActions.find((r) => r.id === request.id) });
    }
  }
  return pairs;
}

export function describeConvertMiss(observed: ObservedAuraPost[]): string {
  const lines = observed.slice(-20).map((o) => `${o.matched ? 'match' : 'skip'} ${o.url} [${o.descriptors.join(', ') || 'no descriptor'}]`);
  return ['No LeadConvertDesktop.convertLeadServer call was captured.', ...(lines.length ? lines : ['No Aura POST was observed.'])].join('\n');
}

export function assertLeadConvertResponse(calls: CapturedCall[], exp: ConvertExpectations, observed: ObservedAuraPost[] = []): ConvertResponseEvidence {
  expect(calls.length, calls.length ? '' : describeConvertMiss(observed)).toBeGreaterThan(0);
  const pairs = findConvertAction(calls);
  expect(pairs, `exactly one ${CONVERT_DESCRIPTOR} action`).toHaveLength(1);
  const { call, request, response } = pairs[0];
  expect(call.status, 'convert call HTTP status').toBe(200);
  expect(response, `response action for ${request.id}`).toBeDefined();

  const params = (request.params ?? {}) as Record<string, unknown>;
  const newOpp = (params.newOpportunityRecord ?? {}) as Record<string, unknown>;
  expect(params.leadId, 'params.leadId').toBe(exp.leadId);
  expect(params.convertedStatus, 'params.convertedStatus').toBe(exp.convertedStatus);
  expect(params.doNotCreateOpportunity, 'params.doNotCreateOpportunity').toBe(false);
  expect(newOpp.Name, 'params.newOpportunityRecord.Name').toBe(exp.opportunityName);

  const res = response!;
  expect(res.state, `actions[${res.id}].state`).toBe('SUCCESS');
  expect(res.error ?? [], `actions[${res.id}].error`).toEqual([]);
  const rv = res.returnValue as ConvertReturnValue;
  expect(rv.hasError, 'returnValue.hasError').toBe(false);
  expect(rv.isPersonAccount, 'returnValue.isPersonAccount').toBe(false);
  expect(isValid18CharId(rv.opportunityId, KEY_PREFIX.Opportunity), `returnValue.opportunityId ${rv.opportunityId}`).toBe(true);
  expect(rv.opportunityId, 'returnValue.opportunityId').toBe(exp.opportunityId);
  expect(rv.accountId, 'returnValue.accountId').toBe(exp.accountId);
  expect(rv.contactId, 'returnValue.contactId').toBe(exp.contactId);

  return {
    url: call.url.split('?')[0],
    descriptor: request.descriptor!,
    actionId: request.id!,
    state: res.state!,
    returnValue: rv,
    request: {
      leadId: params.leadId,
      convertedStatus: params.convertedStatus,
      opportunityName: newOpp.Name,
      doNotCreateOpportunity: params.doNotCreateOpportunity,
    },
  };
}
