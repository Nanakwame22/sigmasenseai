import type { OracleSmartConnectionResult } from './oracleHealthSmart';

export interface OraclePlatformMetric {
  id: string;
  name: string;
  unit: string;
  currentValue: number;
  targetValue: number;
  category: string;
  timestamp: string;
  source: string;
  evidenceSummary: string;
  lineageSummary: string;
  provenanceSummary: string;
}

const EXPECTED_OPEN_SANDBOX_RESOURCES = ['Patient', 'Encounter', 'Observation', 'Condition', 'Location'];

function getReachableResourceTypes(connection: OracleSmartConnectionResult) {
  return Array.from(
    new Set(
      connection.resources
        .map((resource) => resource.resourceType)
        .filter((resourceType): resourceType is string => Boolean(resourceType))
    )
  );
}

export function buildOraclePlatformMetrics(connection: OracleSmartConnectionResult): OraclePlatformMetric[] {
  const reachableResourceTypes = getReachableResourceTypes(connection);
  const totalCapturedSamples = connection.resources.reduce(
    (sum, resource) => sum + resource.sampleIds.length,
    0
  );
  const expectedResourceTypes =
    connection.mode === 'open-sandbox'
      ? EXPECTED_OPEN_SANDBOX_RESOURCES.length
      : Math.max(reachableResourceTypes.length, 1);
  const reachabilityScore = Math.round((reachableResourceTypes.length / expectedResourceTypes) * 100);

  return [
    {
      id: 'oracle-sandbox-reachability',
      name: 'Oracle Sandbox Reachability',
      unit: '%',
      currentValue: reachabilityScore,
      targetValue: 100,
      category: 'Integration Health',
      timestamp: connection.connectedAt,
      source: 'oracle-health:open-sandbox',
      evidenceSummary: `${reachableResourceTypes.length}/${expectedResourceTypes} expected Oracle FHIR resource endpoints responded successfully.`,
      lineageSummary: 'Oracle Health open sandbox -> FHIR discovery -> SigmaSense integration validation',
      provenanceSummary: 'Source-backed Oracle open sandbox read',
    },
    {
      id: 'oracle-verified-fhir-resources',
      name: 'Oracle Verified FHIR Resources',
      unit: 'types',
      currentValue: reachableResourceTypes.length,
      targetValue: expectedResourceTypes,
      category: 'Integration Coverage',
      timestamp: connection.connectedAt,
      source: 'oracle-health:open-sandbox',
      evidenceSummary: `${totalCapturedSamples} sample records captured across ${reachableResourceTypes.join(', ') || 'FHIR capability metadata'}.`,
      lineageSummary: 'Oracle Health open sandbox -> FHIR sample reads -> SigmaSense platform coverage',
      provenanceSummary: 'Derived from live Oracle resource discovery',
    },
  ];
}
