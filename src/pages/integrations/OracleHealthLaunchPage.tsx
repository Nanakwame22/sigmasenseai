import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  buildAuthorizationUrl,
  createSmartSession,
  fetchOracleOpenSandboxSamples,
  getOracleSmartLaunchUri,
  isOracleOpenSandboxIssuer,
  saveSmartConnectionResult,
} from '../../services/oracleHealthSmart';

interface OpenSandboxState {
  issuer: string;
  resources: string[];
}

export default function OracleHealthLaunchPage() {
  const [searchParams] = useSearchParams();
  const [issuerInput, setIssuerInput] = useState(searchParams.get('iss') || '');
  const [launchInput, setLaunchInput] = useState(searchParams.get('launch') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSandboxState, setOpenSandboxState] = useState<OpenSandboxState | null>(null);

  const autoLaunch = useMemo(
    () => Boolean(searchParams.get('iss') && searchParams.get('launch')),
    [searchParams]
  );

  const openSandboxIssuer = useMemo(
    () => searchParams.get('iss') || 'https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d',
    [searchParams]
  );

  const startLaunch = async (issuer: string, launch: string | null) => {
    setLoading(true);
    setError(null);
    setOpenSandboxState(null);
    try {
      const session = await createSmartSession(issuer, launch);
      window.location.assign(buildAuthorizationUrl(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize Oracle Health SMART launch');
      setLoading(false);
    }
  };

  const startOpenSandboxCheck = async (issuer: string) => {
    setLoading(true);
    setError(null);
    setOpenSandboxState(null);
    try {
      const samples = await fetchOracleOpenSandboxSamples(issuer);
      saveSmartConnectionResult({
        issuer,
        accessToken: '',
        tokenType: 'open-sandbox',
        mode: 'open-sandbox',
        connectedAt: new Date().toISOString(),
        resources: samples,
      });
      setOpenSandboxState({
        issuer,
        resources: samples.map((sample) => {
          const ids = sample.sampleIds.length > 0 ? sample.sampleIds.join(', ') : 'no sample ids returned';
          const total = typeof sample.total === 'number' ? `${sample.total} total` : 'unknown total';
          return `${sample.resourceType}: ${total}, ${ids}`;
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read Oracle open sandbox resources');
    } finally {
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

          <div className="mb-6 rounded-2xl border border-sky-100 bg-sky-50 p-4">
            <p className="text-sm font-semibold text-sky-800">Open sandbox shortcut</p>
            <p className="mt-1 text-sm leading-6 text-sky-700">
              For Oracle&apos;s public read-only sandbox, SigmaSense can test live FHIR reads directly without a SMART
              login. Use this first when you want proof of connection before dealing with secure sandbox credentials.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          )}

          {openSandboxState && (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-sm font-semibold text-emerald-800">Oracle open sandbox is reachable</p>
              <p className="mt-1 text-sm text-emerald-700">
                SigmaSense fetched public FHIR data from {openSandboxState.issuer} without requiring the secure sandbox
                login.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-emerald-900">
                {openSandboxState.resources.map((item) => (
                  <li key={item} className="rounded-xl border border-emerald-100 bg-white/70 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
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
            <button
              type="button"
              disabled={loading || !issuerInput.trim() || !isOracleOpenSandboxIssuer(issuerInput.trim())}
              onClick={() => void startOpenSandboxCheck(issuerInput.trim())}
              className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-5 py-3 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-database-2-line" />}
              {loading ? 'Testing Oracle open sandbox...' : 'Test Open Sandbox'}
            </button>
            <span className="text-sm text-slate-500">
              SigmaSense will discover SMART configuration, create a PKCE session, and redirect to Oracle Health auth.
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">Recommended first test</p>
            <p className="mt-1 leading-6">
              Paste Oracle&apos;s public issuer like <span className="font-mono text-slate-800">{openSandboxIssuer}</span>,
              leave the launch token blank, and use <span className="font-semibold text-slate-800">Test Open Sandbox</span>.
              Use SMART launch only when you have a fresh secure launch context and Oracle sandbox credentials.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
