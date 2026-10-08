import type { Browser, Page } from '@playwright/test';
import { lightningReady } from '../pages/components/lightning';
import { config } from '../config/env';
import { logger as rootLogger } from '../utils/logger';
import { expiredSessionCookies, lightningBaseUrl, readStorageState, SessionStateError } from './sessionStore';

const log = rootLogger.child({ component: 'session' });

export interface OpenSession {
  lightningUrl: string;
  page: Page;
  close: () => Promise<void>;
}

/** Login form, or the email verification challenge. */
export function loginOrVerification(page: Page) {
  return page
    .locator('#username')
    .or(page.locator('#Login'))
    .or(page.getByRole('heading', { name: /verify your identity|check your email|verification code/i }))
    .first();
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown host';
  }
}

/**
 * Opens Lightning home once with the session file.
 * Fails when the file is missing or the browser lands on a login or verification page.
 * Does not type a password.
 */
export async function validateSession(browser: Browser): Promise<OpenSession> {
  const state = readStorageState();
  const sidCookies = state.cookies.filter((c) => c.name === 'sid');
  if (sidCookies.length > 0 && expiredSessionCookies(state).length === sidCookies.length) {
    throw new SessionStateError(`Every sid cookie in ${config.storageStatePath} has expired. The cached session is no longer valid.`);
  }

  const lightningUrl = lightningBaseUrl();
  const context = await browser.newContext({ storageState: config.storageStatePath });
  const page = await context.newPage();
  const close = () => context.close();
  try {
    await page.goto(`${lightningUrl}/lightning/page/home`, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeouts.navigation,
    });
    try {
      await lightningReady(page).or(loginOrVerification(page)).first().waitFor({
        state: 'visible',
        timeout: config.timeouts.navigation,
      });
    } catch {
      throw new SessionStateError(
        `Lightning did not show the App Launcher or the global search bar at ${lightningUrl}. The cached session is no longer valid.`,
      );
    }
    const blocked = await loginOrVerification(page).isVisible();
    const ready = await lightningReady(page).isVisible();
    if (blocked || !ready || /login\.salesforce\.com|\/secur\//i.test(page.url())) {
      throw new SessionStateError(
        `Opening ${lightningUrl} landed on a login or verification page (${hostOf(page.url())}). The cached session is no longer valid.`,
      );
    }
    log.info('session file is valid', { lightningUrl });
    return { lightningUrl, page, close };
  } catch (err) {
    await close();
    throw err;
  }
}
