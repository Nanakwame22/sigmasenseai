import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navigation from '../home/components/Navigation';
import Footer from '../home/components/Footer';
import SEOHead from '../../components/common/SEOHead';

interface UseCase {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  metrics: {
    label: string;
    value: string;
    icon: string;
  }[];
  capabilities: string[];
  image: string;
  gradient: string;
}

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://example.com';

const useCasesJsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'SigmaSenseAI Industry Use Cases | Six Sigma Solutions by Sector',
    url: `${SITE_URL}/use-cases`,
    description: 'Explore how SigmaSenseAI delivers AI-powered Six Sigma process improvement solutions across manufacturing, healthcare, supply chain, financial services, retail, and technology sectors.',
    isPartOf: {
      '@type': 'WebSite',
      name: 'SigmaSenseAI',
      url: SITE_URL,
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: SITE_URL,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Use Cases',
          item: `${SITE_URL}/use-cases`,
        },
      ],
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'SigmaSenseAI Industry Solutions',
    description: 'AI-powered Six Sigma and process improvement solutions tailored for specific industries.',
    numberOfItems: 6,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Manufacturing Excellence',
        description: 'Deploy AI-powered Six Sigma methodologies to eliminate defects, optimize production lines, and achieve statistical process control across manufacturing operations.',
        url: `${SITE_URL}/use-cases#manufacturing`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Healthcare Operations',
        description: 'Transform healthcare delivery with data-driven insights that reduce wait times, improve patient outcomes, and optimize resource allocation.',
        url: `${SITE_URL}/use-cases#healthcare`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Supply Chain Optimization',
        description: 'Achieve supply chain resilience through predictive analytics, demand forecasting, and real-time optimization.',
        url: `${SITE_URL}/use-cases#supply-chain`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: 'Financial Services',
        description: 'Enhance operational efficiency, reduce processing errors, and ensure regulatory compliance through systematic process improvement.',
        url: `${SITE_URL}/use-cases#financial`,
      },
      {
        '@type': 'ListItem',
        position: 5,
        name: 'Retail Operations',
        description: 'Optimize store operations, merchandising strategies, and customer journeys using data-driven insights.',
        url: `${SITE_URL}/use-cases#retail`,
      },
      {
        '@type': 'ListItem',
        position: 6,
        name: 'Technology & SaaS',
        description: 'Build world-class software operations with systematic quality control, performance optimization, and data-driven product development.',
        url: `${SITE_URL}/use-cases#technology`,
      },
    ],
  },
];

