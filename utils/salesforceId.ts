/**
 * An 18-character Id is the 15-character Id plus a 3-character checksum of the letter case.
 */

const CHECKSUM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

export const KEY_PREFIX = {
  Account: '001',
  Contact: '003',
  Opportunity: '006',
  Lead: '00Q',
} as const;

export function to18(id15: string): string {
  if (!/^[a-zA-Z0-9]{15}$/.test(id15)) throw new Error(`Not a 15-character Salesforce Id: ${id15}`);
  let suffix = '';
  for (let block = 0; block < 3; block++) {
    let bits = 0;
    for (let i = 0; i < 5; i++) {
      const c = id15[block * 5 + i];
      if (c >= 'A' && c <= 'Z') bits |= 1 << i;
    }
    suffix += CHECKSUM_ALPHABET[bits];
  }
  return id15 + suffix;
}

export function isValid18CharId(id: string, prefix?: string): boolean {
  if (!/^[a-zA-Z0-9]{18}$/.test(id)) return false;
  if (prefix && !id.startsWith(prefix)) return false;
  return to18(id.slice(0, 15)) === id;
}

/**
 * Record URL to Id. After Save the path is often /lightning/r/<Id>/view, with no object name.
 * With an sobject, the object segment must match when it is present, and a known key prefix is required.
 */
export function recordUrlRegex(sobject?: string): RegExp {
  if (!sobject) return /\/lightning\/r\/(?:[A-Za-z0-9_]+\/)?([a-zA-Z0-9]{15,18})\/view/;
  const prefix = KEY_PREFIX[sobject as keyof typeof KEY_PREFIX];
  const id = prefix ? `${prefix}[a-zA-Z0-9]{12,15}` : '[a-zA-Z0-9]{15,18}';
  return new RegExp(`/lightning/r/${prefix ? '(?:' + sobject + '/)?' : sobject + '/'}(${id})/view`);
}

export function recordIdFromUrl(url: string, sobject?: string): string | undefined {
  return url.match(recordUrlRegex(sobject))?.[1];
}
