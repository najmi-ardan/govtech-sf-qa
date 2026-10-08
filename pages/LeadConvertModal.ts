import { expect, type Locator, type Page } from '@playwright/test';
import { checkRadio, comboboxValue, modal, waitForSpinners } from './components/lightning';
import type { Logger } from '../utils/logger';
import { isLeadConvertCall, NetworkRecorder, type CapturedCall, type ObservedAuraPost } from '../utils/networkRecorder';
import { recordIdFromUrl, recordUrlRegex } from '../utils/salesforceId';
import { step } from '../utils/step';
import { escapeRegex } from '../utils/text';
import { convertedRecordLinkName, existingRecordRadioName, lookupOptionName } from './convertMatching';

/**
 * Convert Lead modal.
 * Account, Contact, and Opportunity are collapsible groups. Only Account starts expanded.
 * Choosing an Account re-renders the Contact and Opportunity sections.
 * The success dialog is matched by the heading "Your lead has been converted".
 * "Converted Status" is also on the form, so a text search for "converted" is not enough.
 */

export type SectionName = 'Account' | 'Contact' | 'Opportunity';
export type MatchSignal = 'match-list' | 'lookup' | 'none';

export interface ExistingMatches {
  account: MatchSignal;
  contact: MatchSignal;
}

export interface ConversionResult {
  accountName: string;
  contactName: string;
  opportunityName: string;
  accountId?: string;
  contactId?: string;
  opportunityId?: string;
  accountBranch: 'existing' | 'new';
  contactBranch: 'existing' | 'new';
  convertedStatus: string;
  opportunityOwner: string;
  network: CapturedCall[];
  observedAura: ObservedAuraPost[];
}

export class LeadConvertModal {
  readonly dialog: Locator;
  readonly convertButton: Locator;
  readonly successDialog: Locator;

  constructor(
    private readonly page: Page,
    private readonly log: Logger,
  ) {
    this.dialog = modal(page, /Convert Lead/i);
    this.convertButton = this.dialog.getByRole('button', { name: 'Convert', exact: true });
    this.successDialog = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Your lead has been converted', exact: true }) })
      .last();
  }

