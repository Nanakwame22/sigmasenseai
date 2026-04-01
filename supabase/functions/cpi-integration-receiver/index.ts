import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Maps integration_id to the domain_id(s) it feeds
const INTEGRATION_DOMAIN_MAP: Record<string, string[]> = {
  'ehr-epic':     ['ed'],
  'ehr-cerner':   ['readmission', 'care'],
  'lab-lis':      ['lab'],
  'bed-mgmt':     ['beds'],
  'scheduling':   ['staffing'],
  'adt-real':     ['inpatient', 'discharge'],
  'fhir-gateway': ['ed', 'lab', 'beds', 'inpatient', 'readmission', 'care', 'staffing', 'discharge'],
  'biomedical':   [],
};

// Domain → primary risk score metric key (matches cpi-bridge tags in metrics table)
const DOMAIN_RISK_KEY: Record<string, string> = {
  ed:          'cpi_ed_risk_score',
  lab:         'cpi_lab_risk_score',
  readmission: 'cpi_readmission_risk_score',
  staffing:    'cpi_staffing_risk_score',
  biomedical:  'cpi_biomedical_risk_score',
  care:        'cpi_experience_risk_score',
};

interface TestResult {
  success: boolean;
  integration_id: string;
  protocol: string;
  domains_updated: string[];
  parsed_fields: Record<string, string | number>;
  latency_ms: number;
  message: string;
}

function parseHL7v2(raw: string): Record<string, string | number> {
  const segments = raw.split('\n').filter(Boolean);
  const fields: Record<string, string | number> = {};
  for (const seg of segments) {
    const parts = seg.split('|');
    const segType = parts[0];
    if (segType === 'MSH') {
      fields['sending_app'] = parts[2] ?? '';
      fields['message_type'] = parts[8] ?? '';
      fields['timestamp'] = parts[6] ?? '';
    } else if (segType === 'PID') {
      fields['patient_id'] = parts[3] ?? '';
      fields['patient_name'] = parts[5] ?? '';
    } else if (segType === 'OBX') {
      fields['observation_value'] = parts[5] ?? '';
      fields['units'] = parts[6] ?? '';
      fields['abnormal_flag'] = parts[8] ?? '';
    } else if (segType === 'EVN') {
      fields['event_type'] = parts[1] ?? '';
    } else if (segType === 'PV1') {
      fields['patient_class'] = parts[2] ?? '';
      fields['assigned_location'] = parts[3] ?? '';
    }
  }
  return fields;
}

function parseFHIR(body: Record<string, unknown>): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  fields['resource_type'] = String(body.resourceType ?? 'Bundle');
  if (body.resourceType === 'Bundle') {
    const entries = (body.entry as unknown[]) ?? [];
    fields['entry_count'] = entries.length;
    const types = entries
      .map((e: unknown) => {
        const entry = e as Record<string, unknown>;
        const resource = entry.resource as Record<string, unknown> | undefined;
        return resource?.resourceType ?? '';
      })
      .filter(Boolean);
    fields['resource_types'] = [...new Set(types)].join(', ');
  }
  if (body.resourceType === 'Observation') {
    const obs = body as Record<string, unknown>;
    const code = obs.code as Record<string, unknown> | undefined;
    const coding = (code?.coding as unknown[])?.[0] as Record<string, unknown> | undefined;
    fields['observation_code'] = String(coding?.code ?? '');
    fields['display'] = String(coding?.display ?? '');
    const valueQuantity = obs.valueQuantity as Record<string, unknown> | undefined;
    if (valueQuantity) {
      fields['value'] = String(valueQuantity.value ?? '');
      fields['unit'] = String(valueQuantity.unit ?? '');
    }
  }
  return fields;
}

function parseREST(body: Record<string, unknown>): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  if (body.domain) fields['domain'] = String(body.domain);
  if (body.risk_score) fields['risk_score'] = Number(body.risk_score);
  if (body.metrics && typeof body.metrics === 'object') {
    const metrics = body.metrics as Record<string, unknown>;
    for (const [k, v] of Object.entries(metrics)) {
      fields[k] = String(v);
    }
  }
  return fields;
}

