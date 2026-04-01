import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

interface Integration {
  id: string;
  name: string;
  category: string;
  icon: string;
  protocol: string;
  domainIds: string[];
}

interface IntegrationConfig {
  api_key: string;
  status: string;
  last_test_at: string | null;
  last_test_result: Record<string, unknown> | null;
}

interface TestResult {
  success: boolean;
  integration_id: string;
  protocol: string;
  domains_updated: string[];
  parsed_fields: Record<string, string | number>;
  latency_ms: number;
  message: string;
}

interface Props {
  integration: Integration;
  onClose: () => void;
}

type Tab = 'endpoint' | 'payload' | 'test';

const EDGE_FN_BASE = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/cpi-integration-receiver`;

function getSamplePayload(integration: Integration): { code: string; language: string; hint: string } {
  const { protocol, id } = integration;

  if (protocol.startsWith('HL7 v2.4') || id === 'lab-lis') {
    return {
      language: 'hl7',
      hint: 'Send as plain text with Content-Type: application/x-hl7-v2',
      code: `MSH|^~\\&|SUNQUEST|LAB|CPI|HOSPITAL|20260326121500||ORU^R01|MSG001|P|2.4
PID|1||12345^^^MRN||DOE^JOHN||19600101|M
OBR|1|||CBC^Complete Blood Count
OBX|1|NM|WBC^White Blood Cell Count||3.2|10*3/uL|4.5-11.0|L|||F
OBX|2|NM|HGB^Hemoglobin||7.8|g/dL|13.5-17.5|L|||F
OBX|3|NM|PLT^Platelet Count||89|10*3/uL|150-400|LL|!||F`,
    };
  }

  if (protocol.startsWith('HL7 v2.3') || id === 'adt-real') {
    return {
      language: 'hl7',
      hint: 'ADT A01 (Admit), A02 (Transfer), A03 (Discharge) — send as plain text',
      code: `MSH|^~\\&|ADT|HOSPITAL|CPI|SIGMA|20260326121500||ADT^A01|MSG002|P|2.3
EVN|A01|20260326121500
PID|1||67890^^^MRN||SMITH^JANE||19750315|F|||123 MAIN ST^^BOSTON^MA^02101
PV1|1|I|3WEST^301^A|||ATTENDING^JONES^ROBERT|||MED|||||||A
DG1|1||I50.9^Heart failure^ICD-10`,
    };
  }

  if ((protocol.includes('HL7 v2.5') || id === 'ehr-cerner') && !protocol.includes('FHIR')) {
    return {
      language: 'hl7',
      hint: 'HL7 v2.5 ORU — care coordination and readmission risk scores',
      code: `MSH|^~\\&|CERNER|ORACLE|CPI|SIGMA|20260326121500||ORU^R01|MSG003|P|2.5
