/**
 * Centralized logging — thin wrapper around electron-log so the rest of
 * the main process imports a stable surface.
 *
 * Privacy: per the constitution, logs are LOCAL only. No telemetry, no
 * remote logging. Logs never contain camera frames or hand landmarks —
 * only state transitions, errors, and benchmark results.
 */

import log from 'electron-log';

// Rotating file transport: 5 files x ~1 MB each per the constitution.
log.transports.file.maxSize = 1024 * 1024;
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// File path resolution is handled by electron-log automatically:
//   Windows: %APPDATA%/Swoosh/logs/main.log
//   macOS:   ~/Library/Logs/Swoosh/main.log
//   Linux:   ~/.config/Swoosh/logs/main.log

export const logger = {
  info: (...args: unknown[]) => log.info(...args),
  warn: (...args: unknown[]) => log.warn(...args),
  error: (...args: unknown[]) => log.error(...args),
  debug: (...args: unknown[]) => log.debug(...args),
};

/** Resolve the on-disk log file path (used by Settings → Clear logs). */
export function getLogFilePath(): string | undefined {
  const transport = log.transports.file;
  // electron-log exposes getFile() which returns a Logger.LogFile object
  // with a `path` property.
  return typeof transport.getFile === 'function' ? transport.getFile().path : undefined;
}
