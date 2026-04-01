import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  generateDecisionScenarios,
  generateRecommendationJustification,
  analyzeTradeOffs,
  calculateConfidenceBreakdown,
  DecisionScenario,
  RecommendationJustification,
  TradeOffAnalysis,
  ConfidenceFactor
} from '../../../services/decisionSupportEngine';

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

  const getRiskColor = (risk: string) => {
    if (risk === 'Low') return 'emerald';
    if (risk === 'Medium') return 'amber';
    return 'red';
  };

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Decision Support</h1>
          <p className="text-slate-600">Scenario comparison and recommendation justification</p>
        </div>
        <button 
          onClick={loadDecisionSupportData}
          className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2"
        >
          <i className="ri-refresh-line"></i>
          Refresh Analysis
        </button>
      </div>

      {/* Scenario Comparison */}
      {scenarios.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <i className="ri-scales-line text-xl text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Scenario Comparison</h2>
              <p className="text-sm text-slate-600">Compare different implementation approaches</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Scenario</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Investment</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Timeline</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">ROI</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Risk Level</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Annual Impact</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Select</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => (
                  <tr
                    key={scenario.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                      selectedScenarios.includes(scenario.id) ? 'bg-teal-50' : ''
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-900">{scenario.name}</div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-slate-900 font-semibold">{scenario.cost}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-slate-700">{scenario.timeline}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="px-3 py-1 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-bold rounded-full">
                        {scenario.roi}%
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-3 py-1 bg-${getRiskColor(scenario.risk)}-100 text-${getRiskColor(scenario.risk)}-700 text-sm font-semibold rounded-full`}>
                        {scenario.risk}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-emerald-600 font-bold text-lg">{scenario.impact}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => toggleScenario(scenario.id)}
                        className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                          selectedScenarios.includes(scenario.id)
                            ? 'bg-teal-500 border-teal-500'
                            : 'border-slate-300 hover:border-teal-500'
                        }`}
                      >
                        {selectedScenarios.includes(scenario.id) && (
                          <i className="ri-check-line text-white"></i>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedScenarios.length > 0 && (
            <div className="mt-6 p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-600 mb-1">Selected Scenario</div>
                  <div className="text-xl font-bold text-slate-900">
                    {scenarios.find(s => s.id === selectedScenarios[0])?.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-600 mb-1">Decision Score</div>
                  <div className="text-2xl font-bold text-teal-600">
                    {scenarios.find(s => s.id === selectedScenarios[0])?.score}/100
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendation Justification */}
      {justifications.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
              <i className="ri-file-list-3-line text-xl text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Recommendation Justification</h2>
              <p className="text-sm text-slate-600">Data-backed reasoning for each recommendation</p>
            </div>
          </div>

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
        </div>
      )}

      {/* Trade-Offs Analysis */}
      {tradeOffs && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <i className="ri-exchange-line text-xl text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Anticipated Trade-Offs</h2>
              <p className="text-sm text-slate-600">Benefits vs. considerations for implementation</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
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

          <div className="mt-6 p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg border border-teal-200">
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
        </div>
      )}

      {/* Confidence Score Breakdown */}
      {confidenceBreakdown && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
                <i className="ri-shield-check-line text-xl text-white"></i>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Confidence Score & Data Evidence</h2>
                <p className="text-sm text-slate-600">How we calculate our {confidenceBreakdown.overallScore}% confidence rating</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-teal-600">{confidenceBreakdown.overallScore}%</div>
              <div className="text-sm text-slate-600">Overall Confidence</div>
            </div>
          </div>

          <div className="space-y-4">
            {confidenceBreakdown.factors.map((factor, idx) => (
              <div key={idx} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
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
        </div>
      )}

      {/* No Data State */}
      {scenarios.length === 0 && justifications.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-scales-line text-3xl text-slate-400"></i>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No Decision Data Available</h3>
          <p className="text-slate-600 mb-6">Create recommendations and projects to generate decision support analysis.</p>
          <button
            onClick={() => navigate('/dashboard/metrics')}
            className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap"
          >
            Get Started
          </button>
        </div>
      )}
    </div>
  );
};

export default DecisionSupportSection;