// Files in a private Supabase Storage bucket (uses the service key — server side only)
import { createClient } from '@supabase/supabase-js';

// SUPABASE_URL must be the bare project URL (https://<ref>.supabase.co). Settings pages also show
// longer URLs (…/storage/v1/s3, …/rest/v1) — keep only the origin so those work too.
function projectUrl(raw) {
  try {
    return new URL(String(raw).trim()).origin;
  } catch {
    throw new Error(`SUPABASE_URL "${raw}" is not a URL — use the Project URL, e.g. https://abcd1234.supabase.co`);
  }
}

export function supabaseDriver({ supabaseUrl, supabaseKey, bucket, fetch }) {
  if (!supabaseUrl || !supabaseKey) throw new Error('STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_KEY');
  const name = String(bucket || '').trim();
  if (!name) throw new Error('SUPABASE_BUCKET is empty');
  const client = createClient(projectUrl(supabaseUrl), String(supabaseKey).trim(), {
    auth: { persistSession: false },
    ...(fetch ? { global: { fetch } } : {}),
  });
  const store = client.storage.from(name);
  const check = ({ data, error }) => {
    if (error) throw new Error(`Supabase storage (bucket "${name}"): ${error.message}`);
    return data;
  };
  return {
    put: async (key, buffer, contentType) => check(await store.upload(key, buffer, { contentType, upsert: true })),
    get: async (key) => Buffer.from(await check(await store.download(key)).arrayBuffer()),
    remove: async (key) => check(await store.remove([key])),
    // Start-up check: the bucket exists and the key may use it
    async verify() {
      const { error } = await client.storage.getBucket(name);
      if (error) {
        throw new Error(
          `Supabase bucket "${name}" not usable: ${error.message}. Create a private bucket with that name in Supabase → Storage, ` +
            'and use the service_role key as SUPABASE_SERVICE_KEY.',
        );
      }
    },
  };
}
