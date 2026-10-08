import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegex } from '../../utils/text';

/**
 * Locators for Lightning (LWC and Aura).
 *
 * Role and label locators are used because generated ids change on every render, and
 * XPath does not pierce open shadow roots. Host elements are selected by a stable
 * attribute such as field-label. Lookups are scoped to the visible modal or the
 * active record page, because Lightning keeps hidden copies of earlier tabs in the DOM.
 */

export type Scope = Page | Locator;

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

function rootPage(scope: Scope): Page {
  return typeof (scope as Locator).page === 'function' ? (scope as Locator).page() : (scope as Page);
}

/**
 * Required fields fold an asterisk into the accessible name ("*Last Name").
 */
export function labelRegex(label: string): RegExp {
  return new RegExp(`^\\*?\\s*${escapeRegex(label)}\\s*\\*?$`);
}

/** lightning-input or lightning-textarea. Exact name first, then an asterisk-tolerant fallback. */
export function textField(scope: Scope, label: string): Locator {
  return scope
    .getByRole('textbox', { name: label, exact: true })
    .or(scope.getByLabel(label, { exact: true }))
    .or(scope.getByRole('textbox', { name: labelRegex(label) }))
    .first();
}

/** lightning-combobox trigger. The inner id is generated per render, so the accessible name is used. */
export function combobox(scope: Scope, label: string): Locator {
  return scope
    .getByRole('combobox', { name: label, exact: true })
    .or(scope.getByRole('combobox', { name: labelRegex(label) }))
    .first();
}

export async function fillText(scope: Scope, label: string, value: string): Promise<void> {
  const field = textField(scope, label);
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

/** The listbox for an open combobox, found through aria-controls so hidden comboboxes are not used. */
async function listboxFor(trigger: Locator): Promise<Locator> {
  const page = trigger.page();
  const id = await trigger.getAttribute('aria-controls');
  return id ? page.locator(`[id="${id}"]`) : page.getByRole('listbox').filter({ visible: true }).last();
}

/**
 * Opens a picklist, chooses the first available value, and checks that the trigger kept it.
 * A button combobox shows the value as text. An input combobox (State, Country) keeps it in the value.
 */
export async function selectOption(scope: Scope, label: string, value: string, fallbacks: string[] = []): Promise<string> {
  const page = rootPage(scope);
  const trigger = combobox(scope, label);
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const listbox = await listboxFor(trigger);
    await expect(listbox.getByRole('option').first()).toBeVisible();

    let chosen: string | undefined;
    for (const candidate of [value, ...fallbacks]) {
      const option = listbox.getByRole('option', { name: candidate, exact: true });
      if (await option.count()) {
        await option.first().click();
        chosen = candidate;
        break;
      }
    }
    if (!chosen) {
      const available = (await listbox.getByRole('option').allInnerTexts()).map((t) => t.trim());
      await page.keyboard.press('Escape');
      throw new Error(`Picklist "${label}" has none of [${[value, ...fallbacks].join(', ')}]; available: [${available.join(', ')}]`);
    }

    const isInput = await trigger.evaluate((el) => el instanceof HTMLInputElement);
    const committed = await (isInput
      ? expect(trigger).toHaveValue(chosen, { timeout: 3_000 })
      : expect(trigger).toContainText(chosen, { timeout: 3_000 })
    ).then(() => true, () => false);
    if (committed) return chosen;
    if (attempt === maxAttempts) {
      throw new Error(`Picklist "${label}": "${chosen}" did not stick after ${maxAttempts} attempts`);
    }
  }
  throw new Error(`Picklist "${label}" did not keep a value`);
}

/** Current value of a combobox trigger. An input's text is empty; the value is on the element. */
export async function comboboxValue(trigger: Locator): Promise<string> {
  const v = await trigger.evaluate((el) =>
    el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : (el as HTMLElement).innerText,
  );
  return v.trim();
}

/**
 * Aura radios in the convert modal draw a label over the input, so a click is intercepted.
 * Focus and Space select the radio.
 */
export async function checkRadio(radio: Locator): Promise<void> {
  if (await radio.isChecked()) return;
  await radio.focus();
  await radio.press('Space');
  await expect(radio).toBeChecked();
}

/**
 * State and Country are plain inputs until the org enables the territory picklists, and comboboxes after that.
 */
export async function fillTextOrSelect(scope: Scope, label: string, value: string): Promise<void> {
  if (await combobox(scope, label).count()) {
    await selectOption(scope, label, value);
  } else {
    await fillText(scope, label, value);
  }
}

/**
 * A record field host. The LWC host carries field-label. Older Aura layouts use the test-id hooks.
 */
export function recordField(scope: Scope, label: string): Locator {
  const lwc = scope.locator(`records-record-layout-item[field-label="${label}"]`);
  const aura = scope
    .locator('.slds-form-element')
    .filter({ has: rootPage(scope).locator('.test-id__field-label').getByText(label, { exact: true }) });
  return lwc.or(aura).first();
}

/** Lightning keeps previously visited tabs in the DOM. Scope to the visible one. */
export function activeRecordPage(page: Page): Locator {
  return page.locator('div.oneContent.active, div.windowViewMode-normal.active, one-record-home-flexipage2').filter({ visible: true }).first();
}

/** The topmost open modal, optionally matched by its heading. */
export function modal(page: Page, title?: string | RegExp): Locator {
  const dialogs = page.getByRole('dialog').filter({ visible: true });
  return (title ? dialogs.filter({ has: page.getByRole('heading', { name: title }) }) : dialogs).last();
}

/** Lightning and Aura loading indicators. */
export const SPINNER_SELECTOR = '.slds-spinner, lightning-spinner, .loadingIndicator, .auraLoadingBox';

export async function waitForSpinners(page: Page, timeout?: number): Promise<void> {
  await expect(page.locator(SPINNER_SELECTOR).filter({ visible: true })).toHaveCount(0, { timeout });
}
