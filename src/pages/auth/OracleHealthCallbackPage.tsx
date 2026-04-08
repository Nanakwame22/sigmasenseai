import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addToast } from '../../hooks/useToast';
import {
  clearSmartSession,
  exchangeSmartCode,
  fetchOracleSmartSamples,
  readSmartSession,
  saveSmartConnectionResult,
} from '../../services/oracleHealthSmart';

interface CallbackState {
  status: 'loading' | 'success' | 'error';
  message: string;
  detail?: string;
}

export default function OracleHealthCallbackPage() {
  const [searchParams] = useSearchParams();
  const [callbackState, setCallbackState] = useState<CallbackState>({
    status: 'loading',
    message: 'Completing Oracle Health connection...',
  });
  const [resourceSummary, setResourceSummary] = useState<string[]>([]);

  const authError = searchParams.get('error');
  const authErrorDescription = searchParams.get('error_description');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const guidance = useMemo(() => {
    if (callbackState.status === 'success') {
      return 'SigmaSense now has a live SMART session and sample FHIR resources to prove the connection is real.';
    }
    if (callbackState.status === 'error') {
      return 'This usually means the Oracle registration, redirect URI, client ID, or launch context does not fully match the live SMART session.';
    }
    return 'SigmaSense is exchanging the authorization code, validating the Oracle SMART state, and testing live FHIR reads.';
  }, [callbackState.status]);

  useEffect(() => {
    let active = true;

    async function completeSmartCallback() {
      if (authError) {
        setCallbackState({
          status: 'error',
          message: 'Oracle Health returned an authorization error.',
          detail: authErrorDescription || authError,
        });
        addToast('Oracle Health denied the SMART launch.', 'error');
        return;
      }

      if (!code || !state) {
        setCallbackState({
          status: 'error',
          message: 'Missing SMART callback parameters.',
          detail: 'The callback did not include the authorization code and state SigmaSense needs to finish the launch.',
        });
        addToast('Oracle SMART callback is missing required parameters.', 'error');
        return;
      }

      const session = readSmartSession();
      if (!session) {
        setCallbackState({
          status: 'error',
          message: 'No SMART launch session was found.',
          detail: 'Start from the Oracle Health launch URI again so SigmaSense can recreate the PKCE session.',
        });
        addToast('Oracle SMART session expired or was not found.', 'error');
        return;
      }

      if (session.state !== state) {
        clearSmartSession();
        setCallbackState({
          status: 'error',
          message: 'SMART state validation failed.',
          detail: 'SigmaSense blocked the callback because the Oracle Health state token did not match the launch session.',
        });
        addToast('Oracle SMART state check failed.', 'error');
        return;
      }

      try {
        const token = await exchangeSmartCode(code, session);
        const samples = await fetchOracleSmartSamples(session.issuer, token.access_token);

        if (!active) return;

        saveSmartConnectionResult({
          issuer: session.issuer,
          accessToken: token.access_token,
          tokenType: token.token_type,
          scope: token.scope,
          patient: token.patient,
          encounter: token.encounter,
          expiresIn: token.expires_in,
          connectedAt: new Date().toISOString(),
          resources: samples,
        });

        setResourceSummary(
          samples.map((sample) => {
            const ids = sample.sampleIds.length > 0 ? `sample ids: ${sample.sampleIds.join(', ')}` : 'no sample ids returned';
            const total = typeof sample.total === 'number' ? `${sample.total} total` : 'unknown total';
            return `${sample.resourceType}: ${total}, ${ids}`;
          })
        );

        setCallbackState({
          status: 'success',
          message: 'Oracle Health SMART connection is live.',
          detail: 'SigmaSense exchanged the SMART code successfully and pulled live FHIR resource samples from the Oracle Health endpoint.',
        });
        addToast('Oracle Health connected and live FHIR reads succeeded.', 'success');
        clearSmartSession();
      } catch (error) {
        if (!active) return;
        setCallbackState({
          status: 'error',
          message: 'SigmaSense could not complete the Oracle Health SMART flow.',
          detail: error instanceof Error ? error.message : 'Unknown Oracle SMART callback error',
        });
        addToast('Oracle SMART callback failed.', 'error');
      }
    }

    void completeSmartCallback();
    return () => {
      active = false;
    };
  }, [authError, authErrorDescription, code, state]);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-600">Oracle Health SMART</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Oracle Health callback status</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">{guidance}</p>
            </div>
            <Link to="/dashboard/cpi" className="text-sm font-medium text-teal-700 hover:text-teal-800">
              Back to CPI
            </Link>
          </div>

          <div
            className={`mb-6 rounded-2xl border p-5 ${
              callbackState.status === 'success'
                ? 'border-emerald-200 bg-emerald-50'
                : callbackState.status === 'error'
                  ? 'border-rose-200 bg-rose-50'
                  : 'border-sky-200 bg-sky-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-lg">
                {callbackState.status === 'success' ? (
                  <i className="ri-checkbox-circle-fill text-emerald-600" />
                ) : callbackState.status === 'error' ? (
                  <i className="ri-error-warning-fill text-rose-600" />
                ) : (
                  <i className="ri-loader-4-line animate-spin text-sky-600" />
                )}
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">{callbackState.message}</p>
                {callbackState.detail && <p className="mt-2 text-sm text-slate-700">{callbackState.detail}</p>}
              </div>
            </div>
          </div>

          {callbackState.status === 'success' && (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Live resource proof</p>
                <ul className="mt-4 space-y-3 text-sm text-slate-700">
                  {resourceSummary.map((item) => (
                    <li key={item} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-teal-100 bg-teal-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">What SigmaSense can test now</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-teal-900">
                  <li>Read live Oracle FHIR resources for patient flow, encounters, and observations.</li>
                  <li>Validate Oracle SMART launch and callback handling against your registered client ID.</li>
                  <li>Use the live session as the basis for wiring Oracle data into CPI integrations next.</li>
                </ul>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    to="/dashboard/cpi"
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
                  >
                    <i className="ri-hospital-line" />
                    Open CPI
                  </Link>
                  <Link
                    to="/integrations/oracle-health/launch"
                    className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 hover:border-teal-300"
                  >
                    <i className="ri-refresh-line" />
                    Re-run SMART launch
                  </Link>
                </div>
              </div>
            </div>
          )}

          {callbackState.status === 'error' && (
            <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Most common fixes</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                <li>Make sure the Oracle app registration uses the same redirect URI as SigmaSense.</li>
                <li>Confirm `VITE_ORACLE_HEALTH_CLIENT_ID` matches the Oracle Health client ID for this app.</li>
                <li>Start from the registered launch URI again so SigmaSense can recreate the PKCE session.</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
