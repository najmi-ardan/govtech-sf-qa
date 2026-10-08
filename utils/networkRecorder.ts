import type { Page, Response } from '@playwright/test';
import { auraResponseActions, auraUrlActionFlags, parseAuraRequestActions, type AuraRequestAction, type AuraResponseAction } from './aura';
import { parseAuraJson } from './json';
import type { Logger } from './logger';

/** An XHR or fetch call kept while an action runs. The raw body is not written to the report. */
export interface CapturedCall {
  url: string;
  method: string;
  status: number;
  requestBody: string;
  requestActions: AuraRequestAction[];
  responseActions: AuraResponseAction[];
  json: unknown;
}

export type CallFilter = (url: string, method: string, requestBody: string) => boolean;

export interface ObservedAuraPost {
  url: string;
  descriptors: string[];
  matched: boolean;
}

export class NetworkRecorder {
  private readonly pending: Promise<void>[] = [];
  private readonly calls: CapturedCall[] = [];
  private readonly seen: ObservedAuraPost[] = [];
  private listener?: (r: Response) => void;

  constructor(
    private readonly page: Page,
    private readonly filter: CallFilter,
    private readonly log?: Logger,
  ) {}

  start(): this {
    this.listener = (response: Response) => {
      const req = response.request();
      if (!['xhr', 'fetch'].includes(req.resourceType())) return;
      const body = req.postData() ?? '';
      const matched = this.filter(response.url(), req.method(), body);
      if (req.method() === 'POST' && isAuraEndpoint(response.url())) {
        const descriptors = parseAuraRequestActions(body).map((a) => a.descriptor ?? '?');
        this.seen.push({ url: response.url().split('?')[0], descriptors, matched });
        if (this.seen.length > 40) this.seen.shift();
        this.log?.debug('aura POST', { descriptors, matched });
      }
      if (!matched) return;
      this.pending.push(
        response
          .text()
          .then((text) => {
            let json: unknown;
            try {
              json = parseAuraJson(text);
            } catch {
              json = undefined;
            }
            const requestActions = parseAuraRequestActions(body);
            this.calls.push({
              url: response.url(),
              method: req.method(),
              status: response.status(),
              requestBody: body,
              requestActions,
              responseActions: auraResponseActions(json),
              json,
            });
            this.log?.info('captured network call', {
              url: response.url().split('?')[0],
              status: response.status(),
              descriptors: requestActions.map((a) => a.descriptor),
            });
          })
          .catch(() => undefined),
      );
    };
    this.page.on('response', this.listener);
    return this;
  }

  async stop(): Promise<CapturedCall[]> {
    if (this.listener) this.page.off('response', this.listener);
    await Promise.all(this.pending);
    return [...this.calls];
  }

  observed(): ObservedAuraPost[] {
    return [...this.seen];
  }
}

const CONVERT_RE = /LeadConvertDesktopController\/ACTION\$convertLeadServer\b|LeadConvertDesktop\.convertLeadServer\b/;

function isAuraEndpoint(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith('/aura');
  } catch {
    return false;
  }
}

/** POST /aura whose action is LeadConvertDesktop.convertLeadServer. */
export const isLeadConvertCall: CallFilter = (url, method, body) => {
  if (method !== 'POST' || !isAuraEndpoint(url)) return false;
  const descriptors = parseAuraRequestActions(body).map((a) => `${a.descriptor ?? ''} ${a.callingDescriptor ?? ''}`);
  return descriptors.some((d) => CONVERT_RE.test(d)) || auraUrlActionFlags(url).some((f) => CONVERT_RE.test(f));
};
