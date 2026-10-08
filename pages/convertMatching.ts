import { escapeRegex } from '../utils/text';

/** Accessible name of a match-list radio. The Create New option does not count. */
export function existingRecordRadioName(recordName: string): RegExp {
  return new RegExp(`^(?!.*\\b(?:create\\s+)?new\\b).*${escapeRegex(recordName.trim())}`, 'i');
}

/** Lookup option that starts with the record name. The search-in helper row does not count. */
export function lookupOptionName(recordName: string): RegExp {
  return new RegExp(`^\\s*(?:mrs?\\.|ms\\.|dr\\.|prof\\.)?\\s*${escapeRegex(recordName.trim())}\\b`, 'i');
}

/** Success-screen link. A salutation prefix is allowed. A longer name that only starts the same way is not. */
export function convertedRecordLinkName(recordName: string): RegExp {
  return new RegExp(`(?:^|\\s)${escapeRegex(recordName.trim())}$`);
}
