import fs from 'node:fs';
import { test as setup, expect } from '@playwright/test';
import { validateSession } from '../auth/validateSession';
import { lightningReady } from '../pages/components/lightning';
import { config } from '../config/env';

/**
 * Runs before the browser projects. Opens Lightning once with the cached session file.
 * A missing file, or a login or verification page, fails here and the browser projects are skipped.
 */
setup('cached session shows the App Launcher or global search', async ({ browser }) => {
  setup.setTimeout(2 * config.timeouts.navigation);
  const session = await validateSession(browser);
  try {
    await expect(lightningReady(session.page)).toBeVisible();
    await expect(session.page).not.toHaveURL(/login\.salesforce\.com|\/secur\//);
    const ageHours = (Date.now() - fs.statSync(config.storageStatePath).mtimeMs) / 3_600_000;
    setup.info().annotations.push({
      type: 'session',
      description: `${new URL(session.lightningUrl).host}; file age ${ageHours.toFixed(1)} h`,
    });
  } finally {
    await session.close();
  }
});
