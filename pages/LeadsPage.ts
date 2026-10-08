import { expect, type Locator } from '@playwright/test';
import type { LeadData } from '../data/leadFactory';
import { BasePage } from './BasePage';
import { LeadFormModal } from './LeadFormModal';
import { LeadRecordPage } from './LeadRecordPage';

/** Leads list view. */
export class LeadsPage extends BasePage {
  static readonly PATH = '/lightning/o/Lead/list?filterName=Recent';

  get newButton(): Locator {
    return this.page.getByRole('button', { name: 'New', exact: true }).filter({ visible: true }).first();
  }

  async open(): Promise<void> {
    await this.goto(LeadsPage.PATH);
    await expect(this.newButton).toBeVisible();
  }

  async openNewLeadForm(): Promise<LeadFormModal> {
    await this.newButton.click();
    const form = new LeadFormModal(this.page, this.log, /^New Lead$/);
    await form.expectOpen();
    return form;
  }

  async createLead(lead: LeadData): Promise<{ record: LeadRecordPage; lead: LeadData; id: string }> {
    return this.step(`Create Lead "${lead.firstName} ${lead.lastName}"`, async () => {
      const form = await this.openNewLeadForm();
      const entered = await form.fill(lead);
      const outcome = await form.saveExpectingOutcome();
      if (outcome === 'duplicate') {
        this.log.warn('duplicate alert on create; saving anyway', { uid: lead.uid });
        await form.save();
      } else if (outcome === 'error') {
        throw new Error(`Lead save failed: ${(await form.errorBanner.innerText()).trim()}`);
      }
      const record = new LeadRecordPage(this.page, this.log);
      const id = await record.leadId();
      this.log.info('lead created', { id, uid: lead.uid });
      return { record, lead: entered, id };
    });
  }
}
