import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  generateDecisionScenarios,
  generateRecommendationJustification,
  analyzeTradeOffs,
  calculateConfidenceBreakdown,
} from '../../../services/decisionSupportEngine';
import type { DecisionScenario, RecommendationJustification, TradeOffAnalysis, ConfidenceFactor } from '../../../services/decisionSupportEngine';
import { AIMEmptyState, AIMMetricTiles, AIMPanel, AIMSectionIntro } from './AIMSectionSystem';
import { toDecisionBrief } from '../../../services/intelligenceObjects';

const RISK_THEME: Record<string, string> = {
  Low: 'bg-emerald-100 text-emerald-700',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-red-100 text-red-700',
};

const SCENARIO_THEME: Record<string, { shell: string; activeShell: string; icon: string; accent: string }> = {
  'scenario-1': {
    shell: 'border-brand-200 bg-white hover:border-brand-300',
    activeShell: 'border-brand-500 bg-gradient-to-br from-brand-50 to-brand-100 shadow-lg shadow-brand-200/70',
    icon: 'from-brand-500 to-brand-700',
    accent: 'text-brand-700',
  },
  'scenario-2': {
    shell: 'border-ai-200 bg-white hover:border-ai-300',
    activeShell: 'border-ai-500 bg-gradient-to-br from-ai-50 to-ai-100 shadow-lg shadow-ai-200/70',
    icon: 'from-ai-500 to-ai-600',
    accent: 'text-ai-700',
  },
  'scenario-3': {
    shell: 'border-sapphire-200 bg-white hover:border-sapphire-300',
    activeShell: 'border-sapphire-500 bg-gradient-to-br from-sapphire-50 to-indigo-50 shadow-lg shadow-sapphire-200/70',
    icon: 'from-sapphire-500 to-indigo-600',
    accent: 'text-sapphire-700',
  },
  'scenario-4': {
    shell: 'border-fuchsia-200 bg-white hover:border-fuchsia-300',
    activeShell: 'border-fuchsia-500 bg-gradient-to-br from-fuchsia-50 to-violet-50 shadow-lg shadow-fuchsia-200/70',
    icon: 'from-fuchsia-500 to-violet-600',
    accent: 'text-fuchsia-700',
  },
};

