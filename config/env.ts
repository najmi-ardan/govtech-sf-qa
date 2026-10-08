import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Typed runtime configuration.
 *
 * Values come from process.env, after `.env` (or `ENV_FILE`) is loaded.
 * Nothing is required, so typecheck, lint, and `playwright test --list`
 * run without an org.
 */

export const ROOT = path.resolve(__dirname, '..');

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  rootDir: string;
  isCI: boolean;
  salesforce: {
    /** Lightning origin. Empty until the session file or SF_BASE_URL supplies it. */
    baseUrl: string;
    /** REST version for seed, read-back, and cleanup. */
    apiVersion: string;
  };
  /** Playwright storageState file. The suite loads this and does not sign in. */
  storageStatePath: string;
  timeouts: {
    action: number;
    expect: number;
    navigation: number;
    test: number;
  };
  workers: number | undefined;
  logLevel: LogLevel;
  /** CLEANUP_TEST_DATA=true deletes records the test tracked, through REST. */
  cleanupTestData: boolean;
  /** Stage name the org assigns to an Opportunity created by conversion. */
  opportunityStage: string;
}

/**
 * Builds config from an env map. Every malformed value is reported in one ConfigError.
 */
export function readConfig(env: NodeJS.ProcessEnv, rootDir: string = ROOT): AppConfig {
  const problems: string[] = [];
  const str = (name: string, fallback = ''): string => {
    const v = env[name];
    return v === undefined || v.trim() === '' ? fallback : v.trim();
  };
  const int = (name: string, fallback: number): number => {
    const raw = str(name);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      problems.push(`${name} must be a non-negative integer, got "${raw}"`);
      return fallback;
    }
    return n;
  };
  const oneOf = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const v = str(name, fallback).toLowerCase() as T;
    if (!allowed.includes(v)) problems.push(`${name} must be one of ${allowed.join(' | ')}, got "${v}"`);
    return v;
  };
  /** Absolute http(s) URL reduced to its origin. */
  const origin = (name: string, fallback = ''): string => {
    const raw = str(name, fallback);
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (!/^https?:$/.test(url.protocol)) throw new Error('not http(s)');
      return url.origin;
    } catch {
      problems.push(`${name} must be an absolute http(s) URL, got "${raw}"`);
      return '';
    }
  };
  const flag = (name: string): boolean => str(name).toLowerCase() === 'true';

  const workersRaw = str('WORKERS');
  const cfg: AppConfig = {
    rootDir,
    isCI: !!env.CI,
    salesforce: {
      baseUrl: origin('SF_BASE_URL'),
      apiVersion: str('SF_API_VERSION', 'v62.0'),
    },
    storageStatePath: path.resolve(rootDir, str('STORAGE_STATE_PATH', 'storage/storageState.json')),
    timeouts: {
      action: int('ACTION_TIMEOUT', 20_000),
      expect: int('EXPECT_TIMEOUT', 20_000),
      navigation: int('NAVIGATION_TIMEOUT', 60_000),
      test: int('TEST_TIMEOUT', 180_000),
    },
    workers: workersRaw ? int('WORKERS', 2) : undefined,
    logLevel: oneOf<LogLevel>('LOG_LEVEL', ['debug', 'info', 'warn', 'error'], 'info'),
    cleanupTestData: flag('CLEANUP_TEST_DATA'),
    opportunityStage: str('OPP_DEFAULT_STAGE', 'Prospecting'),
  };
  if (problems.length) throw new ConfigError(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  return cfg;
}

const envFile = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, quiet: true });
}

export const config: Readonly<AppConfig> = Object.freeze(readConfig(process.env));
