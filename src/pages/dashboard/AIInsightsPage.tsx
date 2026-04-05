
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { executeNaturalLanguageQuery, getQuerySuggestions, generateAIResponse } from '../../services/naturalLanguageQuery';
import type { QueryResult } from '../../services/naturalLanguageQuery';
import { generatePredictiveAlerts, generateRecommendations, detectPatterns } from '../../services/aiEngine';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import InsightSummary from '../../components/common/InsightSummary';
import { useAIMData } from '../../hooks/useAIMData';
import { useCPIData } from '../../hooks/useCPIData';
import type { IntelligenceHealthIssue, IntelligenceHealthSeverity } from '../../services/intelligenceObservability';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  data?: any[];
  visualization?: 'table' | 'chart' | 'metric' | 'list';
  chartType?: 'line' | 'bar' | 'pie' | 'area';
}

interface TrustAssessment {
  label: string;
  className: string;
  explanation: string;
}

export default function AIInsightsPage() {
  const { organizationId } = useAuth();
  const { stats: aimStats } = useAIMData();
  const { intelligenceHealth: cpiIntelligenceHealth, loadingDomains, loadingFeed } = useCPIData();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [predictiveAlerts, setPredictiveAlerts] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'alerts' | 'recommendations' | 'insights' | 'health'>('chat');
  const [loadingInsights, setLoadingInsights] = useState(true);
  const cpiHealthLoading = loadingDomains || loadingFeed;

  const combinedHealthIssues = [
    ...aimStats.intelligenceHealth.issues
      .filter((issue) => issue.count > 0)
      .map((issue) => ({ ...issue, system: 'AIM' as const })),
    ...cpiIntelligenceHealth.issues
      .filter((issue) => issue.count > 0)
      .map((issue) => ({ ...issue, system: 'CPI' as const })),
  ].sort((a, b) => {
    const severityRank: Record<IntelligenceHealthSeverity, number> = {
      'Needs attention': 3,
      Watch: 2,
      Healthy: 1,
    };
    const severityDelta = severityRank[b.severity] - severityRank[a.severity];
    if (severityDelta !== 0) return severityDelta;
    return b.count - a.count;
  });

  const combinedHealthIssueCount = combinedHealthIssues.length;

  const getAISummary = () => {
    if (activeTab === 'chat') {
      return {
        summary: 'Ask Sigma is best for fast questions in everyday language, so people do not need to know table names or analytics syntax to get useful answers.',
        driver: messages.length > 0
          ? `This conversation already has ${messages.length} message${messages.length === 1 ? '' : 's'}, which means the assistant is building context from your questions and the returned data.`
          : 'You have not asked a question yet, so this is a good place to start with a simple operational prompt like "What changed this week?"',
        guidance: 'Use it for quick investigation, trend checks, and status questions, then validate important decisions against the recommended actions and source data shown in the response.',
      };
    }

    if (activeTab === 'alerts') {
      const topAlert = predictiveAlerts[0];
      return {
        summary: predictiveAlerts.length === 0
          ? 'There are no predictive alerts right now, which usually means SigmaSense is not seeing a strong short-term risk signal in the monitored data.'
          : `The AI is flagging ${predictiveAlerts.length} possible issue${predictiveAlerts.length === 1 ? '' : 's'} before they fully happen, so this tab should be treated as an early warning queue.`,
        driver: topAlert
          ? `The highest-priority alert is "${topAlert.title}" with ${topAlert.confidence.toFixed(0)}% confidence and a predicted time horizon of ${topAlert.daysUntil} days.`
          : 'When alerts appear here, they combine recent data patterns with model confidence to estimate what may need attention soon.',
        guidance: predictiveAlerts.length === 0
          ? 'Keep refreshing this page as new data arrives, especially before shift changes, operational reviews, or handoffs.'
          : 'Review the highest-confidence alerts first and decide whether you should monitor, escalate, or act now before the predicted issue becomes operationally visible.',
      };
    }

    if (activeTab === 'recommendations') {
      const topRecommendation = recommendations[0];
      return {
        summary: recommendations.length === 0
          ? 'There are no recommendations right now, which usually means the system does not see a strong improvement opportunity from the current data.'
          : `These recommendations translate patterns in your data into suggested next steps, so the page acts more like an action queue than a passive report.`,
        driver: topRecommendation
          ? `The highest-priority recommendation is "${topRecommendation.title}", rated ${topRecommendation.priority} for priority with ${topRecommendation.effort} effort.`
          : 'Recommendations typically weigh impact, urgency, and effort so teams can decide what to do next without over-analyzing every metric.',
        guidance: recommendations.length === 0
          ? 'Come back after more data or new alerts are available, since recommendations become stronger when the platform has enough context to rank likely actions.'
          : 'Start with the highest-priority, lowest-friction item first, then use the listed action steps to turn the suggestion into a concrete workflow.',
      };
    }

    if (activeTab === 'health') {
      const systemsNeedingAttention = [aimStats.intelligenceHealth, cpiIntelligenceHealth].filter(
        (summary) => summary.severity !== 'Healthy'
      ).length;

      return {
        summary: systemsNeedingAttention === 0
          ? 'AIM and CPI are both reading as healthy, so the intelligence layer is keeping up with live evidence, action linkage, and outcome verification.'
          : `This health view shows where the intelligence layer itself needs attention across AIM and CPI, so operators can catch stale evidence, weak verification, or linkage drift before trust erodes.`,
        driver: combinedHealthIssues[0]
          ? `${combinedHealthIssues[0].system} is currently led by "${combinedHealthIssues[0].label}" with ${combinedHealthIssues[0].count} active issue${combinedHealthIssues[0].count === 1 ? '' : 's'}.`
          : 'There are no active health issues right now, which means SigmaSense is seeing a stable flow of evidence, feedback, and linked execution state.',
        guidance: systemsNeedingAttention === 0
          ? 'Use this page as your internal trust check before major reviews, and keep watching for stale inputs or overdue verification as the operating tempo changes.'
          : 'Start with the highest-severity issue first, fix the underlying evidence or execution gap, then confirm the health score improves on the next live refresh.',
      };
    }

    const topPattern = patterns[0];
    return {
      summary: patterns.length === 0
        ? 'No meaningful recurring pattern is visible yet, so the system does not have enough signal to say a trend is repeating.'
        : `The AI is detecting ${patterns.length} repeat pattern${patterns.length === 1 ? '' : 's'} in your data, which helps explain whether recent changes are random or part of a larger trend.`,
      driver: topPattern
        ? `The strongest visible pattern is a ${topPattern.type} signal with ${topPattern.confidence.toFixed(0)}% confidence${topPattern.period ? ` repeating about every ${topPattern.period} days` : ''}.`
        : 'Pattern detection gets stronger as the platform sees more historical metric behavior over time.',
      guidance: patterns.length === 0
        ? 'Add more historical metric data if you want the system to identify seasonality, recurring spikes, or repeating drops with more confidence.'
        : 'Use these patterns to decide whether to plan for a recurring condition, investigate a change in operating conditions, or update thresholds before the next cycle.',
    };
  };

  useEffect(() => {
    if (organizationId) {
      loadAIInsights();
    }
  }, [organizationId]);

  const loadAIInsights = async () => {
    if (!organizationId) return;

    try {
      setLoadingInsights(true);
      
      // Load predictive alerts
      const alerts = await generatePredictiveAlerts(organizationId);
      setPredictiveAlerts(alerts);

      // Load recommendations
      const recs = await generateRecommendations(organizationId);
      setRecommendations(recs);

      // Load patterns from first metric
      const { data: metrics } = await supabase
        .from('metrics')
        .select('id')
        .eq('organization_id', organizationId)
        .limit(1);

      if (metrics && metrics.length > 0) {
        const patternsData = await detectPatterns(metrics[0].id, 90);
        setPatterns(patternsData);
      }
    } catch (error) {
      console.error('Error loading AI insights:', error);
    } finally {
      setLoadingInsights(false);
    }
  };

  const handleSendQuery = async () => {
    if (!query.trim() || !organizationId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: query,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const result = await executeNaturalLanguageQuery(query, organizationId);
      const aiResponse = generateAIResponse(result, query);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: aiResponse,
        timestamp: new Date(),
        data: result.data,
        visualization: result.visualization,
        chartType: result.chartType
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error processing query:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: 'I encountered an error processing your query. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setTimeout(() => handleSendQuery(), 100);
  };

  const handleVoiceInput = () => {
    setIsRecording(!isRecording);
    // Simulate voice input
    if (!isRecording) {
      setTimeout(() => {
        setQuery('Show all critical alerts');
        setIsRecording(false);
      }, 2000);
    }
  };

  const renderVisualization = (message: Message) => {
    if (!message.data || message.data.length === 0) return null;

    switch (message.visualization) {
      case 'chart':
        return renderChart(message);
      case 'table':
        return renderTable(message);
      case 'metric':
        return renderMetric(message);
      case 'list':
        return renderList(message);
      default:
        return null;
    }
  };

  const renderChart = (message: Message) => {
    const colors = ['#14B8A6', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];

    if (message.chartType === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={message.data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {message.data?.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (message.chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={message.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: '12px' }} />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#14B8A6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={message.data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
          <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#14B8A6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const renderTable = (message: Message) => {
    if (!message.data || message.data.length === 0) return null;

    const columns = Object.keys(message.data[0]).filter(key => 
      !key.includes('id') && !key.includes('organization') && !key.includes('created')
    ).slice(0, 5);

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(col => (
                <th key={col} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {message.data.slice(0, 10).map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col} className="px-4 py-2 text-gray-900">
                    {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] || '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {message.data.length > 10 && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            Showing 10 of {message.data.length} results
          </p>
        )}
      </div>
    );
  };

  const renderMetric = (message: Message) => {
    return (
      <div className="grid grid-cols-3 gap-4">
        {message.data?.slice(0, 6).map((item, idx) => (
          <div key={idx} className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">{item.name}</p>
            <p className="text-2xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderList = (message: Message) => {
    return (
      <div className="space-y-2">
        {message.data?.slice(0, 10).map((item, idx) => (
          <div key={idx} className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-900">{item.title || item.name}</p>
            {item.description && (
              <p className="text-xs text-gray-500 mt-1">{item.description}</p>
            )}
          </div>
        ))}
      </div>
    );
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'warning': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'info': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getHealthSeverityClasses = (severity: IntelligenceHealthSeverity) => {
    switch (severity) {
      case 'Healthy':
        return {
          panel: 'border-emerald-200 bg-emerald-50',
          badge: 'bg-emerald-100 text-emerald-700',
          accent: 'text-emerald-700',
        };
      case 'Watch':
        return {
          panel: 'border-amber-200 bg-amber-50',
          badge: 'bg-amber-100 text-amber-700',
          accent: 'text-amber-700',
        };
      default:
        return {
          panel: 'border-rose-200 bg-rose-50',
          badge: 'bg-rose-100 text-rose-700',
          accent: 'text-rose-700',
        };
    }
  };

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'low': return 'bg-green-100 text-green-700';
      case 'medium': return 'bg-yellow-100 text-yellow-700';
      case 'high': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getAlertTrustAssessment = (alert: any): TrustAssessment => {
    if (alert.confidence >= 88 && alert.daysUntil <= 7) {
      return {
        label: 'Decision-ready',
        className: 'bg-emerald-100 text-emerald-700',
        explanation: 'This signal is high confidence and close enough in time to act on directly.',
      };
    }

    if (alert.confidence >= 75) {
      return {
        label: 'Monitor closely',
        className: 'bg-amber-100 text-amber-700',
        explanation: 'The signal is meaningful, but teams should verify local conditions before escalating.',
      };
    }

    return {
      label: 'Directional only',
      className: 'bg-rose-100 text-rose-700',
      explanation: 'Use this as an early warning, not as a standalone operational decision trigger.',
    };
  };

  const getRecommendationTrustAssessment = (rec: any): TrustAssessment => {
    if (rec.confidence >= 88 && rec.priority >= 80) {
      return {
        label: 'Ready to action',
        className: 'bg-emerald-100 text-emerald-700',
        explanation: 'SigmaSense sees a strong enough signal to move this from suggestion into execution.',
      };
    }

    if (rec.confidence >= 75) {
      return {
        label: 'Validate first',
        className: 'bg-amber-100 text-amber-700',
        explanation: 'The recommendation is useful, but it should be checked against staffing, workflow, or frontline constraints.',
      };
    }

    return {
      label: 'Exploratory',
      className: 'bg-rose-100 text-rose-700',
      explanation: 'Treat this as a coaching prompt rather than a firm action plan.',
    };
  };

  const getPatternTrustAssessment = (pattern: any): TrustAssessment => {
    if (pattern.confidence >= 85 && pattern.period) {
      return {
        label: 'Recurring signal',
        className: 'bg-emerald-100 text-emerald-700',
        explanation: 'This pattern looks repeatable enough to plan around operationally.',
      };
    }

    if (pattern.confidence >= 70) {
      return {
        label: 'Likely pattern',
        className: 'bg-amber-100 text-amber-700',
        explanation: 'The pattern is plausible, but it still needs more history or repeat cycles to trust fully.',
      };
    }

    return {
      label: 'Watch only',
      className: 'bg-rose-100 text-rose-700',
      explanation: 'There is not enough signal here yet to rely on the pattern in planning.',
    };
  };

  const getAlertEvidence = (alert: any) => {
    const evidence = [
      `${alert.confidence.toFixed(0)}% model confidence`,
      `${alert.daysUntil} day prediction horizon`,
      alert.category || 'Operational category detected',
    ];

    if (alert.type === 'critical') {
      evidence.push('Severity is already critical');
    }

    return evidence;
  };

  const getAlertCaution = (alert: any) => {
    if (alert.confidence < 75) {
      return 'Confidence is moderate, so confirm the source metric and recent local conditions before acting.';
    }

    if (alert.daysUntil > 14) {
      return 'The horizon is longer-term, so this is better for preparation than immediate escalation.';
    }

    return 'This alert is strong, but teams should still confirm staffing, operational constraints, and any recent interventions.';
  };

  const getRecommendationEvidence = (rec: any) => [
    `${rec.confidence.toFixed(0)}% recommendation confidence`,
    `${rec.priority}/100 priority`,
    `${rec.effort} implementation effort`,
    rec.timeframe,
  ];

  const getRecommendationCaution = (rec: any) => {
    if (rec.confidence < 75) {
      return 'This is a lower-confidence suggestion, so use it to guide discussion rather than to trigger immediate change.';
    }

    if (String(rec.effort).toLowerCase() === 'high') {
      return 'The likely impact is meaningful, but the effort is high enough that the operating team should confirm resourcing first.';
    }

    return 'This recommendation is actionable, but it should still be checked against current staffing, budget, and shift timing.';
  };

  const getPatternEvidence = (pattern: any) => {
    const evidence = [`${pattern.confidence.toFixed(0)}% pattern confidence`];

    if (pattern.period) {
      evidence.push(`Repeats about every ${pattern.period} days`);
    }

    evidence.push(`${pattern.type} behavior detected`);
    return evidence;
  };

  const getPatternCaution = (pattern: any) => {
    if (!pattern.period) {
      return 'SigmaSense sees signal, but not enough repeat structure yet to call this a dependable cycle.';
    }

    if (pattern.confidence < 80) {
      return 'This pattern is useful directionally, but it still needs more history before you hardwire thresholds or schedules around it.';
    }

    return 'This looks stable enough to plan around, but keep validating it as new data arrives.';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Insights</h1>
          <p className="text-gray-600 mt-1">Natural language queries, predictive alerts, and smart recommendations</p>
        </div>
        <button
          onClick={loadAIInsights}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-all whitespace-nowrap flex items-center gap-2 hover-lift button-press"
        >
          <i className="ri-refresh-line"></i>
          Refresh Insights
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 animate-slide-down">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'chat', label: 'AI Chat', icon: 'ri-chat-3-line' },
            { id: 'alerts', label: 'Predictive Alerts', icon: 'ri-alarm-warning-line', count: predictiveAlerts.length },
            { id: 'recommendations', label: 'Recommendations', icon: 'ri-lightbulb-line', count: recommendations.length },
            { id: 'insights', label: 'Pattern Insights', icon: 'ri-line-chart-line', count: patterns.length },
            { id: 'health', label: 'Health', icon: 'ri-pulse-line', count: combinedHealthIssueCount }
          ].map((tab, index) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-all animate-slide-down ${
                activeTab === tab.id
                  ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <i className={`${tab.icon} mr-2`}></i>
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-2 px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="px-6 pt-6">
          <InsightSummary
            title="What This Means In Plain English"
            summary={getAISummary().summary}
            driver={getAISummary().driver}
            guidance={getAISummary().guidance}
          />
        </div>

        {/* AI Chat Tab */}
        {activeTab === 'chat' && (
          <div className="p-6 animate-fade-in">
            {/* Chat Messages */}
            <div className="bg-gray-50 rounded-lg p-4 h-[500px] overflow-y-auto mb-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center mb-4 animate-pulse-slow">
                    <i className="ri-sparkling-line text-white text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Ask me anything!</h3>
                  <p className="text-sm text-gray-600 mb-6 max-w-md">
                    I can help you analyze metrics, find alerts, compare data, and provide insights using natural language.
                  </p>
                  <div className="grid grid-cols-2 gap-3 max-w-2xl">
                    {getQuerySuggestions('general').map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="text-left p-3 bg-white rounded-lg text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-all border border-gray-200 hover:border-teal-300 card-hover"
                      >
                        <i className="ri-lightbulb-line text-teal-600 mr-2"></i>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        message.type === 'user'
                          ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-900'
                      }`}
                    >
                      <p className="text-sm mb-2">{message.content}</p>
                      {message.type === 'ai' && renderVisualization(message)}
                      <p className="text-xs mt-2 opacity-70">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start animate-fade-in">
                  <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                      <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex gap-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendQuery()}
                placeholder="Ask me anything... (e.g., 'Show critical alerts from this week')"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                disabled={loading}
              />
              <button
                onClick={handleVoiceInput}
                className={`px-4 py-3 rounded-lg transition-all ${
                  isRecording
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <i className="ri-mic-line text-lg"></i>
              </button>
              <button
                onClick={handleSendQuery}
                disabled={!query.trim() || loading}
                className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-lg hover:from-teal-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap hover-lift button-press"
              >
                <i className="ri-send-plane-fill mr-2"></i>
                Send
              </button>
            </div>
          </div>
        )}

        {/* Predictive Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="p-6 animate-fade-in">
            {loadingInsights ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : predictiveAlerts.length === 0 ? (
              <div className="text-center py-12">
                <i className="ri-shield-check-line text-5xl text-green-500 mb-4"></i>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Predictive Alerts</h3>
                <p className="text-sm text-gray-600">All metrics are performing within expected ranges</p>
              </div>
            ) : (
              <div className="space-y-4">
                {predictiveAlerts.map((alert, index) => (
                  (() => {
                    const trust = getAlertTrustAssessment(alert);
                    const evidence = getAlertEvidence(alert);
                    return (
                  <div
                    key={alert.id}
                    className={`border-l-4 rounded-lg p-4 ${getSeverityColor(alert.type)} animate-slide-up`}
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-base font-semibold">{alert.title}</h3>
                          <span className="px-2 py-0.5 bg-white rounded-full text-xs font-medium">
                            {alert.confidence.toFixed(0)}% confidence
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${trust.className}`}>
                            {trust.label}
                          </span>
                        </div>
                        <p className="text-sm mb-2">{alert.description}</p>
                        <div className="flex items-center gap-4 text-xs">
                          <span>
                            <i className="ri-calendar-line mr-1"></i>
                            {alert.daysUntil} days until predicted event
                          </span>
                          <span>
                            <i className="ri-price-tag-3-line mr-1"></i>
                            {alert.category}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white bg-opacity-60 rounded-lg p-3 mb-3">
                      <p className="text-xs font-medium mb-2">Why SigmaSense flagged this</p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {evidence.map((item, idx) => (
                          <span key={idx} className="px-2 py-1 bg-white rounded-full text-xs border border-current border-opacity-15">
                            {item}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs">{trust.explanation}</p>
                    </div>
                    <div className="bg-white bg-opacity-50 rounded-lg p-3">
                      <p className="text-xs font-medium mb-2">Recommended Actions:</p>
                      <ul className="space-y-1">
                        {alert.actions.map((action: string, idx: number) => (
                          <li key={idx} className="text-xs flex items-start gap-2">
                            <i className="ri-checkbox-circle-line mt-0.5"></i>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-3 rounded-lg border border-white border-opacity-60 bg-white bg-opacity-40 p-3">
                      <p className="text-xs font-medium mb-1">Use with caution if</p>
                      <p className="text-xs">{getAlertCaution(alert)}</p>
                    </div>
                  </div>
                    );
                  })()
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommendations Tab */}
        {activeTab === 'recommendations' && (
          <div className="p-6 animate-fade-in">
            {loadingInsights ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : recommendations.length === 0 ? (
              <div className="text-center py-12">
                <i className="ri-lightbulb-line text-5xl text-gray-300 mb-4"></i>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Recommendations</h3>
                <p className="text-sm text-gray-600">Check back later for AI-powered improvement suggestions</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {recommendations.map((rec, index) => (
                  (() => {
                    const trust = getRecommendationTrustAssessment(rec);
                    const evidence = getRecommendationEvidence(rec);
                    return (
                  <div
                    key={rec.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-all card-hover animate-slide-up"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-base font-semibold text-gray-900">{rec.title}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getEffortColor(rec.effort)}`}>
                            {rec.effort} effort
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${trust.className}`}>
                            {trust.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{rec.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-teal-600">{rec.priority}</div>
                        <div className="text-xs text-gray-500">Priority</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="text-xs text-gray-500">Impact</p>
                        <p className="text-sm font-semibold text-gray-900">{rec.impact}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="text-xs text-gray-500">Timeframe</p>
                        <p className="text-sm font-semibold text-gray-900">{rec.timeframe}</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-teal-100 bg-teal-50 p-3 mb-3">
                      <p className="text-xs font-medium text-teal-900 mb-2">Why SigmaSense recommended this</p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {evidence.map((item, idx) => (
                          <span key={idx} className="px-2 py-1 rounded-full bg-white text-xs text-teal-800 border border-teal-100">
                            {item}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-teal-800">{trust.explanation}</p>
                    </div>
                    <div className="bg-teal-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-teal-900 mb-2">Action Steps:</p>
                      <ul className="space-y-1">
                        {rec.actions.map((action: string, idx: number) => (
                          <li key={idx} className="text-xs text-teal-800 flex items-start gap-2">
                            <i className="ri-arrow-right-s-line mt-0.5"></i>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-medium text-gray-700 mb-1">Before you act</p>
                      <p className="text-xs text-gray-600">{getRecommendationCaution(rec)}</p>
                    </div>
                  </div>
                    );
                  })()
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pattern Insights Tab */}
        {activeTab === 'insights' && (
          <div className="p-6 animate-fade-in">
            {loadingInsights ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : patterns.length === 0 ? (
              <div className="text-center py-12">
                <i className="ri-line-chart-line text-5xl text-gray-300 mb-4"></i>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Patterns Detected</h3>
                <p className="text-sm text-gray-600">Insufficient data to detect patterns. Add more metric data to see insights.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {patterns.map((pattern, index) => (
                  (() => {
                    const trust = getPatternTrustAssessment(pattern);
                    const evidence = getPatternEvidence(pattern);
                    return (
                  <div
                    key={index}
                    className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-4 animate-slide-up"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center">
                          <i className={`ri-${
                            pattern.type === 'trend' ? 'line-chart-line' :
                            pattern.type === 'seasonal' ? 'calendar-line' :
                            pattern.type === 'spike' ? 'arrow-up-line' :
                            pattern.type === 'drop' ? 'arrow-down-line' :
                            'pulse-line'
                          } text-white`}></i>
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900 capitalize">
                            {pattern.type} Pattern Detected
                          </h3>
                          <p className="text-sm text-gray-600">{pattern.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-teal-600">{pattern.confidence.toFixed(0)}%</div>
                        <div className="text-xs text-gray-500">Confidence</div>
                        <div className={`mt-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${trust.className}`}>
                          {trust.label}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-white border-opacity-60 bg-white bg-opacity-60 p-3 mb-3">
                      <p className="text-xs font-medium text-gray-700 mb-2">Why this insight matters</p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {evidence.map((item, idx) => (
                          <span key={idx} className="px-2 py-1 rounded-full bg-white text-xs text-teal-800 border border-teal-100">
                            {item}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-600">{trust.explanation}</p>
                    </div>
                    {pattern.period && (
                      <div className="bg-white bg-opacity-50 rounded-lg p-3">
                        <p className="text-xs text-gray-600">
                          <i className="ri-time-line mr-1"></i>
                          Pattern repeats every {pattern.period} days
                        </p>
                      </div>
                    )}
                    <div className="mt-3 rounded-lg border border-teal-100 bg-white bg-opacity-70 p-3">
                      <p className="text-xs font-medium text-gray-700 mb-1">Use with caution if</p>
                      <p className="text-xs text-gray-600">{getPatternCaution(pattern)}</p>
                    </div>
                  </div>
                    );
                  })()
                ))}
              </div>
            )}
          </div>
        )}

        {/* Intelligence Health Tab */}
        {activeTab === 'health' && (
          <div className="p-6 animate-fade-in">
            {aimStats.loading || cpiHealthLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[
                    {
                      system: 'AIM',
                      summary: aimStats.intelligenceHealth,
                      detail: `AIM is currently tracking ${aimStats.recommendationsCount} open recommendation${aimStats.recommendationsCount === 1 ? '' : 's'}, ${aimStats.predictiveAlertsCount} grouped alert${aimStats.predictiveAlertsCount === 1 ? '' : 's'}, and ${aimStats.actionCenterCount} tracked work item${aimStats.actionCenterCount === 1 ? '' : 's'}.`,
                    },
                    {
                      system: 'CPI',
                      summary: cpiIntelligenceHealth,
                      detail: 'CPI health reflects live domain telemetry, command-feed acknowledgment, and the current pressure across operational domains.',
                    },
                  ].map(({ system, summary, detail }) => {
                    const tone = getHealthSeverityClasses(summary.severity);
                    const activeIssues = summary.issues.filter((issue) => issue.count > 0);
                    return (
                      <div
                        key={system}
                        className={`rounded-2xl border p-5 shadow-sm ${tone.panel}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{system} Intelligence</div>
                            <h3 className="mt-2 text-lg font-bold text-gray-900">{summary.headline}</h3>
                            <p className="mt-2 text-sm leading-6 text-gray-600">{summary.note}</p>
                          </div>
                          <div className="text-right">
                            <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone.badge}`}>
                              {summary.severity}
                            </div>
                            <div className={`mt-3 text-3xl font-bold ${tone.accent}`}>{summary.score}</div>
                            <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Health score</div>
                          </div>
                        </div>

                        <p className="mt-4 text-sm text-gray-600">{detail}</p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {activeIssues.length > 0 ? (
                            activeIssues.slice(0, 4).map((issue) => (
                              <span
                                key={`${system}-${issue.key}`}
                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${getHealthSeverityClasses(issue.severity).badge}`}
                              >
                                <span>{issue.label}</span>
                                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-xs">{issue.count}</span>
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700">
                              No active health issues
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Shared Intelligence Issue Queue</div>
                      <h3 className="mt-2 text-lg font-bold text-gray-900">Top integrity and reliability issues</h3>
                      <p className="mt-2 text-sm text-gray-600">
                        This queue shows the issues most likely to weaken trust in recommendations, alerts, or case resolution if left unattended.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-900 px-4 py-3 text-right text-white">
                      <div className="text-2xl font-bold">{combinedHealthIssueCount}</div>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-300">Active issues</div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {combinedHealthIssues.length > 0 ? (
                      combinedHealthIssues.map((issue) => {
                        const tone = getHealthSeverityClasses(issue.severity);
                        return (
                          <div
                            key={`${issue.system}-${issue.key}`}
                            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                                    {issue.system}
                                  </span>
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>
                                    {issue.severity}
                                  </span>
                                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600">
                                    {issue.count} active
                                  </span>
                                </div>
                                <div className="mt-2 text-sm font-semibold text-gray-900">{issue.label}</div>
                                <p className="mt-1 text-sm leading-6 text-gray-600">{issue.detail}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                        AIM and CPI are both reading cleanly right now. There are no active intelligence health issues to escalate.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
