import type { Recommendation } from './recommendationsEngine';

export const summarizeAIMRecommendations = (recommendations: Recommendation[]) => {
  const open = recommendations.filter((rec) => rec.status === 'pending' || rec.status === 'in_progress');
  const pending = recommendations.filter((rec) => rec.status === 'pending');
  const inProgress = recommendations.filter((rec) => rec.status === 'in_progress');
  const completed = recommendations.filter((rec) => rec.status === 'completed');
  const dismissed = recommendations.filter((rec) => rec.status === 'dismissed');

  const averageImpactBase = open.length > 0 ? open : recommendations;
  const avgImpactScore =
    averageImpactBase.length > 0
      ? Math.round(
          averageImpactBase.reduce((sum, rec) => sum + (rec.impact_score || 0), 0) / averageImpactBase.length
        )
      : 0;

  const avgEffortScore =
    averageImpactBase.length > 0
      ? Math.round(
          averageImpactBase.reduce((sum, rec) => sum + (rec.effort_score || 0), 0) / averageImpactBase.length
        )
      : 0;

  return {
    total: recommendations.length,
    open: open.length,
    pending: pending.length,
    inProgress: inProgress.length,
    completed: completed.length,
    dismissed: dismissed.length,
    avgImpactScore,
    avgEffortScore,
  };
};
