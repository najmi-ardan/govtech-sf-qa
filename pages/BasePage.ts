import { expect, type Locator, type Page } from '@playwright/test';
import { lightningBaseUrl } from '../auth/sessionStore';
import { Toast } from './components/Toast';
import { activeRecordPage, appLauncherButton, globalSearchButton, modal, waitForSpinners } from './components/lightning';
import { logger as rootLogger, type Logger } from '../utils/logger';
import { step } from '../utils/step';

/** Navigation, the Lightning-ready wait, toasts, and the active tab. */
export abstract class BasePage {
  readonly toast: Toast;
  protected readonly log: Logger;

  constructor(
    readonly page: Page,
    log: Logger = rootLogger,
  ) {
    this.log = log.child({ page: this.constructor.name });
    this.toast = new Toast(page);
  }

  get appLauncherButton(): Locator {
    return appLauncherButton(this.page);
  }

  get globalSearch(): Locator {
    return globalSearchButton(this.page);
  }

  get activePage(): Locator {
    return activeRecordPage(this.page);
  }

  modal(title?: string | RegExp): Locator {
    return modal(this.page, title);
  }

  url(path: string): string {
    return `${lightningBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async goto(path: string): Promise<void> {
    const target = this.url(path);
    this.log.debug('navigate', { target });
    await this.page.goto(target, { waitUntil: 'domcontentloaded' });
    await this.waitForLightning();
  }

  async waitForLightning(): Promise<void> {
    await expect(this.appLauncherButton).toBeVisible();
    await waitForSpinners(this.page);
  }

  protected step<T>(title: string, body: () => Promise<T>): Promise<T> {
    return step(title, body, this.log);
  }
}
