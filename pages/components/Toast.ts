import { expect, type Locator, type Page } from '@playwright/test';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/**
 * Lightning toasts. Matched as role=alert, lightning-toast, or the Aura toast classes.
 * They dismiss on their own, so the caller reads them immediately after the action.
 */
export class Toast {
  constructor(private readonly page: Page) {}

  toasts(variant?: ToastVariant): Locator {
    if (!variant) {
      return this.page
        .getByRole('alert')
        .or(this.page.locator('lightning-toast, .forceToastMessage, .slds-notify_toast'))
        .filter({ visible: true });
    }
    return this.page
      .locator(
        [
          `lightning-toast[variant="${variant}"]`,
          `.slds-notify_toast.slds-theme_${variant}`,
          `.slds-notify_toast.slds-theme--${variant}`,
          `.forceToastMessage.slds-theme--${variant}`,
          `[role="alert"].slds-theme_${variant}`,
        ].join(', '),
      )
      .filter({ visible: true });
  }

  async expectToast(text: string | RegExp, variant?: ToastVariant): Promise<string> {
    const toast = this.toasts(variant).filter({ hasText: text }).first();
    await expect(toast).toBeVisible();
    return (await toast.innerText()).trim();
  }
}
