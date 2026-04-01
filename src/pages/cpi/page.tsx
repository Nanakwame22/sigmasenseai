import { useState } from 'react';
import CPIHeader from './components/CPIHeader';
import OperationalDomains from './components/OperationalDomains';
import RealTimeFeed from './components/RealTimeFeed';
import WorkflowDecisionSupport from './components/WorkflowDecisionSupport';
import HealthcareIntegrations from './components/HealthcareIntegrations';
import CPIIntelligenceModels from './components/CPIIntelligenceModels';
import CPIAutomationWorkflows from './components/CPIAutomationWorkflows';
import PHIEncryptionStatus from '../../components/feature/PHIEncryptionStatus';

type Tab = 'command' | 'intelligence' | 'workflows' | 'integrations' | 'security';

const tabs: { id: Tab; label: string; icon: string; badge?: string; badgeColor?: string }[] = [
  { id: 'command', label: 'Command Center', icon: 'ri-radar-line', badge: 'Live', badgeColor: 'bg-emerald-100 text-emerald-700' },
  { id: 'intelligence', label: 'Intelligence Models', icon: 'ri-brain-line', badge: 'Live', badgeColor: 'bg-emerald-100 text-emerald-700' },
  { id: 'workflows', label: 'Workflows & Automation', icon: 'ri-git-branch-line', badge: '3 Live', badgeColor: 'bg-teal-50 text-teal-700' },
  { id: 'integrations', label: 'Integrations', icon: 'ri-links-line', badge: 'Live', badgeColor: 'bg-emerald-100 text-emerald-700' },
  { id: 'security', label: 'HIPAA Security', icon: 'ri-shield-keyhole-line', badge: 'PHI', badgeColor: 'bg-teal-100 text-teal-700' },
];

export default function CPIPage() {
  const [activeTab, setActiveTab] = useState<Tab>('command');

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <CPIHeader />

      <div className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-8">
          <div className="flex items-center space-x-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-4 text-sm font-semibold border-b-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <i className={`${tab.icon} text-base`}></i>
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${tab.badgeColor}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-8 py-8">
        {activeTab === 'command' && (
          <div className="space-y-10">
            <OperationalDomains />
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              <div className="xl:col-span-2">
                <RealTimeFeed />
              </div>
              <div className="xl:col-span-3">
                <WorkflowDecisionSupport />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'intelligence' && <CPIIntelligenceModels />}
        {activeTab === 'workflows' && <CPIAutomationWorkflows />}
        {activeTab === 'integrations' && <HealthcareIntegrations />}

        {activeTab === 'security' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Section header */}
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 flex items-center justify-center bg-teal-50 rounded-xl">
                <i className="ri-shield-keyhole-line text-teal-600 text-xl"></i>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">HIPAA Technical Safeguards</h2>
                <p className="text-sm text-slate-500">Field-level encryption &amp; PHI access controls</p>
              </div>
            </div>

            <PHIEncryptionStatus />

            {/* What's encrypted info card */}
            <div className="bg-white rounded-xl border border-slate-100 p-5">
              <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center space-x-2">
                <i className="ri-information-line text-slate-400"></i>
                <span>Encryption Architecture</span>
              </h4>
              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <p>
                  <strong className="text-slate-800">Algorithm:</strong> AES-256 symmetric encryption via PostgreSQL pgcrypto extension
                  (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono">pgp_sym_encrypt</code>). Keys never stored in the database.
                </p>
                <p>
                  <strong className="text-slate-800">Key Management:</strong> Encryption key lives exclusively in Supabase Edge Function secrets
                  (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono">PHI_ENCRYPTION_KEY</code>). Only the
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono mx-1">phi-data-handler</code> edge function can encrypt/decrypt.
                  The frontend never sees the key.
                </p>
                <p>
                  <strong className="text-slate-800">Audit Trail:</strong> Every encrypt, decrypt, rotate, and read operation is logged to
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono mx-1">phi_access_logs</code> with user identity and timestamp,
                  satisfying HIPAA §164.312(b).
                </p>
                <p>
                  <strong className="text-slate-800">Access Control:</strong> RLS policies restrict PHI access to authenticated organization members only.
                  The pgcrypto functions are restricted to service role.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border-t border-slate-800 py-4 mt-8">
        <div className="max-w-[1600px] mx-auto px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <i className="ri-heart-pulse-line text-teal-400 text-sm"></i>
              <span className="text-xs text-white/40">
                SigmaSense &mdash; Clinical Process Intelligence &bull; Healthcare-specific operational workspace
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-white/30">
              {['Sense', 'Analyze', 'Decide', 'Act', 'Learn'].map((stage, i) => (
                <div key={i} className="flex items-center">
                  <span className={`font-semibold ${i === 0 ? 'text-teal-400' : ''}`}>{stage}</span>
                  {i < 4 && <i className="ri-arrow-right-s-line mx-1 text-white/20 text-xs"></i>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
