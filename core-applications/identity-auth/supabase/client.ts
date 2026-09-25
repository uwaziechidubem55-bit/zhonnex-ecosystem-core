import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Strict type contract reflecting an immutable, enterprise-grade database profile schema
export interface ZhonnexIdentityProfile {
  id: string;
  zhonnex_uid: string;
  primary_email: string;
  account_tier: 'ENTERPRISE' | 'PRO' | 'STANDARD_TIER';
  is_security_locked: boolean;
  mfa_enabled: boolean;
  created_at: string;
  updated_at: string;
}

const ZHONNEX_SUPABASE_URL = process.env.ZHONNEX_SUPABASE_URL;
const ZHONNEX_SUPABASE_SERVICE_ROLE_KEY = process.env.ZHONNEX_SUPABASE_SERVICE_ROLE_KEY;

if (!ZHONNEX_SUPABASE_URL || !ZHONNEX_SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('CRITICAL ARCHITECTURE CONFIGURATION ERROR: Missing required Supabase Environment Variables.');
}

/**
 * Production-ready Supabase Client Engine initialized with resilient configuration.
 * Uses high-security global context suitable for complex multi-tenant routing.
 */
export const zhonnexIdentityClient: SupabaseClient = createClient(
  ZHONNEX_SUPABASE_URL,
  ZHONNEX_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false, // Explicitly disabled on server layers to enforce stateless token authentication
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'X-Zhonnex-Engine-Client': 'Enterprise-Core-v1',
      },
    },
  }
);

/**
 * Validates a user's ecosystem authentication status and extracts their profile boundary
 */
export async function verifyAndFetchProfile(bearerToken: string): Promise {
  const { data: { user }, error: authError } = await zhonnexIdentityClient.auth.getUser(bearerToken);
  
  if (authError || !user) {
    console.error(`[SECURITY ALTERT] Unauthorized or corrupted access token interception: ${authError?.message}`);
    return null;
  }

  const { data, error: dbError } = await zhonnexIdentityClient
    .from('zhonnex_identity_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (dbError || !data) {
    console.error(`[DATABASE ERROR] Identity extraction failure for bound UID: ${user.id}. Details: ${dbError?.message}`);
    return null;
  }

  return data as ZhonnexIdentityProfile;
}
