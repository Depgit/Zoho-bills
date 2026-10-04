// Every hour: delete uploaded files older than 1 hour that no bill uses
import { Bill } from '../models/index.js';
import { deleteFile, orphanFiles } from '../services/files.service.js';

const HOUR = 60 * 60 * 1000;

export function startOrphanFileCleanup() {
  setInterval(async () => {
    try {
      for (const id of await orphanFiles(HOUR, (fileId) => Bill.exists({ pdfFile: fileId }))) await deleteFile(id);
    } catch (e) {
      console.error('File cleanup failed:', e.message);
    }
  }, HOUR);
}
