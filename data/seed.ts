import type { SalesforceApi } from '../api/SalesforceApi';
import type { LeadData } from './leadFactory';

/**
 * Seeds an Account and Contact through REST so the convert modal can link to them.
 * The conversion itself stays a UI action.
 * Account.Name matches the Lead company. The Contact matches the Lead name and email.
 */

export interface SeededCustomer {
  accountId: string;
  accountName: string;
  contactId: string;
  contactName: string;
}

export async function seedExistingAccountAndContact(api: SalesforceApi, lead: LeadData): Promise<SeededCustomer> {
  const accountId = await api.create(
    'Account',
    { Name: lead.company, Website: lead.website, Phone: lead.phone, Description: `Seeded for ${lead.uid}` },
    { allowDuplicates: true },
  );
  const contactId = await api.create(
    'Contact',
    {
      AccountId: accountId,
      Salutation: lead.salutation,
      FirstName: lead.firstName,
      LastName: lead.lastName,
      Email: lead.email,
      Phone: lead.phone,
      Description: `Seeded for ${lead.uid}`,
    },
    { allowDuplicates: true },
  );
  return { accountId, accountName: lead.company, contactId, contactName: `${lead.firstName} ${lead.lastName}` };
}
