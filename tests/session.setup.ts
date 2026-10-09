import fs from 'node:fs';
import { test as setup, expect } from '@playwright/test';
import { ensureSession } from '../auth/ensureSession';
import { lightningReady } from '../pages/components/lightning';
import { config } from '../config/env';

/**
 * Runs before the browser projects. Opens Lightning with the cached session file.
 * When that file is rejected and JWT settings are present, this saves a new file first.
 */
setup('cached session shows the App Launcher or global search', async ({ browser }) => {
  setup.setTimeout(config.timeouts.test);
  const session = await ensureSession(browser);
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
