// Bill files (PDF/images) stored in MongoDB GridFS — survives restarts/redeploys,
// unlike the local disk on Render. Bill.pdfFile holds the GridFS file id (hex string).
import mongoose from 'mongoose';
import fs from 'fs';

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'billFiles' });
const oid = (id) => (mongoose.isObjectIdOrHexString(id) ? new mongoose.Types.ObjectId(id) : null);

// Copy a local (temp) file into GridFS, return its id
export const saveFile = (localPath, filename, contentType) =>
  new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(filename, { metadata: { contentType } });
    fs.createReadStream(localPath)
      .pipe(upload)
      .on('error', reject)
      .on('finish', () => resolve(String(upload.id)));
  });

export const fileExists = async (id) => !!oid(id) && !!(await bucket().find({ _id: oid(id) }).limit(1).next());

export const streamFile = (id) => bucket().openDownloadStream(oid(id));

export const readFile = (id) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    streamFile(id)
      .on('data', (c) => chunks.push(c))
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks)));
  });

export const deleteFile = (id) => oid(id) && bucket().delete(oid(id)).catch(() => {});

// Files older than `ms` that no bill uses (uploaded via /extract but never saved)
export const orphanFiles = async (ms, isUsed) => {
  const out = [];
  const old = bucket().find({ uploadDate: { $lt: new Date(Date.now() - ms) } }, { projection: { _id: 1 } });
  for await (const f of old) if (!(await isUsed(String(f._id)))) out.push(String(f._id));
  return out;
};
