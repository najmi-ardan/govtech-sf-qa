import type { Browser } from '@playwright/test';
import { config } from '../config/env';
import { logger as rootLogger } from '../utils/logger';
import { refreshSession } from './jwtSession';
import { SessionStateError } from './sessionStore';
import { validateSession, type OpenSession } from './validateSession';

const log = rootLogger.child({ component: 'session' });

/**
 * Opens Lightning with the cached session file.
 * When that file is missing or Salesforce rejects it, and JWT settings are present,
 * asks for a new browser session and saves the file before the browser projects start.
 */
export async function ensureSession(browser: Browser): Promise<OpenSession> {
  try {
    return await validateSession(browser);
  } catch (err) {
    if (!(err instanceof SessionStateError) || !config.jwt) throw err;
    log.warn('cached session was rejected');
    return refreshSession(browser);
  }
}
