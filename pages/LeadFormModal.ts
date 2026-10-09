import { expect, type Locator, type Page } from '@playwright/test';
import { dismissErrorDialog, fillText, fillTextOrSelect, modal, selectOption, textField, waitForSpinners } from './components/lightning';
import { INDUSTRIES, LEAD_SOURCES, LEAD_STATUS, RATINGS, SALUTATIONS } from '../data/picklists';
import type { LeadData } from '../data/leadFactory';
import type { Logger } from '../utils/logger';
import { step } from '../utils/step';

/** New Lead and Edit Lead record form. Fields are located by label inside the dialog. */
export class LeadFormModal {
  readonly dialog: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  /**
   * "We hit a snag." and "Similar Records Exist" open as their own dialogs and set
   * aria-hidden on the form. Role locators then skip the form. Close the topmost
   * dialog before touching Save or Cancel.
   */
  readonly errorBanner: Locator;
  readonly duplicateWarning: Locator;
  private readonly title: RegExp;

  constructor(
    private readonly page: Page,
    private readonly log: Logger,
    title: RegExp = /^(New Lead|Edit .+)$/,
  ) {
    this.title = title;
    this.dialog = modal(page, title);
    this.saveButton = this.dialog.getByRole('button', { name: 'Save', exact: true });
    this.cancelButton = this.dialog.getByRole('button', { name: 'Cancel', exact: true });
    this.errorBanner = page.getByRole('dialog', { name: 'We hit a snag.', exact: true }).first();
    this.duplicateWarning = page
      .getByRole('dialog', { name: 'Similar Records Exist', exact: true })
      .first()
      .getByRole('link', { name: 'View Duplicates', exact: true });
  }

  /** The form dialog, including the node Lightning has marked aria-hidden. */
  private get formStillOpen(): Locator {
    return this.page
      .getByRole('dialog', { includeHidden: true })
      .filter({ visible: true })
      .filter({ has: this.page.getByRole('heading', { name: this.title, includeHidden: true }) });
  }

  /**
   * The close button moves while the popover opens, and a stale copy can sit underneath.
   * Click the last visible close button until none remain.
   */
  async dismissPopovers(): Promise<void> {
    await dismissErrorDialog(this.page, 20_000);
    await expect(this.dialog).toBeVisible();
  }

  async expectOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
    await expect(textField(this.dialog, 'Last Name')).toBeVisible();
  }

  async fill(lead: LeadData): Promise<LeadData> {
    return step('Fill the Lead form', async () => {
      const d = this.dialog;
      const chosen = { ...lead };
      chosen.salutation = await selectOption(d, 'Salutation', lead.salutation, SALUTATIONS);
      await fillText(d, 'First Name', lead.firstName);
      await fillText(d, 'Last Name', lead.lastName);
      await fillText(d, 'Company', lead.company);
      await fillText(d, 'Title', lead.title);
      await fillText(d, 'Email', lead.email);
      await fillText(d, 'Phone', lead.phone);
      await fillText(d, 'Mobile', lead.mobile);
      await fillText(d, 'Website', lead.website);
      chosen.status = await selectOption(d, 'Lead Status', lead.status, LEAD_STATUS.initial);
      chosen.leadSource = await selectOption(d, 'Lead Source', lead.leadSource, LEAD_SOURCES);
      chosen.industry = await selectOption(d, 'Industry', lead.industry, INDUSTRIES);
      chosen.rating = await selectOption(d, 'Rating', lead.rating, RATINGS);
      await fillText(d, 'Annual Revenue', String(lead.annualRevenue));
      await fillText(d, 'No. of Employees', String(lead.employees));
      await fillText(d, 'Street', lead.street);
      await fillText(d, 'City', lead.city);
      await fillText(d, 'Zip/Postal Code', lead.postalCode);
      // State options depend on Country when the territory picklists are enabled.
      await fillTextOrSelect(d, 'Country', lead.country);
      await fillTextOrSelect(d, 'State/Province', lead.state);
      await fillText(d, 'Description', lead.description);
      this.log.info('lead form filled', { uid: lead.uid, leadSource: chosen.leadSource, status: chosen.status });
      return chosen;
    });
  }

  async fillMinimal(fields: Partial<Pick<LeadData, 'firstName' | 'lastName' | 'company' | 'email'>>): Promise<void> {
    const map: [keyof typeof fields, string][] = [
      ['firstName', 'First Name'],
      ['lastName', 'Last Name'],
      ['company', 'Company'],
      ['email', 'Email'],
    ];
    for (const [key, label] of map) {
      const v = fields[key];
      if (v !== undefined) await fillText(this.dialog, label, v);
    }
  }

  async setStatus(preferred: string, fallbacks: string[] = []): Promise<string> {
    return selectOption(this.dialog, 'Lead Status', preferred, fallbacks);
  }

  async save(): Promise<void> {
    await this.dismissPopovers();
    await this.saveButton.click();
    await expect(this.dialog).toBeHidden({ timeout: 30_000 });
    await waitForSpinners(this.page);
  }

  async saveExpectingOutcome(): Promise<'saved' | 'duplicate' | 'error'> {
    // A prompt left open by a field blur covers Save. Close it, then let this save raise its own.
    await this.dismissPopovers();
    await this.saveButton.click();
    let outcome: 'saved' | 'duplicate' | 'error' | 'pending' = 'pending';
    await expect
      .poll(
        async () => {
          if (await this.duplicateWarning.isVisible()) outcome = 'duplicate';
          else if (await this.errorBanner.isVisible()) outcome = 'error';
          else if ((await this.formStillOpen.count()) === 0) outcome = 'saved';
          else outcome = 'pending';
          return outcome;
        },
        { timeout: 30_000 },
      )
      .not.toBe('pending');
    return outcome as 'saved' | 'duplicate' | 'error';
  }

  /**
   * Invalid fields are aria-invalid and expose "Complete this field." as the accessible description.
   */
  async expectFieldError(label: string, message: RegExp = /complete this field|required/i): Promise<void> {
    const input = textField(this.dialog, label);
    await expect(input, `"${label}" is marked invalid`).toHaveAttribute('aria-invalid', 'true');
    await expect(input, `"${label}" error message`).toHaveAccessibleDescription(message);
  }

  async cancel(): Promise<void> {
    await this.dismissPopovers();
    await this.cancelButton.click();
    await expect(this.dialog).toBeHidden();
  }
}
