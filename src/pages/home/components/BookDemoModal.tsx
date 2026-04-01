import { useState } from 'react';

interface BookDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CALENDLY_URL = 'https://calendly.com/your-team/demo';

export default function BookDemoModal({ isOpen, onClose }: BookDemoModalProps) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'form'>('calendar');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [charCount, setCharCount] = useState(0);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const message = (form.elements.namedItem('message') as HTMLTextAreaElement)?.value ?? '';
    if (message.length > 500) return;

    setIsSubmitting(true);
    const data = new FormData(form);
    const params = new URLSearchParams();
    data.forEach((value, key) => params.append(key, value as string));

    try {
      await fetch('https://readdy.ai/api/form/d6otaj539lnhn4hh1gv0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto animate-fade-in flex flex-col">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-8 py-5 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-teal-50 rounded-lg flex items-center justify-center">
              <i className="ri-calendar-schedule-line text-teal-600 text-lg"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Book a Demo</h2>
              <p className="text-xs text-gray-500">Pick a time or send us a message</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-8 pt-5 pb-0">
          <div className="flex space-x-1 bg-gray-100 rounded-full p-1 w-fit">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-5 py-1.5 rounded-full text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'calendar'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="flex items-center space-x-1.5">
                <i className="ri-calendar-2-line"></i>
                <span>Pick a Time</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('form')}
              className={`px-5 py-1.5 rounded-full text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'form'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="flex items-center space-x-1.5">
                <i className="ri-mail-send-line"></i>
                <span>Send a Message</span>
              </span>
            </button>
          </div>
        </div>

        <div className="px-8 py-6 flex-1">

          {/* ── CALENDAR TAB ── */}
          {activeTab === 'calendar' && (
            <div className="flex flex-col">
              <p className="text-sm text-gray-500 mb-4">
                Choose a date and time that works for you. A SigmaSense expert will join the call.
              </p>

              {/* Calendly inline embed */}
              <div className="rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                <iframe
                  src={`${CALENDLY_URL}?embed_type=Inline&hide_event_type_details=1&hide_gdpr_banner=1&primary_color=0d9488`}
                  width="100%"
                  height="620"
                  frameBorder="0"
                  title="Schedule a Demo"
                  className="block"
                />
              </div>

              {/* Fallback hint */}
              <p className="text-xs text-center text-gray-400 mt-3">
                Calendar not loading?{' '}
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-600 hover:underline cursor-pointer"
                >
                  Open in a new tab
                </a>
                {' '}or{' '}
                <button
                  onClick={() => setActiveTab('form')}
                  className="text-teal-600 hover:underline cursor-pointer"
                >
                  send us a message instead
                </button>.
              </p>
            </div>
          )}

          {/* ── FORM TAB ── */}
          {activeTab === 'form' && (
            <>
              {submitted ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="ri-check-double-line text-teal-600 text-3xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">You're all set!</h3>
                  <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                    Thanks for your interest. A SigmaSense expert will contact you within 1 business day to schedule your personalized demo.
                  </p>
                  <button
                    onClick={onClose}
                    className="px-6 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-all cursor-pointer whitespace-nowrap"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form
                  data-readdy-form
                  id="book-demo-form"
                  onSubmit={handleSubmit}
                  className="space-y-5"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="first_name"
                        required
                        placeholder="Jane"
                        className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="last_name"
                        required
                        placeholder="Smith"
                        className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Work Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="jane@company.com"
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Company <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="company"
                        required
                        placeholder="Acme Corp"
                        className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Job Title
                      </label>
                      <input
                        type="text"
                        name="job_title"
                        placeholder="Operations Manager"
                        className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
                      <select
                        name="industry"
                        className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all bg-white cursor-pointer"
                      >
                        <option value="">Select industry</option>
                        <option value="Manufacturing">Manufacturing</option>
                        <option value="Healthcare">Healthcare</option>
                        <option value="Supply Chain & Logistics">Supply Chain &amp; Logistics</option>
                        <option value="Retail & E-Commerce">Retail &amp; E-Commerce</option>
                        <option value="Finance & Banking">Finance &amp; Banking</option>
                        <option value="SaaS & IT">SaaS &amp; IT</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Team Size</label>
                      <select
                        name="team_size"
                        className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all bg-white cursor-pointer"
                      >
                        <option value="">Select size</option>
                        <option value="1-10">1–10</option>
                        <option value="11-50">11–50</option>
                        <option value="51-200">51–200</option>
                        <option value="201-1000">201–1,000</option>
                        <option value="1000+">1,000+</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Preferred Demo Date
                    </label>
                    <input
                      type="date"
                      name="preferred_date"
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      What would you like to see in the demo?
                    </label>
                    <textarea
                      name="message"
                      rows={3}
                      maxLength={500}
                      placeholder="e.g. We want to reduce defect rates in our manufacturing line..."
                      onChange={(e) => setCharCount(e.target.value.length)}
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all resize-none"
                    />
                    <p className={`text-xs mt-1 text-right ${charCount > 480 ? 'text-red-500' : 'text-gray-400'}`}>
                      {charCount}/500
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || charCount > 500}
                    className="w-full py-3 bg-gradient-to-r from-teal-600 to-teal-500 text-white rounded-lg text-sm font-bold hover:from-teal-700 hover:to-teal-600 transition-all shadow-lg shadow-teal-600/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center justify-center space-x-2"
                  >
                    {isSubmitting ? (
                      <>
                        <i className="ri-loader-4-line animate-spin"></i>
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <>
                        <i className="ri-calendar-check-line"></i>
                        <span>Request My Demo</span>
                      </>
                    )}
                  </button>

                  <p className="text-xs text-center text-gray-400">
                    No credit card required &middot; We respect your privacy
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        .animate-fade-in { animation: fade-in 0.25s ease-out both; }
      `}</style>
    </div>
  );
}
