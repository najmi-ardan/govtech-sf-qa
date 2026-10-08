/**
 * Lists records left by earlier runs. Pass --delete to remove them.
 *
 *   npm run cleanup:test-data
 *   npm run cleanup:test-data -- --delete
 *
 * A record matches only when its name, company, and email carry the factory token,
 * or when the description is "Seeded for <uid>" and the name still matches.
 * An Account with a child the suite did not create is left in place.
 */
import { SalesforceApi } from '../api/SalesforceApi';
import { logger } from '../utils/logger';

const EMAIL_TOKEN = /\.([a-z0-9]{4,12})@[a-z0-9]*-\1\.example\.com$/;
const tokenOf = (uid: string) => uid.slice(-12).replace(/[^A-Za-z0-9]/g, '');

interface LeadRow {
  Id: string;
  LastName: string;
  Company: string;
  Email: string | null;
  IsConverted: boolean;
  ConvertedAccountId: string | null;
  ConvertedContactId: string | null;
  ConvertedOpportunityId: string | null;
}
interface NamedRow {
  Id: string;
  Name: string;
  Description?: string | null;
  Email?: string | null;
  LastName?: string;
  AccountId?: string | null;
}

function suiteLeadToken(l: LeadRow): string | undefined {
  const token = l.Email?.toLowerCase().match(EMAIL_TOKEN)?.[1];
  if (!token) return undefined;
  const t = new RegExp(`(^|[- ])${token}$`, 'i');
  return t.test(l.LastName) && t.test(l.Company) && l.LastName.toLowerCase().endsWith(`-${token}`) ? token : undefined;
}

async function main(): Promise<void> {
  const doDelete = process.argv.includes('--delete');
  const log = logger.child({ component: 'cleanup' });
  const api = await SalesforceApi.fromStorageState(log);
  if (!(await api.isAvailable())) throw new Error('REST is not available with this session file.');
  const soqlIds = (ids: Iterable<string>) => [...ids].map((i) => `'${i}'`).join(',');

  const leads = (
    await api.query<LeadRow & Record<string, unknown>>(
      "SELECT Id, LastName, Company, Email, IsConverted, ConvertedAccountId, ConvertedContactId, ConvertedOpportunityId FROM Lead WHERE Email LIKE '%.example.com'",
    )
  ).filter((l) => suiteLeadToken(l));

  const del = { Opportunity: new Set<string>(), Contact: new Set<string>(), Account: new Set<string>(), Lead: new Set<string>() };
  const why = new Map<string, string>();
  for (const l of leads) {
    del.Lead.add(l.Id);
    why.set(l.Id, `${l.LastName} / ${l.Company}`);
  }

  for (const a of await api.query<NamedRow & Record<string, unknown>>("SELECT Id, Name, Description FROM Account WHERE Website LIKE '%.example.com'")) {
    const uid = a.Description?.match(/^Seeded for (\S+)$/)?.[1];
    if (uid && a.Name.endsWith(` ${tokenOf(uid)}`)) {
      del.Account.add(a.Id);
      why.set(a.Id, `${a.Name} (seeded)`);
    }
  }
  for (const c of await api.query<NamedRow & Record<string, unknown>>(
    "SELECT Id, Name, LastName, Email, Description FROM Contact WHERE Email LIKE '%.example.com'",
  )) {
    const uid = c.Description?.match(/^Seeded for (\S+)$/)?.[1];
    if (uid && c.LastName?.endsWith(`-${tokenOf(uid)}`) && c.Email?.toLowerCase().includes(`-${tokenOf(uid).toLowerCase()}.example.com`)) {
      del.Contact.add(c.Id);
      why.set(c.Id, `${c.Name} (seeded)`);
    }
  }

  const converted = leads.filter((l) => l.IsConverted);
  const accIds = converted.map((l) => l.ConvertedAccountId).filter((x): x is string => !!x);
  const conIds = converted.map((l) => l.ConvertedContactId).filter((x): x is string => !!x);
  const oppIds = converted.map((l) => l.ConvertedOpportunityId).filter((x): x is string => !!x);
  const accs = accIds.length ? await api.query<NamedRow & Record<string, unknown>>(`SELECT Id, Name FROM Account WHERE Id IN (${soqlIds(accIds)})`) : [];
  const cons = conIds.length ? await api.query<NamedRow & Record<string, unknown>>(`SELECT Id, Name, LastName FROM Contact WHERE Id IN (${soqlIds(conIds)})`) : [];
  const opps = oppIds.length
    ? await api.query<NamedRow & Record<string, unknown>>(`SELECT Id, Name, AccountId FROM Opportunity WHERE Id IN (${soqlIds(oppIds)})`)
    : [];
  for (const l of converted) {
    const acc = accs.find((a) => a.Id === l.ConvertedAccountId);
    if (acc && acc.Name === l.Company) {
      del.Account.add(acc.Id);
      why.set(acc.Id, `${acc.Name} (converted)`);
    }
    const con = cons.find((c) => c.Id === l.ConvertedContactId);
    if (con && con.LastName === l.LastName) {
      del.Contact.add(con.Id);
      why.set(con.Id, `${con.Name} (converted)`);
    }
    const opp = opps.find((o) => o.Id === l.ConvertedOpportunityId);
    if (opp && opp.AccountId && del.Account.has(opp.AccountId)) {
      del.Opportunity.add(opp.Id);
      why.set(opp.Id, `${opp.Name} (converted)`);
    }
  }

  if (del.Account.size) {
    const ids = soqlIds(del.Account);
    const kids = [
      ...(await api.query<{ Id: string; AccountId: string }>(`SELECT Id, AccountId FROM Contact WHERE AccountId IN (${ids})`)).map((r) => ({
        ...r,
        set: del.Contact,
      })),
      ...(await api.query<{ Id: string; AccountId: string }>(`SELECT Id, AccountId FROM Opportunity WHERE AccountId IN (${ids})`)).map((r) => ({
        ...r,
        set: del.Opportunity,
      })),
    ];
    for (const k of kids.filter((row) => !row.set.has(row.Id))) {
      if (del.Account.delete(k.AccountId)) log.warn('skipping Account with a child the suite did not create', { accountId: k.AccountId });
    }
  }

  for (const [sobject, ids] of Object.entries(del)) {
    for (const id of ids) console.log(`${doDelete ? 'DELETE' : 'would delete'} ${sobject} ${id}  ${why.get(id)}`);
  }
  const total = Object.values(del).reduce((n, s) => n + s.size, 0);
  if (!doDelete) {
    console.log(`${total} records matched. Re-run with --delete to remove them.`);
    await api.dispose();
    return;
  }

  const outcome = { deleted: 0, gone: 0, failed: 0 };
  for (const sobject of ['Opportunity', 'Contact', 'Account', 'Lead'] as const) {
    for (const id of del[sobject]) outcome[await api.delete(sobject, id)]++;
  }
  console.log(`${total} records: ${JSON.stringify(outcome)}`);
  await api.dispose();
  if (outcome.failed) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
