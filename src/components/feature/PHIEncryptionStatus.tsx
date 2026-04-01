import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

interface EncryptionCoverage {
  total_records: number;
  encrypted_records: number;
  unencrypted_records: number;
  coverage_pct: number;
}

interface TableProtection {
  table: string;
  field: string;
  encrypted: boolean;
  note?: string;
}

interface HipaaControls {
  encryption_at_rest: boolean;
  audit_logging: boolean;
  access_controls_rls: boolean;
  automatic_logoff: boolean;
}

interface AccessLog {
  table_name: string;
  field_name: string;
  access_type: string;
  accessed_at: string;
  user_email: string;
}

interface StatusData {
  encryption_coverage: EncryptionCoverage;
  tables_protected: TableProtection[];
  recent_access_logs: AccessLog[];
  hipaa_controls: HipaaControls;
}

const PHI_HANDLER_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/phi-data-handler`;

export default function PHIEncryptionStatus() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${PHI_HANDLER_URL}?action=get_status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        // If the function isn't configured yet, show setup state
        if (err.error?.includes('PHI_ENCRYPTION_KEY')) {
          setError('setup_required');
        } else {
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
      } else {
        const data = await res.json() as StatusData;
        setStatus(data);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('PHI_ENCRYPTION_KEY')) {
        setError('setup_required');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const controlItems: { key: keyof HipaaControls; label: string; ref: string }[] = [
    { key: 'encryption_at_rest', label: 'AES-256 Encryption at Rest', ref: '§164.312(a)(2)(iv)' },
    { key: 'audit_logging', label: 'PHI Access Audit Logging', ref: '§164.312(b)' },
    { key: 'access_controls_rls', label: 'Row-Level Access Controls', ref: '§164.312(a)(1)' },
    { key: 'automatic_logoff', label: 'Automatic Session Logoff', ref: '§164.312(a)(2)(iii)' },
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 bg-slate-100 rounded-lg animate-pulse"></div>
          <div className="h-4 bg-slate-100 rounded w-48 animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  // Setup required state
  if (error === 'setup_required') {
    return (
      <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-lg">
              <i className="ri-key-2-line text-amber-600 text-base"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">PHI Encryption Setup Required</h3>
              <p className="text-xs text-amber-700">Add PHI_ENCRYPTION_KEY to Edge Function secrets</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full">Setup Needed</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            To enable field-level encryption for PHI data, you need to add a strong encryption key to your Supabase Edge Function secrets.
          </p>
          <div className="bg-slate-900 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Setup Steps</p>
            <ol className="space-y-2 text-xs text-slate-300 font-mono">
              <li className="flex items-start space-x-2">
                <span className="text-slate-500">1.</span>
                <span>Go to <span className="text-teal-400">Supabase Dashboard → Edge Functions → Secrets</span></span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-slate-500">2.</span>
                <span>Add secret: <span className="text-amber-400">PHI_ENCRYPTION_KEY</span></span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-slate-500">3.</span>
                <span>Value: a 32+ character random passphrase (keep this safe forever)</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-slate-500">4.</span>
                <span>Redeploy the <span className="text-teal-400">phi-data-handler</span> function</span>
              </li>
            </ol>
          </div>
          <button
            onClick={loadStatus}
            className="flex items-center space-x-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line text-xs"></i>
            <span>Retry After Setup</span>
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start space-x-3">
        <i className="ri-error-warning-line text-red-500 text-lg mt-0.5"></i>
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-800 mb-1">Failed to load encryption status</p>
          <p className="text-xs text-red-600 mb-3">{error}</p>
          <button onClick={loadStatus} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!status) return null;

  const { encryption_coverage: cov, tables_protected, recent_access_logs, hipaa_controls } = status;
  const allControlsPass = Object.values(hipaa_controls).every(Boolean);
  const coverageColor = cov.coverage_pct >= 80 ? 'text-emerald-600' : cov.coverage_pct > 0 ? 'text-amber-600' : 'text-red-500';
  const coverageRingColor = cov.coverage_pct >= 80 ? 'stroke-emerald-500' : cov.coverage_pct > 0 ? 'stroke-amber-400' : 'stroke-red-500';

  const radius = 20;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - cov.coverage_pct / 100);

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${allControlsPass ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <i className={`ri-shield-keyhole-line text-base ${allControlsPass ? 'text-emerald-600' : 'text-amber-600'}`}></i>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">PHI Encryption Status</h3>
            <p className="text-xs text-slate-500">HIPAA Technical Safeguards · AES-256 via pgcrypto</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${allControlsPass ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {allControlsPass ? 'Compliant' : 'Action Needed'}
          </span>
          <button onClick={loadStatus} className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
            <i className="ri-refresh-line text-slate-500 text-xs"></i>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Coverage + Controls row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Encryption coverage */}
          <div className="bg-slate-50 rounded-xl p-4 flex items-center space-x-4">
            <div className="relative w-14 h-14 flex-shrink-0">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle
                  cx="28" cy="28" r={radius} fill="none"
                  className={coverageRingColor}
                  strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xs font-bold ${coverageColor}`}>{cov.coverage_pct}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800 mb-0.5">Encryption Coverage</p>
              <p className="text-xs text-slate-500">{cov.encrypted_records}/{cov.total_records} records</p>
              {cov.unencrypted_records > 0 && (
                <p className="text-xs text-amber-600 font-semibold mt-0.5">{cov.unencrypted_records} need migration</p>
              )}
            </div>
          </div>

          {/* Quick controls summary */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
            <p className="text-xs font-semibold text-slate-600 mb-2">HIPAA Controls</p>
            {controlItems.map(ctrl => {
              const active = hipaa_controls[ctrl.key];
              return (
                <div key={ctrl.key} className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 truncate">{ctrl.label.split(' ').slice(0, 2).join(' ')}</span>
                  <span className={`w-4 h-4 flex items-center justify-center rounded-full flex-shrink-0 ${active ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    <i className={`text-xs ${active ? 'ri-check-line text-emerald-600' : 'ri-close-line text-red-600'}`}></i>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* HIPAA controls detail */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Technical Safeguard Details</p>
          <div className="space-y-2">
            {controlItems.map(ctrl => {
              const active = hipaa_controls[ctrl.key];
              return (
                <div key={ctrl.key} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${active ? 'bg-emerald-50/60 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                  <div className="flex items-center space-x-3">
                    <div className={`w-7 h-7 flex items-center justify-center rounded-lg ${active ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                      <i className={`text-sm ${active ? 'ri-shield-check-line text-emerald-600' : 'ri-alert-line text-amber-600'}`}></i>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{ctrl.label}</p>
                      <p className="text-xs text-slate-400 font-mono">{ctrl.ref}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {active ? 'Active' : 'Pending'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tables protected */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Data Table Protection</p>
          <div className="space-y-2">
            {tables_protected.map((t, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-6 h-6 flex items-center justify-center rounded-lg ${t.encrypted ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    <i className={`text-xs ${t.encrypted ? 'ri-lock-line text-emerald-600' : 'ri-lock-unlock-line text-slate-400'}`}></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 font-mono truncate">{t.table}</p>
                    <p className="text-xs text-slate-400 font-mono truncate">{t.field}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${t.encrypted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {t.encrypted ? 'Encrypted' : 'Plaintext'}
                  </span>
                  {t.note && <p className="text-xs text-slate-400 mt-0.5 max-w-[160px] text-right">{t.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent PHI access logs */}
        <div>
          <button
            onClick={() => setShowLogs(l => !l)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <i className="ri-file-list-line text-slate-500 text-sm"></i>
              <span className="text-xs font-semibold text-slate-700">Recent PHI Access Log</span>
              <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded-full">{recent_access_logs.length}</span>
            </div>
            <i className={`text-slate-400 text-sm transition-transform ${showLogs ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`}></i>
          </button>

          {showLogs && (
            <div className="mt-2 space-y-1.5">
              {recent_access_logs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3">No access logs yet</p>
              ) : (
                recent_access_logs.map((log, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        log.access_type === 'decrypt' ? 'bg-amber-100 text-amber-700' :
                        log.access_type === 'encrypt' ? 'bg-teal-100 text-teal-700' :
                        log.access_type === 'rotate' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{log.access_type}</span>
                      <span className="text-xs text-slate-600 font-mono truncate">{log.table_name}.{log.field_name}</span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-xs text-slate-400">{new Date(log.accessed_at).toLocaleTimeString()}</p>
                      <p className="text-xs text-slate-400 truncate max-w-[120px]">{log.user_email}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
