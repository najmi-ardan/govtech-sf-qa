import { test } from '@playwright/test';
import { logger as rootLogger, type Logger } from './logger';

/** A test.step that also writes a start and finish line to the structured log. */
export async function step<T>(title: string, body: () => Promise<T>, log: Logger = rootLogger): Promise<T> {
  return test.step(title, async () => {
    const started = Date.now();
    log.info(`STEP start ${title}`);
    try {
      const result = await body();
      log.info(`STEP done ${title}`, { ms: Date.now() - started });
      return result;
    } catch (err) {
      log.error(`STEP failed ${title}`, { ms: Date.now() - started, error: (err as Error).message?.split('\n')[0] });
      throw err;
    }
  });
}
