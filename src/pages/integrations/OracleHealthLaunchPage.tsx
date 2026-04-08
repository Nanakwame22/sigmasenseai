import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  buildAuthorizationUrl,
  createSmartSession,
  getOracleSmartLaunchUri,
} from '../../services/oracleHealthSmart';

export default function OracleHealthLaunchPage() {
  const [searchParams] = useSearchParams();
  const [issuerInput, setIssuerInput] = useState(searchParams.get('iss') || '');
  const [launchInput, setLaunchInput] = useState(searchParams.get('launch') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoLaunch = useMemo(
    () => Boolean(searchParams.get('iss') && searchParams.get('launch')),
    [searchParams]
  );

  const startLaunch = async (issuer: string, launch: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const session = await createSmartSession(issuer, launch);
      window.location.assign(buildAuthorizationUrl(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize Oracle Health SMART launch');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!autoLaunch) return;
    const issuer = searchParams.get('iss');
    const launch = searchParams.get('launch');
    if (issuer) {
      void startLaunch(issuer, launch);
    }
  }, [autoLaunch, searchParams]);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-600">Oracle Health SMART</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Launch SigmaSense against Oracle Health</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                This route starts the real SMART on FHIR PKCE flow for SigmaSense. Use it from an Oracle Health launch,
                or paste an issuer URL below to test against a sandbox manually.
              </p>
            </div>
            <Link to="/dashboard/cpi" className="text-sm font-medium text-teal-700 hover:text-teal-800">
              Back to CPI
            </Link>
          </div>

          <div className="mb-6 rounded-2xl border border-teal-100 bg-teal-50 p-4">
            <p className="text-sm font-semibold text-teal-800">Registered launch URI</p>
            <p className="mt-1 break-all text-sm text-teal-700">{getOracleSmartLaunchUri()}</p>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="grid gap-5">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">FHIR issuer (`iss`)</span>
              <input
                type="url"
                value={issuerInput}
                onChange={(event) => setIssuerInput(event.target.value)}
                placeholder="https://fhir-ehr-code.cerner.com/r4/..."
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Launch token (`launch`)</span>
              <input
                type="text"
                value={launchInput}
                onChange={(event) => setLaunchInput(event.target.value)}
                placeholder="Optional for manual sandbox tests"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={loading || !issuerInput.trim()}
              onClick={() => void startLaunch(issuerInput.trim(), launchInput.trim() || null)}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-link-m" />}
              {loading ? 'Launching Oracle Health...' : 'Start SMART Launch'}
            </button>
            <span className="text-sm text-slate-500">
              SigmaSense will discover SMART configuration, create a PKCE session, and redirect to Oracle Health auth.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
