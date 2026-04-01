
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function ResendConfirmationPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (resendError) throw resendError;
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to resend confirmation email');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* Animated Background Pattern */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
          
          {/* Success Orbs */}
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-green-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-400/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-teal-500/10 rounded-full blur-2xl animate-pulse delay-500"></div>
        </div>

        <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-12">
          <div className="w-full max-w-md">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl animate-fade-in-up">
              <div className="text-center">
                {/* Success Icon with Animation */}
                <div className="relative mx-auto mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/25 animate-bounce-subtle">
                    <i className="ri-mail-send-line text-3xl text-white"></i>
                  </div>
                  {/* Celebration rings */}
                  <div className="absolute inset-0 w-20 h-20 border-2 border-green-400/30 rounded-full animate-ping"></div>
                  <div className="absolute inset-0 w-20 h-20 border-2 border-green-400/20 rounded-full animate-ping delay-75"></div>
                </div>

                <h2 className="text-3xl font-bold text-white mb-3">Email Sent!</h2>
                <p className="text-slate-300 mb-6 text-lg leading-relaxed">
                  We've sent a new confirmation link to<br/>
                  <span className="font-semibold text-green-300">{email}</span>
                </p>

                {/* Important Notice */}
                <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-500/30 rounded-2xl p-6 mb-6 text-left">
                  <div className="flex items-start space-x-3 mb-4">
                    <i className="ri-information-line text-blue-400 text-lg mt-0.5"></i>
                    <p className="font-semibold text-blue-200">Important:</p>
                  </div>
                  <ul className="text-sm text-slate-300 space-y-3">
                    <li className="flex items-start space-x-3">
                      <i className="ri-mail-line text-blue-400 mt-0.5 flex-shrink-0"></i>
                      <span>Check your email inbox and spam folder</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <i className="ri-time-line text-amber-400 mt-0.5 flex-shrink-0"></i>
                      <span>The link expires in 24 hours</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <i className="ri-refresh-line text-green-400 mt-0.5 flex-shrink-0"></i>
                      <span>Only the newest link will work</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <Link
                    to="/auth/login"
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-green-500/25 hover:shadow-green-500/40 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap inline-block text-center"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <i className="ri-arrow-left-line"></i>
                      <span>Back to Sign In</span>
                    </div>
                  </Link>
                  
                  <button
                    onClick={() => {setSuccess(false); setEmail(''); setError('');}}
                    className="w-full bg-white/10 hover:bg-white/20 text-white py-3 rounded-2xl font-medium border border-white/20 hover:border-white/30 transition-all duration-200"
                  >
                    Send to Different Email
                  </button>
                </div>
              </div>
            </div>

            {/* Troubleshooting */}
            <div className="mt-8 animate-fade-in-up delay-500">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-start space-x-3">
                  <i className="ri-question-line text-yellow-400 text-lg mt-0.5 flex-shrink-0"></i>
                  <div className="text-left">
                    <h3 className="font-semibold text-white mb-2">Still not receiving emails?</h3>
                    <p className="text-sm text-slate-300 leading-relaxed mb-3">
                      Try these troubleshooting steps:
                    </p>
                    <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside ml-4">
                      <li>Check your spam/junk folder</li>
                      <li>Add noreply@yourdomain.com to your contacts</li>
                      <li>Try a different email address</li>
                      <li>Contact our support team if issues persist</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes bounce-subtle {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
          
          .animate-bounce-subtle {
            animation: bounce-subtle 2s ease-in-out infinite;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Animated Background Pattern */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        
        {/* Floating Orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/15 rounded-full blur-2xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-12">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8 animate-fade-in-up">
            <div className="relative mx-auto mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/25">
                <i className="ri-mail-line text-2xl text-white"></i>
              </div>
              {/* Animated rings around icon */}
              <div className="absolute inset-0 w-16 h-16 border-2 border-indigo-400/20 rounded-2xl animate-ping delay-1000"></div>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
              Resend Confirmation
            </h1>
            <p className="text-slate-400 text-lg">Get a fresh confirmation link in your inbox</p>
          </div>

          {/* Auth Card */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl animate-fade-in-up delay-200">
            {error && (
              <div className="mb-6 p-4 bg-red-500/20 backdrop-blur-sm border border-red-500/30 rounded-2xl animate-shake">
                <div className="flex items-start space-x-3">
                  <i className="ri-error-warning-line text-red-400 text-lg mt-0.5 flex-shrink-0"></i>
                  <p className="text-red-200 text-sm leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-semibold text-white/90">
                  Email Address
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="ri-mail-line text-slate-400 group-focus-within:text-indigo-400 transition-colors"></i>
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-slate-400 focus:bg-white/20 focus:border-indigo-400/50 focus:ring-4 focus:ring-indigo-400/20 outline-none transition-all duration-200"
                    placeholder="you@company.com"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Enter the email you used when signing up
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-indigo-500/25 transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Sending confirmation...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <i className="ri-mail-send-line"></i>
                    <span>Resend Confirmation Email</span>
                  </div>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <Link 
                to="/auth/login" 
                className="inline-flex items-center space-x-2 font-semibold text-white hover:text-indigo-300 transition-colors group"
              >
                <i className="ri-arrow-left-line group-hover:-translate-x-0.5 transition-transform"></i>
                <span>Back to Sign In</span>
              </Link>
            </div>
          </div>

          {/* Why Confirm Section */}
          <div className="mt-8 animate-fade-in-up delay-500">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="flex items-start space-x-3">
                <i className="ri-shield-check-line text-green-400 text-lg mt-0.5 flex-shrink-0"></i>
                <div className="text-left">
                  <h3 className="font-semibold text-white mb-2">Why confirm your email?</h3>
                  <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside ml-4">
                    <li>Secure your account and data</li>
                    <li>Receive important system notifications</li>
                    <li>Enable password reset functionality</li>
                    <li>Get product updates and insights</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
        }
        
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        
        .delay-200 {
          animation-delay: 200ms;
        }
        
        .delay-500 {
          animation-delay: 500ms;
        }
      `}</style>
    </div>
  );
}
