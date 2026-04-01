import { Link } from 'react-router-dom';
import Navigation from '../home/components/Navigation';
import Footer from '../home/components/Footer';
import SEOHead from '../../components/common/SEOHead';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://example.com';

const caseStudiesJsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'SigmaSenseAI Case Studies | Real Process Improvement Results',
    url: `${SITE_URL}/case-studies`,
    description: 'Discover how leading organizations across manufacturing, healthcare, and supply chain industries achieved breakthrough results using SigmaSenseAI process improvement tools.',
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
          name: 'Case Studies',
          item: `${SITE_URL}/case-studies`,
        },
      ],
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'SigmaSenseAI Customer Success Stories',
    description: 'Real-world case studies showing measurable process improvement results delivered by SigmaSenseAI.',
    numberOfItems: 3,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Global Electronics Manufacturer — 62% Defect Reduction',
        description: 'Implemented real-time anomaly detection and root cause analysis, achieving 62% defect reduction and $2.4M annual cost savings within 3 months.',
        url: `${SITE_URL}/case-studies#manufacturing`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Regional Hospital Network — 47% Wait Time Reduction',
        description: 'Deployed predictive analytics and resource optimization, cutting emergency department wait times by 47% and boosting patient satisfaction to 89%.',
        url: `${SITE_URL}/case-studies#healthcare`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'E-commerce Fulfillment Center — 98.7% On-Time Delivery',
        description: 'Integrated SCADA data with AI process optimization, achieving 98.7% on-time delivery rate and 2.3x throughput increase.',
        url: `${SITE_URL}/case-studies#supply-chain`,
      },
    ],
  },
];

