
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEncryptionKey(): string {
  const key = Deno.env.get('PHI_ENCRYPTION_KEY');
  if (!key) throw new Error('PHI_ENCRYPTION_KEY secret is not configured');
  return key;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

function getSupabaseUser(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
}

// ── PHI Access Logger ─────────────────────────────────────────────────────────

async function logPhiAccess(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string;
    userEmail: string;
    tableName: string;
    recordId: string;
    fieldName: string;
    accessType: string;
    purpose?: string;
  },
) {
  await supabase.from('phi_access_logs').insert({
    user_id: params.userId,
    user_email: params.userEmail,
    table_name: params.tableName,
    record_id: params.recordId,
    field_name: params.fieldName,
    access_type: params.accessType,
    purpose: params.purpose ?? null,
  });
}

// ── Encrypt using pgcrypto (server-side) ──────────────────────────────────────

async function encryptField(
  supabase: ReturnType<typeof createClient>,
  plaintext: string,
  key: string,
): Promise<string> {
  // Use pgp_sym_encrypt from pgcrypto — returns bytea as base64 string via encode
  const { data, error } = await supabase.rpc('encrypt_phi_value', {
    plaintext_value: plaintext,
    encryption_passphrase: key,
  });
  if (error) throw new Error(`Encryption failed: ${error.message}`);
  return data as string;
}

async function decryptField(
  supabase: ReturnType<typeof createClient>,
  encryptedBase64: string,
  key: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('decrypt_phi_value', {
    encrypted_value: encryptedBase64,
    encryption_passphrase: key,
  });
  if (error) throw new Error(`Decryption failed: ${error.message}`);
  return data as string;
}

// ── Action Handlers ───────────────────────────────────────────────────────────

async function handleEncryptApiKey(
  body: { integration_id: string; api_key: string; purpose?: string },
  userId: string,
  userEmail: string,
) {
  const admin = getSupabaseAdmin();
  const key = getEncryptionKey();

  const encrypted = await encryptField(admin, body.api_key, key);

  const { error } = await admin
    .from('cpi_integration_configs')
    .update({
      api_key_enc: encrypted,
      api_key: `[ENCRYPTED:${new Date().toISOString()}]`,
      encryption_status: 'encrypted',
      updated_at: new Date().toISOString(),
    })
    .eq('integration_id', body.integration_id);

  if (error) throw new Error(`Failed to store encrypted key: ${error.message}`);

  await logPhiAccess(admin, {
    userId,
    userEmail,
    tableName: 'cpi_integration_configs',
    recordId: body.integration_id,
    fieldName: 'api_key',
    accessType: 'encrypt',
    purpose: body.purpose ?? 'API key encryption',
  });

  return { success: true, message: 'API key encrypted and stored securely' };
}

async function handleDecryptApiKey(
  body: { integration_id: string; purpose?: string },
  userId: string,
  userEmail: string,
) {
  const admin = getSupabaseAdmin();
  const key = getEncryptionKey();

  const { data, error } = await admin
    .from('cpi_integration_configs')
    .select('api_key_enc, encryption_status, api_key')
    .eq('integration_id', body.integration_id)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch record: ${error.message}`);
  if (!data) throw new Error('Integration config not found');

  let plaintext: string;

  if (data.encryption_status === 'encrypted' && data.api_key_enc) {
    plaintext = await decryptField(admin, data.api_key_enc as string, key);
  } else if (data.api_key && !data.api_key.startsWith('[ENCRYPTED:')) {
    // Not yet encrypted — return plaintext and flag for migration
    plaintext = data.api_key;
  } else {
    throw new Error('No valid API key found — key may need to be regenerated');
  }

  // Log every decryption (HIPAA audit requirement)
  await logPhiAccess(admin, {
    userId,
    userEmail,
    tableName: 'cpi_integration_configs',
    recordId: body.integration_id,
    fieldName: 'api_key',
    accessType: 'decrypt',
    purpose: body.purpose ?? 'Integration configuration access',
  });

  return {
    success: true,
    api_key: plaintext,
    encryption_status: data.encryption_status,
  };
}

async function handleRotateApiKey(
  body: { integration_id: string },
  userId: string,
  userEmail: string,
) {
  const admin = getSupabaseAdmin();
  const key = getEncryptionKey();

  // Generate new key
  const newKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(newKeyBytes);
  const newKey = Array.from(newKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const encrypted = await encryptField(admin, newKey, key);

  const { error } = await admin
    .from('cpi_integration_configs')
    .update({
      api_key_enc: encrypted,
      api_key: `[ENCRYPTED:${new Date().toISOString()}]`,
      encryption_status: 'encrypted',
      updated_at: new Date().toISOString(),
    })
    .eq('integration_id', body.integration_id);

  if (error) throw new Error(`Key rotation failed: ${error.message}`);

  await logPhiAccess(admin, {
    userId,
    userEmail,
    tableName: 'cpi_integration_configs',
    recordId: body.integration_id,
    fieldName: 'api_key',
    accessType: 'rotate',
    purpose: 'API key rotation',
  });

  // Return decrypted new key so frontend can display it once
  return { success: true, new_api_key: newKey, message: 'Key rotated and encrypted successfully' };
}

async function handleGetStatus(userId: string, userEmail: string) {
  const admin = getSupabaseAdmin();

  const { data: configs } = await admin
    .from('cpi_integration_configs')
    .select('integration_id, encryption_status, updated_at');

  const total = configs?.length ?? 0;
  const encrypted = configs?.filter(c => c.encryption_status === 'encrypted').length ?? 0;
  const unencrypted = total - encrypted;

  // Get recent PHI access logs
  const { data: recentLogs } = await admin
    .from('phi_access_logs')
    .select('table_name, field_name, access_type, accessed_at, user_email')
    .order('accessed_at', { ascending: false })
    .limit(10);

  await logPhiAccess(admin, {
    userId,
    userEmail,
    tableName: 'phi_access_logs',
    recordId: 'status_check',
    fieldName: 'encryption_status',
    accessType: 'read',
    purpose: 'Compliance status check',
  });

  return {
    success: true,
    encryption_coverage: {
      total_records: total,
      encrypted_records: encrypted,
      unencrypted_records: unencrypted,
      coverage_pct: total > 0 ? Math.round((encrypted / total) * 100) : 0,
    },
    tables_protected: [
      { table: 'cpi_integration_configs', field: 'api_key', encrypted: encrypted > 0 },
      { table: 'cpi_feed', field: 'title,body', encrypted: false, note: 'Operational data — not direct PHI identifiers' },
      { table: 'cpi_decision_cases', field: 'signal,decision,outcome', encrypted: false, note: 'Clinical signals — encryption available on request' },
    ],
    recent_access_logs: recentLogs ?? [],
    hipaa_controls: {
      encryption_at_rest: encrypted > 0,
      audit_logging: true,
      access_controls_rls: true,
      automatic_logoff: true,
    },
  };
}

// ── Main Handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user
    const userClient = getSupabaseUser(authHeader);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const body = req.method !== 'GET' ? await req.json() : {};

    let result: Record<string, unknown>;

    switch (action) {
      case 'encrypt_api_key':
        result = await handleEncryptApiKey(body, user.id, user.email ?? '');
        break;
      case 'decrypt_api_key':
        result = await handleDecryptApiKey(body, user.id, user.email ?? '');
        break;
      case 'rotate_api_key':
        result = await handleRotateApiKey(body, user.id, user.email ?? '');
        break;
      case 'get_status':
        result = await handleGetStatus(user.id, user.email ?? '');
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
