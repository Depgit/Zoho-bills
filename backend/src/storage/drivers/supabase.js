// Files in a private Supabase Storage bucket (uses the service key — server side only)
import { createClient } from '@supabase/supabase-js';

export function supabaseDriver({ supabaseUrl, supabaseKey, bucket }) {
  if (!supabaseUrl || !supabaseKey) throw new Error('STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_KEY');
  const store = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }).storage.from(bucket);
  const check = ({ data, error }) => {
    if (error) throw new Error(`Supabase storage: ${error.message}`);
    return data;
  };
  return {
    put: async (key, buffer, contentType) => check(await store.upload(key, buffer, { contentType, upsert: true })),
    get: async (key) => Buffer.from(await check(await store.download(key)).arrayBuffer()),
    remove: async (key) => check(await store.remove([key])),
  };
}
