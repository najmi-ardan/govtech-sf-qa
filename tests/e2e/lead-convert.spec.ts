import { test, expect } from '../fixtures';
import { assertLeadConvertResponse } from '../../api/leadConvertResponse';
import type { SalesforceApi } from '../../api/SalesforceApi';
import { DEFAULT_OPPORTUNITY_STAGE } from '../../data/picklists';
import { seedExistingAccountAndContact, type SeededCustomer } from '../../data/seed';
import { redact } from '../../utils/logger';
import { isValid18CharId, KEY_PREFIX } from '../../utils/salesforceId';

/**
 * Both convert branches. The Lead is created in the UI.
 * The existing branch seeds an Account and a Contact through REST, then converts in the UI.
 */

test.describe.configure({ timeout: 360_000 });

type Scenario = { name: string; seedExisting: boolean; expectBranch: 'new' | 'existing' };
const scenarios: Scenario[] = [
  { name: 'no matching Account or Contact creates both', seedExisting: false, expectBranch: 'new' },
  { name: 'a matching Account and Contact are linked', seedExisting: true, expectBranch: 'existing' },
];

for (const sc of scenarios) {
  test(
    `convert Lead: ${sc.name}`,
    { tag: ['@lead', '@convert', ...(sc.expectBranch === 'new' ? ['@smoke'] : [])] },
    async ({ leadsPage, opportunityPage, newLead, sfApi, trackRecord, log }) => {
      const lead = newLead();
      let seeded: SeededCustomer | undefined;

      await test.step('Seed an existing Account and Contact when this branch needs them', async () => {
        if (!sc.seedExisting) return;
        test.skip(!sfApi, 'REST is required to seed the existing Account and Contact');
        const api = sfApi as SalesforceApi;
        seeded = await seedExistingAccountAndContact(api, lead);
        trackRecord('Account', seeded.accountId);
        trackRecord('Contact', seeded.contactId);
        const { accountId, accountName } = seeded;
        await expect
          .poll(() => api.searchIds('Account', accountName), {
            message: 'seeded Account is searchable',
            timeout: 120_000,
            intervals: [2_000, 5_000],
          })
          .toContain(accountId);
        log.info('seeded Account and Contact', { accountId: seeded.accountId, contactId: seeded.contactId });
      });

      const { record, id: leadId } = await test.step('Create the Lead in the UI', async () => {
        await leadsPage.open();
        const created = await leadsPage.createLead(lead);
        trackRecord('Lead', created.id);
        return created;
      });

      await record.openDetails();
      const leadOwner = (await record.field('Lead Owner').innerText()).replace(/^Lead Owner\s*/i, '').split('\n').filter(Boolean)[0]?.trim();

      const expected = { accountName: lead.company, contactName: `${lead.firstName} ${lead.lastName}` };
      const convert = await record.convert();
      const matches = await convert.detectExistingMatches({ account: expected.accountName, contact: expected.contactName });
      const accountBranch = matches.account !== 'none' ? 'existing' : 'new';
      const contactBranch = matches.contact !== 'none' ? 'existing' : 'new';
      test.info().annotations.push({
        type: 'branch',
        description: `account=${accountBranch} (${matches.account}), contact=${contactBranch} (${matches.contact})`,
      });

      if (accountBranch === 'existing') await convert.chooseExisting('Account', expected.accountName);
      else await convert.createNew('Account');
      if (contactBranch === 'existing') await convert.chooseExisting('Contact', expected.contactName);
      else await convert.createNew('Contact');

      const result = await convert.submit(expected, { accountBranch, contactBranch });

      await test.step('The branch matches the records that were arranged', async () => {
        expect(accountBranch).toBe(sc.expectBranch);
        expect(contactBranch).toBe(sc.expectBranch);
      });

      await test.step('The success dialog names the Opportunity, Account, and Contact', async () => {
        expect(result.opportunityName).not.toBe('');
        expect(result.accountName).toBe(lead.company);
        expect(result.contactName).toContain(lead.lastName);
        expect(isValid18CharId(result.opportunityId ?? '', KEY_PREFIX.Opportunity)).toBe(true);
        if (leadOwner) expect(result.opportunityOwner).toBe(leadOwner);
        if (seeded) {
          expect(result.accountId).toBe(seeded.accountId);
          expect(result.contactId).toBe(seeded.contactId);
        }
      });

      let converted: { ConvertedAccountId: string; ConvertedContactId: string; ConvertedOpportunityId: string } | undefined;
      if (sfApi) {
        converted = await test.step('REST read-back of the converted Lead', async () => {
          const row = await sfApi.leadConversion(leadId);
          expect(row.IsConverted).toBe(true);
          expect(isValid18CharId(row.ConvertedOpportunityId ?? '', KEY_PREFIX.Opportunity)).toBe(true);
          expect(isValid18CharId(row.ConvertedAccountId ?? '', KEY_PREFIX.Account)).toBe(true);
          expect(isValid18CharId(row.ConvertedContactId ?? '', KEY_PREFIX.Contact)).toBe(true);
          trackRecord('Opportunity', row.ConvertedOpportunityId!);
          if (seeded) {
            expect(row.ConvertedAccountId).toBe(seeded.accountId);
            expect(row.ConvertedContactId).toBe(seeded.contactId);
          } else {
            trackRecord('Contact', row.ConvertedContactId!);
            trackRecord('Account', row.ConvertedAccountId!);
          }
          return {
            ConvertedAccountId: row.ConvertedAccountId!,
            ConvertedContactId: row.ConvertedContactId!,
            ConvertedOpportunityId: row.ConvertedOpportunityId!,
          };
        });
      }

      await convert.openOpportunity(result.opportunityName);
      const opportunityId = await opportunityPage.recordId();
      if (converted) expect(opportunityId).toBe(converted.ConvertedOpportunityId);

      await test.step('The Opportunity shows the owner, stage, and Account', async () => {
        await opportunityPage.openDetails();
        if (leadOwner) await opportunityPage.expectField('Opportunity Owner', leadOwner);
        await opportunityPage.expectField('Stage', DEFAULT_OPPORTUNITY_STAGE);
        await opportunityPage.expectField('Account Name', result.accountName);
        if (seeded) {
          const accountLink = opportunityPage.field('Account Name').getByRole('link').first();
          await expect(accountLink).toHaveAttribute('href', new RegExp(seeded.accountId.slice(0, 15)));
        }
      });

      if (sfApi && converted) {
        await test.step('REST read-back of the Opportunity and its contact role', async () => {
          const [opp] = await sfApi.query<{ StageName: string; AccountId: string; Owner: { Name: string } }>(
            `SELECT StageName, AccountId, Owner.Name FROM Opportunity WHERE Id = '${opportunityId}'`,
          );
          expect(opp.StageName).toBe(DEFAULT_OPPORTUNITY_STAGE);
          expect(opp.AccountId).toBe(converted.ConvertedAccountId);
          if (leadOwner) expect(opp.Owner.Name).toBe(leadOwner);
          const roles = await sfApi.query<{ ContactId: string; IsPrimary: boolean }>(
            `SELECT ContactId, IsPrimary FROM OpportunityContactRole WHERE OpportunityId = '${opportunityId}'`,
          );
        expect(roles.map((r) => ({ ContactId: r.ContactId, IsPrimary: r.IsPrimary }))).toContainEqual({
          ContactId: converted.ConvertedContactId,
          IsPrimary: true,
        });
      });
    }

    await test.step('The convert response contains the linked record ids', async () => {
      const sanitized = result.network.map((c) =>
        redact({
          url: c.url.split('?')[0],
          status: c.status,
          requestActions: c.requestActions,
          responseActions: c.responseActions,
        }),
      );
      await test.info().attach('lead-convert-network.json', {
        body: JSON.stringify(sanitized, null, 2),
        contentType: 'application/json',
      });
      const evidence = assertLeadConvertResponse(
        result.network,
        {
          leadId,
          opportunityId,
          accountId: converted?.ConvertedAccountId ?? seeded?.accountId ?? result.accountId ?? '',
          contactId: converted?.ConvertedContactId ?? seeded?.contactId ?? result.contactId ?? '',
          convertedStatus: result.convertedStatus,
          opportunityName: result.opportunityName,
        },
        result.observedAura,
      );
      log.info('convert response', {
        state: evidence.state,
        accountId: evidence.returnValue.accountId,
        contactId: evidence.returnValue.contactId,
        opportunityId: evidence.returnValue.opportunityId,
      });
    });
  },
);
}
