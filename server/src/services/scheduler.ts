/**
 * ============================================================
 * Scheduler Service
 * ============================================================
 *
 * Manages periodic auto-import scans using setInterval.
 * Reads configuration from the automation_settings DB table.
 */

import { logger } from '../utils/logger.js';
import { getSettings, runScan } from './autoImport.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let isScanInProgress = false;

export function isSchedulerRunning(): boolean {
  return isRunning;
}

export function isScanActive(): boolean {
  return isScanInProgress;
}

export async function startScheduler(): Promise<void> {
  // Stop any existing interval
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  try {
    const settings = await getSettings();
    const enabled = settings.auto_scan_enabled as boolean;
    const intervalHours = (settings.auto_scan_interval_hours as number) || 12;

    if (!enabled) {
      isRunning = false;
      logger.info('Auto-scan is disabled — scheduler not started');
      return;
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;

    const doScan = async () => {
      if (isScanInProgress) {
        logger.info('Scan already in progress — skipping scheduled run');
        return;
      }
      try {
        isScanInProgress = true;
        logger.info('Scheduled auto-import scan starting...');
        await runScan('auto');
        logger.info('Scheduled auto-import scan completed');
      } catch (err) {
        logger.error({ err }, 'Scheduled scan failed');
      } finally {
        isScanInProgress = false;
      }
    };

    // Run first scan 2 minutes after startup (let server warm up)
    setTimeout(() => {
      doScan();
    }, 2 * 60 * 1000);

    // Then repeat on the configured interval
    intervalHandle = setInterval(doScan, intervalMs);

    isRunning = true;
    logger.info({ intervalHours, firstScanInMinutes: 2 }, 'Auto-import scheduler started');
  } catch (err) {
    logger.error({ err }, 'Failed to start scheduler');
    isRunning = false;
  }
}

export async function stopScheduler(): Promise<void> {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  isRunning = false;
  logger.info('Auto-import scheduler stopped');
}

export async function restartScheduler(): Promise<void> {
  await stopScheduler();
  await startScheduler();
}

export async function triggerManualScan(): Promise<ReturnType<typeof runScan>> {
  if (isScanInProgress) {
    throw new Error('סריקה כבר מתבצעת — נסה שוב מאוחר יותר');
  }

  isScanInProgress = true;
  try {
    logger.info('Manual scan triggered');
    const result = await runScan('manual');
    return result;
  } finally {
    isScanInProgress = false;
  }
}
