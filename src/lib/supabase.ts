// ============================================================================
// Supabase clients — three flavors with different trust levels.
//
//   adminDb()     -> service role, bypasses RLS. Use ONLY in trusted server
//                    code (webhooks, background jobs, system operations).
//                    NEVER expose to the browser.
//
//   serverDb()    -> authenticated user, RLS enforced. Use in route handlers,
//                    server components. Reads the user's session cookies.
//
//   browserDb()   -> public anon key, used in client components. RLS enforced.
// ============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// ----- Admin (service role) ------------------------------------------------
let _admin: SupabaseClient | null = null;
export function adminDb(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "wa-agent-admin" } },
  });
  return _admin;
}

// ----- Server (per-request, authenticated) ---------------------------------
export async function serverDb(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Supabase server client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        "x-client-info": "wa-agent-server",
      },
    },
  });
}

// ----- Browser (anon, client components) -----------------------------------
let _browser: SupabaseClient | null = null;
export function browserDb(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("browserDb() called outside the browser");
  }
  if (_browser) return _browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Supabase browser client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  _browser = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { "x-client-info": "wa-agent-browser" } },
  });
  return _browser;
}

// ----- Legacy alias (gradual migration from old single-tenant code) --------
// Old code does `import { supabase } from "@/lib/supabase"`. Until refactor
// completes we keep this as an admin-client proxy. Will be removed.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (adminDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