const DecisionSupportSection: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>(['scenario-2']);
  const [expandedJustification, setExpandedJustification] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scenarios, setScenarios] = useState<DecisionScenario[]>([]);
  const [justifications, setJustifications] = useState<RecommendationJustification[]>([]);
  const [tradeOffs, setTradeOffs] = useState<TradeOffAnalysis | null>(null);
  const [confidenceBreakdown, setConfidenceBreakdown] = useState<{ factors: ConfidenceFactor[]; overallScore: number } | null>(null);

  useEffect(() => {
    if (user) {
      loadDecisionSupportData();
    }
  }, [user]);

  const loadDecisionSupportData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Load all decision support data
      const [scenariosData, justificationsData, tradeOffsData, confidenceData] = await Promise.all([
        generateDecisionScenarios(user.id),
        generateRecommendationJustification(user.id),
        analyzeTradeOffs(user.id, '2'),
        calculateConfidenceBreakdown(user.id)
      ]);

      setScenarios(scenariosData);
      setJustifications(justificationsData);
      setTradeOffs(tradeOffsData);
      setConfidenceBreakdown(confidenceData);

    } catch (error) {
      console.error('Error loading decision support data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleScenario = (id: string) => {
    setSelectedScenarios(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const activeScenario = scenarios.find((scenario) => scenario.id === selectedScenarios[0]) || scenarios[0] || null;
  const activeDecisionBrief = activeScenario
    ? toDecisionBrief(activeScenario, {
        confidenceScore: confidenceBreakdown?.overallScore ?? activeScenario.score,
      })
    : null;
  const activeScenarioTheme = activeScenario ? (SCENARIO_THEME[activeScenario.id] || SCENARIO_THEME['scenario-2']) : SCENARIO_THEME['scenario-2'];
  const hasScenarioComparison = scenarios.length > 0 && !!activeScenario;
  const hasTradeOffContent = Boolean(
    tradeOffs &&
      (
        tradeOffs.netScore > 0 ||
        tradeOffs.benefits.some((group) => group.items.length > 0) ||
        tradeOffs.considerations.some((group) => group.items.length > 0)
      )
  );
  const hasConfidenceContent = Boolean(
    confidenceBreakdown &&
      (
        confidenceBreakdown.overallScore > 0 ||
        confidenceBreakdown.factors.some((factor) => factor.score > 0)
      )
  );
  const readinessHighlights = (confidenceBreakdown?.factors ?? []).slice(0, 3);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-ai-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-brand-600">Loading decision support data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AIMSectionIntro
        eyebrow="Decision Studio"
        title="Decision Support"
        description="Compare operating scenarios, review evidence, and understand the trade-offs behind AIM's recommendation path."
        actions={
          <button 
            onClick={loadDecisionSupportData}
            className="px-4 py-2 bg-gradient-to-r from-ai-500 to-ai-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2"
          >
            <i className="ri-refresh-line"></i>
            Refresh Analysis
          </button>
        }
      />

      {hasScenarioComparison && activeScenario && activeDecisionBrief && (
        <AIMMetricTiles
          items={[
            {
              label: 'Current Recommendation',
              value: activeDecisionBrief.recommendation,
              detail: activeDecisionBrief.timeline,
            },
            {
              label: 'Decision Score',
              value: `${activeDecisionBrief.score}/100`,
              detail: `${activeDecisionBrief.risk} execution risk`,
              accent: activeDecisionBrief.score >= 80 ? 'text-ai-600' : activeDecisionBrief.score >= 65 ? 'text-amber-600' : 'text-red-600',
            },
            {
              label: 'Modeled Annual Impact',
              value: activeDecisionBrief.impact,
              detail: `${activeScenario.roi}% ROI`,
              accent: activeScenarioTheme.accent,
            },
            {
              label: 'Confidence',
              value: `${activeDecisionBrief.confidenceScore}%`,
              detail: activeDecisionBrief.evidence.decisionReadiness,
            },
          ]}
        />
      )}

      {/* Scenario Comparison */}
      {hasScenarioComparison && (
        <AIMPanel
          title="Executive Decision Brief"
          description="Select the operating posture AIM recommends, then compare the upside, cost, and execution risk in one briefing surface."
          icon="ri-compass-3-line"
          accentClass="from-sapphire-500 to-indigo-600"
        >
          <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <div className="space-y-3">
              {scenarios.map((scenario) => {
                const theme = SCENARIO_THEME[scenario.id] || SCENARIO_THEME['scenario-2'];
                const isActive = selectedScenarios.includes(scenario.id);
                return (
                  <button
                    key={scenario.id}
                    onClick={() => toggleScenario(scenario.id)}
                    className={`w-full rounded-[24px] border p-5 text-left transition-all ${
                      isActive ? theme.activeShell : `${theme.shell} hover:shadow-md`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${theme.icon}`}>
                          <i className="ri-scales-3-line text-2xl text-white"></i>
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-brand-900">{scenario.name}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
                              {scenario.timeline}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RISK_THEME[scenario.risk] || RISK_THEME.High}`}>
                              {scenario.risk} risk
                            </span>
                          </div>
                        </div>
                      </div>
                      {isActive && (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ai-500">
                          <i className="ri-check-line text-white"></i>
                        </span>
                      )}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-white/75 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Investment</div>
                        <div className="mt-1 text-lg font-bold text-brand-900">{scenario.cost}</div>
                      </div>
                      <div className="rounded-2xl bg-white/75 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">ROI</div>
                        <div className={`mt-1 text-lg font-bold ${theme.accent}`}>{scenario.roi}%</div>
                      </div>
                      <div className="rounded-2xl bg-white/75 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Annual impact</div>
                        <div className={`mt-1 text-lg font-bold ${theme.accent}`}>{scenario.impact}</div>
                      </div>
                      <div className="rounded-2xl bg-white/75 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Decision score</div>
                        <div className={`mt-1 text-lg font-bold ${theme.accent}`}>{scenario.score}/100</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {activeScenario && activeDecisionBrief && (
              <div className={`rounded-[28px] border p-6 ${activeScenarioTheme.activeShell}`}>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Recommended posture</div>
                <h3 className="mt-2 text-3xl font-bold text-brand-900">{activeScenario.name}</h3>
                <p className="mt-2 text-sm leading-6 text-brand-600">
                  AIM currently favors this posture because it balances operating pressure, visible upside, and execution capacity better than the alternatives.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Modeled annual upside</div>
                    <div className={`mt-2 text-3xl font-bold ${activeScenarioTheme.accent}`}>{activeScenario.impact}</div>
                  </div>
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Execution risk</div>
                    <div className="mt-2 text-3xl font-bold text-brand-900">{activeScenario.risk}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-600">
                    Readiness: {activeDecisionBrief.evidence.decisionReadiness}
                  </span>
                  <span className="rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-600">
                    Provenance: {activeDecisionBrief.evidence.sourceLabel}
                  </span>
                  <span className="rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-600">
                    Confidence basis: {activeDecisionBrief.evidence.confidenceState}
                  </span>
                </div>

                <div className="mt-6 rounded-[22px] bg-white/80 p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Why AIM prefers it</div>
                  <div className="mt-4 space-y-3">
                    {activeScenario.pros.slice(0, 3).map((pro, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-sm text-brand-700">
                        <i className="ri-checkbox-circle-fill mt-0.5 text-ai-600"></i>
                        <span>{pro}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-brand-600">
                    {activeDecisionBrief.evidence.evidenceSummary}
                  </p>
                </div>
              </div>
            )}
          </div>
        </AIMPanel>
      )}

      {/* Recommendation Justification */}
      {justifications.length > 0 && (
        <AIMPanel
          title="Recommendation Justification"
          description="Review the specific evidence, sources, and expected outcomes behind each recommendation."
          icon="ri-file-list-3-line"
          accentClass="from-purple-500 to-pink-600"
        >
          <div className="space-y-4">
            {justifications.map((just) => (
              <div
                key={just.id}
                className="border border-brand-200 rounded-xl overflow-hidden hover:shadow-lg transition-all"
              >
                <div
                  className="p-5 cursor-pointer"
                  onClick={() => setExpandedJustification(expandedJustification === just.id ? null : just.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-brand-900 mb-2">{just.recommendation}</h3>
                      <p className="text-sm text-brand-600">{just.reasoning}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-ai-600">{just.confidence}%</div>
                        <div className="text-xs text-brand-500">Confidence</div>
                      </div>
                      <button className="w-8 h-8 flex items-center justify-center hover:bg-brand-100 rounded-lg transition-colors">
                        <i className={`ri-arrow-${expandedJustification === just.id ? 'up' : 'down'}-s-line text-brand-600`}></i>
                      </button>
                    </div>
                  </div>
                </div>

                {expandedJustification === just.id && (
                  <div className="px-5 pb-5 space-y-4 border-t border-brand-200 pt-4">
                    <div>
                      <h4 className="text-sm font-semibold text-brand-900 mb-3 flex items-center gap-2">
                        <i className="ri-bar-chart-line text-ai-600"></i>
                        Data Evidence
                      </h4>
                      <div className="space-y-2">
                        {just.dataEvidence.map((evidence, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-brand-50 rounded-lg">
                            <i className="ri-checkbox-circle-fill text-ai-600 mt-0.5"></i>
                            <span className="text-sm text-brand-700">{evidence}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-brand-900 mb-3 flex items-center gap-2">
                        <i className="ri-file-text-line text-sapphire-600"></i>
                        Data Sources
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {just.sources.map((source, idx) => (
                          <span key={idx} className="px-3 py-1 bg-sapphire-50 text-sapphire-700 text-xs font-medium rounded-full">
                            {source}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-brand-900 mb-2 flex items-center gap-2">
                        <i className="ri-target-line text-emerald-600"></i>
                        Expected Outcome
                      </h4>
                      <p className="text-sm text-brand-700 p-3 bg-emerald-50 rounded-lg">{just.expectedOutcome}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </AIMPanel>
      )}

      {/* Trade-Offs Analysis */}
      {hasTradeOffContent && tradeOffs && (
        <AIMPanel
          title="Anticipated Trade-Offs"
          description="Balance implementation benefits against execution complexity and risk."
          icon="ri-exchange-line"
          accentClass="from-amber-500 to-orange-600"
        >
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Benefits */}
            <div>
              <h3 className="text-lg font-bold text-emerald-600 mb-4 flex items-center gap-2">
                <i className="ri-thumb-up-line"></i>
                Expected Benefits
              </h3>
              <div className="space-y-4">
                {tradeOffs.benefits.map((benefit, idx) => (
                  <div key={idx}>
                    <h4 className="text-sm font-semibold text-brand-900 mb-2">{benefit.category}</h4>
                    <div className="space-y-2">
                      {benefit.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-start gap-2 p-2 bg-emerald-50 rounded-lg">
                          <i className="ri-check-line text-emerald-600 mt-0.5"></i>
                          <span className="text-sm text-brand-700">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Considerations */}
            <div>
              <h3 className="text-lg font-bold text-amber-600 mb-4 flex items-center gap-2">
                <i className="ri-alert-line"></i>
                Key Considerations
              </h3>
              <div className="space-y-4">
                {tradeOffs.considerations.map((consideration, idx) => (
                  <div key={idx}>
                    <h4 className="text-sm font-semibold text-brand-900 mb-2">{consideration.category}</h4>
                    <div className="space-y-2">
                      {consideration.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">
                          <i className="ri-arrow-right-s-line text-amber-600 mt-0.5"></i>
                          <span className="text-sm text-brand-700">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-[22px] border border-ai-200 bg-gradient-to-br from-ai-50 to-ai-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-brand-600 mb-1">Overall Assessment</div>
                <div className="text-xl font-bold text-brand-900">{tradeOffs.recommendation}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-brand-600 mb-1">Net Score</div>
                <div className="text-3xl font-bold text-ai-600">{tradeOffs.netScore}/100</div>
              </div>
            </div>
          </div>
        </AIMPanel>
      )}

      {/* Confidence Score Breakdown */}
      {hasConfidenceContent && confidenceBreakdown && (
        <AIMPanel
          title="Confidence Score & Data Evidence"
          description={`How AIM calculates its ${confidenceBreakdown.overallScore}% confidence rating`}
          icon="ri-shield-check-line"
          accentClass="from-ai-500 to-ai-600"
          actions={
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-4xl font-bold text-ai-600">{confidenceBreakdown.overallScore}%</div>
                <div className="text-sm text-brand-600">Overall Confidence</div>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {confidenceBreakdown.factors.map((factor, idx) => (
              <div key={idx} className="rounded-[22px] border border-brand-200 p-5 transition-all hover:shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-brand-900 mb-1">{factor.factor}</h3>
                    <p className="text-xs text-brand-600">{factor.description}</p>
                  </div>
                  <div className="text-2xl font-bold text-ai-600 ml-4">{factor.score}%</div>
                </div>
                <div className="w-full h-2 bg-brand-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-ai-500 to-ai-600 rounded-full transition-all duration-1000"
                    style={{ width: `${factor.score}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-gradient-to-br from-ai-50 to-ai-100 rounded-lg">
            <div className="flex items-start gap-3">
              <i className="ri-information-line text-ai-600 text-xl mt-0.5"></i>
              <div>
                <h4 className="text-sm font-semibold text-brand-900 mb-1">How Confidence is Calculated</h4>
                <p className="text-sm text-brand-600">
                  Our confidence score is a weighted average of data quality, model accuracy, industry benchmarks, expert validation, and implementation risk assessment. Scores above 90% indicate high reliability based on comprehensive analysis.
                </p>
              </div>
            </div>
          </div>
        </AIMPanel>
      )}

      {!hasScenarioComparison && (
        <AIMPanel
          title="Decision Readiness"
          description="AIM has supporting signals, but it does not yet have enough aligned evidence to publish a decision-ready scenario brief."
          icon="ri-compass-discover-line"
          accentClass="from-ai-500 to-ai-600"
        >
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-[22px] border border-brand-200 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Scenario coverage</div>
              <div className="mt-2 text-3xl font-bold text-brand-900">{scenarios.length}</div>
              <div className="mt-1 text-sm text-brand-500">decision path{scenarios.length === 1 ? '' : 's'} currently ready</div>
            </div>
            <div className="rounded-[22px] border border-brand-200 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Justification briefs</div>
              <div className="mt-2 text-3xl font-bold text-brand-900">{justifications.length}</div>
              <div className="mt-1 text-sm text-brand-500">recommendation narratives available</div>
            </div>
            <div className="rounded-[22px] border border-brand-200 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Confidence coverage</div>
              <div className="mt-2 text-3xl font-bold text-ai-600">
                {hasConfidenceContent && confidenceBreakdown ? `${confidenceBreakdown.overallScore}%` : 'Pending'}
              </div>
              <div className="mt-1 text-sm text-brand-500">evidence-backed confidence depth</div>
            </div>
            <div className="rounded-[22px] border border-brand-200 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Current status</div>
              <div className="mt-2 text-2xl font-bold text-amber-600">Needs more evidence</div>
              <div className="mt-1 text-sm text-brand-500">AIM is still gathering the strongest decision path</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
            <div className="rounded-[24px] border border-brand-200 bg-white p-5">
              <div className="text-sm font-semibold text-brand-900">What AIM can already confirm</div>
              <div className="mt-4 space-y-3">
                {(readinessHighlights.length > 0 ? readinessHighlights : [
                  {
                    factor: 'Signal Alignment',
                    score: 0,
                    description: 'Active alerts, metrics, and recommendations are not yet aligned enough for a decisive scenario brief.',
                    weight: 0,
                  },
                ]).map((factor, idx) => (
                  <div key={idx} className="rounded-2xl bg-brand-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-brand-900">{factor.factor}</div>
                        <div className="mt-1 text-sm text-brand-600">{factor.description}</div>
                      </div>
                      <div className="text-xl font-bold text-ai-600">{factor.score}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-dashed border-brand-300 bg-brand-50 p-5">
              <div className="text-sm font-semibold text-brand-900">What will improve readiness</div>
              <div className="mt-4 space-y-3 text-sm text-brand-600">
                <div className="flex items-start gap-3">
                  <i className="ri-checkbox-circle-line mt-0.5 text-ai-600"></i>
                  <span>More action-ready recommendations or stronger scenario evidence from connected alerts and metrics.</span>
                </div>
                <div className="flex items-start gap-3">
                  <i className="ri-checkbox-circle-line mt-0.5 text-ai-600"></i>
                  <span>Additional target-backed metric coverage so AIM can compare scenario outcomes with more confidence.</span>
                </div>
                <div className="flex items-start gap-3">
                  <i className="ri-checkbox-circle-line mt-0.5 text-ai-600"></i>
                  <span>More forecast and action history so the decision brief can separate upside from execution risk more clearly.</span>
                </div>
              </div>
            </div>
          </div>
        </AIMPanel>
      )}

      {/* No Data State */}
      {scenarios.length === 0 && justifications.length === 0 && !hasTradeOffContent && !hasConfidenceContent && (
        <AIMEmptyState
          icon="ri-scales-line"
          title="No decision analysis available yet"
          description="Create recommendations and projects to populate scenario comparison, confidence, and trade-off analysis."
          action={
            <button
              onClick={() => navigate('/dashboard/metrics')}
              className="px-6 py-3 bg-gradient-to-r from-ai-500 to-ai-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap"
            >
              Get Started
            </button>
          }
        />
      )}
    </div>
  );
};

export default DecisionSupportSection;
