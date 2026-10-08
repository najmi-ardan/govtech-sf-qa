import { expect, type Locator } from '@playwright/test';
import { AppLauncher } from './components/AppLauncher';
import { BasePage } from './BasePage';

/** The standard Sales Lightning app. */
export class SalesAppPage extends BasePage {
  static readonly APP_NAME = 'Sales';

  get appName(): Locator {
    return this.page.locator('.slds-context-bar__app-name, .appName').filter({ visible: true }).first();
  }

  get navBar(): Locator {
    // A partial name matches the Global Header landmark, which has no tabs.
    return this.page.getByRole('navigation', { name: 'Global', exact: true });
  }

  navTab(name: string): Locator {
    return this.navBar.getByRole('link', { name, exact: true });
  }

  /** Narrow viewports put items in the More menu. Exact "Sales" also avoids Sales Console. */
  get moreMenu(): Locator {
    return this.navBar.getByRole('button', { name: /^More\b/ });
  }

  async openViaAppLauncher(): Promise<void> {
    await this.step('Open the Sales app via the App Launcher', async () => {
      await this.goto('/lightning/page/home');
      await new AppLauncher(this.page).openApp(SalesAppPage.APP_NAME);
      await this.expectCurrentApp();
    });
  }

  async expectCurrentApp(): Promise<void> {
    await expect(this.appName).toHaveText(SalesAppPage.APP_NAME);
  }

  async openTab(name: string): Promise<void> {
    await this.step(`Open the "${name}" tab`, async () => {
      await expect(this.navTab(name).or(this.moreMenu).first()).toBeVisible();
      if (await this.navTab(name).isVisible()) {
        await this.navTab(name).click();
      } else {
        await this.moreMenu.click();
        await this.page.getByRole('menuitem', { name, exact: true }).click();
      }
      await this.waitForLightning();
    });
  }
}
