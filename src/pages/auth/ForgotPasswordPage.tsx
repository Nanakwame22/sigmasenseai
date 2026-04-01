
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await resetPassword(email);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
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
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-400/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-green-500/10 rounded-full blur-2xl animate-pulse delay-500"></div>
        </div>

        <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-12">
          <div className="w-full max-w-md">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl animate-fade-in-up">
              <div className="text-center">
                {/* Success Icon */}
                <div className="relative mx-auto mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/25 animate-bounce-subtle">
                    <i className="ri-mail-send-line text-3xl text-white"></i>
                  </div>
                  <div className="absolute inset-0 w-20 h-20 border-2 border-emerald-400/30 rounded-full animate-ping"></div>
                </div>

                <h2 className="text-3xl font-bold text-white mb-3">Reset Link Sent!</h2>
                <p className="text-slate-300 mb-6 text-lg leading-relaxed">
                  We've sent a password reset link to<br/>
                  <span className="font-semibold text-emerald-300">{email}</span>
                </p>

                <div className="bg-emerald-500/20 backdrop-blur-sm border border-emerald-500/30 rounded-2xl p-6 mb-6">
                  <div className="flex items-start space-x-3 mb-4">
                    <i className="ri-information-line text-emerald-400 text-lg mt-0.5"></i>
                    <p className="font-semibold text-emerald-200">What happens next:</p>
                  </div>
                  <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside ml-4">
                    <li>Check your email inbox (and spam folder)</li>
                    <li>Click the reset link within 24 hours</li>
                    <li>Create a new secure password</li>
                    <li>Sign in with your new password</li>
                  </ul>
                </div>

                <Link
                  to="/auth/login"
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap inline-block text-center"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <i className="ri-arrow-left-line"></i>
                    <span>Back to Sign In</span>
                  </div>
                </Link>
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
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-orange-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-yellow-500/15 rounded-full blur-2xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-12">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8 animate-fade-in-up">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl mb-6 shadow-2xl shadow-orange-500/25">
              <i className="ri-lock-unlock-line text-2xl text-white"></i>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
              Reset Password
            </h1>
            <p className="text-slate-400 text-lg">We'll send you a secure reset link</p>
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
                    <i className="ri-mail-line text-slate-400 group-focus-within:text-orange-400 transition-colors"></i>
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-slate-400 focus:bg-white/20 focus:border-orange-400/50 focus:ring-4 focus:ring-orange-400/20 outline-none transition-all duration-200"
                    placeholder="you@company.com"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Enter the email address associated with your account
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || success}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-orange-500/25 hover:shadow-orange-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-orange-500/25 transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Sending reset link...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <i className="ri-mail-send-line"></i>
                    <span>Send Reset Link</span>
                  </div>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <Link 
                to="/auth/login" 
                className="inline-flex items-center space-x-2 font-semibold text-white hover:text-orange-300 transition-colors group"
              >
                <i className="ri-arrow-left-line group-hover:-translate-x-0.5 transition-transform"></i>
                <span>Back to Sign In</span>
              </Link>
            </div>
          </div>

          {/* Help Section */}
          <div className="mt-8 text-center animate-fade-in-up delay-500">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="flex items-start space-x-3">
                <i className="ri-question-line text-blue-400 text-lg mt-0.5 flex-shrink-0"></i>
                <div className="text-left">
                  <h3 className="font-semibold text-white mb-2">Need help?</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    If you don't receive the email within a few minutes, check your spam folder or contact our support team.
                  </p>
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
