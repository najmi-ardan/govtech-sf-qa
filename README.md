# Salesforce QA

Playwright and TypeScript tests for Lead creation, status edit, and Lead conversion in a Salesforce Developer Edition org.

## Setup

Create a Developer Edition org at https://developer.salesforce.com/signup and activate the account by hand. The signup form is not part of the suite.

Node 20.19 or newer.

```
npm ci
npx playwright install chromium webkit
```

Copy `.env.example` to `.env`. `.env` stays on the machine that runs the tests.

A Playwright `storageState` file is required at `storage/storageState.json`, or at the path in `STORAGE_STATE_PATH`. `storage/`, `*storageState*.json`, `.certs/`, and `.env` are gitignored. The Lightning origin comes from the `sid` cookie on the Lightning host. When that cookie is absent, the suite reads `baseURL` from `instance.json` in the same directory. `SF_BASE_URL` overrides both.

When Salesforce rejects the saved session, setup can mint a new one. That path needs an External Client App created once in the org, with `SF_USERNAME`, `SF_CLIENT_ID`, and `SF_JWT_KEY_PATH` (or `SF_JWT_PRIVATE_KEY`). The app needs the `web`, `api`, and `refresh_token` scopes, the certificate at `.certs/jwt-public.crt`, and this user pre-authorized. `SF_LOGIN_URL` defaults to `https://login.salesforce.com`.

```
npm run check
```

`npm run check` runs the typecheck and lint. An org is not required.

## Run

```
npm test
npm run test:chromium
npm run test:webkit
npm run test:smoke
npm run test:headed
npm run test:list
npm run session:check
npm run report
```

`npm test` runs setup, the Chromium suite, and the WebKit smoke tests.

Setup opens `/lightning/page/home` and continues when the App Launcher or the global search bar is visible. A missing or rejected session file is replaced when the JWT settings are present. Without those settings, setup fails and the browser projects are skipped.

Chromium runs the landing check, Lead create and status edit, both convert branches, and the two negative cases. WebKit runs the landing check, Lead create and status edit, and the convert branch that creates a new Account and Contact. The default worker count is 2. Each test builds its own Lead name, company, and email.

## Report

`npm run report` opens the HTML report in `reports/html`. `reports/results.json` is the machine-readable result. `reports/junit.xml` is the JUnit file. A failure keeps a screenshot and a video. A trace is kept on failure for a local run. Traces are off when `CI` is set, because a trace contains the session cookie.

## Scenarios

Login uses the cached session. A signed-in page shows the App Launcher or the global search bar.

Lead creation opens the Sales app, fills a generated name, company, lead source, and the other fields on the form, then saves. The test checks the 18-character Lead Id and the details view, then changes Lead Status. This org uses Open - Not Contacted and Working - Contacted. Qualified is selected when the org offers that value.

Conversion checks the convert modal for an existing Account and an existing Contact. A match is linked. When neither record exists, the modal creates both. The test opens the new Opportunity and checks the owner and stage.

Saving without the required fields shows the validation banner. A second Lead with the same email shows the duplicate warning when the org has an active Lead duplicate rule. That test skips when the rule cannot be confirmed.

Lead conversion posts to `/aura`. The action is `serviceComponent://ui.lead.runtime.components.controllers.LeadConvertDesktopController/ACTION$convertLeadServer`. A successful call returns HTTP 200. The action `state` is `SUCCESS`, `error` is empty, and `returnValue` carries `accountId`, `contactId`, and `opportunityId`. Stage is read from the Opportunity page. In this org that stage is Prospecting. `convertedStatus` is on the request, under `actions[].params`, with `leadId` and `newOpportunityRecord.Name`.

## Locators

Lightning redraws controls with new ids, and several controls sit in open shadow roots, so a CSS path through the shadow tree breaks on the next render. Fields are located by accessible name. Record fields use the stable `field-label` on `records-record-layout-item`. Lookups stay inside the visible modal or the active record page, because Lightning keeps hidden copies of earlier tabs in the DOM.

## Email verification

Salesforce asks for an email code when a password login comes from a browser it does not recognize. Setup loads the saved session. When Salesforce rejects that file, setup signs a short-lived JWT for an External Client App, exchanges it at the token endpoint, and requests a one-time Lightning URL from `/services/oauth2/singleaccess`. Playwright opens that URL and writes a new `storageState` file. The next run checks the file again and can refresh it, so a deleted or expired cache is replaced without a manual login.

Reading the code from a mailbox requires that mailbox's credentials in CI, plus a wait for the message. A public disposable inbox leaves the login code readable by anyone who knows the address, and Salesforce often refuses those domains. The JWT private key and consumer key remain secrets and are not committed. The External Client App is created once in Setup, and the user is pre-authorized.

## Data

The behaviour under test is done in the UI. REST seeds an existing Account or Contact, reads records back, and deletes them when cleanup is on (`CLEANUP_TEST_DATA=true`, or `npm run cleanup:test-data`). Lead emails stay within 80 characters.

## CI

The verify job in `.github/workflows/ci.yml` runs the typecheck, lint, and `npx playwright test --list`. It uses no secrets. The live job restores the session file from `SF_STORAGE_STATE_B64` and skips when that secret is absent.
