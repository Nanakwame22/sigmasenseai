const SMART_STORAGE_KEY = 'oracle-health-smart-session';
const SMART_RESULT_STORAGE_KEY = 'oracle-health-smart-result';

export interface OracleSmartSession {
  issuer: string;
  launch?: string | null;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  tokenEndpoint: string;
  authorizationEndpoint: string;
  createdAt: string;
}

export interface OracleSmartTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  patient?: string;
  encounter?: string;
  id_token?: string;
}

export interface OracleSmartConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  capabilities_supported?: string[];
  scopes_supported?: string[];
}

export interface OracleSmartResourceSample {
  resourceType: string;
  total?: number;
  sampleIds: string[];
  sampleRecords?: OracleNormalizedFhirRecord[];
}

export interface OracleNormalizedFhirRecord {
  resource_type: string;
  resource_id: string;
  status?: string;
  category?: string;
  code?: string;
  display?: string;
  value?: number | string;
  unit?: string;
  effective_at?: string;
  authored_at?: string;
  recorded_at?: string;
  period_start?: string;
  period_end?: string;
  subject_ref?: string;
  encounter_ref?: string;
  location_ref?: string;
  source: string;
  evidence_summary: string;
}

export interface OracleSmartConnectionResult {
  issuer: string;
  accessToken: string;
  tokenType: string;
  mode?: 'smart' | 'open-sandbox';
  scope?: string;
  patient?: string;
  encounter?: string;
  expiresIn?: number;
  connectedAt: string;
  resources: OracleSmartResourceSample[];
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}

async function sha256(input: string) {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64UrlEncode(digest);
}

function getConfiguredClientId() {
  return (import.meta.env.VITE_ORACLE_HEALTH_CLIENT_ID as string | undefined)?.trim() || '';
}

function getConfiguredScope() {
  return (
    (import.meta.env.VITE_ORACLE_HEALTH_SCOPE as string | undefined)?.trim() ||
    'launch openid fhirUser user/Patient.read user/Encounter.read user/Observation.read user/Condition.read user/Procedure.read user/ServiceRequest.read user/Location.read user/Practitioner.read user/Organization.read user/Appointment.read user/CareTeam.read user/DiagnosticReport.read user/MedicationRequest.read user/DocumentReference.read'
  );
}

export function getOracleSmartRedirectUri() {
  return `${window.location.origin}/auth/oracle-health/callback`;
}

export function getOracleSmartLaunchUri() {
  return `${window.location.origin}/integrations/oracle-health/launch`;
}

export function isOracleOpenSandboxIssuer(issuer: string) {
  return /fhir-open\.cerner\.com/i.test(issuer);
}

export async function fetchSmartConfiguration(issuer: string): Promise<OracleSmartConfig> {
  const issuerBase = issuer.replace(/\/$/, '');
  const candidates = [
    `${issuerBase}/.well-known/smart-configuration`,
    `${issuerBase}/metadata`,
  ];

  let lastError: Error | null = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`SMART discovery failed (${response.status})`);
      }
      const data = await response.json();
      if (data.authorization_endpoint && data.token_endpoint) {
        return data as OracleSmartConfig;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('SMART discovery failed');
    }
  }

  throw lastError || new Error('Unable to discover SMART configuration');
}

