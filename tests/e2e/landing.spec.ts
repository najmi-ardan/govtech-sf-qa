import { test, expect } from '../fixtures';
import { lightningReady } from '../../pages/components/lightning';

test.describe('Authenticated landing', () => {
  test('cached session opens Lightning', { tag: ['@smoke', '@auth'] }, async ({ salesApp }) => {
    await salesApp.goto('/lightning/page/home');
    await expect(lightningReady(salesApp.page)).toBeVisible();
    await expect(salesApp.page).not.toHaveURL(/login\.salesforce\.com|\/secur\//);
  });

  test('opens the Sales app and the Leads tab', async ({ salesApp, leadsPage }) => {
    await salesApp.openViaAppLauncher();
    await salesApp.openTab('Leads');
    await expect(leadsPage.newButton).toBeVisible();
  });
});
