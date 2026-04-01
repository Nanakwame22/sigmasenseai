import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const industries = [
  { label: 'Healthcare', icon: 'ri-hospital-line' },
  { label: 'Manufacturing', icon: 'ri-factory-line' },
  { label: 'Technology', icon: 'ri-computer-line' },
  { label: 'Finance', icon: 'ri-bank-line' },
  { label: 'Retail', icon: 'ri-store-line' },
  { label: 'Logistics', icon: 'ri-truck-line' },
  { label: 'Energy', icon: 'ri-flashlight-line' },
  { label: 'Other', icon: 'ri-more-line' },
];

const steps = [
  { num: 1, label: 'Organization', icon: 'ri-building-line' },
  { num: 2, label: 'Industry', icon: 'ri-briefcase-line' },
  { num: 3, label: 'Location', icon: 'ri-map-pin-line' },
];

const featureHighlights = [
  { icon: 'ri-brain-line', text: 'AI-powered operational intelligence' },
  { icon: 'ri-shield-check-line', text: 'HIPAA-compliant data handling' },
  { icon: 'ri-bar-chart-grouped-line', text: 'Real-time KPI monitoring' },
  { icon: 'ri-flow-chart', text: 'Six Sigma DMAIC methodology' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, setCurrentOrganization } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    organizationName: '',
    industry: '',
    locationName: '',
    department: '',
    address: '',
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
    setError('');
  };

  const handleNext = () => {
    if (step === 1 && !formData.organizationName.trim()) {
      setError('Organization name is required');
      return;
    }
    if (step === 2 && !formData.industry) {
      setError('Please select an industry');
      return;
    }
    if (step === 3 && !formData.locationName.trim()) {
      setError('Location name is required');
      return;
    }
    setStep(step + 1);
    setError('');
  };

  const handleBack = () => {
    setStep(step - 1);
    setError('');
  };

  const handleCreateOrganization = async () => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: formData.organizationName, industry: formData.industry })
        .select()
        .single();

      if (orgError) throw orgError;

      const { error: userOrgError } = await supabase
        .from('user_organizations')
        .insert({ user_id: user.id, organization_id: orgData.id, role: 'admin' });

      if (userOrgError) throw userOrgError;

      if (formData.locationName) {
        const { error: locationError } = await supabase
          .from('locations')
          .insert({
            organization_id: orgData.id,
            name: formData.locationName,
            department: formData.department || null,
            address: formData.address || null,
          });
        if (locationError) throw locationError;
      }

      setCurrentOrganization(orgData, 'admin');
      navigate('/dashboard');
    } catch (err: unknown) {
      console.error('Error creating organization:', err);
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex w-[420px] flex-shrink-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden flex-col justify-between p-10">
        {/* Decorative circles */}
        <div className="absolute top-[-60px] right-[-60px] w-64 h-64 rounded-full bg-teal-500/10"></div>
        <div className="absolute bottom-[-40px] left-[-40px] w-48 h-48 rounded-full bg-teal-400/8"></div>
        <div className="absolute top-1/2 left-[-30px] w-32 h-32 rounded-full bg-teal-600/10"></div>

        {/* Logo */}
        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl flex items-center justify-center">
              <i className="ri-line-chart-line text-white text-xl"></i>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">SigmaSense</span>
          </Link>

          <div className="mb-10">
            <h2 className="text-3xl font-bold text-white mb-3 leading-tight">
              Set up your<br />workspace
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              You're just a few steps away from your operational intelligence dashboard.
            </p>
          </div>

          {/* Step tracker */}
          <div className="space-y-3 mb-10">
            {steps.map((s) => (
              <div
                key={s.num}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  step === s.num
                    ? 'bg-teal-500/20 border border-teal-500/40'
                    : step > s.num
                    ? 'opacity-60'
                    : 'opacity-30'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  step > s.num
                    ? 'bg-teal-500 text-white'
                    : step === s.num
                    ? 'bg-teal-400/30 text-teal-300 border border-teal-400/50'
                    : 'bg-slate-700 text-slate-500'
                }`}>
                  {step > s.num ? <i className="ri-check-line"></i> : s.num}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${step >= s.num ? 'text-white' : 'text-slate-600'}`}>
                    {s.label}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Feature highlights */}
          <div className="space-y-3">
            {featureHighlights.map((f) => (
              <div key={f.text} className="flex items-center gap-3">
                <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-teal-500/15 flex-shrink-0">
                  <i className={`${f.icon} text-teal-400 text-sm`}></i>
                </div>
                <span className="text-slate-400 text-xs">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-slate-600 text-xs">
          &copy; {new Date().getFullYear()} SigmaSense. All rights reserved.
        </p>
      </div>

      {/* Right Panel — Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-lg">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl flex items-center justify-center">
              <i className="ri-line-chart-line text-white"></i>
            </div>
            <span className="text-lg font-bold text-slate-900">SigmaSense</span>
          </div>

          {/* Progress bar — mobile */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            {steps.map((s, idx) => (
              <div key={s.num} className="flex items-center flex-1">
                <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  step > s.num ? 'bg-teal-500' : step === s.num ? 'bg-teal-400' : 'bg-slate-200'
                }`}></div>
                {idx < steps.length - 1 && <div className="w-1"></div>}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {step === 1 && (
                <div>
                  <div className="mb-8">
                    <div className="inline-flex w-12 h-12 items-center justify-center bg-teal-50 border border-teal-100 rounded-2xl mb-4">
                      <i className="ri-building-line text-teal-600 text-xl"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">Create your organization</h1>
                    <p className="text-slate-500 text-sm">This is the workspace your whole team will use.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Organization Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.organizationName}
                      onChange={(e) => handleInputChange('organizationName', e.target.value)}
                      placeholder="e.g., Memorial Health System"
                      className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all placeholder:text-slate-400"
                      autoFocus
                    />
                    <p className="text-xs text-slate-400 mt-2">
                      Use your company&apos;s full legal name or a recognizable brand name.
                    </p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div className="mb-8">
                    <div className="inline-flex w-12 h-12 items-center justify-center bg-teal-50 border border-teal-100 rounded-2xl mb-4">
                      <i className="ri-briefcase-line text-teal-600 text-xl"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">Select your industry</h1>
                    <p className="text-slate-500 text-sm">We&apos;ll tailor your dashboard, KPIs, and templates to your sector.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {industries.map((ind) => (
                      <button
                        key={ind.label}
                        onClick={() => handleInputChange('industry', ind.label)}
                        className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-200 cursor-pointer whitespace-nowrap ${
                          formData.industry === ind.label
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${
                          formData.industry === ind.label ? 'bg-teal-100' : 'bg-slate-100'
                        }`}>
                          <i className={`${ind.icon} text-sm ${
                            formData.industry === ind.label ? 'text-teal-600' : 'text-slate-500'
                          }`}></i>
                        </div>
                        <span className={`text-sm font-semibold ${
                          formData.industry === ind.label ? 'text-teal-700' : 'text-slate-700'
                        }`}>
                          {ind.label}
                        </span>
                        {formData.industry === ind.label && (
                          <i className="ri-check-line text-teal-600 text-sm ml-auto"></i>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <div className="mb-8">
                    <div className="inline-flex w-12 h-12 items-center justify-center bg-teal-50 border border-teal-100 rounded-2xl mb-4">
                      <i className="ri-map-pin-line text-teal-600 text-xl"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">Add your first location</h1>
                    <p className="text-slate-500 text-sm">You can add more facilities and departments after setup.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Location Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.locationName}
                        onChange={(e) => handleInputChange('locationName', e.target.value)}
                        placeholder="e.g., Main Campus, Factory A, HQ"
                        className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all placeholder:text-slate-400"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Department <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={formData.department}
                        onChange={(e) => handleInputChange('department', e.target.value)}
                        placeholder="e.g., Emergency, Operations, Production"
                        className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Address <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        value={formData.address}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        placeholder="Enter full street address"
                        rows={3}
                        maxLength={500}
                        className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none placeholder:text-slate-400"
                      ></textarea>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl"
            >
              <i className="ri-error-warning-line text-red-500 flex-shrink-0"></i>
              <p className="text-sm text-red-600">{error}</p>
            </motion.div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <button
                onClick={handleBack}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <i className="ri-arrow-left-line"></i>
                Back
              </button>
            )}

            {step < 3 ? (
              <button
                onClick={handleNext}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all cursor-pointer whitespace-nowrap"
              >
                Continue
                <i className="ri-arrow-right-line"></i>
              </button>
            ) : (
              <button
                onClick={handleCreateOrganization}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                {loading ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    Creating workspace...
                  </>
                ) : (
                  <>
                    <i className="ri-rocket-line"></i>
                    Launch Dashboard
                  </>
                )}
              </button>
            )}
          </div>

          {/* Step indicator — desktop */}
          <div className="hidden lg:flex items-center justify-center gap-2 mt-6">
            {steps.map((s) => (
              <div
                key={s.num}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  step === s.num ? 'w-6 bg-teal-500' : step > s.num ? 'w-3 bg-teal-300' : 'w-3 bg-slate-200'
                }`}
              ></div>
            ))}
            <span className="text-xs text-slate-400 ml-2">Step {step} of {steps.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
