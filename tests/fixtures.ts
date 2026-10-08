import { test as base, expect } from '@playwright/test';
import { SalesforceApi } from '../api/SalesforceApi';
import { config } from '../config/env';
import { buildLead, type LeadData } from '../data/leadFactory';
import { LeadRecordPage } from '../pages/LeadRecordPage';
import { LeadsPage } from '../pages/LeadsPage';
import { SalesAppPage } from '../pages/SalesAppPage';
import { logger as rootLogger, type Logger } from '../utils/logger';

type TestFixtures = {
  log: Logger;
  newLead: (overrides?: Partial<LeadData>) => LeadData;
  salesApp: SalesAppPage;
  leadsPage: LeadsPage;
  leadRecord: LeadRecordPage;
  trackRecord: (sobject: string, id: string) => void;
  failureContext: void;
};

type WorkerFixtures = {
  /** Null when the session cannot call REST. Tests still run the UI. */
  sfApi: SalesforceApi | null;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  sfApi: [
    // Playwright requires an object pattern as the first fixture argument.
    async ({}, use, workerInfo) => {
      const log = rootLogger.child({ worker: workerInfo.workerIndex });
      let api: SalesforceApi | null = null;
      try {
        api = await SalesforceApi.fromStorageState(log);
        if (!(await api.isAvailable())) {
          await api.dispose();
          api = null;
        }
      } catch (err) {
        log.warn('REST API client unavailable', { error: (err as Error).message });
        api = null;
      }
      await use(api);
      await api?.dispose();
    },
    { scope: 'worker' },
  ],

  log: async ({}, use, testInfo) => {
    const lines: string[] = [];
    const log = rootLogger.withSink(lines).child({ test: testInfo.titlePath.slice(1).join(' > '), worker: testInfo.workerIndex });
    log.info(`TEST start ${testInfo.title}`, { project: testInfo.project.name, retry: testInfo.retry });
    await use(log);
    log.info(`TEST end ${testInfo.title}`, { status: testInfo.status, ms: testInfo.duration });
    await testInfo.attach('test-log.txt', { body: lines.join('\n'), contentType: 'text/plain' });
  },

  newLead: async ({ log }, use, testInfo) => {
    const created: LeadData[] = [];
    await use((overrides) => {
      const lead = buildLead(overrides, testInfo.workerIndex);
      created.push(lead);
      log.info('generated lead data', { uid: lead.uid, name: `${lead.firstName} ${lead.lastName}`, company: lead.company });
      return lead;
    });
    if (created.length) {
      await testInfo.attach('lead-data.json', { body: JSON.stringify(created, null, 2), contentType: 'application/json' });
    }
  },

  salesApp: async ({ page, log }, use) => use(new SalesAppPage(page, log)),
  leadsPage: async ({ page, log }, use) => use(new LeadsPage(page, log)),
  leadRecord: async ({ page, log }, use) => use(new LeadRecordPage(page, log)),

  failureContext: [
    async ({ page, log }, use, testInfo) => {
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 500)));
      page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 500)}`));
      page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url().split('?')[0]} ${r.failure()?.errorText ?? ''}`));
      await use();
      if (testInfo.status !== testInfo.expectedStatus) {
        const ctx = {
          url: page.isClosed() ? '<closed>' : page.url().split('?')[0],
          consoleErrors: consoleErrors.slice(-30),
          failedRequests: failedRequests.slice(-30),
        };
        log.error('failure context', { url: ctx.url, consoleErrors: consoleErrors.length, failedRequests: failedRequests.length });
        await testInfo.attach('failure-context.json', { body: JSON.stringify(ctx, null, 2), contentType: 'application/json' });
      }
    },
    { auto: true },
  ],

  trackRecord: async ({ sfApi, log }, use) => {
    const records: { sobject: string; id: string }[] = [];
    await use((sobject, id) => records.push({ sobject, id }));
    if (config.cleanupTestData && sfApi) {
      const outcome = { deleted: 0, gone: 0, failed: 0 };
      for (const r of records.reverse()) outcome[await sfApi.delete(r.sobject, r.id)]++;
      log.info('cleaned up test records', { tracked: records.length, ...outcome });
    }
  },
});

export { expect };
