import { expect, type Locator } from '@playwright/test';
import { recordUrlRegex } from '../utils/salesforceId';
import { LeadConvertModal } from './LeadConvertModal';
import { LeadFormModal } from './LeadFormModal';
import { RecordPage } from './RecordPage';

/** Lead record page. */
export class LeadRecordPage extends RecordPage {
  protected readonly sobject = 'Lead';

  get header(): Locator {
    return this.activePage.locator('records-highlights2, .slds-page-header').first();
  }

  get headerTitle(): Locator {
    return this.activePage.getByRole('heading', { level: 1 }).filter({ visible: true }).first();
  }

  /** Header actions that do not fit move into Show more actions. Exact name avoids Edit matching a longer label. */
  async clickAction(name: string): Promise<void> {
    const direct = this.header.getByRole('button', { name, exact: true }).filter({ visible: true });
    if (await direct.count()) {
      await direct.first().click();
      return;
    }
    await this.header.getByRole('button', { name: /show more actions/i }).click();
    await this.page.getByRole('menuitem', { name, exact: true }).click();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(recordUrlRegex('Lead'));
    await expect(this.headerTitle).toBeVisible();
  }

  async leadId(): Promise<string> {
    await this.expectLoaded();
    return this.recordId();
  }

  async edit(): Promise<LeadFormModal> {
    await this.clickAction('Edit');
    const form = new LeadFormModal(this.page, this.log, /^Edit /);
    await form.expectOpen();
    return form;
  }

  async convert(): Promise<LeadConvertModal> {
    await this.clickAction('Convert');
    const convert = new LeadConvertModal(this.page, this.log);
    await convert.expectOpen();
    return convert;
  }
}
