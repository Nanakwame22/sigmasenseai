import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface TourHeroProps {
  totalModules: number;
  activeIndex: number;
}

export default function TourHero({ totalModules, activeIndex }: TourHeroProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const progress = ((activeIndex + 1) / totalModules) * 100;

  return (
    <section className="relative bg-gradient-to-br from-gray-950 via-gray-900 to-teal-950 overflow-hidden pt-20">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-400/8 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}></div>
      </div>

      <div className="relative w-full px-6 lg:px-12 xl:px-16 2xl:px-24 py-20 text-center">
        <div className={`transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500/15 border border-teal-400/30 rounded-full text-teal-300 text-sm font-medium mb-8">
            <i className="ri-play-circle-line text-base"></i>
            Interactive Product Tour
            <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse"></span>
          </div>

          <h1 className="text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight tracking-tight">
            See Every Module in Action
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Walk through all 10 powerful modules of SigmaSenseAI — from AI intelligence
            to HIPAA-compliant clinical analytics. No login required.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              to="/auth/signup"
              className="px-8 py-3.5 bg-gradient-to-r from-teal-500 to-teal-400 text-white font-bold rounded-xl hover:from-teal-400 hover:to-teal-300 transition-all duration-200 cursor-pointer whitespace-nowrap shadow-xl shadow-teal-500/25"
            >
              Start Free — No Credit Card
            </Link>
            <a
              href="#tour-modules"
              className="px-8 py-3.5 bg-white/10 text-white font-semibold rounded-xl border border-white/20 hover:bg-white/15 transition-all duration-200 cursor-pointer whitespace-nowrap"
            >
              Explore Modules
            </a>
          </div>
        </div>

        {/* Stats Row */}
        <div className={`mt-16 grid grid-cols-2 lg:grid-cols-4 gap-6 transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {[
            { value: '10', label: 'Core Modules', icon: 'ri-grid-line' },
            { value: '50+', label: 'Analytics Tools', icon: 'ri-bar-chart-grouped-line' },
            { value: '99.9%', label: 'Uptime SLA', icon: 'ri-shield-check-line' },
            { value: 'HIPAA', label: 'Compliant', icon: 'ri-lock-2-line' },
          ].map((stat, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-center">
              <div className="w-10 h-10 flex items-center justify-center mx-auto mb-3 bg-teal-500/20 rounded-xl">
                <i className={`${stat.icon} text-teal-400 text-xl`}></i>
              </div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-sm text-white/50 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mt-12 max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white/40 font-medium uppercase tracking-wider">Tour Progress</span>
            <span className="text-xs text-teal-400 font-semibold">{activeIndex + 1} / {totalModules} modules</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>
    </section>
  );
}
