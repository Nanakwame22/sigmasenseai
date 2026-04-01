import { useState, useEffect } from 'react';
import { RecommendationsEngine, Recommendation } from '../../../services/recommendationsEngine';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { addToast } from '../../../hooks/useToast';

// Track which recommendation IDs have already been pushed this session
const pushedSet = new Set<string>();

export default function RecommendationsSection() {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');
  const [statistics, setStatistics] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pushedIds, setPushedIds] = useState<Set<string>>(new Set());
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    show: boolean;
    type: 'start' | 'complete' | 'dismiss' | null;
    recommendation: Recommendation | null;
  }>({ show: false, type: null, recommendation: null });
  const [actionNotes, setActionNotes] = useState('');

  useEffect(() => {
    if (user) {
      loadOrganization();
    }
  }, [user]);

  useEffect(() => {
    if (user && organizationId !== undefined) {
      loadRecommendations();
      loadStatistics();
    }
  }, [organizationId, selectedCategory, selectedPriority, selectedStatus, user]);

  const loadOrganization = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle();
    setOrganizationId(data?.organization_id ?? null);
  };

  const loadRecommendations = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const engine = new RecommendationsEngine(user.id);
      const filters: any = {};
      if (selectedStatus !== 'all') filters.status = selectedStatus;
      if (selectedCategory !== 'all') filters.category = selectedCategory;
      if (selectedPriority !== 'all') filters.priority = selectedPriority;
      const data = await engine.getRecommendations(filters);
      setRecommendations(data);

      // Check which ones are already in action_items (by source_recommendation_id tag)
      if (data.length > 0 && organizationId) {
        const { data: existing } = await supabase
          .from('action_items')
          .select('tags')
          .eq('organization_id', organizationId);
        if (existing) {
          const alreadyPushed = new Set<string>();
          existing.forEach((item: any) => {
            const tags: string[] = item.tags || [];
            tags.forEach((t) => {
              if (t.startsWith('rec:')) alreadyPushed.add(t.replace('rec:', ''));
            });
          });
          setPushedIds(alreadyPushed);
        }
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
      addToast('Failed to load recommendations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    if (!user) return;
    try {
      const engine = new RecommendationsEngine(user.id);
      const stats = await engine.getStatistics();
      setStatistics(stats);
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const handleGenerateRecommendations = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const engine = new RecommendationsEngine(user.id);
      const newRecs = await engine.generateRecommendations();
      if (newRecs.length > 0) {
        addToast(`Generated ${newRecs.length} new recommendations`, 'success');
        await loadRecommendations();
        await loadStatistics();
      } else {
        addToast('No new recommendations found. Your system is performing well!', 'info');
      }
    } catch (error) {
      console.error('Error generating recommendations:', error);
      addToast('Failed to generate recommendations', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // ── Push to Action Tracker ──────────────────────────────────────────────────
  const handlePushToActionTracker = async (rec: Recommendation) => {
    if (!user || !organizationId) {
      addToast('Organization not found', 'error');
      return;
    }
    setPushingId(rec.id);
    try {
      // Map recommendation priority → action priority
      const priorityMap: Record<string, string> = {
        critical: 'critical',
        high: 'high',
        medium: 'medium',
        low: 'low',
      };

      // Build a due date 30 days from now as a sensible default
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const actionData = {
        organization_id: organizationId,
        created_by: user.id,
        title: rec.title,
        description: [
          rec.description,
          rec.expected_impact ? `\nExpected Impact: ${rec.expected_impact}` : '',
          rec.recommended_actions?.length
            ? `\nRecommended Actions:\n${rec.recommended_actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
            : '',
        ]
          .filter(Boolean)
          .join(''),
        priority: priorityMap[rec.priority] ?? 'medium',
        status: 'open',
        category: rec.category ?? 'AI Recommendation',
        due_date: dueDate.toISOString().split('T')[0],
        progress: 0,
        estimated_hours: 0,
        tags: [`rec:${rec.id}`, 'ai-recommendation', rec.category ?? 'general'],
        assigned_to: null,
      };

      const { error } = await supabase.from('action_items').insert([actionData]);
      if (error) throw error;

      setPushedIds((prev) => new Set([...prev, rec.id]));
      pushedSet.add(rec.id);
      addToast('Pushed to Action Tracker successfully!', 'success');
    } catch (error) {
      console.error('Error pushing to action tracker:', error);
      addToast('Failed to push to Action Tracker', 'error');
    } finally {
      setPushingId(null);
    }
  };
  // ───────────────────────────────────────────────────────────────────────────

  const handleStartRecommendation = (recommendation: Recommendation) => {
    setActionModal({ show: true, type: 'start', recommendation });
  };

  const handleCompleteRecommendation = (recommendation: Recommendation) => {
    setActionModal({ show: true, type: 'complete', recommendation });
  };

  const handleDismissRecommendation = (recommendation: Recommendation) => {
    setActionModal({ show: true, type: 'dismiss', recommendation });
  };

  const executeAction = async () => {
    if (!user || !actionModal.recommendation) return;
    try {
      const engine = new RecommendationsEngine(user.id);
      const { type, recommendation } = actionModal;
      let success = false;

      if (type === 'start') {
        success = await engine.startRecommendation(recommendation.id, user.id);
        if (success) addToast('Recommendation started', 'success');
      } else if (type === 'complete') {
        if (!actionNotes.trim()) {
          addToast('Please provide results and notes', 'error');
          return;
        }
        success = await engine.completeRecommendation(recommendation.id, actionNotes, actionNotes);
        if (success) addToast('Recommendation completed', 'success');
      } else if (type === 'dismiss') {
        success = await engine.dismissRecommendation(recommendation.id, actionNotes || 'Dismissed by user');
        if (success) addToast('Recommendation dismissed', 'success');
      }

      if (success) {
        setActionModal({ show: false, type: null, recommendation: null });
        setActionNotes('');
        await loadRecommendations();
        await loadStatistics();
      } else {
        addToast('Failed to update recommendation', 'error');
      }
    } catch (error) {
      console.error('Error executing action:', error);
      addToast('An error occurred', 'error');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'performance': return 'ri-speed-up-line';
      case 'quality': return 'ri-shield-check-line';
      case 'efficiency': return 'ri-time-line';
      case 'cost': return 'ri-money-dollar-circle-line';
      case 'risk': return 'ri-alert-line';
      default: return 'ri-lightbulb-line';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-teal-600 bg-teal-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-gray-600 bg-gray-100';
      case 'in_progress': return 'text-teal-600 bg-teal-100';
      case 'completed': return 'text-green-600 bg-green-100';
      case 'dismissed': return 'text-gray-400 bg-gray-50';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatStatus = (status: string) =>
    status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI Recommendations</h2>
          <p className="text-sm text-gray-600 mt-1">Smart suggestions to improve your operations</p>
        </div>
        <button
          onClick={handleGenerateRecommendations}
          disabled={generating}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
        >
          <i className={`${generating ? 'ri-loader-4-line animate-spin' : 'ri-magic-line'}`}></i>
          {generating ? 'Analyzing...' : 'Generate New Recommendations'}
        </button>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            { label: 'Total', value: statistics.total, color: 'text-gray-900' },
            { label: 'Pending', value: statistics.pending, color: 'text-gray-600' },
            { label: 'In Progress', value: statistics.inProgress, color: 'text-teal-600' },
            { label: 'Completed', value: statistics.completed, color: 'text-green-600' },
            { label: 'Avg Impact', value: `${statistics.avgImpactScore}%`, color: 'text-teal-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-sm text-gray-600">{s.label}</div>
              <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <div className="flex flex-wrap gap-4">
          {[
            {
              label: 'Status', value: selectedStatus, onChange: setSelectedStatus,
              options: [
                { v: 'all', l: 'All Statuses' }, { v: 'pending', l: 'Pending' },
                { v: 'in_progress', l: 'In Progress' }, { v: 'completed', l: 'Completed' },
                { v: 'dismissed', l: 'Dismissed' },
              ],
            },
            {
              label: 'Category', value: selectedCategory, onChange: setSelectedCategory,
              options: [
                { v: 'all', l: 'All Categories' }, { v: 'performance', l: 'Performance' },
                { v: 'quality', l: 'Quality' }, { v: 'efficiency', l: 'Efficiency' },
                { v: 'cost', l: 'Cost' }, { v: 'risk', l: 'Risk' },
              ],
            },
            {
              label: 'Priority', value: selectedPriority, onChange: setSelectedPriority,
              options: [
                { v: 'all', l: 'All Priorities' }, { v: 'critical', l: 'Critical' },
                { v: 'high', l: 'High' }, { v: 'medium', l: 'Medium' }, { v: 'low', l: 'Low' },
              ],
            },
          ].map((f) => (
            <div key={f.label} className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">{f.label}</label>
              <select
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              >
                {f.options.map((o) => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
            <p className="text-gray-600 mt-4">Loading recommendations...</p>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <i className="ri-lightbulb-line text-6xl text-gray-300"></i>
            <p className="text-gray-600 mt-4 text-lg">No recommendations found</p>
            <p className="text-gray-500 text-sm mt-2">Click "Generate New Recommendations" to analyze your data</p>
          </div>
        ) : (
          recommendations.map((rec) => {
            const isPushed = pushedIds.has(rec.id);
            const isPushing = pushingId === rec.id;

            return (
              <div
                key={rec.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-lg ${getPriorityColor(rec.priority)} flex items-center justify-center flex-shrink-0`}>
                        <i className={`${getCategoryIcon(rec.category)} text-xl`}></i>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{rec.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(rec.priority)}`}>
                            {rec.priority.toUpperCase()}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(rec.status)}`}>
                            {formatStatus(rec.status)}
                          </span>
                          {isPushed && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                              <i className="ri-checkbox-circle-fill text-xs"></i>
                              In Action Tracker
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-gray-600 mb-4">{rec.description}</p>

                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <i className="ri-flashlight-line text-teal-600"></i>
                            <span className="text-gray-600">Impact:</span>
                            <span className="font-semibold text-gray-900">{rec.impact_score}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <i className="ri-time-line text-gray-600"></i>
                            <span className="text-gray-600">Effort:</span>
                            <span className="font-semibold text-gray-900">{rec.effort_score}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <i className="ri-shield-check-line text-gray-600"></i>
                            <span className="text-gray-600">Confidence:</span>
                            <span className="font-semibold text-gray-900">{rec.confidence_score}%</span>
                          </div>
                        </div>

                        {expandedId === rec.id && (
                          <div className="mt-6 space-y-4">
                            {rec.recommended_actions && rec.recommended_actions.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Recommended Actions:</h4>
                                <ol className="list-decimal list-inside space-y-1">
                                  {rec.recommended_actions.map((action, idx) => (
                                    <li key={idx} className="text-sm text-gray-600">{action}</li>
                                  ))}
                                </ol>
                              </div>
                            )}
                            {rec.expected_impact && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Expected Impact:</h4>
                                <p className="text-sm text-gray-600">{rec.expected_impact}</p>
                              </div>
                            )}
                            {rec.actual_impact && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Actual Impact:</h4>
                                <p className="text-sm text-green-600">{rec.actual_impact}</p>
                              </div>
                            )}
                            {rec.implementation_notes && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Implementation Notes:</h4>
                                <p className="text-sm text-gray-600">{rec.implementation_notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {/* ── Push to Action Tracker ── */}
                      <button
                        onClick={() => !isPushed && handlePushToActionTracker(rec)}
                        disabled={isPushed || isPushing}
                        title={isPushed ? 'Already in Action Tracker' : 'Push to Action Tracker'}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                          isPushed
                            ? 'bg-green-100 text-green-700 cursor-default'
                            : isPushing
                            ? 'bg-teal-100 text-teal-600 cursor-wait'
                            : 'bg-teal-600 text-white hover:bg-teal-700 cursor-pointer'
                        }`}
                      >
                        {isPushing ? (
                          <>
                            <i className="ri-loader-4-line animate-spin text-xs"></i>
                            Pushing...
                          </>
                        ) : isPushed ? (
                          <>
                            <i className="ri-checkbox-circle-fill text-xs"></i>
                            Pushed
                          </>
                        ) : (
                          <>
                            <i className="ri-send-plane-line text-xs"></i>
                            Push to Tracker
                          </>
                        )}
                      </button>

                      {rec.status === 'pending' && (
                        <button
                          onClick={() => handleStartRecommendation(rec)}
                          className="px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors text-sm whitespace-nowrap"
                        >
                          Start
                        </button>
                      )}
                      {rec.status === 'in_progress' && (
                        <button
                          onClick={() => handleCompleteRecommendation(rec)}
                          className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-sm whitespace-nowrap"
                        >
                          Complete
                        </button>
                      )}
                      {(rec.status === 'pending' || rec.status === 'in_progress') && (
                        <button
                          onClick={() => handleDismissRecommendation(rec)}
                          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
                        >
                          Dismiss
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                        className="px-4 py-2 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-sm whitespace-nowrap"
                      >
                        {expandedId === rec.id ? 'Less' : 'Details'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Action Modal */}
      {actionModal.show && actionModal.recommendation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {actionModal.type === 'start' && 'Start Recommendation'}
              {actionModal.type === 'complete' && 'Complete Recommendation'}
              {actionModal.type === 'dismiss' && 'Dismiss Recommendation'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">{actionModal.recommendation.title}</p>
            {(actionModal.type === 'complete' || actionModal.type === 'dismiss') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {actionModal.type === 'complete' ? 'Results & Notes' : 'Reason for Dismissal'}
                </label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={4}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder={
                    actionModal.type === 'complete'
                      ? 'Describe the results and impact...'
                      : 'Why are you dismissing this recommendation?'
                  }
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={executeAction}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  setActionModal({ show: false, type: null, recommendation: null });
                  setActionNotes('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
