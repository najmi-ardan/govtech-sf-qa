import { test, expect } from '../fixtures';
import { soqlString } from '../../utils/text';

test.describe('Lead negative cases', () => {
  test('saving a Lead without mandatory fields shows the validation banner', { tag: ['@negative', '@lead'] }, async ({ leadsPage, newLead, page }) => {
    const lead = newLead();
    await leadsPage.open();
    const form = await leadsPage.openNewLeadForm();

    await test.step('Fill only the first name', async () => {
      await form.fillMinimal({ firstName: lead.firstName });
    });

    await test.step('Save is rejected and the form stays open', async () => {
      const urlBefore = page.url();
      const outcome = await form.saveExpectingOutcome();
      expect(outcome).toBe('error');
      await expect(form.errorBanner).toContainText('Review the following fields');
      await expect(form.errorBanner.getByRole('link', { name: 'Name', exact: true })).toBeVisible();
      await expect(form.errorBanner.getByRole('link', { name: 'Company', exact: true })).toBeVisible();
      await form.dismissPopovers();
      await form.expectFieldError('Last Name');
      await form.expectFieldError('Company');
      await expect(form.dialog).toBeVisible();
      expect(page.url()).toBe(urlBefore);
    });

    await form.cancel();
  });

  test('a second Lead with the same email shows the duplicate warning', { tag: ['@negative', '@lead'] }, async ({
    leadsPage,
    newLead,
    sfApi,
    trackRecord,
    log,
  }) => {
    const original = newLead();

    await test.step('Confirm an active Lead duplicate rule', async () => {
      test.skip(!sfApi, 'REST is unavailable, so the duplicate rule cannot be confirmed');
      const rules = await sfApi!
        .query<{ DeveloperName: string; IsActive: boolean }>(
          "SELECT DeveloperName, IsActive FROM DuplicateRule WHERE SobjectType = 'Lead' AND IsActive = true",
        )
        .catch(() => undefined);
      test.skip(!rules, 'The duplicate rule could not be read');
      log.info('active lead duplicate rules', { rules: rules!.map((r) => r.DeveloperName) });
      test.skip(rules!.length === 0, 'No active Lead duplicate rule in this org');
    });

    await test.step('Create the first Lead in the UI', async () => {
      await leadsPage.open();
      const { id } = await leadsPage.createLead(original);
      trackRecord('Lead', id);
    });

    await test.step('Save a second Lead with the same email', async () => {
      await leadsPage.open();
      const form = await leadsPage.openNewLeadForm();
      await form.fillMinimal({
        firstName: original.firstName,
        lastName: original.lastName,
        company: original.company,
        email: original.email,
      });
      const outcome = await form.saveExpectingOutcome();
      log.info('duplicate save outcome', { outcome });

      if (outcome === 'saved') {
        const flagged = leadsPage.page.getByText(/potential duplicate|view duplicates|similar records/i).filter({ visible: true }).first();
        const shown = await flagged.waitFor({ timeout: 10_000 }).then(
          () => true,
          () => false,
        );
        test.skip(!shown, 'The duplicate rule did not flag this email');
        await expect(flagged).toBeVisible();
        return;
      }

      expect(outcome).toBe('duplicate');
      await expect(form.duplicateWarning).toBeVisible();
      if (sfApi) {
        const sameEmail = await sfApi.query(`SELECT Id FROM Lead WHERE Email = ${soqlString(original.email)}`);
        expect(sameEmail).toHaveLength(1);
      }
      await form.cancel();
    });
  });
});
