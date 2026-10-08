import { request, type APIRequestContext } from '@playwright/test';
import { instanceUrl as sessionInstanceUrl, readStorageState } from '../auth/sessionStore';
import { config } from '../config/env';
import { logger as rootLogger, type Logger } from '../utils/logger';

/**
 * REST client that uses the sid cookie on the my.salesforce.com host.
 * Used to seed an existing Account or Contact, to read records back, and to delete
 * records when cleanup is on. The behaviour under test goes through the UI.
 */

export interface SObjectRecord {
  Id: string;
  [field: string]: unknown;
}

export interface LeadConversion {
  IsConverted: boolean;
  ConvertedAccountId: string | null;
  ConvertedContactId: string | null;
  ConvertedOpportunityId: string | null;
  ConvertedDate: string | null;
  Status: string;
}

export class SalesforceApi {
  private constructor(
    private readonly ctx: APIRequestContext,
    readonly instanceUrl: string,
    private readonly log: Logger,
  ) {}

  static async fromStorageState(log: Logger = rootLogger): Promise<SalesforceApi> {
    const state = readStorageState();
    const instanceHost = new URL(sessionInstanceUrl(state)).hostname;
    const sid = state.cookies.find((c) => c.name === 'sid' && c.domain.replace(/^\./, '') === instanceHost);
    if (!sid) throw new Error(`No sid cookie for ${instanceHost} in the session file.`);

    const instanceUrl = `https://${instanceHost}`;
    const ctx = await request.newContext({
      baseURL: instanceUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${sid.value}`, Accept: 'application/json' },
      timeout: config.timeouts.action,
    });
    return new SalesforceApi(ctx, instanceUrl, log.child({ component: 'sf-api' }));
  }

  private path(p: string): string {
    return `/services/data/${config.salesforce.apiVersion}${p}`;
  }

  async isAvailable(): Promise<boolean> {
    const res = await this.ctx.get(this.path('/limits')).catch(() => undefined);
    const ok = !!res?.ok();
    this.log.info(`REST API ${ok ? 'available' : 'not available'}`, { status: res?.status() });
    return ok;
  }

  async query<T extends Record<string, unknown> = SObjectRecord>(soql: string): Promise<T[]> {
    const res = await this.ctx.get(this.path('/query'), { params: { q: soql } });
    if (!res.ok()) throw new Error(`SOQL failed (${res.status()}): ${await res.text()}`);
    const body = (await res.json()) as { records: T[] };
    this.log.debug('query', { soql, rows: body.records.length });
    return body.records;
  }

  /**
   * Ids returned by parameterizedSearch, the index behind Lightning lookups.
   * A record created through the API can be missing from that index for a while.
   */
  async searchIds(sobject: string, term: string): Promise<string[]> {
    const res = await this.ctx.get(this.path('/parameterizedSearch'), {
      params: { q: term, sobject, in: 'NAME', [`${sobject}.fields`]: 'Id' },
    });
    if (!res.ok()) throw new Error(`search failed (${res.status()}): ${await res.text()}`);
    const body = (await res.json()) as { searchRecords: { Id: string }[] };
    return body.searchRecords.map((r) => r.Id);
  }

  async get<T = SObjectRecord>(sobject: string, id: string, fields?: string[]): Promise<T> {
    const res = await this.ctx.get(this.path(`/sobjects/${sobject}/${id}`), {
      params: fields ? { fields: fields.join(',') } : undefined,
    });
    if (!res.ok()) throw new Error(`GET ${sobject} failed (${res.status()}): ${await res.text()}`);
    return (await res.json()) as T;
  }

  async create(sobject: string, fields: Record<string, unknown>, opts: { allowDuplicates?: boolean } = {}): Promise<string> {
    const res = await this.ctx.post(this.path(`/sobjects/${sobject}`), {
      data: fields,
      headers: opts.allowDuplicates ? { 'Sforce-Duplicate-Rule-Header': 'allowSave=true' } : undefined,
    });
    if (!res.ok()) throw new Error(`Create ${sobject} failed (${res.status()}): ${await res.text()}`);
    const { id } = (await res.json()) as { id: string };
    this.log.info(`created ${sobject}`, { id });
    return id;
  }

  async delete(sobject: string, id: string): Promise<'deleted' | 'gone' | 'failed'> {
    const res = await this.ctx.delete(this.path(`/sobjects/${sobject}/${id}`));
    if (res.ok()) return 'deleted';
    if (res.status() === 404) return 'gone';
    this.log.warn(`delete ${sobject} failed`, { id, status: res.status() });
    return 'failed';
  }

  async leadConversion(leadId: string): Promise<LeadConversion> {
    return this.get<LeadConversion>('Lead', leadId, [
      'IsConverted',
      'ConvertedAccountId',
      'ConvertedContactId',
      'ConvertedOpportunityId',
      'ConvertedDate',
      'Status',
    ]);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }
}
