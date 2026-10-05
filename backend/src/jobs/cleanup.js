// Every hour: delete uploads no bill uses (older than 1 hour), files of bills rejected more than
// REJECTED_FILE_DAYS ago, and extraction logs never submitted (30 days)
import { extractionLogsRepo } from '../db/index.js';
import { removeStaleRejectedFiles } from '../services/bills/fileRetention.js';
import { deleteOrphanFiles } from '../services/files.service.js';

const HOUR = 60 * 60 * 1000;

async function runCleanup() {
  try {
    await deleteOrphanFiles(HOUR);
    const removed = await removeStaleRejectedFiles();
    if (removed) console.log(`Cleanup: removed the file of ${removed} bill(s) rejected too long ago`);
    await extractionLogsRepo.deleteUnsubmittedOlderThan(30);
  } catch (e) {
    console.error('Cleanup failed:', e.message);
  }
}

export function startCleanupJobs() {
  setTimeout(runCleanup, 30 * 1000).unref(); // shortly after start-up, then hourly
  setInterval(runCleanup, HOUR).unref();
}
