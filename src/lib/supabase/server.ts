import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let serverClientInstance: SupabaseClient | null = null;

/**
 * Returns a server-side Supabase client using SUPABASE_URL and SUPABASE_SECRET_KEY.
 *
 * Security Requirements:
 * - Must strictly run on server-side (enforced by `import "server-only"`).
 * - Secrets must never be exposed to the browser or prefixed with NEXT_PUBLIC_.
 * - Returns null or throws an error if environment variables are missing.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (serverClientInstance) {
    return serverClientInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Missing Supabase server configuration: SUPABASE_URL and SUPABASE_SECRET_KEY must be defined."
    );
  }

  serverClientInstance = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serverClientInstance;
}

