import { useState, useEffect, useRef } from 'react';
import AnimatedCounter from '../../../components/common/AnimatedCounter';

export default function Testimonials() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setIsVisible(true);
      },
      { threshold: 0.15 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const stats = [
    { numValue: 5000, prefix: '',  suffix: '+',  decimals: 0, label: 'Active Projects' },
    { numValue: 47,   prefix: '',  suffix: '%',  decimals: 0, label: 'Avg. Improvement' },
    { numValue: 2.4,  prefix: '$', suffix: 'B+', decimals: 1, label: 'Total Savings' },
    { numValue: 98,   prefix: '',  suffix: '%',  decimals: 0, label: 'Customer Satisfaction' },
  ];

  return (
    <section
      id="testimonials"
      ref={sectionRef}
      className="relative overflow-hidden py-32"
    >
      {/* ── Video background ── */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        src="https://storage.readdy-site.link/project_files/4a603193-9173-4b25-a6df-3423147d42af/8b93621c-0d06-44c3-953e-35c286870545_202603270937.mp4?v=7d8724f665454c9f0ca7152992ae9631"
      />

      {/* ── Cinematic overlay stack ── */}
      {/* Deep base */}
      <div className="absolute inset-0 bg-black/65" />
      {/* Top-to-bottom fade so it connects to surrounding sections */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />
      {/* Subtle warm tint that echoes the brand's orange accent */}
      <div className="absolute inset-0 bg-gradient-to-tr from-orange-900/20 via-transparent to-transparent" />

      {/* ── Content ── */}
      <div className="relative z-10 w-full px-6 lg:px-12 max-w-5xl mx-auto">

        {/* Label */}
        <div
          className={`flex justify-center mb-10 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/80 text-xs font-semibold tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            Customer Success
          </span>
        </div>

        {/* Glass testimonial card */}
        <div
          className={`relative rounded-3xl overflow-hidden transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={{ transitionDelay: '100ms' }}
        >
          {/* Card glass bg */}
          <div className="absolute inset-0 bg-white/8 backdrop-blur-xl border border-white/15 rounded-3xl" />

          <div className="relative p-12 lg:p-16">
            {/* Quote icon */}
            <div className="flex justify-center mb-8">
              <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-orange-500/20 border border-orange-400/30 backdrop-blur-sm">
                <i className="ri-double-quotes-l text-2xl text-orange-300" />
              </div>
            </div>

            {/* Quote */}
            <blockquote className="text-center mb-10">
              <p className="text-2xl lg:text-3xl font-light text-white leading-relaxed tracking-tight">
                "SigmaSense is a valuable analytics partner that helps our teams make more informed decisions for process optimization and quality improvement."
              </p>
            </blockquote>

            {/* Divider */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className="flex-1 h-px bg-white/15 max-w-[120px]" />
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400/60" />
              <div className="flex-1 h-px bg-white/15 max-w-[120px]" />
            </div>

            {/* Author */}
            <div className="flex flex-col items-center gap-2 mb-10">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-orange-500/30 border border-orange-400/40">
                <i className="ri-user-line text-orange-300 text-base" />
              </div>
              <p className="text-white font-semibold text-base">Sarah Chen</p>
              <p className="text-white/55 text-sm">VP of Operations · Boeing Manufacturing</p>
            </div>

            {/* Star rating */}
            <div className="flex justify-center gap-1 mb-10">
              {[1,2,3,4,5].map(i => (
                <i key={i} className="ri-star-fill text-orange-400 text-lg" />
              ))}
            </div>

            {/* CTA */}
            <div className="flex justify-center">
              <button className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/18 backdrop-blur-sm border border-white/20 text-white text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap">
                Read Full Case Study
                <i className="ri-arrow-right-line" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div
          className={`mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ transitionDelay: '300ms' }}
        >
          {stats.map((stat, idx) => (
            <div
              key={idx}
              className="relative rounded-2xl overflow-hidden text-center py-7 px-4"
            >
              {/* Tile glass */}
              <div className="absolute inset-0 bg-white/7 backdrop-blur-md border border-white/12 rounded-2xl" />
              <div className="relative">
                <div className="text-3xl lg:text-4xl font-bold text-white mb-1">
                  <AnimatedCounter
                    value={stat.numValue}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    decimals={stat.decimals}
                    isVisible={isVisible}
                    delay={idx * 150 + 300}
                    duration={1800}
                  />
                </div>
                <div className="text-xs text-white/55 font-medium tracking-wide uppercase">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
