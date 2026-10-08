import { test, expect } from '../fixtures';
import { displayName } from '../../data/leadFactory';
import { LEAD_STATUS } from '../../data/picklists';
import { isValid18CharId, KEY_PREFIX } from '../../utils/salesforceId';
import { phonePattern } from '../../utils/text';

test.describe('Lead creation and status', () => {
  test('creates a Lead, checks the Id and the details, then changes the status', { tag: ['@smoke', '@lead'] }, async ({
    salesApp,
    leadsPage,
    newLead,
    sfApi,
    trackRecord,
    log,
  }) => {
    await salesApp.openViaAppLauncher();
    await salesApp.openTab('Leads');
    await expect(leadsPage.newButton).toBeVisible();

    const { record, lead, id } = await leadsPage.createLead(newLead());
    trackRecord('Lead', id);

    await test.step('Lead Id is 18 characters', async () => {
      expect(id).toHaveLength(18);
      expect(isValid18CharId(id, KEY_PREFIX.Lead)).toBe(true);
    });

    await test.step('Details view shows the values that were entered', async () => {
      await expect(record.headerTitle).toContainText(`${lead.firstName} ${lead.lastName}`);
      await record.openDetails();
      await record.expectField('Name', displayName(lead));
      await record.expectField('Company', lead.company);
      await record.expectField('Title', lead.title);
      await record.expectField('Email', lead.email);
      await record.expectField('Phone', phonePattern(lead.phone));
      await record.expectField('Mobile', phonePattern(lead.mobile));
      await record.expectField('Lead Source', lead.leadSource);
      await record.expectField('Industry', lead.industry);
      await record.expectField('Rating', lead.rating);
      await record.expectField('Lead Status', lead.status);
      await record.expectField('Address', lead.city);
    });

    if (sfApi) {
      await test.step('REST read-back matches the form', async () => {
        const saved = await sfApi.get<Record<string, unknown>>('Lead', id, ['Id', 'FirstName', 'LastName', 'Company', 'Email', 'LeadSource', 'Status']);
        expect(saved).toMatchObject({
          Id: id,
          FirstName: lead.firstName,
          LastName: lead.lastName,
          Company: lead.company,
          Email: lead.email,
          LeadSource: lead.leadSource,
          Status: lead.status,
        });
      });
    }

    const newStatus = await test.step('Edit the status', async () => {
      const form = await record.edit();
      const target = LEAD_STATUS.updated.find((s) => s !== lead.status) ?? LEAD_STATUS.updated[0];
      const chosen = await form.setStatus(target, LEAD_STATUS.updated.filter((s) => s !== target && s !== lead.status));
      await form.save();
      log.info('status changed', { from: lead.status, to: chosen });
      return chosen;
    });

    await test.step('The record shows the new status', async () => {
      await record.toast.expectToast(/was saved/i, 'success').catch(() => log.warn('save toast was not observed'));
      await record.expectField('Lead Status', newStatus);
      if (sfApi) {
        await expect.poll(async () => (await sfApi.get<{ Status: string }>('Lead', id, ['Status'])).Status).toBe(newStatus);
      }
    });
  });
});
