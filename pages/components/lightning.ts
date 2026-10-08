import type { Locator, Page } from '@playwright/test';

/** App Launcher button. Present once Lightning has loaded for an authenticated user. */
export function appLauncherButton(page: Page): Locator {
  return page.getByRole('button', { name: 'App Launcher', exact: true });
}

/** Global search button in the header. */
export function globalSearchButton(page: Page): Locator {
  return page.getByRole('button', { name: /^Search/ }).filter({ visible: true }).first();
}

/** Either control is enough to treat the cached session as signed in. */
export function lightningReady(page: Page): Locator {
  return appLauncherButton(page).or(globalSearchButton(page)).first();
}
