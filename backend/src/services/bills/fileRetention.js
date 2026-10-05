// Rejected bills don't keep their file forever: REJECTED_FILE_DAYS (default 10) after the
// rejection the file is deleted from storage. The bill and its data stay; its history says
// what happened, and the owner uploads the file again when they fix and resubmit it.
import { REJECTED_FILE_DAYS } from '../../config/env.js';
import { billsRepo } from '../../db/index.js';
import { deleteFile } from '../files.service.js';

export async function removeStaleRejectedFiles(days = REJECTED_FILE_DAYS) {
  const stale = await billsRepo.rejectedWithFileOlderThan(days);
  for (const b of stale) {
    await billsRepo.detachFile(b.id, {
      by: 'System',
      role: '',
      action: 'FILE_REMOVED',
      comment: `Uploaded file deleted — the bill stayed rejected for more than ${days} days. Upload it again to resubmit.`,
    });
    await deleteFile(b.fileId);
  }
  return stale.length;
}
