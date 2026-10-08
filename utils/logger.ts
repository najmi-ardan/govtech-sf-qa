import fs from 'node:fs';
import path from 'node:path';
import { config, type LogLevel } from '../config/env';

/**
 * Structured logger.
 *
 * Writes a readable line to stdout and a JSON line to logs/run-<runId>.jsonl.
 * Child loggers add context such as the test title and worker index.
 * Values under secret-looking keys are replaced with "[redacted]" before anything is written.
 */

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const LOG_DIR = path.join(config.rootDir, 'logs');

export const RUN_ID: string =
  process.env.RUN_ID ?? (process.env.RUN_ID = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14));

let fileReady = false;
function logFile(): string | undefined {
  try {
    if (!fileReady) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fileReady = true;
    }
    return path.join(LOG_DIR, `run-${RUN_ID}.jsonl`);
  } catch {
    return undefined;
  }
}

export type LogContext = Record<string, string | number | boolean | undefined>;

export class Logger {
  /**
   * @param sink optional in-memory buffer. Per-test loggers use it so the lines can be attached to the report.
   */
  constructor(
    private readonly context: LogContext = {},
    private readonly sink?: string[],
  ) {}

  child(extra: LogContext): Logger {
    return new Logger({ ...this.context, ...extra }, this.sink);
  }

  withSink(sink: string[]): Logger {
    return new Logger({ ...this.context }, sink);
  }

  debug(msg: string, data?: unknown): void {
    this.write('debug', msg, data);
  }
  info(msg: string, data?: unknown): void {
    this.write('info', msg, data);
  }
  warn(msg: string, data?: unknown): void {
    this.write('warn', msg, data);
  }
  error(msg: string, data?: unknown): void {
    this.write('error', msg, data);
  }

  private write(level: LogLevel, msg: string, rawData?: unknown): void {
    if (LEVELS[level] < LEVELS[config.logLevel]) return;
    const data = redact(rawData);
    const ts = new Date().toISOString();
    const ctx = Object.entries(this.context)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    const suffix = data === undefined ? '' : ` ${safeStringify(data)}`;
    const line = `${ts} ${level.toUpperCase().padEnd(5)} ${ctx ? `[${ctx}] ` : ''}${msg}${suffix}`;
    (level === 'error' || level === 'warn' ? console.error : console.log)(line);
    this.sink?.push(line);

    const file = logFile();
    if (file) {
      try {
        fs.appendFileSync(file, JSON.stringify({ ts, level, msg, ...this.context, data }) + '\n');
      } catch {
        // A log failure must not fail a test.
      }
    }
  }
}

/**
 * Keys whose values are never written. Short names match exactly so fields such as
 * codeLength stay readable.
 */
const SECRET_KEY = /password|passwd|secret|token|authorization|cookie|^(sid|otp|code|session_?id)$/i;

/** Replaces values under secret-looking keys with "[redacted]". */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)]),
  );
}

function safeStringify(data: unknown): string {
  try {
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export const logger = new Logger();
