// File storage. The rest of the app only uses put / get / remove by key;
// which backend holds the bytes is decided here (STORAGE_DRIVER=local | supabase).
import { STORAGE } from '../config/env.js';
import { localDriver } from './drivers/local.js';
import { supabaseDriver } from './drivers/supabase.js';

const DRIVERS = { local: localDriver, supabase: supabaseDriver };

let driver;
function current() {
  if (!driver) {
    const make = DRIVERS[STORAGE.driver];
    if (!make) throw new Error(`Unknown STORAGE_DRIVER "${STORAGE.driver}" (use local or supabase)`);
    driver = make(STORAGE);
  }
  return driver;
}

export const putObject = (key, buffer, contentType) => current().put(key, buffer, contentType);
export const getObject = (key) => current().get(key);
export const removeObject = (key) => current().remove(key);
export const storageDriver = () => STORAGE.driver;
