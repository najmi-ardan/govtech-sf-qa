import { faker } from '@faker-js/faker';
import { RUN_ID } from '../utils/logger';
import { INDUSTRIES, LEAD_SOURCES, LEAD_STATUS, RATINGS, SALUTATIONS } from './picklists';

/**
 * One Lead per run, worker, and call.
 * The uid is embedded in the last name, company, and email so workers do not share records.
 * Faker is seeded from the uid, so the same uid produces the same Lead.
 */

export interface LeadData {
  uid: string;
  salutation: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  leadSource: string;
  status: string;
  industry: string;
  rating: string;
  annualRevenue: number;
  employees: number;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  description: string;
}

let counter = 0;

export function uniqueId(workerIndex = Number(process.env.TEST_WORKER_INDEX ?? 0)): string {
  counter += 1;
  return `${RUN_ID}-w${workerIndex}-${counter}`;
}

function seedFrom(uid: string): number {
  let h = 0;
  for (const ch of uid) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const usPhone = () => `(${faker.number.int({ min: 201, max: 989 })}) ${faker.string.numeric(3)}-${faker.string.numeric(4)}`;

export function buildLead(overrides: Partial<LeadData> = {}, workerIndex?: number): LeadData {
  const uid = overrides.uid ?? uniqueId(workerIndex);
  faker.seed(seedFrom(uid));

  const firstName = faker.person.firstName();
  const baseLast = faker.person.lastName().replace(/[^A-Za-z]/g, '');
  const shortUid = uid.slice(-12).replace(/[^A-Za-z0-9]/g, '');
  const lastName = `${baseLast}-${shortUid}`;
  // Lightning collapses repeated spaces, so punctuation that would leave a double space is removed.
  const companyBase = faker.company.name().replace(/[^A-Za-z0-9 &]/g, '').replace(/\s+/g, ' ').trim();
  // Lead.Email accepts at most 80 characters.
  const companySlug = companyBase.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18);
  const domain = `${companySlug}-${shortUid.toLowerCase()}.example.com`;
  const localBase = `${firstName}.${baseLast}`.toLowerCase().replace(/[^a-z0-9.]+/g, '').slice(0, 22).replace(/\.+$/, '');

  return {
    uid,
    salutation: faker.helpers.arrayElement(SALUTATIONS),
    firstName,
    lastName,
    title: faker.person.jobTitle().slice(0, 120),
    company: `${companyBase} ${shortUid}`,
    email: `${localBase}.${shortUid}@${domain}`.toLowerCase(),
    phone: usPhone(),
    mobile: usPhone(),
    website: `https://www.${domain}`,
    leadSource: faker.helpers.arrayElement(LEAD_SOURCES.slice(0, 2)),
    status: LEAD_STATUS.initial[0],
    industry: faker.helpers.arrayElement(INDUSTRIES),
    rating: faker.helpers.arrayElement(RATINGS),
    annualRevenue: faker.number.int({ min: 1, max: 500 }) * 10_000,
    employees: faker.number.int({ min: 5, max: 5_000 }),
    street: faker.location.streetAddress(),
    city: faker.location.city(),
    state: 'California',
    postalCode: faker.location.zipCode('#####'),
    country: 'United States',
    description: `Suite run ${uid}. ${faker.company.catchPhrase()}.`,
    ...overrides,
  };
}

/** Name as Lightning renders it, including the salutation. */
export function displayName(lead: Pick<LeadData, 'salutation' | 'firstName' | 'lastName'>): string {
  return [lead.salutation, lead.firstName, lead.lastName].filter(Boolean).join(' ');
}
