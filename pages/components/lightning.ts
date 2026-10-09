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

/**
 * A duplicate alert or save error sits above the form and takes the click.
 * "We hit a snag." uses "Close error dialog". "Similar Records Exist" is a popover
 * whose close control is "Close", and the footer warning stays expanded over the picklist.
 * Closing either leaves the record form open.
 */
function duplicatePrompt(page: Page): Locator {
  // Match the prompt itself. A hasText search on every dialog also matches the New Lead
  // dialog that contains the prompt, and that dialog stays visible after the prompt closes.
  const named = page.getByRole('dialog', { name: /Similar Records Exist/ }).filter({ visible: true });
  const popover = page
    .locator('.slds-popover, lightning-popup')
    .filter({ hasText: /Similar Records Exist|View Duplicates/ })
    .filter({ visible: true });
  return named.or(popover);
}

export async function dismissErrorDialog(page: Page, timeout = 10_000): Promise<boolean> {
  const closeError = page.getByRole('button', { name: 'Close error dialog', exact: true }).filter({ visible: true });
  const prompt = duplicatePrompt(page);
  const promptClose = prompt
    .getByRole('button', { name: /^close( dialog)?$/i })
    .or(prompt.locator('button.slds-popover__close, button[title="Close"], button[title="Close dialog"]'));
  const errorToggle = page.getByRole('button', { name: 'Error', exact: true }).filter({ visible: true });

  const open = async (): Promise<'error-dialog' | 'similar' | 'error-toggle' | null> => {
    if ((await closeError.count()) > 0) return 'error-dialog';
    if ((await prompt.count()) > 0) return 'similar';
    if ((await errorToggle.count()) > 0) {
      const expanded = await errorToggle.last().getAttribute('aria-expanded', { timeout: 1_000 }).catch(() => null);
      if (expanded === 'true') return 'error-toggle';
    }
    return null;
  };

  if (!(await open())) return false;

  await expect(async () => {
    const which = await open();
    if (which === 'error-dialog') await closeError.last().click({ timeout: 2_000 });
    else if (which === 'similar') {
      if ((await promptClose.count()) > 0) await promptClose.last().click({ timeout: 2_000 });
      else if ((await errorToggle.count()) > 0) await errorToggle.last().click({ timeout: 2_000 });
      else throw new Error('Similar Records Exist has no close control');
    } else if (which === 'error-toggle') await errorToggle.last().click({ timeout: 2_000 });
    if (await open()) throw new Error('prompt still open');
  }).toPass({ timeout });
  return true;
}