const useCases: UseCase[] = [
  {
    id: 'manufacturing',
    title: 'Manufacturing Excellence',
    subtitle: 'Precision-Driven Quality Control',
    description: 'Deploy AI-powered Six Sigma methodologies to eliminate defects, optimize production lines, and achieve statistical process control across your manufacturing operations.',
    metrics: [
      { label: 'Defect Reduction', value: '94%', icon: 'ri-shield-check-line' },
      { label: 'Cycle Time', value: '-38%', icon: 'ri-time-line' },
      { label: 'Yield Rate', value: '99.7%', icon: 'ri-line-chart-line' },
      { label: 'Cost Savings', value: '$2.4M', icon: 'ri-money-dollar-circle-line' }
    ],
    capabilities: [
      'Real-time SPC monitoring with automated control charts',
      'Predictive maintenance using machine learning algorithms',
      'Root cause analysis with AI-powered correlation detection',
      'DMAIC project automation and tracking',
      'Multi-site benchmarking and best practice sharing'
    ],
    image: 'https://readdy.ai/api/search-image?query=modern%20industrial%20manufacturing%20facility%20with%20robotic%20arms%20and%20automated%20assembly%20lines%20in%20a%20clean%20high-tech%20factory%20environment%20with%20blue%20lighting%20and%20precision%20machinery%20showing%20advanced%20automation%20technology&width=1400&height=900&seq=mfg001&orientation=landscape',
    gradient: 'from-slate-900 via-blue-900 to-slate-900'
  },
  {
    id: 'healthcare',
    title: 'Healthcare Operations',
    subtitle: 'Patient-Centric Process Optimization',
    description: 'Transform healthcare delivery with data-driven insights that reduce wait times, improve patient outcomes, and optimize resource allocation across your entire care continuum.',
    metrics: [
      { label: 'Wait Time', value: '-42%', icon: 'ri-timer-line' },
      { label: 'Patient Satisfaction', value: '96%', icon: 'ri-heart-pulse-line' },
      { label: 'Bed Utilization', value: '+28%', icon: 'ri-hospital-line' },
      { label: 'Cost per Patient', value: '-31%', icon: 'ri-funds-line' }
    ],
    capabilities: [
      'ED flow optimization with predictive patient volume modeling',
      'Surgical scheduling efficiency using constraint-based algorithms',
      'Readmission risk prediction and intervention protocols',
      'Supply chain optimization for medical inventory',
      'Clinical pathway standardization and variance analysis'
    ],
    image: 'https://readdy.ai/api/search-image?query=modern%20hospital%20emergency%20department%20with%20advanced%20medical%20technology%20digital%20displays%20and%20clean%20efficient%20layout%20showing%20healthcare%20professionals%20using%20data%20systems%20in%20a%20bright%20professional%20environment&width=1400&height=900&seq=hc001&orientation=landscape',
    gradient: 'from-cyan-900 via-teal-900 to-cyan-900'
  },
  {
    id: 'supply-chain',
    title: 'Supply Chain Optimization',
    subtitle: 'End-to-End Logistics Intelligence',
    description: 'Achieve supply chain resilience through predictive analytics, demand forecasting, and real-time optimization of inventory, transportation, and warehouse operations.',
    metrics: [
      { label: 'Inventory Turns', value: '+67%', icon: 'ri-stack-line' },
      { label: 'On-Time Delivery', value: '98.2%', icon: 'ri-truck-line' },
      { label: 'Carrying Costs', value: '-44%', icon: 'ri-price-tag-3-line' },
      { label: 'Forecast Accuracy', value: '94%', icon: 'ri-bar-chart-box-line' }
    ],
    capabilities: [
      'Multi-echelon inventory optimization with safety stock calculation',
      'Demand sensing and forecasting using time-series ML models',
      'Transportation route optimization and carrier selection',
      'Warehouse layout optimization and pick-path efficiency',
      'Supplier performance scorecards and risk assessment'
    ],
    image: 'https://readdy.ai/api/search-image?query=massive%20automated%20warehouse%20with%20robotic%20systems%20conveyor%20belts%20and%20organized%20inventory%20racks%20in%20a%20modern%20logistics%20facility%20with%20blue%20accent%20lighting%20showing%20efficient%20supply%20chain%20operations&width=1400&height=900&seq=sc001&orientation=landscape',
    gradient: 'from-indigo-900 via-purple-900 to-indigo-900'
  },
  {
    id: 'financial',
    title: 'Financial Services',
    subtitle: 'Risk-Aware Process Engineering',
    description: 'Enhance operational efficiency, reduce processing errors, and ensure regulatory compliance through systematic process improvement and advanced analytics.',
    metrics: [
      { label: 'Processing Time', value: '-56%', icon: 'ri-speed-line' },
      { label: 'Error Rate', value: '0.02%', icon: 'ri-error-warning-line' },
      { label: 'Compliance Score', value: '99.8%', icon: 'ri-shield-check-line' },
      { label: 'Cost Efficiency', value: '+48%', icon: 'ri-line-chart-line' }
    ],
    capabilities: [
      'Transaction anomaly detection using unsupervised learning',
      'Loan processing automation with intelligent document extraction',
      'Fraud pattern recognition and real-time alerting',
      'Regulatory reporting automation and audit trail management',
      'Customer onboarding optimization and KYC streamlining'
    ],
    image: 'https://readdy.ai/api/search-image?query=modern%20financial%20trading%20floor%20with%20multiple%20digital%20screens%20displaying%20data%20analytics%20and%20charts%20in%20a%20sleek%20professional%20environment%20with%20blue%20lighting%20showing%20advanced%20financial%20technology&width=1400&height=900&seq=fin001&orientation=landscape',
    gradient: 'from-blue-900 via-slate-900 to-blue-900'
  },
  {
    id: 'retail',
    title: 'Retail Operations',
    subtitle: 'Customer Experience Engineering',
    description: 'Optimize store operations, merchandising strategies, and customer journeys using data-driven insights that drive revenue growth and operational excellence.',
    metrics: [
      { label: 'Conversion Rate', value: '+34%', icon: 'ri-shopping-cart-line' },
      { label: 'Basket Size', value: '+29%', icon: 'ri-shopping-bag-line' },
      { label: 'Stock Accuracy', value: '99.1%', icon: 'ri-checkbox-circle-line' },
      { label: 'Labor Efficiency', value: '+41%', icon: 'ri-team-line' }
    ],
    capabilities: [
      'Store layout optimization using customer flow analytics',
      'Dynamic pricing and markdown optimization algorithms',
      'Planogram compliance monitoring with computer vision',
      'Labor scheduling optimization based on traffic patterns',
      'Omnichannel inventory visibility and allocation'
    ],
    image: 'https://readdy.ai/api/search-image?query=modern%20retail%20store%20interior%20with%20clean%20minimalist%20design%20digital%20displays%20and%20organized%20product%20shelves%20in%20a%20bright%20contemporary%20shopping%20environment%20with%20advanced%20technology%20integration&width=1400&height=900&seq=ret001&orientation=landscape',
    gradient: 'from-emerald-900 via-teal-900 to-emerald-900'
  },
  {
    id: 'technology',
    title: 'Technology & SaaS',
    subtitle: 'Engineering-Grade Reliability',
    description: 'Build world-class software operations with systematic quality control, performance optimization, and data-driven product development methodologies.',
    metrics: [
      { label: 'System Uptime', value: '99.99%', icon: 'ri-server-line' },
      { label: 'Deploy Frequency', value: '12x/day', icon: 'ri-rocket-line' },
      { label: 'MTTR', value: '-73%', icon: 'ri-tools-line' },
      { label: 'Customer NPS', value: '+52pts', icon: 'ri-star-line' }
    ],
    capabilities: [
      'CI/CD pipeline optimization and deployment automation',
      'Application performance monitoring with anomaly detection',
      'Customer churn prediction and intervention modeling',
      'Feature usage analytics and A/B testing frameworks',
      'Infrastructure cost optimization and resource allocation'
    ],
    image: 'https://readdy.ai/api/search-image?query=modern%20data%20center%20server%20room%20with%20rows%20of%20illuminated%20server%20racks%20and%20blue%20LED%20lighting%20in%20a%20clean%20high-tech%20facility%20showing%20advanced%20cloud%20computing%20infrastructure%20and%20network%20systems&width=1400&height=900&seq=tech001&orientation=landscape',
    gradient: 'from-violet-900 via-blue-900 to-violet-900'
  }
];

