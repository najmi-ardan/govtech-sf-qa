import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegex } from '../../utils/text';
import { appLauncherButton } from './lightning';

/** App Launcher: the button, the search combobox, then an option with the exact app name. */
export class AppLauncher {
  static readonly SEARCH_NAME = 'Search apps and items...';
  readonly button: Locator;
  readonly search: Locator;

  constructor(private readonly page: Page) {
    this.button = appLauncherButton(page);
    this.search = page
      .getByRole('combobox', { name: AppLauncher.SEARCH_NAME, exact: true })
      .or(page.getByPlaceholder(AppLauncher.SEARCH_NAME, { exact: true }))
      .first();
  }

  result(appName: string): Locator {
    return this.page
      .getByRole('option', { name: appName, exact: true })
      .or(this.page.getByRole('option').filter({ hasText: new RegExp(`^\\s*${escapeRegex(appName)}\\s*$`) }))
      .first();
  }

  async openApp(appName: string): Promise<void> {
    await this.button.click();
    await expect(this.search).toBeVisible();
    const result = this.result(appName);
    // The launcher can clear the search box when its default list finishes loading.
    await expect(async () => {
      if ((await this.search.inputValue()) !== appName) await this.search.fill(appName);
      await expect(this.search).toHaveValue(appName, { timeout: 2_000 });
      await expect(result).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
    // A click on the option is dropped while the results re-render. Click again while it is still shown.
    await expect(async () => {
      if (await result.isVisible()) await result.click({ timeout: 5_000 });
      await expect(this.search).toBeHidden({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
  }
}
