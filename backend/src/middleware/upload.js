import multer from 'multer';
import os from 'os';

// Bill file upload: PDF or image, max 10 MB, kept in the temp dir until moved into GridFS
export const uploadBillFile = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10e6 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')),
}).single('file');
