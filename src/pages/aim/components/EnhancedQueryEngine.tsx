import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { nlQueryService, QueryResult, QueryHistory } from '../../../services/nlQueryService';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#14B8A6', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#10B981'];

interface Props {
  compact?: boolean;
}

export default function EnhancedQueryEngine({ compact = false }: Props) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<QueryHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [savedToFeed, setSavedToFeed] = useState(false);

  useEffect(() => {
    const key = nlQueryService.getApiKey();
    setHasApiKey(!!key);
    loadSuggestions();
    loadHistory();
  }, []);

  const loadSuggestions = async () => {
    try {
      const suggested = await nlQueryService.getSuggestedQuestions();
      setSuggestions(suggested);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const loadHistory = () => {
    setHistory(nlQueryService.getQueryHistory());
  };

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      nlQueryService.setApiKey(apiKey.trim(), provider);
      setHasApiKey(true);
      setShowApiKeyModal(false);
      setApiKey('');
    }
  };

  const handleRemoveApiKey = () => {
    nlQueryService.clearApiKey();
    setHasApiKey(false);
  };

  const resolveOrgId = async (): Promise<string> => {
    if (!user) return '';
    const { data } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    return data?.organization_id ?? user.id;
  };

  const handleExecuteQuery = async (queryText?: string) => {
    const queryToExecute = queryText || query;
    if (!queryToExecute.trim()) return;

    setIsLoading(true);
    setResult(null);
    setSavedToFeed(false);

    try {
      const queryResult = await nlQueryService.executeQuery(queryToExecute);
      setResult(queryResult);

      if (queryResult.success) {
        await nlQueryService.saveQueryHistory(queryToExecute, queryResult);
        loadHistory();

        // Save to AIM insights feed
        if (user) {
          const orgId = await resolveOrgId();
          await nlQueryService.saveAsAIMInsight(queryToExecute, queryResult, orgId, user.id);
          setSavedToFeed(true);
          // Notify InsightHistorySection to refresh
          window.dispatchEvent(new CustomEvent('aim-insight-added'));
        }
      }
    } catch (error: any) {
      setResult({
        success: false,
        error: error?.message || 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    handleExecuteQuery(suggestion);
  };

  const handleHistoryClick = (historyItem: QueryHistory) => {
    setQuery(historyItem.query);
    setResult(historyItem.result);
    setShowHistory(false);
  };

  const renderVisualization = () => {
    if (!result?.success || !result.data || result.data.length === 0) return null;
    const data = result.data;

    switch (result.visualization) {
      case 'metric': {
        const metricValue = Object.values(data[0])[0];
        const metricLabel = Object.keys(data[0])[0];
        return (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="text-5xl font-bold text-teal-600 mb-2">
                {typeof metricValue === 'number' ? (metricValue as number).toLocaleString() : String(metricValue)}
              </div>
              <div className="text-gray-600 text-lg capitalize">
                {metricLabel.replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        );
      }
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={compact ? 220 : 400}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={Object.keys(data[0])[0]} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {Object.keys(data[0]).slice(1).map((key, index) => (
                <Line key={key} type="monotone" dataKey={key} stroke={COLORS[index % COLORS.length]} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={compact ? 220 : 400}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={Object.keys(data[0])[0]} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {Object.keys(data[0]).slice(1).map((key, index) => (
                <Bar key={key} dataKey={key} fill={COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      case 'pie': {
        const pieData = data.map((item, index) => ({
          name: Object.values(item)[0],
          value: Object.values(item)[1],
          fill: COLORS[index % COLORS.length],
        }));
        return (
          <ResponsiveContainer width="100%" height={compact ? 220 : 400}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={compact ? 80 : 120}
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                dataKey="value">
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );
      }
      default:
        return (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  {Object.keys(data[0]).map((key) => (
                    <th key={key} className="px-4 py-3 text-left text-sm font-semibold text-gray-700 capitalize">
                      {key.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 100).map((row, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    {Object.values(row).map((value: any, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-3 text-sm text-gray-600">
                        {typeof value === 'number' ? value.toLocaleString() : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length > 100 && (
              <div className="text-center py-4 text-sm text-gray-500">
                Showing first 100 of {data.length} results
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Natural Language Query</h2>
            <p className="text-gray-600 mt-1">Ask questions about your data in plain English — results are saved to the Insight History feed</p>
          </div>
          <div className="flex items-center gap-3">
            {hasApiKey ? (
              <>
                <div className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 rounded-lg text-sm">
                  <i className="ri-check-line"></i>
                  <span>AI Connected</span>
                </div>
                <button onClick={handleRemoveApiKey} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap cursor-pointer">
                  Change API Key
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <i className="ri-key-line"></i>
                Configure AI
              </button>
            )}
          </div>
        </div>
      )}

      {/* Query Input */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleExecuteQuery();
                }
              }}
              placeholder={hasApiKey ? 'Ask anything… results auto-save to Insight History' : 'Ask anything about your data…'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-sm"
              rows={compact ? 2 : 3}
            />
          </div>
          <button
            onClick={() => handleExecuteQuery()}
            disabled={!query.trim() || isLoading}
            className="px-5 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 h-fit whitespace-nowrap cursor-pointer"
          >
            {isLoading ? (
              <><i className="ri-loader-4-line animate-spin"></i>{!compact && 'Analyzing…'}</>
            ) : (
              <><i className="ri-send-plane-fill"></i>{!compact && 'Ask'}</>
            )}
          </button>
        </div>

        {/* Suggestions */}
        {!result && suggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.slice(0, compact ? 3 : 6).map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 border border-transparent text-xs transition-all whitespace-nowrap cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {result.success ? (
            <>
              {/* Saved-to-feed badge */}
              {savedToFeed && (
                <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-700 w-fit">
                  <i className="ri-history-line"></i>
                  Saved to Insight History feed
                </div>
              )}

              {result.summary && (
                <div className="mb-6 p-4 bg-teal-50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <i className="ri-lightbulb-line text-teal-600 text-xl mt-0.5"></i>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">Insight</h3>
                      <p className="text-gray-700">{result.summary}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-4">{renderVisualization()}</div>

              {result.sql && (
                <div className="border-t border-gray-200 pt-4">
                  <button
                    onClick={() => setShowSql(!showSql)}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap cursor-pointer"
                  >
                    <i className={`ri-code-${showSql ? 'box' : 's'}-line`}></i>
                    {showSql ? 'Hide' : 'Show'} SQL Query
                  </button>
                  {showSql && (
                    <pre className="mt-3 p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
                      {result.sql}
                    </pre>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="flex items-start gap-3">
                <i className="ri-error-warning-line text-red-600 text-xl mt-0.5"></i>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Error</h3>
                  <p className="text-gray-700">{result.error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Query History */}
      {!compact && history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-left whitespace-nowrap cursor-pointer"
          >
            <h3 className="text-lg font-semibold text-gray-900">Recent Queries</h3>
            <i className={`ri-arrow-${showHistory ? 'up' : 'down'}-s-line text-gray-400`}></i>
          </button>

          {showHistory && (
            <div className="mt-4 space-y-2">
              {history.slice(0, 10).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleHistoryClick(item)}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 border border-gray-200 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{item.query}</p>
                      <p className="text-xs text-gray-500 mt-1">{new Date(item.timestamp).toLocaleString()}</p>
                    </div>
                    {item.result.success
                      ? <i className="ri-check-line text-teal-600"></i>
                      : <i className="ri-close-line text-red-600"></i>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Configure AI Provider</h3>
              <button onClick={() => setShowApiKeyModal(false)} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center cursor-pointer">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <p className="text-gray-600 mb-6">Add an API key from OpenAI or Anthropic to enable AI-powered queries.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">AI Provider</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['openai', 'anthropic'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium whitespace-nowrap cursor-pointer ${
                        provider === p ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {p === 'openai' ? 'OpenAI' : 'Anthropic'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter your ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key`}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowApiKeyModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 whitespace-nowrap cursor-pointer">
                  Cancel
                </button>
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim()}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                >
                  Save & Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
