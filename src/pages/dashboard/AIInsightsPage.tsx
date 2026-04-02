
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { executeNaturalLanguageQuery, getQuerySuggestions, generateAIResponse } from '../../services/naturalLanguageQuery';
import type { QueryResult } from '../../services/naturalLanguageQuery';
import { generatePredictiveAlerts, generateRecommendations, detectPatterns } from '../../services/aiEngine';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  data?: any[];
  visualization?: 'table' | 'chart' | 'metric' | 'list';
  chartType?: 'line' | 'bar' | 'pie' | 'area';
}

export default function AIInsightsPage() {
  const { organizationId } = useAuth();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [predictiveAlerts, setPredictiveAlerts] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'alerts' | 'recommendations' | 'insights'>('chat');
  const [loadingInsights, setLoadingInsights] = useState(true);

  useEffect(() => {
    if (organizationId) {
      loadAIInsights();
    }
  }, [organizationId]);

  const loadAIInsights = async () => {
    try {
      setLoadingInsights(true);
      
      // Load predictive alerts
      const alerts = await generatePredictiveAlerts();
      setPredictiveAlerts(alerts);

      // Load recommendations
      const recs = await generateRecommendations();
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

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'low': return 'bg-green-100 text-green-700';
      case 'medium': return 'bg-yellow-100 text-yellow-700';
      case 'high': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
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
            { id: 'insights', label: 'Pattern Insights', icon: 'ri-line-chart-line', count: patterns.length }
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
                  </div>
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
                  </div>
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
                      </div>
                    </div>
                    {pattern.period && (
                      <div className="bg-white bg-opacity-50 rounded-lg p-3">
                        <p className="text-xs text-gray-600">
                          <i className="ri-time-line mr-1"></i>
                          Pattern repeats every {pattern.period} days
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
