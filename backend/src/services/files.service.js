// Bill files: bytes in file storage (src/storage), a record in the database (src/db).
// Bill.pdfFile holds the file id.
import crypto from 'crypto';
import fs from 'fs/promises';
import { Readable } from 'stream';
import { filesRepo } from '../db/index.js';
import { getObject, putObject, removeObject } from '../storage/index.js';

// Store a local (temp) upload; returns the new file id
export async function saveFile(localPath, filename, mimeType) {
  const id = crypto.randomUUID();
  const storageKey = `bills/${id}`;
  const buffer = await fs.readFile(localPath);
  await putObject(storageKey, buffer, mimeType);
  await filesRepo.create({ id, storageKey, filename: filename || '', mimeType: mimeType || 'application/pdf', size: buffer.length });
  return id;
}

export const fileExists = async (id) => Boolean(await filesRepo.findById(id));

export async function readFile(id) {
  const f = await filesRepo.findById(id);
  if (!f) throw new Error('File not found');
  return getObject(f.storageKey);
}

export const streamFile = async (id) => Readable.from(await readFile(id));

// Never throws — a missing file is already "deleted"
export async function deleteFile(id) {
  try {
    const f = await filesRepo.findById(id);
    if (!f) return;
    await removeObject(f.storageKey);
    await filesRepo.remove(id);
  } catch (e) {
    console.warn('Could not delete file', id, e.message);
  }
}

// Delete uploads older than `ms` that no bill uses; returns how many
export async function deleteOrphanFiles(ms) {
  const orphans = await filesRepo.orphans(ms);
  for (const f of orphans) await deleteFile(f.id);
  return orphans.length;
}
