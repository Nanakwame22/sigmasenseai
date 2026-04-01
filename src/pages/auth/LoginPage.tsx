import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) throw signInError;
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Column - Value Proposition */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 p-16 flex-col justify-between relative overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-sapphire-600/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-ai-400/10 rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center">
              <img 
                src="https://static.readdy.ai/image/e0eaba904d3ab93af6bd7d79a7618802/315afdeb7baeedd8ffa62425df2dc4e4.png" 
                alt="SigmaSense Logo" 
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">
              sigmaSense<span className="text-ai-400">AI</span>
            </span>
          </Link>

          {/* Value Proposition */}
          <div className="mt-24 space-y-8">
            <div>
              <h1 className="text-4xl font-bold text-white leading-tight mb-4">
                Welcome Back to
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sapphire-400 to-ai-400">
                  Intelligent Analytics
                </span>
              </h1>
              <p className="text-lg text-brand-300 leading-relaxed">
                Continue driving operational excellence with AI-powered insights and decision support.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white/5 backdrop-blur-sm rounded-premium p-4 border border-white/10">
                <div className="text-3xl font-bold text-white mb-1">99.9%</div>
                <div className="text-sm text-brand-300">Uptime SLA</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-premium p-4 border border-white/10">
                <div className="text-3xl font-bold text-white mb-1">24/7</div>
                <div className="text-sm text-brand-300">Support</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-premium p-4 border border-white/10">
                <div className="text-3xl font-bold text-white mb-1">SOC 2</div>
                <div className="text-sm text-brand-300">Certified</div>
              </div>
            </div>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="relative z-10">
          <p className="text-brand-400 text-sm mb-4">Trusted by leading organizations</p>
          <div className="flex items-center gap-8 opacity-60">
            <div className="text-white font-semibold text-lg">Fortune 500</div>
            <div className="text-white font-semibold text-lg">Healthcare</div>
            <div className="text-white font-semibold text-lg">Manufacturing</div>
          </div>
        </div>
      </div>

      {/* Right Column - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <Link to="/" className="lg:hidden inline-flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-gradient-to-br from-sapphire-500 to-ai-400 rounded-lg flex items-center justify-center shadow-elevation-2">
              <i className="ri-line-chart-line text-white text-xl"></i>
            </div>
            <span className="text-2xl font-bold text-brand-900 tracking-tight">
              sigmaSense<span className="text-sapphire-600">AI</span>
            </span>
          </Link>

          {/* Form Header */}
          <div className="mb-10">
            <h2 className="text-3xl font-bold text-text-primary mb-2 tracking-tight">
              Sign in to your account
            </h2>
            <p className="text-text-secondary">
              Access your analytics dashboard and insights
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-premium">
              <div className="flex items-start gap-3">
                <i className="ri-error-warning-line text-red-600 text-lg flex-shrink-0 mt-0.5"></i>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full mb-6 px-6 py-3.5 bg-white border-2 border-border rounded-premium text-text-primary font-medium hover:bg-brand-50 hover:border-brand-300 transition-all duration-200 flex items-center justify-center gap-3 shadow-elevation-1 hover:shadow-elevation-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-background text-text-secondary">Or continue with email</span>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 bg-white border border-border rounded-premium text-text-primary placeholder-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-sapphire-500 focus:border-transparent transition-all shadow-elevation-1"
                placeholder="john@company.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-text-primary">
                  Password
                </label>
                <Link
                  to="/auth/forgot-password"
                  className="text-sm text-sapphire-600 hover:text-sapphire-700 font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 bg-white border border-border rounded-premium text-text-primary placeholder-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-sapphire-500 focus:border-transparent transition-all shadow-elevation-1"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3.5 bg-sapphire-600 text-white font-semibold rounded-premium hover:bg-sapphire-700 focus:outline-none focus:ring-2 focus:ring-sapphire-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-elevation-2 hover:shadow-glow-md hover:-translate-y-0.5 whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Signup Link */}
          <div className="mt-8 text-center">
            <p className="text-sm text-text-secondary">
              Don't have an account?{' '}
              <Link
                to="/auth/signup"
                className="text-sapphire-600 hover:text-sapphire-700 font-semibold"
              >
                Start free trial
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
