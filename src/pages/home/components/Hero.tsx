import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function Hero() {
  const [currentStat, setCurrentStat] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [counts, setCounts] = useState({ defect: 0, cycle: 0, yield: 0, oee: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);

  const stats = [
    { value: '47%', label: 'Average Defect Reduction' },
    { value: '60%', label: 'Faster Project Completion' },
    { value: '$2.4B+', label: 'Total Cost Savings' },
    { value: '5,000+', label: 'Active Projects' },
  ];

  useEffect(() => {
    setIsVisible(true);
    const interval = setInterval(() => {
      setCurrentStat((prev) => (prev + 1) % stats.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isVisible) {
      const duration = 2000;
      const steps = 60;
      const stepDuration = duration / steps;
      let step = 0;
      const timer = setInterval(() => {
        step++;
        const progress = step / steps;
        setCounts({
          defect: Math.floor(2.3 * progress * 10) / 10,
          cycle: Math.floor(4.2 * progress * 10) / 10,
          yield: Math.floor(97.8 * progress * 10) / 10,
          oee: Math.floor(89.5 * progress * 10) / 10,
        });
        if (step >= steps) clearInterval(timer);
      }, stepDuration);
      return () => clearInterval(timer);
    }
  }, [isVisible]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  const companies = [
    'Mayo Clinic', 'Cleveland Clinic', 'Kaiser Permanente', 'Johns Hopkins Medicine',
    'HCA Healthcare', 'Mass General Brigham', 'Ascension Health', 'Northwell Health',
    'CommonSpirit Health', 'Intermountain Health', 'Providence Health', 'Tenet Healthcare',
  ];

  return (
    <>
      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="relative min-h-screen overflow-hidden flex items-center pt-16">

        {/* Video Background */}
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          src="https://storage.readdy-site.link/project_files/4a603193-9173-4b25-a6df-3423147d42af/603ee439-02ba-4ed3-a91e-1d6a6a0b5e3d_VID_20260327091058022.mp4?v=2ca3e3120e24d2315d5906647f075fe1"
        />

        {/* Layered Overlays – cinematic dark gradient */}
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

        {/* Noise texture for premium feel */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")' }}
        />

        {/* Content */}
        <div className="relative z-10 w-full px-6 lg:px-16 xl:px-24 py-20">
          <div className="max-w-[1600px] mx-auto grid lg:grid-cols-2 gap-16 xl:gap-28 items-center">

            {/* ── Left Column ── */}
            <div
              className={`space-y-8 transition-all duration-1000 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              {/* Badge */}
              <div className="inline-flex items-center space-x-2 bg-white/10 backdrop-blur-sm text-white/90 px-4 py-2 rounded-full border border-white/20">
                <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium whitespace-nowrap tracking-wide">AI-Powered Six Sigma Platform</span>
              </div>

              {/* Headline */}
              <h1 className="font-display text-5xl lg:text-6xl xl:text-7xl leading-tight tracking-tight text-white">
                Scale your analytics
                <span className="block mt-2 bg-gradient-to-r from-teal-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                  without hiring
                </span>
              </h1>

              {/* Sub-headline */}
              <p className="text-lg lg:text-xl text-white/75 leading-relaxed max-w-lg">
                SigmaSense <strong className="text-white/95">senses, analyzes, predicts, and corrects</strong> performance in real time — so your team focuses on outcomes, not spreadsheets.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap gap-4 pt-2">
                <Link
                  to="/auth/signup"
                  className="group inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-gray-900 bg-white hover:bg-gray-100 rounded-xl transition-all shadow-xl hover:shadow-2xl cursor-pointer whitespace-nowrap"
                >
                  <span>Start Free Trial</span>
                  <i className="ri-arrow-right-line ml-2 transition-transform group-hover:translate-x-1" />
                </Link>
                <button
                  onClick={() => scrollToSection('how-it-works')}
                  className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-all border border-white/25 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-play-circle-line mr-2 text-teal-300" />
                  See How It Works
                </button>
              </div>

              {/* Trust chips */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                {[
                  { icon: 'ri-shield-check-line', label: 'SOC 2 Compliant' },
                  { icon: 'ri-lock-line', label: 'HIPAA Ready' },
                  { icon: 'ri-star-line', label: '4.9/5 Rating' },
                ].map((chip) => (
                  <div key={chip.label} className="flex items-center space-x-2 text-white/60 text-sm">
                    <i className={`${chip.icon} text-teal-400`} />
                    <span>{chip.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right Column – Metric Dashboard Card ── */}
            <div
              className={`relative transition-all duration-1000 delay-300 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
              }`}
            >
              {/* Glass card */}
              <div className="relative bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">

                {/* Card header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/15">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-teal-500/30 rounded-lg flex items-center justify-center border border-teal-400/40">
                      <i className="ri-dashboard-3-line text-teal-300 text-base" />
                    </div>
                    <span className="text-white font-semibold text-sm">Live Operations Dashboard</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-white/60 text-xs">Real-time</span>
                  </div>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {[
                    { label: 'Defect Rate', value: counts.defect, unit: '%', change: '-12%', icon: 'ri-bug-line', color: 'text-rose-300' },
                    { label: 'Cycle Time', value: counts.cycle, unit: 'h', change: '-8%', icon: 'ri-time-line', color: 'text-amber-300' },
                    { label: 'Yield Rate', value: counts.yield, unit: '%', change: '+5%', icon: 'ri-seedling-line', color: 'text-emerald-300' },
                    { label: 'OEE Score', value: counts.oee, unit: '%', change: '+3%', icon: 'ri-speed-up-line', color: 'text-teal-300' },
                  ].map((kpi, idx) => (
                    <div key={idx} className="bg-white/8 backdrop-blur-sm rounded-2xl p-4 border border-white/15 hover:bg-white/15 transition-all duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <i className={`${kpi.icon} ${kpi.color} text-base`} />
                        <span className="text-green-400 text-xs font-semibold">{kpi.change}</span>
                      </div>
                      <div className="text-white text-2xl font-bold">
                        {kpi.value.toFixed(1)}{kpi.unit}
                      </div>
                      <div className="text-white/50 text-xs mt-1">{kpi.label}</div>
                    </div>
                  ))}
                </div>

                {/* Sparkline bars */}
                <div className="bg-white/8 rounded-2xl p-4 border border-white/15 mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-white/80 text-xs font-semibold">Performance Trend</span>
                    <span className="text-teal-300 text-xs">↑ 18% this month</span>
                  </div>
                  <div className="flex items-end gap-1 h-14">
                    {[35, 42, 38, 55, 50, 62, 58, 70, 65, 78, 74, 85, 80, 92].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-sm bg-gradient-to-t from-teal-500/80 to-teal-300/60 transition-all duration-700"
                        style={{
                          height: isVisible ? `${h}%` : '0%',
                          transitionDelay: `${i * 40 + 600}ms`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Active AI alerts */}
                <div className="space-y-2">
                  {[
                    { label: 'Root cause detected on Line 3', type: 'AI', color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
                    { label: 'DMAIC project 94% complete', type: 'Progress', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
                    { label: 'Defect spike predicted in 4 h', type: 'Alert', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
                  ].map((alert, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${alert.color} transition-all duration-500`}
                      style={{
                        opacity: isVisible ? 1 : 0,
                        transitionDelay: `${i * 150 + 1200}ms`,
                      }}
                    >
                      <span>{alert.label}</span>
                      <span className="font-bold ml-2 whitespace-nowrap">{alert.type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rotating stat pill – floats above card */}
              <div
                className="absolute -top-5 left-1/2 -translate-x-1/2 bg-white/15 backdrop-blur-xl border border-white/30 rounded-full px-6 py-2.5 shadow-xl transition-all duration-700"
                style={{ opacity: isVisible ? 1 : 0 }}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl font-bold text-white">{stats[currentStat].value}</span>
                  <span className="text-white/65 text-sm whitespace-nowrap">{stats[currentStat].label}</span>
                  <div className="flex space-x-1 ml-1">
                    {stats.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentStat(i)}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${
                          currentStat === i ? 'bg-teal-400 w-5' : 'bg-white/30 w-1.5'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom fade-to-white transition */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white/10 to-transparent pointer-events-none" />
      </section>

      {/* ── TRUSTED COMPANIES ───────────────────────────── */}
      <section className="py-16 bg-gray-50 relative overflow-hidden">
        <div className="max-w-[1440px] mx-auto px-8 lg:px-12">
          <div className="text-center mb-12">
            <p className="text-sm text-gray-500 font-medium">Trusted by industry leaders worldwide</p>
          </div>
          <div className="relative overflow-hidden">
            <div className="company-scroll flex items-center gap-12">
              {companies.map((company, index) => (
                <div
                  key={`first-${index}`}
                  className="flex-shrink-0 bg-white px-10 py-5 rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-300 cursor-pointer hover:scale-105"
                >
                  <span className="text-xl font-bold text-gray-700 whitespace-nowrap">{company}</span>
                </div>
              ))}
              {companies.map((company, index) => (
                <div
                  key={`second-${index}`}
                  className="flex-shrink-0 bg-white px-10 py-5 rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-300 cursor-pointer hover:scale-105"
                >
                  <span className="text-xl font-bold text-gray-700 whitespace-nowrap">{company}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes scroll-horizontal {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .company-scroll {
            animation: scroll-horizontal 40s linear infinite;
          }
          .company-scroll:hover {
            animation-play-state: paused;
          }
        `}</style>
      </section>
    </>
  );
}