// Write parsed metric values into the metrics/metric_data tables
async function bridgeToMetrics(
  orgId: string,
  domains: string[],
  parsedFields: Record<string, string | number>,
  protocol: string
): Promise<void> {
  const now = new Date().toISOString();

  // For each affected domain, write to metric_data for the domain risk score metric
  for (const domainId of domains) {
    const metricKey = DOMAIN_RISK_KEY[domainId];
    if (!metricKey) continue;

    // Find the metric row for this org + key tag
    const { data: metricRow } = await supabase
      .from('metrics')
      .select('id')
      .eq('organization_id', orgId)
      .contains('tags', [`cpi-key:${metricKey}`])
      .maybeSingle();

    if (!metricRow?.id) continue;

    // Determine value: use parsed risk_score if available, else last cpi_domain_snapshot
    let value: number | null = null;

    if (typeof parsedFields['risk_score'] === 'number') {
      value = parsedFields['risk_score'];
    } else {
      // Pull latest risk_score from cpi_domain_snapshots
      const { data: snap } = await supabase
        .from('cpi_domain_snapshots')
        .select('risk_score')
        .eq('domain_id', domainId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      value = snap?.risk_score ?? null;
    }

    if (value === null) continue;

    // Insert metric_data point
    await supabase.from('metric_data').insert({
      metric_id: metricRow.id,
      value,
      timestamp: now,
      source: `cpi-integration:${protocol}`,
      quality_score: 92,
      aggregation_level: 'raw',
      organization_id: orgId,
    });

    // Update current_value on the metric row
    await supabase
      .from('metrics')
      .update({ current_value: value, actual_value: value })
      .eq('id', metricRow.id)
      .eq('organization_id', orgId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const start = Date.now();

  try {
    const url = new URL(req.url);
    const integrationId = url.searchParams.get('integration') ?? 'unknown';
    const isTest = url.searchParams.get('test') === 'true';

    const apiKey = req.headers.get('x-api-key') ?? url.searchParams.get('api_key');
    const contentType = req.headers.get('content-type') ?? '';

    // Validate API key and get org context
    const { data: config } = await supabase
      .from('cpi_integration_configs')
      .select('api_key, status, organization_id')
      .eq('integration_id', integrationId)
      .maybeSingle();

    if (!config) {
      return new Response(JSON.stringify({ error: 'Unknown integration ID' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (apiKey !== config.api_key) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse payload
    let parsedFields: Record<string, string | number> = {};
    let protocol = 'REST';

    const rawBody = await req.text();

    if (contentType.includes('x-hl7-v2') || rawBody.startsWith('MSH|')) {
      protocol = 'HL7 v2';
      parsedFields = parseHL7v2(rawBody);
    } else if (contentType.includes('application/json') || rawBody.startsWith('{')) {
      try {
        const jsonBody = JSON.parse(rawBody) as Record<string, unknown>;
        if (jsonBody.resourceType) {
          protocol = 'FHIR R4';
          parsedFields = parseFHIR(jsonBody);
        } else {
          parsedFields = parseREST(jsonBody);
        }
      } catch {
        parsedFields = { raw_length: rawBody.length };
      }
    }

    const domains = INTEGRATION_DOMAIN_MAP[integrationId] ?? [];
    const latency = Date.now() - start;

    const result: TestResult = {
      success: true,
      integration_id: integrationId,
      protocol,
      domains_updated: isTest ? [] : domains,
      parsed_fields: parsedFields,
      latency_ms: latency,
      message: isTest
        ? `Test ping received. ${Object.keys(parsedFields).length} fields parsed successfully. No data written.`
        : `Payload processed. ${domains.length} domain(s) updated. Data bridged to analytics engine.`,
    };

    if (!isTest) {
      // Update CPI domain snapshots
      if (domains.length > 0) {
        await supabase
          .from('cpi_domain_snapshots')
          .update({ updated_at: new Date().toISOString() })
          .in('domain_id', domains);
      }

      // ── Bridge to main analytics engine ──────────────────────────────────
      const orgId = config.organization_id as string | null;
      if (orgId && domains.length > 0) {
        await bridgeToMetrics(orgId, domains, parsedFields, protocol);
      }
    }

    // Record last test result
    await supabase
      .from('cpi_integration_configs')
      .update({
        last_test_at: new Date().toISOString(),
        last_test_result: result,
        updated_at: new Date().toISOString(),
      })
      .eq('integration_id', integrationId);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