export default function UseCasesPage() {
  const [scrollY, setScrollY] = useState(0);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);

      const sections = document.querySelectorAll('[data-use-case]');
      const newVisible = new Set<string>();

      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.8) {
          newVisible.add(section.getAttribute('data-use-case') || '');
        }
      });

      setVisibleSections(newVisible);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SEOHead
        title="SigmaSenseAI Industry Use Cases | Six Sigma Solutions by Sector"
        description="Explore how SigmaSenseAI delivers AI-powered Six Sigma process improvement across manufacturing, healthcare, supply chain, financial services, retail, and technology. Real metrics, real results."
        keywords="Six Sigma use cases, manufacturing process improvement, healthcare analytics, supply chain optimization, DMAIC by industry"
        canonicalPath="/use-cases"
        jsonLd={useCasesJsonLd}
      />
      <Navigation />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0a0a0f] via-[#111827] to-[#0a0a0f]">
        {/* Animated Grid Background */}
        <div className="absolute inset-0 opacity-20">
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(to right, #00aaff 1px, transparent 1px), linear-gradient(to bottom, #00aaff 1px, transparent 1px)`,
              backgroundSize: '60px 60px',
              transform: `translateY(${scrollY * 0.3}px)`
            }}
          />
        </div>

        {/* Floating Orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div 
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"
            style={{ transform: `translate(${scrollY * 0.1}px, ${scrollY * 0.15}px)` }}
          />
          <div 
            className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl"
            style={{ transform: `translate(${-scrollY * 0.1}px, ${-scrollY * 0.15}px)` }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-32 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-8 animate-fade-in-up">
            <i className="ri-lightbulb-flash-line text-[#00aaff] text-lg"></i>
            <span className="text-sm font-medium text-white/90 tracking-wide">INDUSTRY SOLUTIONS</span>
          </div>

          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold text-white mb-8 tracking-tight leading-none animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            Engineering Excellence
            <br />
            <span className="bg-gradient-to-r from-[#00aaff] to-[#06b6d4] bg-clip-text text-transparent">
              Across Industries
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-white/70 max-w-3xl mx-auto mb-12 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            Deploy systematic process improvement methodologies tailored to your sector's unique operational challenges and regulatory requirements.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <Link
              to="/signup"
              className="px-8 py-4 bg-[#00aaff] text-white font-semibold rounded-lg hover:bg-[#0099ee] transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/50 whitespace-nowrap cursor-pointer"
            >
              Start Free Trial
            </Link>
            <a
              href="#use-cases"
              className="px-8 py-4 bg-transparent text-white font-semibold rounded-lg border-2 border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-300 whitespace-nowrap cursor-pointer"
            >
              Explore Solutions
            </a>
          </div>

          {/* Scroll Indicator */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce">
            <i className="ri-arrow-down-line text-white/50 text-3xl"></i>
          </div>
        </div>
      </section>

      {/* Use Cases Grid */}
      <section id="use-cases" className="py-32 bg-[#fafafa]">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-[#111] mb-6 tracking-tight">
              Sector-Specific Solutions
            </h2>
            <p className="text-xl text-[#555] max-w-3xl mx-auto leading-relaxed">
              Precision-engineered methodologies designed for the operational realities of your industry
            </p>
          </div>

          <div className="space-y-32">
            {useCases.map((useCase, index) => (
              <div
                key={useCase.id}
                data-use-case={useCase.id}
                className={`transition-all duration-1000 ${
                  visibleSections.has(useCase.id)
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-20'
                }`}
              >
                <div className={`grid lg:grid-cols-2 gap-12 items-center ${index % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}>
                  {/* Image Side */}
                  <div className={`${index % 2 === 1 ? 'lg:order-2' : ''}`}>
                    <div className="relative group">
                      <div className={`absolute inset-0 bg-gradient-to-br ${useCase.gradient} opacity-20 rounded-2xl blur-2xl group-hover:opacity-30 transition-opacity duration-500`} />
                      <div className="relative overflow-hidden rounded-2xl border border-[#e5e7eb] shadow-2xl">
                        <img
                          src={useCase.image}
                          alt={useCase.title}
                          className="w-full h-[600px] object-cover object-center transform group-hover:scale-105 transition-transform duration-700"
                        />
                        <div className={`absolute inset-0 bg-gradient-to-t ${useCase.gradient} opacity-20`} />
                      </div>
                    </div>
                  </div>

                  {/* Content Side */}
                  <div className={`${index % 2 === 1 ? 'lg:order-1' : ''}`}>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00aaff]/10 border border-[#00aaff]/20 mb-6">
                      <span className="text-sm font-semibold text-[#00aaff] tracking-wide uppercase">
                        {useCase.subtitle}
                      </span>
                    </div>

                    <h3 className="text-5xl font-bold text-[#111] mb-6 tracking-tight">
                      {useCase.title}
                    </h3>

                    <p className="text-lg text-[#555] mb-10 leading-relaxed">
                      {useCase.description}
                    </p>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-10">
                      {useCase.metrics.map((metric, idx) => (
                        <div
                          key={idx}
                          className="p-6 bg-white rounded-xl border border-[#e5e7eb] hover:border-[#00aaff]/30 hover:shadow-lg transition-all duration-300 group cursor-pointer"
                          style={{ animationDelay: `${idx * 0.1}s` }}
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 flex items-center justify-center bg-[#00aaff]/10 rounded-lg group-hover:bg-[#00aaff]/20 transition-colors duration-300">
                              <i className={`${metric.icon} text-[#00aaff] text-2xl`}></i>
                            </div>
                            <div>
                              <div className="text-3xl font-bold text-[#111] mb-1">
                                {metric.value}
                              </div>
                              <div className="text-sm text-[#666] font-medium">
                                {metric.label}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Capabilities List */}
                    <div className="space-y-4">
                      <h4 className="text-xl font-bold text-[#111] mb-4">Core Capabilities</h4>
                      {useCase.capabilities.map((capability, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 group"
                          style={{ animationDelay: `${idx * 0.05}s` }}
                        >
                          <div className="w-6 h-6 flex items-center justify-center bg-[#00aaff]/10 rounded-full mt-0.5 group-hover:bg-[#00aaff]/20 transition-colors duration-300">
                            <i className="ri-check-line text-[#00aaff] text-sm"></i>
                          </div>
                          <p className="text-[#555] leading-relaxed flex-1">
                            {capability}
                          </p>
                        </div>
                      ))}
                    </div>

                    <Link
                      to="/signup"
                      className="inline-flex items-center gap-2 mt-8 px-6 py-3 bg-[#111] text-white font-semibold rounded-lg hover:bg-[#00aaff] transition-all duration-300 hover:scale-105 hover:shadow-lg whitespace-nowrap cursor-pointer group"
                    >
                      <span>Get Started</span>
                      <i className="ri-arrow-right-line text-lg group-hover:translate-x-1 transition-transform duration-300"></i>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technical Specifications Section */}
      <section className="py-32 bg-gradient-to-br from-[#0a0a0f] via-[#111827] to-[#0a0a0f] relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, #00aaff 1px, transparent 0)`,
              backgroundSize: '40px 40px'
            }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
              Platform Specifications
            </h2>
            <p className="text-xl text-white/70 max-w-3xl mx-auto leading-relaxed">
              Enterprise-grade infrastructure built for mission-critical operations
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: 'ri-shield-check-line',
                title: 'Security & Compliance',
                specs: ['SOC 2 Type II Certified', 'HIPAA Compliant', 'GDPR Ready', 'ISO 27001', '256-bit Encryption']
              },
              {
                icon: 'ri-speed-line',
                title: 'Performance',
                specs: ['99.99% Uptime SLA', '<100ms Response Time', 'Auto-scaling Infrastructure', 'Global CDN', 'Real-time Processing']
              },
              {
                icon: 'ri-plug-line',
                title: 'Integration',
                specs: ['REST & GraphQL APIs', 'Webhook Support', 'SSO/SAML', 'Pre-built Connectors', 'Custom Integrations']
              }
            ].map((spec, index) => (
              <div
                key={index}
                className="p-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-[#00aaff]/50 hover:bg-white/10 transition-all duration-300 group"
              >
                <div className="w-16 h-16 flex items-center justify-center bg-[#00aaff]/10 rounded-xl mb-6 group-hover:bg-[#00aaff]/20 transition-colors duration-300">
                  <i className={`${spec.icon} text-[#00aaff] text-3xl`}></i>
                </div>
                <h3 className="text-2xl font-bold text-white mb-6">{spec.title}</h3>
                <ul className="space-y-3">
                  {spec.specs.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-white/70">
                      <i className="ri-checkbox-circle-line text-[#00aaff]"></i>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 bg-[#fafafa]">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-5xl md:text-6xl font-bold text-[#111] mb-8 tracking-tight">
            Ready to Transform
            <br />
            Your Operations?
          </h2>
          <p className="text-xl text-[#555] mb-12 leading-relaxed max-w-3xl mx-auto">
            Join industry leaders who trust SigmaSense to drive operational excellence through data-driven process improvement.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              to="/signup"
              className="px-8 py-4 bg-[#00aaff] text-white font-semibold rounded-lg hover:bg-[#0099ee] transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/50 whitespace-nowrap cursor-pointer"
            >
              Start Free Trial
            </Link>
            <Link
              to="/contact"
              className="px-8 py-4 bg-transparent text-[#111] font-semibold rounded-lg border-2 border-[#e5e7eb] hover:border-[#00aaff] hover:bg-[#00aaff]/5 transition-all duration-300 whitespace-nowrap cursor-pointer"
            >
              Schedule Demo
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-12 border-t border-[#e5e7eb]">
            {[
              { value: '500+', label: 'Enterprise Clients' },
              { value: '2M+', label: 'Projects Completed' },
              { value: '$1.2B', label: 'Cost Savings Generated' },
              { value: '99.99%', label: 'Platform Uptime' }
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl font-bold text-[#111] mb-2">{stat.value}</div>
                <div className="text-sm text-[#666] font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />

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

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
