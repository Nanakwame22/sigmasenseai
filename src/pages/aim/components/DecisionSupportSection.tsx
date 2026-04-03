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

const RISK_THEME: Record<string, string> = {
  Low: 'bg-emerald-100 text-emerald-700',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-red-100 text-red-700',
};

const SCENARIO_THEME: Record<string, { shell: string; activeShell: string; icon: string; accent: string }> = {
  'scenario-1': {
    shell: 'border-slate-200 bg-white hover:border-slate-300',
    activeShell: 'border-slate-500 bg-gradient-to-br from-slate-50 to-slate-100 shadow-lg shadow-slate-200/70',
    icon: 'from-slate-500 to-slate-700',
    accent: 'text-slate-700',
  },
  'scenario-2': {
    shell: 'border-teal-200 bg-white hover:border-teal-300',
    activeShell: 'border-teal-500 bg-gradient-to-br from-teal-50 to-cyan-50 shadow-lg shadow-teal-200/70',
    icon: 'from-teal-500 to-cyan-600',
    accent: 'text-teal-700',
  },
  'scenario-3': {
    shell: 'border-blue-200 bg-white hover:border-blue-300',
    activeShell: 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg shadow-blue-200/70',
    icon: 'from-blue-500 to-indigo-600',
    accent: 'text-blue-700',
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
  const activeScenarioTheme = activeScenario ? (SCENARIO_THEME[activeScenario.id] || SCENARIO_THEME['scenario-2']) : SCENARIO_THEME['scenario-2'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading decision support data...</p>
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
            className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2"
          >
            <i className="ri-refresh-line"></i>
            Refresh Analysis
          </button>
        }
      />

      {activeScenario && (
        <AIMMetricTiles
          items={[
            {
              label: 'Current Recommendation',
              value: activeScenario.name,
              detail: activeScenario.timeline,
            },
            {
              label: 'Decision Score',
              value: `${activeScenario.score}/100`,
              detail: `${activeScenario.risk} execution risk`,
              accent: activeScenario.score >= 80 ? 'text-teal-600' : activeScenario.score >= 65 ? 'text-amber-600' : 'text-red-600',
            },
            {
              label: 'Modeled Annual Impact',
              value: activeScenario.impact,
              detail: `${activeScenario.roi}% ROI`,
              accent: activeScenarioTheme.accent,
            },
            {
              label: 'Confidence',
              value: confidenceBreakdown ? `${confidenceBreakdown.overallScore}%` : 'Pending',
              detail: 'Evidence-backed decision confidence',
            },
          ]}
        />
      )}

      {/* Scenario Comparison */}
      {scenarios.length > 0 && (
        <AIMPanel
          title="Executive Decision Brief"
          description="Select the operating posture AIM recommends, then compare the upside, cost, and execution risk in one briefing surface."
          icon="ri-compass-3-line"
          accentClass="from-blue-500 to-indigo-600"
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
                          <h3 className="text-lg font-bold text-slate-900">{scenario.name}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                              {scenario.timeline}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RISK_THEME[scenario.risk] || RISK_THEME.High}`}>
                              {scenario.risk} risk
                            </span>
                          </div>
                        </div>
                      </div>
                      {isActive && (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-500">
                          <i className="ri-check-line text-white"></i>
                        </span>
                      )}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-white/75 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Investment</div>
                        <div className="mt-1 text-lg font-bold text-slate-900">{scenario.cost}</div>
                      </div>
                      <div className="rounded-2xl bg-white/75 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">ROI</div>
                        <div className={`mt-1 text-lg font-bold ${theme.accent}`}>{scenario.roi}%</div>
                      </div>
                      <div className="rounded-2xl bg-white/75 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Annual impact</div>
                        <div className={`mt-1 text-lg font-bold ${theme.accent}`}>{scenario.impact}</div>
                      </div>
                      <div className="rounded-2xl bg-white/75 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Decision score</div>
                        <div className={`mt-1 text-lg font-bold ${theme.accent}`}>{scenario.score}/100</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {activeScenario && (
              <div className={`rounded-[28px] border p-6 ${activeScenarioTheme.activeShell}`}>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recommended posture</div>
                <h3 className="mt-2 text-3xl font-bold text-slate-900">{activeScenario.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  AIM currently favors this posture because it balances operating pressure, visible upside, and execution capacity better than the alternatives.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Modeled annual upside</div>
                    <div className={`mt-2 text-3xl font-bold ${activeScenarioTheme.accent}`}>{activeScenario.impact}</div>
                  </div>
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Execution risk</div>
                    <div className="mt-2 text-3xl font-bold text-slate-900">{activeScenario.risk}</div>
                  </div>
                </div>

                <div className="mt-6 rounded-[22px] bg-white/80 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Why AIM prefers it</div>
                  <div className="mt-4 space-y-3">
                    {activeScenario.pros.slice(0, 3).map((pro, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                        <i className="ri-checkbox-circle-fill mt-0.5 text-teal-600"></i>
                        <span>{pro}</span>
                      </div>
                    ))}
                  </div>
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
                className="border border-slate-200 rounded-xl overflow-hidden hover:shadow-lg transition-all"
              >
                <div
                  className="p-5 cursor-pointer"
                  onClick={() => setExpandedJustification(expandedJustification === just.id ? null : just.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-900 mb-2">{just.recommendation}</h3>
                      <p className="text-sm text-slate-600">{just.reasoning}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-teal-600">{just.confidence}%</div>
                        <div className="text-xs text-slate-500">Confidence</div>
                      </div>
                      <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors">
                        <i className={`ri-arrow-${expandedJustification === just.id ? 'up' : 'down'}-s-line text-slate-600`}></i>
                      </button>
                    </div>
                  </div>
                </div>

                {expandedJustification === just.id && (
                  <div className="px-5 pb-5 space-y-4 border-t border-slate-200 pt-4">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <i className="ri-bar-chart-line text-teal-600"></i>
                        Data Evidence
                      </h4>
                      <div className="space-y-2">
                        {just.dataEvidence.map((evidence, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                            <i className="ri-checkbox-circle-fill text-teal-600 mt-0.5"></i>
                            <span className="text-sm text-slate-700">{evidence}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <i className="ri-file-text-line text-blue-600"></i>
                        Data Sources
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {just.sources.map((source, idx) => (
                          <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                            {source}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                        <i className="ri-target-line text-emerald-600"></i>
                        Expected Outcome
                      </h4>
                      <p className="text-sm text-slate-700 p-3 bg-emerald-50 rounded-lg">{just.expectedOutcome}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </AIMPanel>
      )}

      {/* Trade-Offs Analysis */}
      {tradeOffs && (
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
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">{benefit.category}</h4>
                    <div className="space-y-2">
                      {benefit.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-start gap-2 p-2 bg-emerald-50 rounded-lg">
                          <i className="ri-check-line text-emerald-600 mt-0.5"></i>
                          <span className="text-sm text-slate-700">{item}</span>
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
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">{consideration.category}</h4>
                    <div className="space-y-2">
                      {consideration.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">
                          <i className="ri-arrow-right-s-line text-amber-600 mt-0.5"></i>
                          <span className="text-sm text-slate-700">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-[22px] border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-600 mb-1">Overall Assessment</div>
                <div className="text-xl font-bold text-slate-900">{tradeOffs.recommendation}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-600 mb-1">Net Score</div>
                <div className="text-3xl font-bold text-teal-600">{tradeOffs.netScore}/100</div>
              </div>
            </div>
          </div>
        </AIMPanel>
      )}

      {/* Confidence Score Breakdown */}
      {confidenceBreakdown && (
        <AIMPanel
          title="Confidence Score & Data Evidence"
          description={`How AIM calculates its ${confidenceBreakdown.overallScore}% confidence rating`}
          icon="ri-shield-check-line"
          accentClass="from-teal-500 to-cyan-600"
          actions={
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-4xl font-bold text-teal-600">{confidenceBreakdown.overallScore}%</div>
                <div className="text-sm text-slate-600">Overall Confidence</div>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {confidenceBreakdown.factors.map((factor, idx) => (
              <div key={idx} className="rounded-[22px] border border-slate-200 p-5 transition-all hover:shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-900 mb-1">{factor.factor}</h3>
                    <p className="text-xs text-slate-600">{factor.description}</p>
                  </div>
                  <div className="text-2xl font-bold text-teal-600 ml-4">{factor.score}%</div>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-cyan-600 rounded-full transition-all duration-1000"
                    style={{ width: `${factor.score}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg">
            <div className="flex items-start gap-3">
              <i className="ri-information-line text-teal-600 text-xl mt-0.5"></i>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1">How Confidence is Calculated</h4>
                <p className="text-sm text-slate-600">
                  Our confidence score is a weighted average of data quality, model accuracy, industry benchmarks, expert validation, and implementation risk assessment. Scores above 90% indicate high reliability based on comprehensive analysis.
                </p>
              </div>
            </div>
          </div>
        </AIMPanel>
      )}

      {/* No Data State */}
      {scenarios.length === 0 && justifications.length === 0 && (
        <AIMEmptyState
          icon="ri-scales-line"
          title="No decision analysis available yet"
          description="Create recommendations and projects to populate scenario comparison, confidence, and trade-off analysis."
          action={
            <button
              onClick={() => navigate('/dashboard/metrics')}
              className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap"
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
