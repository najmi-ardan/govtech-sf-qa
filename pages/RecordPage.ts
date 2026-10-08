import { expect, type Locator } from '@playwright/test';
import { recordField } from './components/lightning';
import { isValid18CharId, KEY_PREFIX, recordIdFromUrl, recordUrlRegex } from '../utils/salesforceId';
import { BasePage } from './BasePage';

/** Shared record page: Details tab, fields, and the 18-character Id from the URL. */
export abstract class RecordPage extends BasePage {
  protected abstract readonly sobject: keyof typeof KEY_PREFIX;

  get detailsTab(): Locator {
    return this.activePage.getByRole('tab', { name: 'Details', exact: true });
  }

  /**
   * The tab set is not always rendered when navigation finishes. Clicking waits for it.
   * Checking aria-selected avoids treating a click that landed on Activity as success.
   */
  async openDetails(): Promise<void> {
    await this.detailsTab.click();
    await expect(this.detailsTab).toHaveAttribute('aria-selected', 'true');
  }

  field(label: string): Locator {
    return recordField(this.activePage, label);
  }

  async expectField(label: string, expected: string | RegExp): Promise<void> {
    await expect(this.field(label), `${this.sobject} field "${label}"`).toContainText(expected);
  }

  async recordId(): Promise<string> {
    await expect(this.page).toHaveURL(recordUrlRegex(this.sobject));
    const id = recordIdFromUrl(this.page.url(), this.sobject);
    expect(id, `${this.sobject} Id in URL`).toBeDefined();
    expect(id!.length, `${this.sobject} Id length`).toBe(18);
    expect(
      isValid18CharId(id!, KEY_PREFIX[this.sobject]),
      `${this.sobject} Id ${id} has a valid checksum and ${KEY_PREFIX[this.sobject]} prefix`,
    ).toBe(true);
    return id!;
  }
}
