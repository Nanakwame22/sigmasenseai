import { useState, useEffect, useRef } from 'react';

export default function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const steps = [
    {
      number: '01',
      title: 'Connect Your Data',
      description: 'Integrate with existing systems via API, CSV upload, or direct database connection. Support for ERP, MES, and IoT platforms.',
      icon: 'ri-database-2-line',
      gradient: 'from-teal-500 to-cyan-600',
      features: ['Real-time sync', 'Secure encryption', 'Multiple sources']
    },
    {
      number: '02',
      title: 'AI Analyzes Patterns',
      description: 'Machine learning algorithms automatically detect anomalies, correlations, and root causes across your process data.',
      icon: 'ri-brain-line',
      gradient: 'from-purple-500 to-pink-600',
      features: ['Pattern detection', 'Anomaly alerts', 'Predictive insights']
    },
    {
      number: '03',
      title: 'Get Recommendations',
      description: 'Receive prioritized improvement suggestions with impact forecasts, implementation guides, and ROI projections.',
      icon: 'ri-lightbulb-line',
      gradient: 'from-orange-500 to-red-600',
      features: ['Impact scoring', 'Action plans', 'ROI calculator']
    },
    {
      number: '04',
      title: 'Track & Optimize',
      description: 'Monitor implementation progress, measure results, and continuously refine processes with automated control charts.',
      icon: 'ri-line-chart-line',
      gradient: 'from-blue-500 to-indigo-600',
      features: ['Live dashboards', 'Control charts', 'Performance tracking']
    }
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isVisible) {
      const interval = setInterval(() => {
        setActiveStep((prev) => (prev + 1) % steps.length);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [isVisible, steps.length]);

  return (
    <section id="how-it-works" ref={sectionRef} className="relative py-24 bg-gradient-to-br from-gray-50 to-white overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-96 h-96 bg-blue-100/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-[500px] h-[500px] bg-teal-100/20 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-6 lg:px-12">
        <div className="text-center mb-16 max-w-3xl mx-auto">
          {/* Section Header */}
          <div className="inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full mb-6 border border-blue-100">
            <i className="ri-route-line text-sm"></i>
            <span className="text-sm font-medium whitespace-nowrap">Simple Process</span>
          </div>
          
          <h2 className="font-display text-5xl lg:text-6xl tracking-tight text-gray-900 mb-6">
            From data to insights
            <span className="block mt-2 bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 bg-clip-text text-transparent">
              in four steps
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Our AI-powered platform guides you through the entire improvement journey
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid lg:grid-cols-4 gap-8 mb-16">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`relative transition-all duration-700 cursor-pointer ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`}
              style={{ transitionDelay: `${index * 150}ms` }}
              onClick={() => setActiveStep(index)}
            >
              {/* Connection Line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-16 left-full w-full h-1 -ml-4">
                  <div className="relative w-full h-full">
                    <div className="absolute inset-0 bg-gray-200 rounded-full"></div>
                    <div 
                      className={`absolute inset-0 bg-gradient-to-r ${step.gradient} rounded-full transition-all duration-1000`}
                      style={{ 
                        width: activeStep > index ? '100%' : '0%',
                        transitionDelay: `${index * 200}ms`
                      }}
                    ></div>
                  </div>
                </div>
              )}

              <div 
                className={`relative bg-white rounded-2xl p-8 border-2 transition-all duration-500 ${
                  activeStep === index 
                    ? `border-transparent shadow-2xl scale-105` 
                    : 'border-gray-100 shadow-lg hover:shadow-xl hover:scale-102'
                }`}
              >
                {/* Active Gradient Border */}
                {activeStep === index && (
                  <div className={`absolute inset-0 bg-gradient-to-br ${step.gradient} rounded-2xl -z-10`}></div>
                )}

                {/* Step Number */}
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${step.gradient} mb-6 shadow-lg`}>
                  <i className={`${step.icon} text-3xl text-white`}></i>
                </div>

                <div className={`text-sm font-bold mb-3 bg-gradient-to-r ${step.gradient} bg-clip-text text-transparent`}>
                  STEP {step.number}
                </div>

                <h3 className="text-2xl font-bold text-gray-900 mb-4">{step.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-6">{step.description}</p>

                {/* Features List */}
                <div className="space-y-2">
                  {step.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${step.gradient}`}></div>
                      <span className="text-xs text-gray-700 font-medium">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Active Indicator */}
                {activeStep === index && (
                  <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2">
                    <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${step.gradient} shadow-lg animate-pulse`}></div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Progress Indicators */}
        <div className="flex justify-center space-x-3">
          {steps.map((step, index) => (
            <button
              key={index}
              onClick={() => setActiveStep(index)}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                activeStep === index ? `bg-gradient-to-r ${step.gradient} w-12` : 'bg-gray-300 w-2'
              }`}
            />
          ))}
        </div>

        {/* CTA Section */}
        <div 
          className={`mt-20 text-center transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ transitionDelay: '800ms' }}
        >
          <div className="inline-flex flex-col items-center space-y-6 bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl px-12 py-10 shadow-2xl">
            <div className="flex items-center space-x-3">
              <i className="ri-time-line text-teal-400 text-3xl"></i>
              <span className="text-white text-lg font-semibold">Get started in under 5 minutes</span>
            </div>
            <a
              href="/auth/signup"
              className="group inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-gray-900 bg-white hover:bg-gray-50 rounded-xl transition-all shadow-lg hover:shadow-xl cursor-pointer whitespace-nowrap"
            >
              <span>Start Your Free Trial</span>
              <i className="ri-arrow-right-line ml-2 transition-transform group-hover:translate-x-1"></i>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