export async function fillText(scope: Scope, label: string, value: string): Promise<void> {
  await dismissErrorDialog(rootPage(scope));
  const field = textField(scope, label);
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

/** The listbox for an open combobox, found through aria-controls so hidden comboboxes are not used. */
async function listboxFor(trigger: Locator): Promise<Locator> {
  const page = trigger.page();
  const id = await trigger.getAttribute('aria-controls', { timeout: 2_000 }).catch(() => null);
  const owned = id ? page.locator(`[id="${id}"]`) : undefined;
  // WebKit sometimes leaves the aria-controls node empty and paints the open list elsewhere.
  if (owned && (await owned.getByRole('option').count()) > 0) return owned;
  const visible = page.getByRole('listbox').filter({ visible: true }).last();
  if ((await visible.count()) > 0) return visible;
  return owned ?? visible;
}

type PicklistOption = { value: string; label: string };

/**
 * data-value is the stored code (US). The name the form shows (United States) is in the shadow root.
 * innerText on the host is blank, so both are read here.
 */
async function readOptions(listbox: Locator): Promise<PicklistOption[]> {
  try {
    const options = listbox.locator('[role="option"]');
    if ((await options.count()) === 0) return [];
    const rows = await options.evaluateAll((els) =>
      els.map((el) => {
        const host = el as HTMLElement;
        const value = host.getAttribute('data-value')?.trim() ?? '';
        const aria = host.getAttribute('aria-label')?.trim() ?? '';
        const truncate = host.shadowRoot?.querySelector('.slds-truncate')?.textContent ?? '';
        const text = (truncate || host.shadowRoot?.textContent || host.textContent || '').replace(/\s+/g, ' ').trim();
        return { value, label: aria || text || value };
      }),
    );
    const seen = new Set<string>();
    const out: PicklistOption[] = [];
    for (const row of rows) {
      const label = row.label.trim();
      if (!label) continue;
      const key = `${row.value}|${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value: row.value, label });
    }
    return out;
  } catch {
    return [];
  }
}

function describeOptions(options: PicklistOption[]): string {
  return options
    .map((option) => (option.value && option.value !== option.label ? `${option.label} (${option.value})` : option.label))
    .join(', ');
}

function labelMatches(label: string, candidate: string): boolean {
  const lines = label
    .split(/\n| {2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return label.trim() === candidate || lines.includes(candidate);
}

function optionFor(listbox: Locator, candidate: string): Locator {
  const quoted = candidate.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return listbox
    .getByRole('option', { name: candidate, exact: true })
    .or(listbox.locator(`[data-value="${quoted}"]`))
    .first();
}

function optionMatches(option: PicklistOption, candidate: string): boolean {
  return option.value === candidate || labelMatches(option.label, candidate);
}

/**
 * locator.click() scrolls the option into view, and Lightning closes the menu on that scroll.
 * A DOM click on the option does not scroll.
 */
async function clickOptionWithoutScroll(option: Locator): Promise<boolean> {
  try {
    return await option.evaluate((el) => {
      const host = el as HTMLElement;
      const inner = host.shadowRoot?.querySelector<HTMLElement>('[role="option"], .slds-media');
      (inner ?? host).click();
      return true;
    });
  } catch {
    return false;
  }
}

async function menuOpen(trigger: Locator): Promise<boolean> {
  return (await trigger.getAttribute('aria-expanded', { timeout: 1_000 }).catch(() => null)) === 'true';
}

/** aria-expanded flips after the click. getAttribute alone reads the value too early. */
async function waitForMenu(trigger: Locator): Promise<boolean> {
  return expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: 3_000 }).then(
    () => true,
    () => false,
  );
}

async function collapseMenu(trigger: Locator): Promise<void> {
  if (await menuOpen(trigger)) await trigger.press('Escape').catch(() => undefined);
}

/** Typeahead plus Enter. The trigger is already in view, so the page does not scroll. */
async function chooseByTypeahead(trigger: Locator, candidate: string): Promise<void> {
  if (!(await menuOpen(trigger))) return;
  const isInput = await trigger.evaluate((el) => el instanceof HTMLInputElement).catch(() => false);
  if (isInput) await trigger.press('ControlOrMeta+A').catch(() => undefined);
  await trigger.pressSequentially(candidate, { delay: 40 });
  if (await menuOpen(trigger)) await trigger.press('Enter');
}

async function selectionStuck(trigger: Locator, accepted: string[], timeout = 3_000): Promise<boolean> {
  const wanted = [...new Set(accepted.map((item) => item.trim()).filter(Boolean))];
  return expect
    .poll(
      async () => {
        const isInput = await trigger.evaluate((el) => el instanceof HTMLInputElement).catch(() => false);
        const current = isInput ? await trigger.inputValue().catch(() => '') : await trigger.innerText().catch(() => '');
        const text = current.replace(/\s+/g, ' ').trim();
        // Short codes such as US must match exactly. A visible name may be part of a longer trigger label.
        return wanted.some((item) => text === item || (item.length > 3 && text.includes(item)));
      },
      { timeout },
    )
    .toBe(true)
    .then(
      () => true,
      () => false,
    );
}

/**
 * Opens a picklist, chooses the first available value, and checks that the trigger kept it.
 * A button combobox shows the value as text. An input combobox (State, Country) keeps it in the value.
 * A missing menu or a missing name is retried. The duplicate prompt hides the form between attempts.
 */
export async function selectOption(scope: Scope, label: string, value: string, fallbacks: string[] = []): Promise<string> {
  const page = rootPage(scope);
  const trigger = combobox(scope, label);
  const maxAttempts = 3;
  const wanted = [...new Set([value, ...fallbacks])];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // A duplicate prompt can open while the previous field blurs and swallow the click.
    await dismissErrorDialog(page);
    try {
      // Scroll the trigger, never the option. The menu is still closed, so this scroll is safe.
      await trigger.scrollIntoViewIfNeeded({ timeout: 5_000 });
      await trigger.click({ timeout: 5_000 });
    } catch (err) {
      if (attempt === maxAttempts || !(await dismissErrorDialog(page))) throw err;
      continue;
    }

    if (!(await waitForMenu(trigger))) {
      // Similar Records Exist sets aria-hidden on the form. The combobox locator
      // cannot resolve until that prompt is closed, so dismiss it and retry.
      await dismissErrorDialog(page);
      if (attempt === maxAttempts) throw new Error(`Picklist "${label}" did not show its options`);
      continue;
    }

    const listbox = await listboxFor(trigger);
    const optionVisible = await listbox
      .getByRole('option')
      .first()
      .waitFor({ state: 'visible', timeout: 2_500 })
      .then(
        () => true,
        () => false,
      );
    if (!optionVisible) {
      await dismissErrorDialog(page);
      await collapseMenu(trigger);
      if (attempt === maxAttempts) throw new Error(`Picklist "${label}" did not show its options`);
      continue;
    }

    const options = await readOptions(listbox);
    let chosen: string | undefined;
    for (const candidate of wanted) {
      if (options.some((option) => optionMatches(option, candidate)) || (await optionFor(listbox, candidate).count()) > 0) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen) {
      await collapseMenu(trigger);
      await dismissErrorDialog(page);
      if (attempt === maxAttempts) {
        throw new Error(
          `Picklist "${label}" has none of [${wanted.join(', ')}]; available: [${describeOptions(options)}]`,
        );
      }
      continue;
    }

    const option = optionFor(listbox, chosen);
    const match = options.find((item) => optionMatches(item, chosen));
    const accepted = [chosen, match?.label ?? '', match?.value ?? ''];
    if ((await option.count()) > 0) await clickOptionWithoutScroll(option);
    if (await selectionStuck(trigger, accepted, 2_000)) return chosen;

    if (await menuOpen(trigger)) await chooseByTypeahead(trigger, chosen);
    if (await selectionStuck(trigger, accepted)) return chosen;

    await collapseMenu(trigger);
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
  // The duplicate prompt hides the form. A hidden combobox looks like a missing one.
  await dismissErrorDialog(rootPage(scope));
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
