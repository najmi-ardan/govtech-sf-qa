# Salesforce QA

Playwright tests for a Developer Edition org. The suite loads a Playwright storageState file. It does not sign in.

## Setup

Use Node 20.19 or newer.

```
npm ci
npx playwright install chromium webkit
```

Copy `.env.example` to `.env`. `.env` stays local.

Place the session file at `storage/storageState.json`, or set `STORAGE_STATE_PATH` to the file. `storage/`, `*storageState*.json`, and `.env` are gitignored. The Lightning origin is taken from the `sid` cookie on the Lightning host. If that cookie is absent, the suite reads `baseURL` from `instance.json` in the same directory. `SF_BASE_URL` overrides both.

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

The setup project opens `/lightning/page/home` once. The browser projects run when the App Launcher or the global search bar is visible. A missing file, or a redirect to a login or verification page, fails the setup project. The browser projects are then skipped.

Chromium runs the landing check, Lead create and status edit, both convert branches, and the two negative cases. WebKit runs the landing check, Lead create and status edit, and the convert branch that creates a new Account and Contact. The default worker count is 2.

## Report

`npm run report` opens the HTML report in `reports/html`. `reports/results.json` is the machine-readable result. `reports/junit.xml` is the JUnit file. A failure keeps a screenshot and a video. A trace is kept on failure for a local run. Traces are off when `CI` is set, because a trace contains the session cookie.

## Data

The behaviour under test is done in the UI. The API is limited to seeding an existing Account or Contact, reading records back, and optional cleanup (`CLEANUP_TEST_DATA=true`, or `npm run cleanup:test-data`). Each test builds its own Lead name, company, and email. The email stays within 80 characters. The duplicate-email test skips when REST cannot see an active Lead duplicate rule.

The verify job in `.github/workflows/ci.yml` runs the typecheck, lint, and `npx playwright test --list`. It uses no secrets. The live job restores the session file from `SF_STORAGE_STATE_B64` and skips when that secret is absent.