  async expectOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
    await expect(this.convertButton).toBeEnabled();
    await waitForSpinners(this.page);
  }

  section(name: SectionName): Locator {
    return this.dialog.getByRole('group', { name, exact: true });
  }

  async expandSection(name: SectionName): Promise<void> {
    const toggle = this.section(name).getByRole('heading', { name }).getByRole('button', { name, exact: true });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  createNewRadio(name: SectionName): Locator {
    return this.section(name).getByRole('radio', { name: `Create New ${name}`, exact: true });
  }

  chooseExistingRadio(name: SectionName): Locator {
    return this.section(name).getByRole('radio', { name: `Choose Existing ${name}`, exact: true });
  }

  matchStatus(name: 'Account' | 'Contact'): Locator {
    return this.section(name).getByRole('status').filter({ hasText: new RegExp(`\\d+ ${name} Match`) }).first();
  }

  matchRadio(name: 'Account' | 'Contact', recordName: string): Locator {
    return this.section(name).getByRole('radio', { name: existingRecordRadioName(recordName) }).filter({ visible: true });
  }

  lookup(name: 'Account' | 'Contact'): Locator {
    return this.section(name).getByRole('combobox', { name: `${name} Search`, exact: true });
  }

  lookupSelection(name: 'Account' | 'Contact', recordName: string): Locator {
    return this.section(name).getByRole('list', { name: new RegExp(`Current Selection: ${escapeRegex(recordName)}$`) });
  }

  newRecordNameInput(name: SectionName): Locator {
    const label = name === 'Account' ? /^Account Name/ : name === 'Opportunity' ? /^Opportunity Name/ : /^Last Name/;
    return this.section(name).getByRole('textbox', { name: label });
  }

  async detectExistingMatches(expected: { account: string; contact: string }): Promise<ExistingMatches> {
    return step('Check the convert modal for an existing Account or Contact', async () => {
      const result: ExistingMatches = { account: 'none', contact: 'none' };
      for (const name of ['Account', 'Contact'] as const) {
        const key = name.toLowerCase() as 'account' | 'contact';
        const recordName = expected[key];
        await this.expandSection(name);
        await expect(this.matchStatus(name)).toBeVisible();
        if (await this.matchRadio(name, recordName).count()) {
          result[key] = 'match-list';
        } else if (await this.lookupFinds(name, recordName)) {
          result[key] = 'lookup';
        }
      }
      this.log.info('existing records in convert modal', { ...result, expected });
      return result;
    });
  }

  private async lookupFinds(name: 'Account' | 'Contact', recordName: string): Promise<boolean> {
    if (!(await this.chooseExistingRadio(name).count())) return false;
    const originallyNew = await this.createNewRadio(name).isChecked();
    await checkRadio(this.chooseExistingRadio(name));
    const lookup = this.lookup(name);
    if (!(await lookup.count())) return false;
    await lookup.fill(recordName);
    const option = this.section(name).getByRole('option', { name: lookupOptionName(recordName) }).first();
    const found = await option.waitFor({ state: 'visible', timeout: 8_000 }).then(
      () => true,
      () => false,
    );
    // Escape would close the Convert modal.
    await lookup.fill('');
    if (originallyNew) await checkRadio(this.createNewRadio(name));
    return found;
  }

  async chooseExisting(name: 'Account' | 'Contact', recordName: string): Promise<void> {
    await step(`Link the existing ${name} "${recordName}"`, async () => {
      await this.expandSection(name);
      await expect(this.matchStatus(name)).toBeVisible();
      const match = this.matchRadio(name, recordName).first();
      if (await match.count()) {
        await checkRadio(match);
        await expect(this.chooseExistingRadio(name)).toBeChecked();
        return;
      }
      await checkRadio(this.chooseExistingRadio(name));
      await this.lookup(name).fill(recordName);
      await this.section(name).getByRole('option', { name: lookupOptionName(recordName) }).first().click();
      await expect(this.lookupSelection(name, recordName)).toBeVisible();
    });
  }

  async createNew(name: 'Account' | 'Contact'): Promise<void> {
    await checkRadio(this.createNewRadio(name));
  }

  convertedRecordLink(recordName: string): Locator {
    const named = (n: string | RegExp) =>
      this.successDialog.getByRole('link', typeof n === 'string' ? { name: n, exact: true } : { name: n });
    return named(recordName).or(named(convertedRecordLinkName(recordName))).first();
  }

  async submit(
    expected: { accountName: string; contactName: string },
    branches: { accountBranch: 'existing' | 'new'; contactBranch: 'existing' | 'new' },
  ): Promise<ConversionResult> {
    return step('Convert and wait for the success heading', async () => {
      const skipOpportunity = this.dialog.getByRole('checkbox', { name: /don.t create an opportunity/i });
      if ((await skipOpportunity.isVisible()) && (await skipOpportunity.isChecked())) {
        await skipOpportunity.uncheck();
        this.log.warn('the option to skip the Opportunity was checked; it was cleared');
      }
      await this.expandSection('Opportunity');
      const opportunityName = (await this.newRecordNameInput('Opportunity').inputValue()).trim();
      expect(opportunityName, 'Opportunity Name in the convert modal').not.toBe('');
      const convertedStatus = await comboboxValue(this.dialog.getByRole('combobox', { name: 'Converted Status', exact: true }));
      const recorder = new NetworkRecorder(this.page, isLeadConvertCall, this.log).start();
      await this.convertButton.click();
      await expect(this.successDialog).toBeVisible({ timeout: 60_000 });
      const network = await recorder.stop();

      const links = {
        account: this.convertedRecordLink(expected.accountName),
        contact: this.convertedRecordLink(expected.contactName),
        opportunity: this.convertedRecordLink(opportunityName),
      };
      for (const link of Object.values(links)) await expect(link).toBeVisible();
      const idOf = async (l: Locator) => recordIdFromUrl((await l.getAttribute('href')) ?? '');
      // The row text joins the label and the owner name with no separator. The owner is the link next to the title.
      const ownerLink = this.successDialog
        .getByRole('listitem')
        .filter({ has: this.page.getByTitle('Opportunity Owner', { exact: true }) })
        .getByRole('link');
      const result: ConversionResult = {
        accountName: (await links.account.innerText()).trim(),
        contactName: (await links.contact.innerText()).trim(),
        opportunityName,
        accountId: await idOf(links.account),
        contactId: await idOf(links.contact),
        opportunityId: await idOf(links.opportunity),
        ...branches,
        convertedStatus,
        opportunityOwner: (await ownerLink.innerText()).trim(),
        network,
        observedAura: recorder.observed(),
      };
      this.log.info('conversion complete', {
        accountBranch: result.accountBranch,
        contactBranch: result.contactBranch,
        opportunityId: result.opportunityId,
        network: network.length,
      });
      return result;
    });
  }

  async openOpportunity(opportunityName: string): Promise<void> {
    await this.convertedRecordLink(opportunityName).click();
    await expect(this.page).toHaveURL(recordUrlRegex('Opportunity'));
  }
}
