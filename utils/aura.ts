/**
 * Aura request and response helpers.
 *
 * A convert call is a POST to /aura with a form body: message, aura.context, and aura.token.
 * message is JSON: { actions: [{ id, descriptor, params }] }.
 * The response is { actions: [{ id, state, returnValue, error }] }.
 */

export interface AuraRequestAction {
  id?: string;
  descriptor?: string;
  callingDescriptor?: string;
  params?: Record<string, unknown>;
}

export interface AuraResponseAction {
  id?: string;
  state?: string;
  returnValue?: unknown;
  error?: unknown[];
}

export function parseAuraRequestActions(postData: string | null | undefined): AuraRequestAction[] {
  if (!postData) return [];
  try {
    const message = new URLSearchParams(postData).get('message');
    if (!message) return [];
    const parsed = JSON.parse(message) as { actions?: AuraRequestAction[] };
    return Array.isArray(parsed.actions) ? parsed.actions : [];
  } catch {
    return [];
  }
}

export function auraResponseActions(json: unknown): AuraResponseAction[] {
  const actions = (json as { actions?: unknown } | undefined)?.actions;
  return Array.isArray(actions) ? (actions as AuraResponseAction[]) : [];
}

/** Query-string flags other than r, for example LeadConvertDesktop.convertLeadServer. */
export function auraUrlActionFlags(url: string): string[] {
  try {
    return [...new URL(url).searchParams.keys()].filter((k) => k !== 'r' && k.includes('.'));
  } catch {
    return [];
  }
}
