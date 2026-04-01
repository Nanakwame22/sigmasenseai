
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { nlQueryService } from '../../services/nlQueryService';
import {
  generatePredictiveAlerts,
  generateRecommendations,
  PredictiveAlert,
  Recommendation,
} from '../../services/aiEngine';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface AskSigmaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  type: 'user' | 'ai';
  text: string;
  timestamp: Date;
  data?: any[];
  visualization?: 'table' | 'line' | 'bar' | 'pie' | 'metric';
  sql?: string;
  isError?: boolean;
}

type ActiveTab = 'chat' | 'alerts' | 'recommendations' | 'settings';

const COLORS = ['#14B8A6', '#06B6D4', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'];

const SUGGESTIONS = [
  'Show me all my metrics',
  'What alerts are currently active?',
  'How many projects are in progress?',
  'Show me recent anomalies',
  'Compare metrics by category',
  'What are my top KPIs this month?',
];

export default function AskSigmaModal({ isOpen, onClose }: AskSigmaModalProps) {
  const { user } = useAuth();

  // Chat state
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI insights state
  const [predictiveAlerts, setPredictiveAlerts] = useState<PredictiveAlert[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // API key settings state
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [showApiKey, setShowApiKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [keyError, setKeyError] = useState('');

  // Load saved key on mount
  useEffect(() => {
    const savedKey = nlQueryService.getApiKey();
    const savedProvider = localStorage.getItem('nl_query_provider') as 'openai' | 'anthropic' | null;
    if (savedKey) {
      setApiKey(savedKey);
      setKeySaved(true);
    }
    if (savedProvider) setProvider(savedProvider);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load AI insights when modal opens
  useEffect(() => {
    if (isOpen && user?.organizationId) {
      loadAIInsights();
    }
  }, [isOpen, user?.organizationId]);

  const loadAIInsights = async () => {
    setInsightsLoading(true);
    try {
      const [alerts, recs] = await Promise.all([
        generatePredictiveAlerts(),
        generateRecommendations(),
      ]);
      setPredictiveAlerts(alerts);
      setRecommendations(recs);
    } catch (err) {
      console.error('Error loading AI insights:', err);
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleSaveApiKey = () => {
    setKeyError('');
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setKeyError('Please enter an API key.');
      return;
    }
    if (provider === 'openai' && !trimmed.startsWith('sk-')) {
      setKeyError('OpenAI keys start with "sk-". Please check your key.');
      return;
    }
    if (provider === 'anthropic' && !trimmed.startsWith('sk-ant-')) {
      setKeyError('Anthropic keys start with "sk-ant-". Please check your key.');
      return;
    }
    nlQueryService.setApiKey(trimmed, provider);
    setKeySaved(true);
    setKeyError('');
  };

  const handleClearApiKey = () => {
    nlQueryService.clearApiKey();
    setApiKey('');
    setKeySaved(false);
    setKeyError('');
  };

  const handleSubmit = useCallback(async (e?: React.FormEvent, overrideQuery?: string) => {
    e?.preventDefault();
    const text = (overrideQuery ?? query).trim();
    if (!text || isProcessing) return;

    const hasKey = !!nlQueryService.getApiKey();
    if (!hasKey) {
      setActiveTab('settings');
      setMessages(prev => [...prev, {
        type: 'ai',
        text: '⚙️ No AI API key configured yet. Please go to the Settings tab to add your OpenAI or Anthropic key — then come back and ask anything!',
        timestamp: new Date(),
        isError: true,
      }]);
      setQuery('');
      return;
    }

    setQuery('');
    setIsProcessing(true);

    const userMsg: Message = { type: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const result = await nlQueryService.executeQuery(text);

      if (result.success) {
        const aiMsg: Message = {
          type: 'ai',
          text: result.summary || `Found ${result.data?.length ?? 0} result(s).`,
          timestamp: new Date(),
          data: result.data,
          visualization: result.visualization,
          sql: result.sql,
        };
        setMessages(prev => [...prev, aiMsg]);
        await nlQueryService.saveQueryHistory(text, result);
      } else {
        setMessages(prev => [...prev, {
          type: 'ai',
          text: result.error || 'Something went wrong. Please try rephrasing your question.',
          timestamp: new Date(),
          isError: true,
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        type: 'ai',
        text: err?.message || 'An unexpected error occurred. Please try again.',
        timestamp: new Date(),
        isError: true,
      }]);
    } finally {
      setIsProcessing(false);
    }
  }, [query, isProcessing]);

  const handleSuggestion = (suggestion: string) => {
    setQuery(suggestion);
    setTimeout(() => handleSubmit(undefined, suggestion), 50);
  };

  // ── Visualization renderer ──────────────────────────────────────────────────
  const renderVisualization = (msg: Message) => {
    const { data, visualization } = msg;
    if (!data || data.length === 0) return null;

    if (visualization === 'metric') {
      const keys = Object.keys(data[0]).filter(k => !['id', 'user_id', 'organization_id'].includes(k));
      return (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {data.slice(0, 4).map((item, i) => (
            <div key={i} className="p-3 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg border border-teal-100">
              <p className="text-xs text-gray-500 truncate">{item[keys[0]] ?? `Item ${i + 1}`}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{item[keys[1]] ?? '—'}</p>
            </div>
          ))}
        </div>
      );
    }

    if (visualization === 'bar') {
      const keys = Object.keys(data[0]).filter(k => !['id', 'user_id', 'organization_id'].includes(k));
      const nameKey = keys[0];
      const valueKey = keys[1];
      return (
        <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.slice(0, 15)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey={valueKey} fill="#14B8A6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (visualization === 'line') {
      const keys = Object.keys(data[0]).filter(k => !['id', 'user_id', 'organization_id'].includes(k));
      const xKey = keys[0];
      const yKey = keys[1];
      return (
        <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.slice(0, 30)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey={yKey} stroke="#14B8A6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (visualization === 'pie') {
      const keys = Object.keys(data[0]).filter(k => !['id', 'user_id', 'organization_id'].includes(k));
      const nameKey = keys[0];
      const valueKey = keys[1];
      return (
        <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.slice(0, 8)} dataKey={valueKey} nameKey={nameKey} cx="50%" cy="50%" outerRadius={80} label>
                {data.slice(0, 8).map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // Default: table
    const columns = Object.keys(data[0]).filter(k =>
      !['id', 'user_id', 'organization_id', 'created_at', 'updated_at'].includes(k)
    ).slice(0, 5);

    return (
      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              {columns.map(col => (
                <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wide">
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 10).map((row, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col} className="px-3 py-2 text-gray-800 max-w-[160px] truncate">
                    {String(row[col] ?? '—').slice(0, 60)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 10 && (
          <p className="text-xs text-gray-400 text-center py-2">
            Showing 10 of {data.length} rows
          </p>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  const hasKey = keySaved && !!nlQueryService.getApiKey();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
              <i className="ri-sparkling-line text-white text-xl"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Ask Sigma AI</h2>
              <p className="text-xs text-gray-500">
                {hasKey
                  ? `Connected · ${provider === 'openai' ? 'OpenAI GPT-4o mini' : 'Claude 3.5 Sonnet'}`
                  : 'Add an API key in Settings to enable AI'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!hasKey && (
              <button
                onClick={() => setActiveTab('settings')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-key-2-line"></i>
                Add API Key
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-gray-200 px-6">
          {(['chat', 'alerts', 'recommendations', 'settings'] as ActiveTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-3 text-sm font-medium transition-colors capitalize cursor-pointer whitespace-nowrap ${
                activeTab === tab ? 'text-teal-600' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <i className={`mr-1.5 ${
                tab === 'chat' ? 'ri-chat-3-line' :
                tab === 'alerts' ? 'ri-alarm-warning-line' :
                tab === 'recommendations' ? 'ri-lightbulb-line' :
                'ri-settings-3-line'
              }`}></i>
              {tab === 'chat' ? 'AI Chat' : tab === 'alerts' ? 'Predictive Alerts' : tab === 'recommendations' ? 'Recommendations' : 'Settings'}
              {tab === 'alerts' && predictiveAlerts.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">{predictiveAlerts.length}</span>
              )}
              {tab === 'recommendations' && recommendations.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-teal-100 text-teal-700 text-xs rounded-full">{recommendations.length}</span>
              )}
              {tab === 'settings' && !hasKey && (
                <span className="ml-1.5 w-2 h-2 bg-amber-400 rounded-full inline-block"></span>
              )}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600 rounded-t"></div>
              )}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0" style={{ maxHeight: 'calc(90vh - 280px)' }}>
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-100 flex items-center justify-center mb-4">
                      <i className="ri-sparkling-2-line text-3xl text-teal-500"></i>
                    </div>
                    <h3 className="text-base font-semibold text-gray-800 mb-1">Ask anything about your data</h3>
                    <p className="text-sm text-gray-500 mb-6 max-w-sm">
                      {hasKey
                        ? 'Sigma uses AI to translate your question into a database query and summarise the results.'
                        : 'Add your OpenAI or Anthropic key in Settings to unlock full AI-powered queries.'}
                    </p>
                    <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                      {SUGGESTIONS.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => handleSuggestion(s)}
                          className="text-left px-3 py-2.5 bg-gray-50 hover:bg-teal-50 border border-gray-200 hover:border-teal-200 rounded-lg text-sm text-gray-700 transition-all cursor-pointer"
                        >
                          <i className="ri-arrow-right-s-line text-teal-500 mr-1"></i>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.type === 'ai' && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                        <i className="ri-sparkling-line text-white text-xs"></i>
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.type === 'user'
                        ? 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white'
                        : msg.isError
                          ? 'bg-red-50 border border-red-200 text-red-800'
                          : 'bg-gray-100 text-gray-900'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      {msg.type === 'ai' && !msg.isError && renderVisualization(msg)}
                      {msg.sql && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">View generated SQL</summary>
                          <pre className="mt-1 text-xs bg-gray-800 text-green-300 p-2 rounded overflow-x-auto">{msg.sql}</pre>
                        </details>
                      )}
                      <p className={`text-xs mt-2 ${msg.type === 'user' ? 'text-teal-100' : 'text-gray-400'}`}>
                        {msg.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}

                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                      <i className="ri-sparkling-line text-white text-xs"></i>
                    </div>
                    <div className="bg-gray-100 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        <span className="text-xs text-gray-500 ml-1">Thinking…</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-gray-200">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={hasKey ? 'Ask about metrics, alerts, projects, trends…' : 'Add an API key in Settings first…'}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none text-sm transition-all"
                    disabled={isProcessing}
                  />
                  <button
                    type="submit"
                    disabled={!query.trim() || isProcessing}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer"
                  >
                    {isProcessing
                      ? <i className="ri-loader-4-line text-white animate-spin"></i>
                      : <i className="ri-send-plane-fill text-white text-sm"></i>}
                  </button>
                </form>
                {messages.length > 0 && (
                  <button
                    onClick={() => setMessages([])}
                    className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  >
                    <i className="ri-delete-bin-line mr-1"></i>Clear conversation
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Alerts Tab */}
          {activeTab === 'alerts' && (
            <div className="p-6 space-y-3">
              {insightsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <i className="ri-loader-4-line text-3xl text-teal-500 animate-spin"></i>
                </div>
              ) : predictiveAlerts.length === 0 ? (
                <div className="text-center py-16">
                  <i className="ri-shield-check-line text-5xl text-gray-300 mb-3"></i>
                  <p className="text-gray-600 font-medium">No predictive alerts</p>
                  <p className="text-sm text-gray-400 mt-1">AI is monitoring your metrics for potential issues</p>
                </div>
              ) : predictiveAlerts.map(alert => (
                <div key={alert.id} className={`p-4 rounded-xl border-l-4 ${
                  alert.type === 'critical' ? 'bg-red-50 border-red-500' :
                  alert.type === 'warning' ? 'bg-orange-50 border-orange-500' :
                  'bg-sky-50 border-sky-400'
                }`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h4 className="font-semibold text-gray-900 text-sm leading-snug">{alert.title}</h4>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                      alert.type === 'critical' ? 'bg-red-100 text-red-700' :
                      alert.type === 'warning' ? 'bg-orange-100 text-orange-700' :
                      'bg-sky-100 text-sky-700'
                    }`}>{alert.daysUntil}d</span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{alert.description}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
                    <span><i className="ri-calendar-line mr-1"></i>{alert.predictedDate}</span>
                    <span><i className="ri-bar-chart-line mr-1"></i>{alert.confidence.toFixed(0)}% confidence</span>
                    <span><i className="ri-price-tag-3-line mr-1"></i>{alert.category}</span>
                  </div>
                  <ul className="space-y-1">
                    {alert.actions.map((a, i) => (
                      <li key={i} className="flex items-start text-xs text-gray-600">
                        <i className="ri-arrow-right-s-line text-teal-500 mt-0.5 mr-1 flex-shrink-0"></i>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations Tab */}
          {activeTab === 'recommendations' && (
            <div className="p-6 space-y-3">
              {insightsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <i className="ri-loader-4-line text-3xl text-teal-500 animate-spin"></i>
                </div>
              ) : recommendations.length === 0 ? (
                <div className="text-center py-16">
                  <i className="ri-lightbulb-line text-5xl text-gray-300 mb-3"></i>
                  <p className="text-gray-600 font-medium">No recommendations yet</p>
                  <p className="text-sm text-gray-400 mt-1">AI will analyse your data and surface suggestions</p>
                </div>
              ) : recommendations.map(rec => (
                <div key={rec.id} className="p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl border border-teal-200">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h4 className="font-semibold text-gray-900 text-sm leading-snug">{rec.title}</h4>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                      rec.priority >= 80 ? 'bg-red-100 text-red-700' :
                      rec.priority >= 60 ? 'bg-orange-100 text-orange-700' :
                      'bg-teal-100 text-teal-700'
                    }`}>P{rec.priority}</span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{rec.description}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
                    <span><i className="ri-time-line mr-1"></i>{rec.timeframe}</span>
                    <span><i className="ri-tools-line mr-1"></i>{rec.effort} effort</span>
                    <span><i className="ri-bar-chart-line mr-1"></i>{rec.confidence.toFixed(0)}% confidence</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="p-2 bg-white rounded-lg">
                      <p className="text-xs text-gray-500">Impact</p>
                      <p className="text-xs font-medium text-gray-800 mt-0.5">{rec.impact}</p>
                    </div>
                    <div className="p-2 bg-white rounded-lg">
                      <p className="text-xs text-gray-500">Expected Benefit</p>
                      <p className="text-xs font-medium text-gray-800 mt-0.5">{rec.expectedBenefit}</p>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {rec.actions.map((a, i) => (
                      <li key={i} className="flex items-start text-xs text-gray-600">
                        <i className="ri-checkbox-circle-line text-teal-500 mt-0.5 mr-1 flex-shrink-0"></i>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="p-6 max-w-xl">
              <h3 className="text-base font-semibold text-gray-900 mb-1">AI Engine Configuration</h3>
              <p className="text-sm text-gray-500 mb-6">
                Ask Sigma uses your own API key to generate SQL from natural language and summarise results.
                Your key is stored locally in your browser and never sent to our servers.
              </p>

              {/* Provider selector */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">AI Provider</label>
                <div className="flex gap-3">
                  {(['openai', 'anthropic'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => { setProvider(p); setKeySaved(false); setKeyError(''); }}
                      className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                        provider === p
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {p === 'openai' ? '🤖 OpenAI' : '🧠 Anthropic'}
                      <span className="block text-xs font-normal mt-0.5 opacity-70">
                        {p === 'openai' ? 'GPT-4o mini' : 'Claude 3.5 Sonnet'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {provider === 'openai' ? 'OpenAI API Key' : 'Anthropic API Key'}
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => { setApiKey(e.target.value); setKeySaved(false); setKeyError(''); }}
                    placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                    className={`w-full px-4 py-2.5 pr-10 rounded-lg border text-sm outline-none transition-all font-mono ${
                      keyError ? 'border-red-400 focus:ring-2 focus:ring-red-200' :
                      keySaved ? 'border-teal-400 focus:ring-2 focus:ring-teal-200' :
                      'border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <i className={showApiKey ? 'ri-eye-off-line' : 'ri-eye-line'}></i>
                  </button>
                </div>
                {keyError && <p className="mt-1.5 text-xs text-red-600"><i className="ri-error-warning-line mr-1"></i>{keyError}</p>}
                {keySaved && !keyError && (
                  <p className="mt-1.5 text-xs text-teal-600"><i className="ri-checkbox-circle-line mr-1"></i>Key saved — Ask Sigma is ready to use.</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim()}
                  className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-save-line mr-1.5"></i>Save Key
                </button>
                {keySaved && (
                  <button
                    onClick={handleClearApiKey}
                    className="px-4 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-delete-bin-line mr-1"></i>Remove
                  </button>
                )}
              </div>

              {/* How it works */}
              <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs font-semibold text-gray-700 mb-2">How it works</p>
                <ol className="space-y-1.5 text-xs text-gray-600 list-decimal list-inside">
                  <li>You type a question in plain English</li>
                  <li>Sigma sends it to {provider === 'openai' ? 'OpenAI' : 'Anthropic'} to generate a SQL query</li>
                  <li>The SQL runs securely against your Supabase database via an Edge Function</li>
                  <li>The AI summarises the results in plain language</li>
                </ol>
                <p className="mt-3 text-xs text-gray-500">
                  <i className="ri-lock-line mr-1"></i>
                  Your API key is stored only in your browser's local storage. It is sent directly to {provider === 'openai' ? 'OpenAI' : 'Anthropic'} — never to our servers.
                </p>
              </div>

              {/* Get key links */}
              <div className="mt-4 flex gap-3">
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-800 transition-colors"
                >
                  <i className="ri-external-link-line"></i>Get OpenAI key
                </a>
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-800 transition-colors"
                >
                  <i className="ri-external-link-line"></i>Get Anthropic key
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