PID|1||11223^^^MRN||BROWN^MICHAEL||19820620|M
OBR|1|||READMIT^Readmission Risk Assessment|||20260326120000
OBX|1|NM|RISK30D^30-Day Readmission Risk Score||0.23||0.00-0.10|H|||F
OBX|2|NM|RISK7D^7-Day Readmission Risk Score||0.41||0.00-0.15|HH|!||F
OBX|3|TX|REASON^Primary Risk Factor||Prior admission within 30 days|||A|||F`,
    };
  }

  if (protocol.includes('FHIR') || id === 'ehr-epic' || id === 'fhir-gateway') {
    const bundleType = id === 'ehr-epic' ? 'ED Encounter Bundle' : id === 'fhir-gateway' ? 'Unified Clinical Bundle' : 'FHIR Bundle';
    return {
      language: 'json',
      hint: `Send as JSON with Content-Type: application/fhir+json — ${bundleType}`,
      code: JSON.stringify({
        resourceType: 'Bundle',
        type: 'transaction',
        meta: { lastUpdated: '2026-03-26T12:15:00Z' },
        entry: [
          {
            resource: {
              resourceType: 'Encounter',
              status: 'in-progress',
              class: { code: 'EMER', display: 'emergency' },
              subject: { reference: 'Patient/12345' },
              location: [{ location: { display: 'ED Bay 4' }, status: 'active' }],
              period: { start: '2026-03-26T10:30:00Z' },
            },
            request: { method: 'PUT', url: 'Encounter/enc-12345' },
          },
          {
            resource: {
              resourceType: 'Observation',
              status: 'final',
              code: { coding: [{ code: '8867-4', display: 'Heart rate', system: 'http://loinc.org' }] },
              subject: { reference: 'Patient/12345' },
              valueQuantity: { value: 104, unit: 'beats/min' },
            },
            request: { method: 'POST', url: 'Observation' },
          },
        ],
      }, null, 2),
    };
  }

  if (id === 'biomedical') {
    return {
      language: 'json',
      hint: 'IEEE 11073 device observations mapped to FHIR Observation — send as application/fhir+json',
      code: JSON.stringify({
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{ code: '8867-4', display: 'Heart rate', system: 'http://loinc.org' }],
        },
        subject: { reference: 'Patient/12345' },
        device: { reference: 'Device/bedside-monitor-301' },
        valueQuantity: { value: 78, unit: 'beats/min', system: 'http://unitsofmeasure.org' },
        component: [
          {
            code: { coding: [{ code: '59408-5', display: 'SpO2' }] },
            valueQuantity: { value: 96, unit: '%' },
          },
          {
            code: { coding: [{ code: '55284-4', display: 'Blood pressure' }] },
            valueQuantity: { value: 118, unit: 'mmHg' },
          },
        ],
      }, null, 2),
    };
  }

  // REST (Teletracking, Kronos)
  const domainMetrics: Record<string, Record<string, unknown>> = {
    'bed-mgmt': { available_beds: 23, cleaning_queue: 11, dirty_turn_time: '28m', total_beds: 312 },
    scheduling:  { rn_coverage: '91%', open_shifts: 6, overtime_hours: '142h', float_pool_available: 3 },
  };
  return {
    language: 'json',
    hint: 'Send as JSON with Content-Type: application/json',
    code: JSON.stringify({
      domain: integration.domainIds[0] ?? integration.id,
      source: integration.id,
      timestamp: '2026-03-26T12:15:00Z',
      metrics: domainMetrics[id] ?? { value: 42, unit: 'count', status: 'normal' },
    }, null, 2),
  };
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isHL7 = language === 'hl7';

  return (
    <div className="relative">
      <div className={`rounded-xl overflow-hidden border ${isHL7 ? 'border-slate-700 bg-slate-950' : 'border-slate-700 bg-slate-950'}`}>
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {isHL7 ? 'HL7 v2.x Message' : 'JSON Payload'}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors cursor-pointer"
          >
            <i className={`text-xs ${copied ? 'ri-check-line text-emerald-400' : 'ri-file-copy-line text-slate-300'}`}></i>
            <span className={`text-xs font-semibold ${copied ? 'text-emerald-400' : 'text-slate-300'}`}>
              {copied ? 'Copied' : 'Copy'}
            </span>
          </button>
        </div>
        <pre className="p-4 text-xs leading-relaxed overflow-x-auto max-h-72 text-slate-300 font-mono whitespace-pre">{code}</pre>
      </div>
    </div>
  );
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayValue = secret && !revealed ? '•'.repeat(Math.min(value.length, 40)) : value;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</p>
      <div className="flex items-center space-x-2">
        <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 min-w-0">
          <span className="text-xs font-mono text-slate-700 truncate flex-1">{displayValue}</span>
        </div>
        {secret && (
          <button
            onClick={() => setRevealed(r => !r)}
            className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors cursor-pointer flex-shrink-0"
          >
            <i className={`text-sm text-slate-500 ${revealed ? 'ri-eye-off-line' : 'ri-eye-line'}`}></i>
          </button>
        )}
        <button
          onClick={handleCopy}
          className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors cursor-pointer flex-shrink-0 ${
            copied ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <i className={`text-sm ${copied ? 'ri-check-line text-emerald-500' : 'ri-file-copy-line text-slate-500'}`}></i>
        </button>
      </div>
    </div>
  );
}

export default function IntegrationConfigModal({ integration, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('endpoint');
  const [config, setConfig] = useState<IntegrationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const payload = getSamplePayload(integration);

  const webhookUrl = `${EDGE_FN_BASE}?integration=${integration.id}`;
  const testUrl = `${EDGE_FN_BASE}?integration=${integration.id}&test=true`;

  const loadConfig = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('cpi_integration_configs')
      .select('api_key, status, last_test_at, last_test_result')
      .eq('integration_id', integration.id)
      .maybeSingle();
    setConfig(data);
    if (data?.last_test_result) {
      setTestResult(data.last_test_result as TestResult);
    }
    setLoading(false);
  }, [integration.id]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleTest = async () => {
    if (!config) return;
    setTesting(true);
    setTestError(null);
    setTestResult(null);

    try {
      const isHL7 = payload.language === 'hl7';
      const res = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': isHL7 ? 'application/x-hl7-v2' : 'application/json',
          'x-api-key': config.api_key,
        },
        body: payload.code,
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setTestError(err.error ?? `HTTP ${res.status}`);
      } else {
        const result = await res.json() as TestResult;
        setTestResult(result);
        await loadConfig();
      }
    } catch (err) {
      setTestError(String(err));
    } finally {
      setTesting(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    const newKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    await supabase
      .from('cpi_integration_configs')
      .update({ api_key: newKey, updated_at: new Date().toISOString() })
      .eq('integration_id', integration.id);
    await loadConfig();
    setRegenerating(false);
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'endpoint', label: 'Endpoint', icon: 'ri-links-line' },
    { id: 'payload', label: 'Payload Format', icon: 'ri-code-s-slash-line' },
    { id: 'test', label: 'Test Connection', icon: 'ri-flashlight-line' },
  ];

  const statusColor: Record<string, string> = {
    connected: 'bg-emerald-100 text-emerald-700',
    syncing:   'bg-amber-100 text-amber-700',
    pending:   'bg-slate-100 text-slate-600',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center space-x-4">
            <div className="w-11 h-11 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl">
              <i className={`${integration.icon} text-xl text-slate-600`}></i>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900">{integration.name}</h3>
                {config && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor[config.status] ?? statusColor.pending}`}>
                    {config.status.charAt(0).toUpperCase() + config.status.slice(1)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{integration.category} &bull; {integration.protocol}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-slate-500 text-lg"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-slate-100 px-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-1 py-3.5 mr-5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <i className={`${tab.icon} text-sm`}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <i className="ri-loader-4-line animate-spin text-2xl text-teal-500"></i>
            </div>
          ) : !config ? (
            <p className="text-sm text-slate-500">Could not load configuration.</p>
          ) : (
            <>
              {activeTab === 'endpoint' && (
                <div className="space-y-6">
                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                    <div className="flex items-start space-x-3">
                      <i className="ri-information-line text-teal-600 text-base mt-0.5"></i>
                      <p className="text-xs text-teal-700 leading-relaxed">
                        Give your IT team this <strong>webhook URL</strong> and <strong>API key</strong>. Configure your {integration.name} system to POST {integration.protocol} messages to this endpoint. The key goes in the <code className="bg-teal-100 px-1 py-0.5 rounded font-mono">x-api-key</code> request header.
                      </p>
                    </div>
                  </div>

                  <CopyField label="Webhook Endpoint URL" value={webhookUrl} />
                  <CopyField label="API Key" value={config.api_key} secret />

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Setup Steps</p>
                    </div>
                    <ol className="space-y-3">
                      {[
                        { step: `Log into your ${integration.name} integration settings or contact your vendor IT team.` },
                        { step: `Add a new outbound interface with the endpoint URL above.` },
                        { step: `Set the message format to ${integration.protocol} and add the API key as the x-api-key header.` },
                        { step: `Configure trigger events (see Payload Format tab for supported message types).` },
                        { step: `Use the Test Connection tab to fire a sample payload and confirm it reaches CPI.` },
                      ].map((item, i) => (
                        <li key={i} className="flex items-start space-x-3">
                          <span className="w-5 h-5 flex-shrink-0 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-sm text-slate-600 leading-relaxed">{item.step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-xs text-slate-400">Rotate API key if it was exposed</p>
                    <button
                      onClick={handleRegenerate}
                      disabled={regenerating}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-50 border border-red-100 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <i className={`text-xs ${regenerating ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}`}></i>
                      <span>{regenerating ? 'Rotating...' : 'Rotate Key'}</span>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'payload' && (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 mb-1">Expected {integration.protocol} Format</p>
                    <p className="text-xs text-slate-500 mb-4">{payload.hint}</p>
                    <CodeBlock code={payload.code} language={payload.language} />
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Supported Fields</p>
                    <div className="grid grid-cols-2 gap-2">
                      {integration.domainIds.length > 0 ? (
                        <>
                          <div className="flex items-center space-x-2 text-xs text-slate-600">
                            <i className="ri-check-line text-emerald-500"></i>
                            <span>Domain metrics ({integration.domainIds.join(', ')})</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-slate-600">
                            <i className="ri-check-line text-emerald-500"></i>
                            <span>Risk score deltas</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-slate-600">
                            <i className="ri-check-line text-emerald-500"></i>
                            <span>Alert counts</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-slate-600">
                            <i className="ri-check-line text-emerald-500"></i>
                            <span>Patient identifiers</span>
                          </div>
                        </>
                      ) : (
                        <div className="col-span-2 flex items-center space-x-2 text-xs text-amber-600">
                          <i className="ri-time-line text-amber-500"></i>
                          <span>Integration schema pending setup — contact your device vendor</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Sample curl command</p>
                    <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap break-all leading-relaxed">
{`curl -X POST \\
  "${webhookUrl}" \\
  -H "Content-Type: ${payload.language === 'hl7' ? 'application/x-hl7-v2' : 'application/json'}" \\
  -H "x-api-key: ${config.api_key.slice(0, 8)}..."`}
                    </pre>
                  </div>
                </div>
              )}

              {activeTab === 'test' && (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 mb-1">Fire a Test Ping</p>
                    <p className="text-xs text-slate-500">
                      Sends the sample {integration.protocol} payload to the receiver endpoint with your API key. Validates parsing without writing to the database.
                    </p>
                  </div>

                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className="w-full flex items-center justify-center space-x-2 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {testing ? (
                      <>
                        <i className="ri-loader-4-line animate-spin text-base"></i>
                        <span>Sending test payload...</span>
                      </>
                    ) : (
                      <>
                        <i className="ri-flashlight-line text-base"></i>
                        <span>Send Test Ping</span>
                      </>
                    )}
                  </button>

                  {testError && (
                    <div className="flex items-start space-x-3 bg-red-50 border border-red-100 rounded-xl p-4">
                      <i className="ri-error-warning-line text-red-500 text-base mt-0.5"></i>
                      <div>
                        <p className="text-sm font-semibold text-red-700 mb-0.5">Test failed</p>
                        <p className="text-xs text-red-600">{testError}</p>
                      </div>
                    </div>
                  )}

                  {testResult && (
                    <div className={`rounded-xl border p-5 space-y-4 ${testResult.success ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full ${testResult.success ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                          <span className={`text-sm font-bold ${testResult.success ? 'text-emerald-800' : 'text-red-800'}`}>
                            {testResult.success ? 'Connection verified' : 'Connection failed'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-white/70 rounded-lg">
                          <i className="ri-timer-line text-xs text-slate-500"></i>
                          <span className="text-xs font-semibold text-slate-600">{testResult.latency_ms}ms</span>
                        </div>
                      </div>

                      <p className={`text-xs leading-relaxed ${testResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                        {testResult.message}
                      </p>

                      {Object.keys(testResult.parsed_fields).length > 0 && (
                        <div className="bg-white/60 rounded-xl p-4">
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Parsed Fields</p>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(testResult.parsed_fields).map(([key, val]) => (
                              <div key={key} className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-mono">{key}</span>
                                <span className="text-xs font-semibold text-slate-700 font-mono truncate ml-2 max-w-[120px]" title={String(val)}>
                                  {String(val)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center space-x-2 text-xs text-slate-500">
                        <i className="ri-time-line"></i>
                        <span>Tested {new Date().toLocaleTimeString()}</span>
                        <span>&bull;</span>
                        <span>Protocol: {testResult.protocol}</span>
                      </div>
                    </div>
                  )}

                  {!testResult && !testError && config.last_test_at && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                      <p className="text-xs text-slate-500">
                        Last tested {new Date(config.last_test_at).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {!testResult && !testError && !config.last_test_at && (
                    <div className="flex items-center space-x-3 text-slate-400 text-xs py-4">
                      <i className="ri-radar-line text-lg"></i>
                      <span>No test run yet — click Send Test Ping to verify the connection</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
