export type TrackedWorkStatus = 'Not Started' | 'In Progress' | 'Completed' | 'On Hold';

const normalizeActionItemStatus = (status?: string | null): TrackedWorkStatus => {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In Progress';
  if (status === 'on_hold') return 'On Hold';
  return 'Not Started';
};

const normalizeDMAICStatus = (status?: string | null): TrackedWorkStatus => {
  if (status === 'completed') return 'Completed';
  if (status === 'on_hold') return 'On Hold';
  return 'In Progress';
};

const normalizeKaizenStatus = (status?: string | null): TrackedWorkStatus => {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In Progress';
  if (status === 'rejected') return 'On Hold';
  return 'Not Started';
};

export const summarizeAIMTrackedWorkRecords = (params: {
  actionItems?: Array<{ status?: string | null; impact_score?: number | null }>;
  dmaicProjects?: Array<{ status?: string | null; expected_savings?: number | null }>;
  kaizenItems?: Array<{ status?: string | null; estimated_savings?: number | null }>;
}) => {
  const statuses: TrackedWorkStatus[] = [
    ...(params.actionItems || []).map((item) => normalizeActionItemStatus(item.status)),
    ...(params.dmaicProjects || []).map((item) => normalizeDMAICStatus(item.status)),
    ...(params.kaizenItems || []).map((item) => normalizeKaizenStatus(item.status)),
  ];

  const totalImpact =
    (params.actionItems || []).reduce((sum, item) => sum + (item.impact_score || 0), 0) +
    (params.dmaicProjects || []).reduce((sum, item) => sum + (item.expected_savings || 0), 0) +
    (params.kaizenItems || []).reduce((sum, item) => sum + (item.estimated_savings || 0), 0);

  return {
    total: statuses.length,
    inProgress: statuses.filter((status) => status === 'In Progress').length,
    completed: statuses.filter((status) => status === 'Completed').length,
    notStarted: statuses.filter((status) => status === 'Not Started').length,
    onHold: statuses.filter((status) => status === 'On Hold').length,
    totalImpact,
  };
};

export const summarizeAIMTrackedWorkItems = (
  actions: Array<{ status: TrackedWorkStatus; impactValue: number }>
) => ({
  total: actions.length,
  inProgress: actions.filter((action) => action.status === 'In Progress').length,
  completed: actions.filter((action) => action.status === 'Completed').length,
  notStarted: actions.filter((action) => action.status === 'Not Started').length,
  onHold: actions.filter((action) => action.status === 'On Hold').length,
  totalImpact: actions.reduce((sum, action) => sum + action.impactValue, 0),
});
