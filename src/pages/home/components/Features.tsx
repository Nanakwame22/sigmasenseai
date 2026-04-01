import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AnimatedCounter from '../../../components/common/AnimatedCounter';

export default function Features() {
  const navigate = useNavigate();
  const [visibleFeatures, setVisibleFeatures] = useState<number[]>([]);
  const featureRefs = useRef<(HTMLDivElement | null)[]>([]);

  const features = [
    {
      number: '01',
      tag: 'Live Monitoring',
      icon: 'ri-pulse-line',
      title: 'Real-Time Metrics Dashboard',
      description: 'Monitor critical KPIs the moment they shift — before they become problems. Live data feeds, instant alerts, and clean visualizations that tell you exactly what\'s happening.',
      gradient: 'from-teal-500 to-cyan-500',
      accentColor: 'teal',
      link: '/dashboard/metrics',
      bullets: [
        { icon: 'ri-flashlight-line', text: 'Sub-second data refresh across all KPIs' },
        { icon: 'ri-alarm-warning-line', text: 'Automated threshold alerts with smart suppression' },
        { icon: 'ri-bar-chart-grouped-line', text: 'Custom dashboards per team and role' },
      ],
      stats: [
        { label: 'Defect Rate', numValue: 2.3, suffix: '%', decimals: 1, trend: 'down', delta: '↓ 0.8%', color: 'text-teal-600' },
        { label: 'Cycle Time', numValue: 4.2, suffix: 'h', decimals: 1, trend: 'down', delta: '↓ 12%', color: 'text-teal-600' },
        { label: 'Yield', numValue: 97.8, suffix: '%', decimals: 1, trend: 'up', delta: '↑ 3.2%', color: 'text-green-600' },
      ],
      bars: [65, 45, 75, 55, 85, 70, 90, 80, 95, 88, 92, 85],
      imageType: 'dashboard',
    },
    {
      number: '02',
      tag: 'AI Intelligence',
      icon: 'ri-brain-line',
      title: 'AI-Powered Root Cause Analysis',
      description: 'Stop guessing why KPIs are slipping. The AI digs through your data with statistical rigor, surfaces the real drivers, and ranks them by impact — so you fix the right thing first.',
      gradient: 'from-violet-500 to-purple-600',
      accentColor: 'violet',
      link: '/dashboard/root-cause',
      bullets: [
        { icon: 'ri-focus-3-line', text: 'Multi-variable correlation across datasets' },
        { icon: 'ri-shield-check-line', text: 'Statistical confidence scoring per cause' },
        { icon: 'ri-git-branch-line', text: 'Fishbone and fault tree generation' },
      ],
      causes: [
        { rank: 1, label: 'Staff Count Correlation', score: 85 },
        { rank: 2, label: 'Time of Day Pattern', score: 72 },
        { rank: 3, label: 'Department Variance', score: 61 },
      ],
      analysisStats: [
        { label: 'Model Accuracy', numValue: 94.2, suffix: '%', decimals: 1 },
        { label: 'Analysis Time', numValue: 2.1, suffix: 's', decimals: 1 },
      ],
      imageType: 'analysis',
    },
    {
      number: '03',
      tag: 'Predictive Engine',
      icon: 'ri-flask-line',
      title: 'Predictive Simulations',
      description: 'Run thousands of "what if" scenarios before touching a single process. Monte Carlo and discrete event simulations let you see the outcome before you commit.',
      gradient: 'from-orange-500 to-rose-500',
      accentColor: 'orange',
      link: '/dashboard/simulations',
      bullets: [
        { icon: 'ri-loop-right-line', text: '10,000-run Monte Carlo in seconds' },
        { icon: 'ri-line-chart-line', text: 'P50 / P95 / worst-case scenario output' },
        { icon: 'ri-compare-line', text: 'Side-by-side scenario comparison' },
      ],
      simStats: [
        { label: 'Mean', numValue: 32.5, decimals: 1 },
        { label: 'P95', numValue: 45.2, decimals: 1 },
        { label: 'Runs', numValue: 10, suffix: 'K', decimals: 0 },
      ],
      simBars: [20, 35, 50, 70, 85, 95, 90, 75, 55, 40, 25, 15],
      imageType: 'simulation',
    },
    {
      number: '04',
      tag: 'Methodology',
      icon: 'ri-flow-chart',
      title: 'DMAIC Methodology',
      description: 'The gold-standard Six Sigma framework — built into every workflow. Guided phase-by-phase execution means your team follows the right process every time, automatically.',
      gradient: 'from-blue-500 to-sky-500',
      accentColor: 'blue',
      link: '/dashboard/dmaic',
      bullets: [
        { icon: 'ri-map-pin-line', text: 'Phase-gated approvals with sign-off tracking' },
        { icon: 'ri-file-chart-line', text: 'Auto-generated project reports per phase' },
        { icon: 'ri-team-line', text: 'Multi-stakeholder collaboration built-in' },
      ],
      projects: [
        { title: 'Reduce ED Wait Times', progress: 75, status: 'Analyze', color: 'bg-blue-500' },
        { title: 'Improve Lab Yield', progress: 100, status: 'Complete', color: 'bg-green-500' },
      ],
      phases: ['D', 'M', 'A', 'I', 'C'],
      imageType: 'dmaic',
    },
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = featureRefs.current.indexOf(entry.target as HTMLDivElement);
            if (index !== -1 && !visibleFeatures.includes(index)) {
              setVisibleFeatures((prev) => [...prev, index]);
            }
          }
        });
      },
      { threshold: 0.15 }
    );
    featureRefs.current.forEach((ref) => { if (ref) observer.observe(ref); });
    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" className="py-28 bg-gradient-to-b from-white via-slate-50/60 to-white overflow-hidden">
      <div className="w-full px-6 lg:px-16 xl:px-24">

        {/* Section Header */}
        <div className="text-center mb-20 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-200/60 text-teal-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse inline-block"></span>
            Powerful Features
          </div>
          <h2 className="text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 mb-5 leading-tight">
            Real-time intelligence for{' '}
            <span className="bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 bg-clip-text text-transparent">
              mission-critical KPIs
            </span>
          </h2>
          <p className="text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto">
            Monitors live performance, detects variations early, uncovers root causes, predicts the impact of improvements, and automatically protects KPIs.
          </p>
        </div>

        {/* Feature Blocks */}
        <div className="space-y-28 lg:space-y-36">
          {features.map((feature, index) => {
            const isVisible = visibleFeatures.includes(index);
            const isReversed = index % 2 === 1;

            return (
              <div
                key={index}
                ref={(el) => (featureRefs.current[index] = el)}
                className={`transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-14'}`}
              >
                <div className={`grid lg:grid-cols-2 gap-12 xl:gap-20 items-center ${isReversed ? 'lg:grid-flow-dense' : ''}`}>

                  {/* ── Text Side ── */}
                  <div className={`space-y-8 ${isReversed ? 'lg:col-start-2' : ''}`}>
                    <div className="flex items-center gap-4">
                      <span className={`text-xs font-bold tracking-widest uppercase text-${feature.accentColor}-500`}>{feature.number}</span>
                      <div className={`h-px flex-1 max-w-[40px] bg-gradient-to-r ${feature.gradient}`}></div>
                      <span className={`text-xs font-semibold uppercase tracking-widest bg-${feature.accentColor}-50 text-${feature.accentColor}-600 px-3 py-1 rounded-full border border-${feature.accentColor}-200/50`}>{feature.tag}</span>
                    </div>

                    <div>
                      <div className={`w-14 h-14 flex items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient} shadow-lg mb-6`}>
                        <i className={`${feature.icon} text-2xl text-white`}></i>
                      </div>
                      <h3 className="text-3xl xl:text-4xl font-bold text-gray-900 leading-snug mb-4">{feature.title}</h3>
                      <p className="text-lg text-gray-500 leading-relaxed">{feature.description}</p>
                    </div>

                    {/* Bullet points */}
                    <ul className="space-y-3">
                      {feature.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <div className={`w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-br ${feature.gradient} flex-shrink-0 mt-0.5`}>
                            <i className={`${b.icon} text-sm text-white`}></i>
                          </div>
                          <span className="text-gray-600 text-base leading-relaxed pt-1">{b.text}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => navigate(feature.link)}
                      className={`group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${feature.gradient} shadow-md hover:shadow-lg hover:opacity-90 transition-all cursor-pointer whitespace-nowrap`}
                    >
                      Explore Feature
                      <i className="ri-arrow-right-line transition-transform group-hover:translate-x-1"></i>
                    </button>
                  </div>

                  {/* ── Visual Card Side ── */}
                  <div
                    className={`${isReversed ? 'lg:col-start-1 lg:row-start-1' : ''}`}
                    onClick={() => navigate(feature.link)}
                  >
                    <div className="relative cursor-pointer group">
                      {/* Glow layer */}
                      <div className={`absolute -inset-1 bg-gradient-to-br ${feature.gradient} rounded-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-500 blur-xl`}></div>

                      <div className="relative bg-white border border-gray-100/80 rounded-3xl p-7 overflow-hidden transition-all duration-500 group-hover:scale-[1.015] group-hover:border-gray-200">

                        {/* Top bar of card */}
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-400/70"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-400/70"></div>
                            <div className="w-3 h-3 rounded-full bg-green-400/70"></div>
                          </div>
                          <div className={`flex items-center gap-1.5 bg-gradient-to-r ${feature.gradient} text-white text-xs font-semibold px-3 py-1 rounded-full`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse inline-block"></span>
                            Live
                          </div>
                        </div>

                        {/* === Dashboard Visual === */}
                        {feature.imageType === 'dashboard' && (
                          <div className="space-y-5">
                            <div className="grid grid-cols-3 gap-3">
                              {feature.stats?.map((stat, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-2xl bg-gradient-to-br from-slate-50 to-gray-50 border border-gray-100 p-4 transition-all duration-700"
                                  style={{ transitionDelay: `${idx * 100}ms`, opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(12px)' }}
                                >
                                  <div className="text-xs text-gray-400 mb-1.5 font-medium">{stat.label}</div>
                                  <div className="text-2xl font-bold text-gray-900 mb-1">
                                    <AnimatedCounter
                                      value={stat.numValue}
                                      suffix={stat.suffix}
                                      decimals={stat.decimals}
                                      isVisible={isVisible}
                                      delay={idx * 120}
                                      duration={1600}
                                    />
                                  </div>
                                  <div className={`text-xs font-semibold ${stat.color}`}>{stat.delta}</div>
                                </div>
                              ))}
                            </div>
                            <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-gray-50 border border-gray-100 p-5">
                              <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-semibold text-gray-700">KPI Performance Trend</span>
                                <div className="flex items-center gap-1.5">
                                  {['30d', '60d', '90d'].map((t, i) => (
                                    <span key={i} className={`text-xs px-2 py-0.5 rounded-md font-medium cursor-pointer ${i === 2 ? 'bg-teal-500 text-white' : 'text-gray-400 hover:text-gray-600'}`}>{t}</span>
                                  ))}
                                </div>
                              </div>
                              <div className="h-36 flex items-end gap-1">
                                {feature.bars?.map((height, idx) => (
                                  <div
                                    key={idx}
                                    className={`flex-1 bg-gradient-to-t ${feature.gradient} rounded-t-lg transition-all duration-1000`}
                                    style={{ height: isVisible ? `${height}%` : '4%', transitionDelay: `${idx * 50 + 200}ms` }}
                                  ></div>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-2.5 flex-1">
                                <i className="ri-checkbox-circle-line text-green-500"></i>
                                <span className="text-xs font-semibold text-green-700">All alerts nominal</span>
                              </div>
                              <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-4 py-2.5 flex-1">
                                <i className="ri-refresh-line text-teal-500 animate-spin" style={{ animationDuration: '3s' }}></i>
                                <span className="text-xs font-semibold text-teal-700">Live sync active</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* === Root Cause Visual === */}
                        {feature.imageType === 'analysis' && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-3 rounded-2xl bg-violet-50 border border-violet-100 px-5 py-3.5 mb-5">
                              <i className="ri-robot-2-line text-violet-500 text-xl"></i>
                              <div>
                                <div className="text-xs font-bold text-violet-800">AI Analysis Complete</div>
                                <div className="text-xs text-violet-500">3 causal factors identified with statistical significance</div>
                              </div>
                            </div>
                            {feature.causes?.map((cause, idx) => (
                              <div
                                key={idx}
                                className="rounded-2xl bg-gradient-to-br from-slate-50 to-gray-50 border border-gray-100 p-5 transition-all duration-700"
                                style={{ transitionDelay: `${idx * 120}ms`, opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateX(0)' : 'translateX(-16px)' }}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-white text-xs font-bold`}>#{cause.rank}</div>
                                    <span className="text-sm font-semibold text-gray-800">{cause.label}</span>
                                  </div>
                                  <span className="text-sm font-bold text-gray-900">{cause.score}%</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full bg-gradient-to-r ${feature.gradient} rounded-full transition-all duration-1200`}
                                    style={{ width: isVisible ? `${cause.score}%` : '0%', transitionDelay: `${idx * 150 + 300}ms` }}
                                  ></div>
                                </div>
                              </div>
                            ))}
                            <div className="grid grid-cols-2 gap-3 pt-1">
                              {feature.analysisStats?.map((stat, idx) => (
                                <div key={idx} className="rounded-xl bg-slate-50 border border-gray-100 p-3 text-center">
                                  <div className="text-xl font-bold text-gray-900">
                                    <AnimatedCounter
                                      value={stat.numValue}
                                      suffix={stat.suffix}
                                      decimals={stat.decimals}
                                      isVisible={isVisible}
                                      delay={idx * 200 + 400}
                                      duration={1400}
                                    />
                                  </div>
                                  <div className="text-xs text-gray-400 mt-0.5">{stat.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* === Simulation Visual === */}
                        {feature.imageType === 'simulation' && (
                          <div className="space-y-5">
                            <div className="grid grid-cols-3 gap-3">
                              {feature.simStats?.map((stat, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-2xl bg-gradient-to-br from-orange-50 to-rose-50 border border-orange-100/60 p-4 text-center transition-all duration-700"
                                  style={{ transitionDelay: `${idx * 100}ms`, opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(12px)' }}
                                >
                                  <div className="text-xs text-gray-400 mb-1 font-medium">{stat.label}</div>
                                  <div className="text-2xl font-bold text-gray-900">
                                    <AnimatedCounter
                                      value={stat.numValue}
                                      suffix={stat.suffix ?? ''}
                                      decimals={stat.decimals}
                                      isVisible={isVisible}
                                      delay={idx * 120 + 200}
                                      duration={1500}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-gray-50 border border-gray-100 p-5">
                              <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-semibold text-gray-700">Distribution Curve</span>
                                <span className="text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full font-semibold">Complete</span>
                              </div>
                              <div className="h-36 flex items-end gap-1.5 relative">
                                {feature.simBars?.map((height, idx) => (
                                  <div
                                    key={idx}
                                    className={`flex-1 bg-gradient-to-t ${feature.gradient} rounded-t-md transition-all duration-1000 opacity-80`}
                                    style={{ height: isVisible ? `${height}%` : '0%', transitionDelay: `${idx * 50 + 200}ms` }}
                                  ></div>
                                ))}
                              </div>
                              <div className="flex justify-between mt-2">
                                <span className="text-xs text-gray-400">Min: 18.4</span>
                                <span className="text-xs text-gray-400">Max: 51.7</span>
                              </div>
                            </div>
                            <div className="rounded-xl bg-orange-50 border border-orange-100 px-5 py-3 flex items-center gap-3">
                              <i className="ri-speed-up-line text-orange-500 text-xl"></i>
                              <span className="text-xs font-semibold text-orange-700">Scenario A reduces P95 by 28% vs baseline</span>
                            </div>
                          </div>
                        )}

                        {/* === DMAIC Visual === */}
                        {feature.imageType === 'dmaic' && (
                          <div className="space-y-5">
                            {/* Phase pipeline */}
                            <div className="flex items-center gap-1.5 mb-2">
                              {feature.phases?.map((phase, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 flex-1">
                                  <div
                                    className={`flex-1 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-700 ${idx <= 2 ? `bg-gradient-to-br ${feature.gradient} text-white shadow-md` : 'bg-gray-100 text-gray-400'}`}
                                    style={{ transitionDelay: `${idx * 80}ms`, opacity: isVisible ? 1 : 0, transform: isVisible ? 'scale(1)' : 'scale(0.85)' }}
                                  >
                                    {phase}
                                  </div>
                                  {idx < (feature.phases?.length ?? 0) - 1 && (
                                    <i className={`ri-arrow-right-s-line text-sm ${idx < 2 ? 'text-blue-400' : 'text-gray-300'}`}></i>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex items-center gap-3">
                              <i className="ri-map-pin-2-line text-blue-500"></i>
                              <span className="text-xs font-semibold text-blue-700">Currently in Analyze phase — 2 of 5 phases complete</span>
                            </div>
                            <div className="space-y-3">
                              {feature.projects?.map((project, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-2xl bg-gradient-to-br from-slate-50 to-gray-50 border border-gray-100 p-5 transition-all duration-700"
                                  style={{ transitionDelay: `${idx * 150 + 400}ms`, opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateX(0)' : 'translateX(16px)' }}
                                >
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-semibold text-gray-900">{project.title}</span>
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${project.progress === 100 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{project.status}</span>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${project.color} rounded-full transition-all duration-1200`}
                                      style={{ width: isVisible ? `${project.progress}%` : '0%', transitionDelay: `${idx * 200 + 600}ms` }}
                                    ></div>
                                  </div>
                                  <div className="flex justify-between mt-1.5">
                                    <span className="text-xs text-gray-400">{project.progress}% complete</span>
                                    <span className="text-xs text-gray-400">Phase {Math.round(project.progress / 20)} of 5</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
