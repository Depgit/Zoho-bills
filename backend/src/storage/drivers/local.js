// Files on the local disk — for development and tests (Render's disk is wiped on deploy)
import fs from 'fs/promises';
import path from 'path';

export function localDriver({ localDir }) {
  const full = (key) => path.join(localDir, key);
  return {
    async put(key, buffer) {
      await fs.mkdir(path.dirname(full(key)), { recursive: true });
      await fs.writeFile(full(key), buffer);
    },
    get: (key) => fs.readFile(full(key)),
    remove: (key) => fs.rm(full(key), { force: true }),
    verify: () => fs.mkdir(localDir, { recursive: true }),
  };
}