export default function CaseStudiesPage() {
  const caseStudies = [
    {
      id: 1,
      industry: 'Manufacturing',
      company: 'Global Electronics Manufacturer',
      challenge: 'High defect rates in production line causing $4.2M annual losses',
      solution: 'Implemented real-time anomaly detection and root cause analysis using SigmaSense AI',
      results: [
        { metric: '62%', label: 'Reduction in defects' },
        { metric: '$2.4M', label: 'Annual cost savings' },
        { metric: '3 weeks', label: 'Implementation time' },
        { metric: '99.2%', label: 'Quality score achieved' }
      ],
      timeline: '3 months to full ROI',
      image: 'https://readdy.ai/api/search-image?query=modern%20electronics%20manufacturing%20facility%20with%20automated%20production%20lines%20robotic%20arms%20and%20quality%20control%20systems%20clean%20industrial%20environment%20with%20blue%20lighting%20and%20high-tech%20equipment&width=800&height=600&seq=case1&orientation=landscape',
      icon: 'ri-cpu-line',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      id: 2,
      industry: 'Healthcare',
      company: 'Regional Hospital Network',
      challenge: 'Emergency department overcrowding with 4+ hour average wait times',
      solution: 'Deployed predictive analytics and resource optimization with SigmaSense AI',
      results: [
        { metric: '47%', label: 'Reduction in wait times' },
        { metric: '31%', label: 'Increase in patient capacity' },
        { metric: '89%', label: 'Patient satisfaction score' },
        { metric: '2.1 hours', label: 'Average wait time' }
      ],
      timeline: '6 weeks to measurable impact',
      image: 'https://readdy.ai/api/search-image?query=modern%20hospital%20emergency%20department%20with%20digital%20displays%20patient%20flow%20management%20systems%20clean%20bright%20medical%20facility%20with%20healthcare%20professionals%20and%20advanced%20technology&width=800&height=600&seq=case2&orientation=landscape',
      icon: 'ri-heart-pulse-line',
      color: 'from-teal-500 to-emerald-500'
    },
    {
      id: 3,
      industry: 'Supply Chain',
      company: 'E-commerce Fulfillment Center',
      challenge: 'Inconsistent delivery times and 16% late shipment rate',
      solution: 'Integrated SCADA data with AI-powered process optimization',
      results: [
        { metric: '98.7%', label: 'On-time delivery rate' },
        { metric: '34%', label: 'Faster order processing' },
        { metric: '$890K', label: 'Annual savings' },
        { metric: '2.3x', label: 'Throughput increase' }
      ],
      timeline: '4 weeks to deployment',
      image: 'https://readdy.ai/api/search-image?query=modern%20warehouse%20fulfillment%20center%20with%20automated%20sorting%20systems%20conveyor%20belts%20robotic%20picking%20arms%20and%20inventory%20management%20technology%20bright%20organized%20logistics%20facility&width=800&height=600&seq=case3&orientation=landscape',
      icon: 'ri-truck-line',
      color: 'from-purple-500 to-pink-500'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="SigmaSenseAI Case Studies | Real Six Sigma Process Improvement Results"
        description="Discover how leading organizations across manufacturing, healthcare, and supply chain achieved breakthrough results with SigmaSenseAI — 62% defect reduction, 47% faster wait times, 98.7% on-time delivery."
        keywords="Six Sigma case studies, process improvement results, manufacturing defect reduction, healthcare analytics, supply chain optimization results"
        canonicalPath="/case-studies"
        jsonLd={caseStudiesJsonLd}
      />
      <Navigation />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-50 via-white to-cyan-50"></div>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzE0YjhhNiIgc3Ryb2tlLW9wYWNpdHk9IjAuMDUiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-40"></div>
        
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-teal-100 text-teal-700 px-4 py-2 rounded-full text-sm font-semibold mb-6">
              <i className="ri-trophy-line"></i>
              <span>Real Results from Real Companies</span>
            </div>
            <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Success Stories That Speak for Themselves
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Discover how leading organizations across industries are transforming their operations with SigmaSense AI. From manufacturing to healthcare, see the measurable impact of data-driven decision making.
            </p>
          </div>
        </div>
      </section>

      {/* Case Studies Grid */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="space-y-24">
            {caseStudies.map((study, index) => (
              <div 
                key={study.id}
                className={`flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-12 items-center`}
              >
                {/* Image */}
                <div className="w-full lg:w-1/2">
                  <div className="relative rounded-2xl overflow-hidden shadow-2xl group">
                    <div className="w-full h-96">
                      <img 
                        src={study.image}
                        alt={study.company}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700"
                      />
                    </div>
                    <div className={`absolute top-6 left-6 bg-gradient-to-r ${study.color} text-white px-4 py-2 rounded-lg font-semibold text-sm shadow-lg`}>
                      {study.industry}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="w-full lg:w-1/2 space-y-6">
                  <div className="flex items-center space-x-3">
                    <div className={`w-12 h-12 bg-gradient-to-br ${study.color} rounded-xl flex items-center justify-center`}>
                      <i className={`${study.icon} text-white text-xl`}></i>
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900">{study.company}</h2>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">The Challenge</h3>
                      <p className="text-lg text-gray-700">{study.challenge}</p>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">The Solution</h3>
                      <p className="text-lg text-gray-700">{study.solution}</p>
                    </div>
                  </div>

                  {/* Results Grid */}
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    {study.results.map((result, idx) => (
                      <div key={idx} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 border border-gray-200">
                        <div className={`text-3xl font-bold bg-gradient-to-r ${study.color} bg-clip-text text-transparent mb-1`}>
                          {result.metric}
                        </div>
                        <div className="text-sm text-gray-600 font-medium">{result.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center space-x-2 text-teal-600 font-semibold pt-2">
                    <i className="ri-time-line"></i>
                    <span>{study.timeline}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Proven Impact Across Industries</h2>
            <p className="text-xl text-gray-300">Aggregate results from our customer base</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-5xl font-bold text-teal-400 mb-2">500+</div>
              <div className="text-gray-300 font-medium">Companies Transformed</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-teal-400 mb-2">$2.8B</div>
              <div className="text-gray-300 font-medium">Total Cost Savings</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-teal-400 mb-2">94%</div>
              <div className="text-gray-300 font-medium">Customer Satisfaction</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-teal-400 mb-2">6 weeks</div>
              <div className="text-gray-300 font-medium">Average Time to ROI</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Ready to Write Your Success Story?</h2>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            Join hundreds of organizations that have transformed their operations with SigmaSense AI. Start your journey today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              to="/signup"
              className="whitespace-nowrap px-8 py-4 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-lg font-semibold hover:from-teal-700 hover:to-cyan-700 transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
            >
              Start Free Trial
            </Link>
            <Link 
              to="/#contact"
              className="whitespace-nowrap px-8 py-4 bg-white text-gray-900 rounded-lg font-semibold border-2 border-gray-300 hover:border-teal-600 hover:text-teal-600 transition-all duration-200 cursor-pointer"
            >
              Schedule a Demo
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
