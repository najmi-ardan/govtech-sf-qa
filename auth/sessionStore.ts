import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env';

/**
 * The Playwright storageState file is the only source of authentication.
 * The Lightning origin comes from SF_BASE_URL, otherwise from a sid cookie on
 * *.lightning.force.com, otherwise from instance.json beside the session file.
 */

export interface StateCookie {
  name: string;
  value: string;
  domain: string;
  /** Unix seconds. -1 is a session cookie. */
  expires: number;
}

export interface StorageStateFile {
  cookies: StateCookie[];
  origins?: unknown[];
}

export class SessionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionStateError';
  }
}

/** Writes the session file without leaving a partial file behind. */
export function writeStorageState(file: string, state: StorageStateFile): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Reads the session file and checks that it contains a sid cookie. */
export function readStorageState(file: string = config.storageStatePath): StorageStateFile {
  if (!fs.existsSync(file)) {
    throw new SessionStateError(`No session file at ${file}. The cached session is no longer valid.`);
  }
  let state: StorageStateFile;
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8')) as StorageStateFile;
  } catch (err) {
    throw new SessionStateError(`${file} is not valid JSON (${(err as Error).message}). The cached session is no longer valid.`);
  }
  if (!Array.isArray(state?.cookies) || !state.cookies.some((c) => c.name === 'sid')) {
    throw new SessionStateError(`${file} has no sid cookie. The cached session is no longer valid.`);
  }
  return state;
}

const hostOf = (c: StateCookie) => c.domain.replace(/^\./, '').toLowerCase();

/**
 * Org URLs implied by the cookies. Prefers the sid cookie, because other hosts also set cookies.
 */
export function orgUrlsFromState(state: StorageStateFile): { lightningUrl?: string; instanceUrl?: string } {
  const pick = (suffix: RegExp) => {
    const onHost = state.cookies.filter((c) => suffix.test(hostOf(c)));
    const c = onHost.find((x) => x.name === 'sid') ?? onHost[0];
    return c ? `https://${hostOf(c)}` : undefined;
  };
  return {
    lightningUrl: pick(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.lightning\.force\.com$/),
    instanceUrl: pick(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.my\.salesforce\.com$/),
  };
}

/** sid cookies whose explicit expiry has passed. Session cookies (expires = -1) are not included. */
export function expiredSessionCookies(state: StorageStateFile, nowMs: number = Date.now()): StateCookie[] {
  return state.cookies.filter((c) => c.name === 'sid' && c.expires > 0 && c.expires * 1000 < nowMs);
}

export function originFromInstance(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** instance.json beside the session file: `{ "baseURL": "https://….lightning.force.com" }`. */
export function instanceFileFor(storageStatePath: string): string {
  return path.join(path.dirname(storageStatePath), 'instance.json');
}

export function readInstanceBaseUrl(file: string): string | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { baseURL?: string };
    return originFromInstance(parsed.baseURL);
  } catch {
    return undefined;
  }
}

/** SF_BASE_URL, then the sid cookie host, then instance.json. */
export function resolveLightningUrl(state: StorageStateFile, override = '', instanceBaseUrl?: string): string | undefined {
  return override || orgUrlsFromState(state).lightningUrl || instanceBaseUrl || undefined;
}

let cachedBaseUrl: string | undefined;

export function lightningBaseUrl(): string {
  if (config.salesforce.baseUrl) return config.salesforce.baseUrl;
  if (cachedBaseUrl) return cachedBaseUrl;
  const state = readStorageState();
  const url = resolveLightningUrl(state, '', readInstanceBaseUrl(instanceFileFor(config.storageStatePath)));
  if (!url) {
    throw new SessionStateError(
      `Cannot tell the Lightning origin from ${config.storageStatePath}. The cached session is no longer valid.`,
    );
  }
  return (cachedBaseUrl = url);
}

/** REST host: the my.salesforce.com sid domain, otherwise derived from the Lightning origin. */
export function instanceUrl(state: StorageStateFile = readStorageState()): string {
  return orgUrlsFromState(state).instanceUrl ?? toInstanceUrl(lightningBaseUrl());
}

export function toInstanceUrl(lightningUrl: string): string {
  return lightningUrl.replace('.lightning.force.com', '.my.salesforce.com');
}