export async function createSmartSession(issuer: string, launch?: string | null): Promise<OracleSmartSession> {
  const clientId = getConfiguredClientId();
  if (!clientId) {
    throw new Error('Missing VITE_ORACLE_HEALTH_CLIENT_ID');
  }

  const config = await fetchSmartConfiguration(issuer);
  const codeVerifier = randomString(96);
  const codeChallenge = await sha256(codeVerifier);
  const state = randomString(48);

  const session: OracleSmartSession = {
    issuer,
    launch: launch || null,
    clientId,
    redirectUri: getOracleSmartRedirectUri(),
    scope: getConfiguredScope(),
    state,
    codeVerifier,
    codeChallenge,
    tokenEndpoint: config.token_endpoint,
    authorizationEndpoint: config.authorization_endpoint,
    createdAt: new Date().toISOString(),
  };

  sessionStorage.setItem(SMART_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function readSmartSession(): OracleSmartSession | null {
  const raw = sessionStorage.getItem(SMART_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OracleSmartSession;
  } catch {
    return null;
  }
}

export function clearSmartSession() {
  sessionStorage.removeItem(SMART_STORAGE_KEY);
}

export function saveSmartConnectionResult(result: OracleSmartConnectionResult) {
  sessionStorage.setItem(SMART_RESULT_STORAGE_KEY, JSON.stringify(result));
}

export function readSmartConnectionResult(): OracleSmartConnectionResult | null {
  const raw = sessionStorage.getItem(SMART_RESULT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OracleSmartConnectionResult;
  } catch {
    return null;
  }
}

export function clearSmartConnectionResult() {
  sessionStorage.removeItem(SMART_RESULT_STORAGE_KEY);
}

export function buildAuthorizationUrl(session: OracleSmartSession) {
  const url = new URL(session.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', session.clientId);
  url.searchParams.set('redirect_uri', session.redirectUri);
  url.searchParams.set('scope', session.scope);
  url.searchParams.set('aud', session.issuer);
  url.searchParams.set('state', session.state);
  url.searchParams.set('code_challenge', session.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (session.launch) {
    url.searchParams.set('launch', session.launch);
  }
  return url.toString();
}

export async function exchangeSmartCode(code: string, session: OracleSmartSession): Promise<OracleSmartTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: session.redirectUri,
    client_id: session.clientId,
    code_verifier: session.codeVerifier,
  });

  const response = await fetch(session.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text || 'No response body'}`);
  }

  return response.json();
}

async function fetchResourceBundle(issuer: string, accessToken: string, resourceType: string) {
  const url = new URL(`${issuer.replace(/\/$/, '')}/${resourceType}`);
  url.searchParams.set('_count', '3');
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/fhir+json, application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`${resourceType} fetch failed (${response.status})`);
  }

  return response.json();
}

function firstCodingDisplay(resource: any): { code?: string; display?: string; category?: string } {
  const coding = resource?.code?.coding?.[0] || resource?.category?.[0]?.coding?.[0] || resource?.category?.coding?.[0];
  const categoryCoding = resource?.category?.[0]?.coding?.[0] || resource?.category?.coding?.[0];
  return {
    code: typeof coding?.code === 'string' ? coding.code : undefined,
    display: typeof coding?.display === 'string' ? coding.display : undefined,
    category: typeof categoryCoding?.display === 'string' ? categoryCoding.display : undefined,
  };
}

function normalizeFhirResource(resource: any, issuer: string): OracleNormalizedFhirRecord | null {
  if (!resource || typeof resource !== 'object') return null;

  const resourceType = typeof resource.resourceType === 'string' ? resource.resourceType : 'Unknown';
  const resourceId = typeof resource.id === 'string' ? resource.id : `${resourceType}-${crypto.randomUUID()}`;
  const coding = firstCodingDisplay(resource);
  const valueQuantity = resource.valueQuantity || {};
  const period = resource.period || {};

  const normalized: OracleNormalizedFhirRecord = {
    resource_type: resourceType,
    resource_id: resourceId,
    status: typeof resource.status === 'string' ? resource.status : undefined,
    category: coding.category,
    code: coding.code,
    display: coding.display,
    value: typeof valueQuantity.value === 'number'
      ? valueQuantity.value
      : typeof resource.valueString === 'string'
        ? resource.valueString
        : undefined,
    unit: typeof valueQuantity.unit === 'string' ? valueQuantity.unit : undefined,
    effective_at: typeof resource.effectiveDateTime === 'string' ? resource.effectiveDateTime : undefined,
    authored_at: typeof resource.authoredOn === 'string' ? resource.authoredOn : undefined,
    recorded_at: typeof resource.recordedDate === 'string' ? resource.recordedDate : undefined,
    period_start: typeof period.start === 'string' ? period.start : undefined,
    period_end: typeof period.end === 'string' ? period.end : undefined,
    subject_ref: typeof resource.subject?.reference === 'string' ? resource.subject.reference : undefined,
    encounter_ref: typeof resource.encounter?.reference === 'string' ? resource.encounter.reference : undefined,
    location_ref: typeof resource.location?.[0]?.location?.reference === 'string'
      ? resource.location[0].location.reference
      : typeof resource.location?.reference === 'string'
        ? resource.location.reference
        : undefined,
    source: `${issuer.replace(/\/$/, '')}/${resourceType}/${resourceId}`,
    evidence_summary: `Oracle FHIR ${resourceType} sample ${resourceId} normalized for SigmaSense ingestion.`,
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== undefined && value !== '')
  ) as OracleNormalizedFhirRecord;
}

function normalizeBundleEntries(bundle: any, issuer: string): OracleNormalizedFhirRecord[] {
  if (!Array.isArray(bundle?.entry)) return [];

  return bundle.entry
    .map((entry: any) => normalizeFhirResource(entry?.resource, issuer))
    .filter((record: OracleNormalizedFhirRecord | null): record is OracleNormalizedFhirRecord => Boolean(record));
}

export async function fetchOracleSmartSamples(
  issuer: string,
  accessToken: string
): Promise<OracleSmartResourceSample[]> {
  const resourceTypes = ['Patient', 'Encounter', 'Observation', 'Condition'];
  const settled = await Promise.allSettled(
    resourceTypes.map(async (resourceType) => {
      const bundle = await fetchResourceBundle(issuer, accessToken, resourceType);
      return {
        resourceType,
        total: typeof bundle.total === 'number' ? bundle.total : undefined,
        sampleIds: Array.isArray(bundle.entry)
          ? bundle.entry
              .map((entry: any) => entry?.resource?.id)
              .filter((id: unknown): id is string => typeof id === 'string')
          : [],
        sampleRecords: normalizeBundleEntries(bundle, issuer),
      } satisfies OracleSmartResourceSample;
    })
  );

  return settled
    .filter((item): item is PromiseFulfilledResult<OracleSmartResourceSample> => item.status === 'fulfilled')
    .map((item) => item.value);
}

async function fetchOpenResourceBundle(issuer: string, resourceType: string) {
  const url = new URL(`${issuer.replace(/\/$/, '')}/${resourceType}`);
  url.searchParams.set('_count', '3');
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/fhir+json, application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`${resourceType} fetch failed (${response.status})`);
  }

  return response.json();
}

async function fetchCapabilityStatement(issuer: string) {
  const response = await fetch(`${issuer.replace(/\/$/, '')}/metadata`, {
    headers: {
      Accept: 'application/fhir+json, application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`CapabilityStatement fetch failed (${response.status})`);
  }

  return response.json();
}

export async function fetchOracleOpenSandboxSamples(
  issuer: string
): Promise<OracleSmartResourceSample[]> {
  const resourceTypes = ['Patient', 'Encounter', 'Observation', 'Condition', 'Location'];
  const settled = await Promise.allSettled(
    resourceTypes.map(async (resourceType) => {
      const bundle = await fetchOpenResourceBundle(issuer, resourceType);
      return {
        resourceType,
        total: typeof bundle.total === 'number' ? bundle.total : undefined,
        sampleIds: Array.isArray(bundle.entry)
          ? bundle.entry
              .map((entry: any) => entry?.resource?.id)
              .filter((id: unknown): id is string => typeof id === 'string')
          : [],
        sampleRecords: normalizeBundleEntries(bundle, issuer),
      } satisfies OracleSmartResourceSample;
    })
  );

  const samples = settled
    .filter((item): item is PromiseFulfilledResult<OracleSmartResourceSample> => item.status === 'fulfilled')
    .map((item) => item.value);

  if (samples.length > 0) {
    return samples;
  }

  const capabilityStatement = await fetchCapabilityStatement(issuer);
  const softwareName = capabilityStatement?.software?.name;
  const fhirVersion = capabilityStatement?.fhirVersion;
  const restResources = Array.isArray(capabilityStatement?.rest?.[0]?.resource)
    ? capabilityStatement.rest[0].resource
        .map((resource: any) => resource?.type)
        .filter((type: unknown): type is string => typeof type === 'string')
        .slice(0, 5)
    : [];

  return [
    {
      resourceType: 'CapabilityStatement',
      sampleIds: [softwareName, fhirVersion, ...restResources].filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      ),
    },
  ];
}
