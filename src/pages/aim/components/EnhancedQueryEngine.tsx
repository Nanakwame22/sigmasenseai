import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { nlQueryService } from '../../../services/nlQueryService';
import type { QueryResult, QueryHistory } from '../../../services/nlQueryService';
import { addToast } from '../../../hooks/useToast';
import { AIMEmptyState, AIMPanel, AIMSectionIntro } from './AIMSectionSystem';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Chart constants ──────────────────────────────────────────────────────────
const COLORS = ['#2CB1BC', '#8B5CF6', '#F59E0B', '#EF4444', '#0967D2', '#10B981'];
const AXIS_TICK = { fontSize: 11, fill: '#829AB1' };
const GRID_STROKE = '#D9E2EC';
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(255,255,255,0.98)',
  border: '1px solid #BCCCDC',
  borderRadius: '14px',
  boxShadow: '0 18px 45px rgba(15,23,42,0.12)',
  fontSize: '12px',
};

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
    const savedProvider = localStorage.getItem('nl_query_provider');
    if (savedProvider === 'openai' || savedProvider === 'anthropic') {
      setProvider(savedProvider);
    }
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
    const normalizedKey = apiKey.trim();
    if (normalizedKey) {
      if (provider === 'openai' && !normalizedKey.startsWith('sk-')) {
        addToast('OpenAI keys usually start with "sk-". Please double-check the key.', 'warning');
        return;
      }
      if (provider === 'anthropic' && !normalizedKey.startsWith('sk-ant-')) {
        addToast('Anthropic keys usually start with "sk-ant-". Please double-check the key.', 'warning');
        return;
      }
      nlQueryService.setApiKey(normalizedKey, provider);
      setHasApiKey(true);
      setShowApiKeyModal(false);
      setApiKey('');
      addToast(`${provider === 'openai' ? 'OpenAI' : 'Anthropic'} connected for richer AIM query output`, 'success');
    }
  };

  const handleRemoveApiKey = () => {
    nlQueryService.clearApiKey();
    setHasApiKey(false);
    addToast('AI provider disconnected. Ask AIM will still work in direct query mode.', 'info');
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

        if (user) {
          const orgId = await resolveOrgId();
          await nlQueryService.saveAsAIMInsight(queryToExecute, queryResult, orgId, user.id);
          setSavedToFeed(true);
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
              <div className="text-5xl font-bold text-ai-600 mb-3 tabular-nums">
                {typeof metricValue === 'number' ? (metricValue as number).toLocaleString() : String(metricValue)}
              </div>
              <div className="text-brand-500 text-sm font-medium capitalize">
                {metricLabel.replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        );
      }
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={compact ? 220 : 380}>
            <LineChart data={data} margin={{ top: 12, right: 18, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey={Object.keys(data[0])[0]} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: '#BCCCDC', strokeDasharray: '4 4' }} />
              <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
              {Object.keys(data[0]).slice(1).map((key, index) => (
                <Line key={key} type="monotone" dataKey={key} stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={compact ? 220 : 380}>
            <BarChart data={data} margin={{ top: 12, right: 18, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey={Object.keys(data[0])[0]} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(188,204,220,0.15)' }} />
              <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
              {Object.keys(data[0]).slice(1).map((key, index) => (
                <Bar key={key} dataKey={key} fill={COLORS[index % COLORS.length]} radius={[5, 5, 0, 0]} />
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
          <ResponsiveContainer width="100%" height={compact ? 220 : 380}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={compact ? 80 : 130}
                innerRadius={compact ? 40 : 60}
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                dataKey="value">
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        );
      }
      default:
        return (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-50 border-b border-border">
                  {Object.keys(data[0]).map((key) => (
                    <th key={key} className="px-4 py-3 text-left text-xs font-bold text-brand-500 uppercase tracking-wide whitespace-nowrap">
                      {key.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 100).map((row, index) => (
                  <tr key={index} className="border-b border-border hover:bg-brand-50 transition-colors">
                    {Object.values(row).map((value: any, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-3 text-brand-700">
                        {typeof value === 'number' ? value.toLocaleString() : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length > 100 && (
              <div className="text-center py-3 text-xs text-brand-400 border-t border-border bg-brand-50">
                Showing first 100 of {data.length} results
              </div>
            )}
          </div>
        );
    }
  };

  // ─── Compact mode (right rail) ────────────────────────────────────────────
  if (compact) {
    return (
      <div className="space-y-4">
        {!hasApiKey && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
            <i className="ri-information-line text-amber-500 mt-0.5 flex-shrink-0"></i>
            <p className="text-xs text-amber-800 leading-relaxed">
              Works now in direct mode. Add an API key for richer AI summaries.
            </p>
          </div>
        )}

        {/* Input */}
        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleExecuteQuery();
              }
            }}
            placeholder="Ask about metrics, alerts, trends…"
            className="w-full px-4 py-3 pr-12 bg-white border border-border rounded-premium-xl focus:outline-none focus:ring-2 focus:ring-ai-300/60 focus:border-ai-300 resize-none text-sm text-brand-800 placeholder:text-brand-300 transition-all shadow-elevation-1"
            rows={3}
          />
          <button
            onClick={() => handleExecuteQuery()}
            disabled={!query.trim() || isLoading}
            className="absolute bottom-2.5 right-2.5 w-8 h-8 flex items-center justify-center bg-gradient-to-br from-ai-500 to-ai-600 text-white rounded-lg hover:from-ai-600 hover:to-ai-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-glow-sm cursor-pointer"
          >
            {isLoading
              ? <i className="ri-loader-4-line animate-spin text-sm"></i>
              : <i className="ri-send-plane-fill text-sm"></i>
            }
          </button>
        </div>

        {/* Suggestions */}
        {!result && suggestions.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-brand-400 uppercase tracking-widest mb-2">Try asking</p>
            <div className="flex flex-col gap-1.5">
              {suggestions.slice(0, 3).map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(s)}
                  className="text-left px-3 py-2 bg-brand-50 hover:bg-ai-50 border border-border hover:border-ai-200 text-xs text-brand-600 hover:text-ai-700 rounded-premium transition-all cursor-pointer"
                >
                  <i className="ri-corner-down-right-line mr-1.5 opacity-50"></i>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Compact result */}
        {result && (
          <div className={`rounded-premium-xl border p-4 ${result.success ? 'border-ai-200 bg-ai-50' : 'border-red-200 bg-red-50'}`}>
            {result.success ? (
              <>
                {result.summary && (
                  <p className="text-xs text-brand-700 leading-relaxed mb-3">{result.summary}</p>
                )}
                {result.data && result.data.length > 0 && (
                  <div className="text-xs text-ai-600 font-semibold flex items-center gap-1.5">
                    <i className="ri-database-2-line"></i>
                    {result.data.length} row{result.data.length === 1 ? '' : 's'} returned
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-start gap-2">
                <i className="ri-error-warning-line text-red-500 mt-0.5 flex-shrink-0"></i>
                <p className="text-xs text-red-700">{result.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Full mode ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <AIMSectionIntro
        eyebrow="Natural Language Query"
        title="Ask AIM"
        description="Query SigmaSense in plain English, review the underlying SQL when needed, and save useful answers directly into Insight History."
        actions={
          <div className="flex items-center gap-3">
            {hasApiKey ? (
              <>
                <div className="flex items-center gap-2 px-4 py-2 bg-ai-50 border border-ai-200 text-ai-700 rounded-premium text-sm font-medium">
                  <i className="ri-shield-check-line text-ai-500"></i>
                  <span>{provider === 'openai' ? 'OpenAI' : 'Anthropic'} connected</span>
                </div>
                <button
                  onClick={handleRemoveApiKey}
                  className="px-4 py-2 text-sm text-brand-500 hover:text-brand-800 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Change key
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-ai-500 to-ai-600 text-white text-sm font-semibold rounded-premium hover:from-ai-600 hover:to-ai-700 transition-all shadow-glow-sm whitespace-nowrap cursor-pointer"
              >
                <i className="ri-key-2-line"></i>
                Connect AI
              </button>
            )}
          </div>
        }
      />

      {/* Query Studio */}
      <AIMPanel
        title="Query Studio"
        description="Ask an operational question, inspect the result, and preserve the answer as reusable intelligence."
        icon="ri-chat-voice-line"
        accentClass="from-ai-500 to-ai-600"
      >
        {!hasApiKey && (
          <div className="mb-5 flex items-start gap-3 rounded-premium-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <i className="ri-information-line text-amber-500 text-lg mt-0.5 flex-shrink-0"></i>
            <div>
              <p className="text-sm font-semibold text-amber-800">Running in direct query mode</p>
              <p className="text-xs text-amber-700 mt-0.5">Add an OpenAI or Anthropic key for richer AI summaries and stronger language interpretation.</p>
            </div>
            <button
              onClick={() => setShowApiKeyModal(true)}
              className="ml-auto flex-shrink-0 text-xs font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 whitespace-nowrap cursor-pointer"
            >
              Connect AI →
            </button>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
          {/* Input area */}
          <div className="space-y-3">
            <div className="relative">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleExecuteQuery();
                  }
                }}
                placeholder={hasApiKey
                  ? 'Ask anything about your data… results auto-save to Insight History'
                  : 'Ask anything about your operations…'
                }
                className="w-full min-h-[140px] px-5 py-4 bg-white border border-border rounded-premium-xl focus:outline-none focus:ring-2 focus:ring-ai-300/50 focus:border-ai-300 resize-none text-sm text-brand-800 placeholder:text-brand-300 transition-all shadow-elevation-1 leading-relaxed"
                rows={5}
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {query.trim() && (
                  <span className="text-xs text-brand-300">{query.length} chars</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-brand-400">
                <kbd className="px-1.5 py-0.5 bg-brand-100 border border-border rounded text-[10px] font-mono">Enter</kbd>
                {' '}to run &nbsp;·&nbsp;
                <kbd className="px-1.5 py-0.5 bg-brand-100 border border-border rounded text-[10px] font-mono">Shift+Enter</kbd>
                {' '}for new line
              </p>
              <button
                onClick={() => handleExecuteQuery()}
                disabled={!query.trim() || isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-ai-500 to-ai-600 text-white text-sm font-bold rounded-premium hover:from-ai-600 hover:to-ai-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-glow-sm cursor-pointer"
              >
                {isLoading ? (
                  <><i className="ri-loader-4-line animate-spin"></i> Analyzing…</>
                ) : (
                  <><i className="ri-send-plane-fill"></i> Ask AIM</>
                )}
              </button>
            </div>
          </div>

          {/* How to use */}
          <div className="rounded-premium-xl border border-border bg-brand-50 p-5">
            <div className="text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-4">How to use</div>
            <ul className="space-y-4">
              {[
                { icon: 'ri-bar-chart-box-line', text: 'Ask for trends, exceptions, comparisons, or operational drivers.' },
                { icon: 'ri-code-s-slash-line', text: 'Review the generated SQL for analyst-level traceability.' },
                { icon: 'ri-history-line', text: 'Every successful query feeds the AIM memory loop automatically.' },
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 flex items-center justify-center bg-white border border-border rounded-lg flex-shrink-0 shadow-elevation-1">
                    <i className={`${item.icon} text-ai-500 text-sm`}></i>
                  </div>
                  <span className="text-xs text-brand-600 leading-relaxed pt-0.5">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Suggested prompts */}
        {!result && suggestions.length > 0 && (
          <div className="mt-5 pt-5 border-t border-border">
            <div className="mb-3 text-[10px] font-bold text-brand-400 uppercase tracking-widest">Suggested prompts</div>
            <div className="flex flex-wrap gap-2">
              {suggestions.slice(0, 6).map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-border text-brand-600 hover:bg-ai-50 hover:text-ai-700 hover:border-ai-200 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer shadow-elevation-1"
                >
                  <i className="ri-corner-down-right-line text-brand-300 text-[10px]"></i>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </AIMPanel>

      {/* Results */}
      {result && (
        <AIMPanel
          title={result.success ? 'Query Results' : 'Query Failed'}
          description={result.success
            ? 'Result set, narrative summary, and query trace for your latest Ask AIM request.'
            : 'AIM could not complete the requested query.'
          }
          icon={result.success ? 'ri-database-2-line' : 'ri-error-warning-line'}
          accentClass={result.success ? 'from-ai-500 to-ai-600' : 'from-red-500 to-orange-600'}
        >
          {result.success ? (
            <div className="space-y-5">
              {/* Saved badge */}
              {savedToFeed && (
                <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-premium text-xs font-semibold text-emerald-700 w-fit">
                  <i className="ri-check-double-line"></i>
                  Saved to Insight History
                </div>
              )}

              {/* AI Summary */}
              {result.summary && (
                <div className="rounded-premium-xl border border-ai-200 bg-gradient-to-br from-ai-50 to-ai-100 p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 flex items-center justify-center bg-ai-500 rounded-xl flex-shrink-0 shadow-glow-sm">
                      <i className="ri-lightbulb-flash-line text-white text-base"></i>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-ai-700 uppercase tracking-wide mb-1.5">AIM Summary</p>
                      <p className="text-sm text-brand-800 leading-relaxed">{result.summary}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Visualization */}
              <div className="rounded-premium-xl border border-border bg-white p-5 shadow-elevation-1">
                <div className="flex items-center gap-2 mb-5">
                  <span className="px-2.5 py-1 bg-brand-100 text-brand-600 text-[11px] font-bold uppercase tracking-wide rounded-full">
                    {result.visualization || 'table'}
                  </span>
                  {result.data && (
                    <span className="px-2.5 py-1 bg-ai-100 text-ai-700 text-[11px] font-bold uppercase tracking-wide rounded-full">
                      {result.data.length} row{result.data.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {renderVisualization()}
              </div>

              {/* SQL trace */}
              {result.sql && (
                <div>
                  <button
                    onClick={() => setShowSql(!showSql)}
                    className="flex items-center gap-2 text-xs font-semibold text-brand-400 hover:text-brand-700 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <i className={`ri-code-${showSql ? 'box' : 's'}-line`}></i>
                    {showSql ? 'Hide' : 'Show'} SQL query
                    <i className={`ri-arrow-${showSql ? 'up' : 'down'}-s-line`}></i>
                  </button>
                  {showSql && (
                    <pre className="mt-3 p-5 bg-brand-900 text-ai-200 rounded-premium-xl overflow-x-auto text-xs leading-relaxed font-mono">
                      {result.sql}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-4 p-5 bg-red-50 border border-red-200 rounded-premium-xl">
              <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                <i className="ri-error-warning-line text-red-600 text-lg"></i>
              </div>
              <div>
                <p className="font-semibold text-red-800 mb-1">Query could not complete</p>
                <p className="text-sm text-red-700 leading-relaxed">{result.error}</p>
              </div>
            </div>
          )}
        </AIMPanel>
      )}

      {/* Query History */}
      {!compact && history.length > 0 && (
        <AIMPanel
          title="Recent Queries"
          description="Re-open recent Ask AIM questions and compare successful vs failed runs."
          icon="ri-history-line"
          accentClass="from-brand-600 to-brand-800"
          actions={
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:text-brand-800 border border-border rounded-premium hover:bg-brand-50 transition-all cursor-pointer"
            >
              {showHistory ? 'Collapse' : 'Expand'}
              <i className={`ri-arrow-${showHistory ? 'up' : 'down'}-s-line`}></i>
            </button>
          }
        >
          {showHistory && (
            <div className="space-y-2">
              {history.slice(0, 10).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleHistoryClick(item)}
                  className="w-full text-left p-4 rounded-premium border border-border hover:bg-brand-50 hover:border-ai-200 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-brand-800 truncate">{item.query}</p>
                      <p className="text-xs text-brand-400 mt-1">{new Date(item.timestamp).toLocaleString()}</p>
                    </div>
                    {item.result.success
                      ? <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-emerald-100 rounded-full"><i className="ri-check-line text-emerald-600 text-xs"></i></span>
                      : <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-red-100 rounded-full"><i className="ri-close-line text-red-500 text-xs"></i></span>
                    }
                  </div>
                </button>
              ))}
            </div>
          )}
        </AIMPanel>
      )}

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-brand-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-premium-xl shadow-elevation-5 max-w-md w-full p-7 border border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-ai-500 to-ai-600 rounded-xl shadow-glow-sm">
                  <i className="ri-key-2-line text-white text-lg"></i>
                </div>
                <h3 className="text-lg font-bold text-brand-900">Connect AI Provider</h3>
              </div>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="w-8 h-8 flex items-center justify-center text-brand-400 hover:text-brand-700 hover:bg-brand-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <p className="text-sm text-brand-500 mb-6 ml-13">
              Add an API key from OpenAI or Anthropic for richer AI-generated summaries and stronger natural language interpretation.
            </p>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-brand-600 uppercase tracking-wide mb-2">AI Provider</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['openai', 'anthropic'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={`px-4 py-3 rounded-premium border-2 text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                        provider === p
                          ? 'border-ai-500 bg-ai-50 text-ai-700 shadow-glow-sm'
                          : 'border-border text-brand-600 hover:border-brand-300 hover:bg-brand-50'
                      }`}
                    >
                      {p === 'openai' ? 'OpenAI' : 'Anthropic'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-600 uppercase tracking-wide mb-2">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                  placeholder={provider === 'openai' ? 'sk-…' : 'sk-ant-…'}
                  className="w-full px-4 py-3 border border-border rounded-premium focus:outline-none focus:ring-2 focus:ring-ai-300/50 focus:border-ai-300 text-sm text-brand-800 placeholder:text-brand-300 transition-all"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="flex-1 px-4 py-2.5 border border-border text-brand-600 rounded-premium hover:bg-brand-50 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim()}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-ai-500 to-ai-600 text-white rounded-premium hover:from-ai-600 hover:to-ai-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold transition-all shadow-glow-sm whitespace-nowrap cursor-pointer"
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
