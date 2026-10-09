# Salesforce QA

Playwright tests for a Developer Edition org. The suite reuses a Playwright storageState file. When Salesforce rejects that file, and the JWT settings below are present, setup asks for a new browser session and saves the file again. It does not type a password or an email code.

## Setup

Use Node 20.19 or newer.

```
npm ci
npx playwright install chromium webkit
```

Copy `.env.example` to `.env`. `.env` stays local.

Place a captured session file at `storage/storageState.json`, or set `STORAGE_STATE_PATH` to the file. `storage/`, `*storageState*.json`, `.certs/`, and `.env` are gitignored. The Lightning origin is taken from the `sid` cookie on the Lightning host. If that cookie is absent, the suite reads `baseURL` from `instance.json` in the same directory. `SF_BASE_URL` overrides both.

To refresh a rejected session without the email verification page, create an External Client App once in the org and set `SF_USERNAME`, `SF_CLIENT_ID`, and `SF_JWT_KEY_PATH` (or `SF_JWT_PRIVATE_KEY`). The app needs the `web`, `api`, and `refresh_token` scopes, the public certificate from `.certs/jwt-public.crt`, and this user pre-authorized. `SF_LOGIN_URL` defaults to `https://login.salesforce.com`.

```
npm run check
```

`npm run check` runs the typecheck and lint. It does not need an org.

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

`npm test` runs the setup project, the Chromium suite, and the WebKit smoke tests.

The setup project opens `/lightning/page/home` once. The browser projects run when the App Launcher or the global search bar is visible. A missing or rejected session file is replaced when the JWT settings are present. Without those settings, setup fails and the browser projects are skipped.

Chromium runs the landing check, Lead create and status edit, both convert branches, and the two negative cases. WebKit runs the landing check, Lead create and status edit, and the convert branch that creates a new Account and Contact. The default worker count is 2.

## Report

`npm run report` opens the HTML report in `reports/html`. `reports/results.json` is the machine-readable result. `reports/junit.xml` is the JUnit file. A failure keeps a screenshot and a video. A trace is kept on failure for a local run. Traces are off when `CI` is set, because a trace contains the session cookie.

## Email verification

Salesforce shows an email code when a browser it does not recognize logs in with a password. This suite does not do that login. Setup loads the saved session. When Salesforce rejects it, setup signs a short-lived JWT for an External Client App, exchanges it at the token endpoint, and asks `/services/oauth2/singleaccess` for a one-time Lightning URL. Playwright opens that URL and writes a new `storageState` file. Later runs in the same session reuse the file. The next run still checks the file and can refresh it again, so a deleted or expired cache does not have to be repaired by hand.

A real mailbox API would read that code from the user's inbox. It works, and it needs a mailbox password or app password in CI, plus handling for mail delays and for Salesforce changing the message. A public disposable inbox is a poor fit: the code is a login secret that anyone who knows the address can read, and Salesforce often refuses those domains. The JWT bridge avoids both. The private key and consumer key are still secrets, the app has to be created once by someone who can open Setup, and the user has to be pre-authorized. The key is not committed.

## Data

The behaviour under test is done in the UI. The API is limited to seeding an existing Account or Contact, reading records back, and optional cleanup (`CLEANUP_TEST_DATA=true`, or `npm run cleanup:test-data`). Each test builds its own Lead name, company, and email. The email stays within 80 characters. The duplicate-email test skips when REST cannot see an active Lead duplicate rule.

The verify job in `.github/workflows/ci.yml` runs the typecheck, lint, and `npx playwright test --list`. It uses no secrets. The live job restores the session file from `SF_STORAGE_STATE_B64` and skips when that secret is absent.
