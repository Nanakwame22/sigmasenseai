import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredPlan, setHoveredPlan] = useState<number | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  const plans = [
    {
      name: 'Starter',
      description: 'Perfect for small teams getting started',
      monthlyPrice: 299,
      annualPrice: 249,
      gradient: 'from-orange-400 to-orange-500',
      features: [
        { text: 'Up to 5 team members', included: true },
        { text: '10 active projects', included: true },
        { text: 'Basic analytics & reporting', included: true },
        { text: 'Email support', included: true },
        { text: 'Data integration (CSV)', included: true },
        { text: 'Advanced AI analysis', included: false },
        { text: 'Custom workflows', included: false },
        { text: 'API access', included: false }
      ],
      cta: 'Start Free Trial',
      popular: false
    },
    {
      name: 'Professional',
      description: 'For growing teams with advanced needs',
      monthlyPrice: 799,
      annualPrice: 665,
      gradient: 'from-orange-400 to-orange-500',
      features: [
        { text: 'Up to 25 team members', included: true },
        { text: 'Unlimited projects', included: true },
        { text: 'Advanced analytics & AI', included: true },
        { text: 'Priority support (24/7)', included: true },
        { text: 'All data integrations', included: true },
        { text: 'Custom workflows', included: true },
        { text: 'API access', included: true },
        { text: 'Dedicated account manager', included: false }
      ],
      cta: 'Start Free Trial',
      popular: true
    },
    {
      name: 'Enterprise',
      description: 'For large organizations at scale',
      monthlyPrice: null,
      annualPrice: null,
      gradient: 'from-orange-400 to-orange-500',
      features: [
        { text: 'Unlimited team members', included: true },
        { text: 'Unlimited projects', included: true },
        { text: 'Enterprise AI & analytics', included: true },
        { text: 'Dedicated support team', included: true },
        { text: 'Custom integrations', included: true },
        { text: 'White-label options', included: true },
        { text: 'SLA guarantees', included: true },
        { text: 'On-premise deployment', included: true }
      ],
      cta: 'Contact Sales',
      popular: false
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

  return (
    <section id="pricing" ref={sectionRef} className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Section Header */}
        <div className="text-center mb-16 max-w-3xl mx-auto">
          <h2 className="font-display text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Choose the plan that fits your team. All plans include a 14-day free trial.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center bg-white rounded-full p-1 shadow-sm border border-gray-200">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                !isAnnual ? 'bg-gray-900 text-white' : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                isAnnual ? 'bg-gray-900 text-white' : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Annual
              <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative transition-all duration-500 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`}
              style={{ transitionDelay: `${index * 100}ms` }}
              onMouseEnter={() => setHoveredPlan(index)}
              onMouseLeave={() => setHoveredPlan(null)}
            >
              <div 
                className={`relative bg-white rounded-2xl p-8 border transition-all duration-300 h-full flex flex-col ${
                  plan.popular
                    ? 'border-orange-500 shadow-xl ring-2 ring-orange-500'
                    : hoveredPlan === index
                    ? 'border-gray-300 shadow-lg'
                    : 'border-gray-200 shadow-md'
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-gradient-to-r from-orange-400 to-orange-500 text-white px-4 py-1 rounded-full text-xs font-bold whitespace-nowrap shadow-lg">
                      MOST POPULAR
                    </div>
                  </div>
                )}

                {/* Plan Header */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <p className="text-sm text-gray-600">{plan.description}</p>
                </div>

                {/* Pricing */}
                <div className="mb-8">
                  {plan.monthlyPrice ? (
                    <>
                      <div className="flex items-baseline mb-1">
                        <span className="text-4xl font-bold text-gray-900">
                          ${isAnnual ? plan.annualPrice : plan.monthlyPrice}
                        </span>
                        <span className="text-gray-600 ml-2 text-base">/month</span>
                      </div>
                      {isAnnual && (
                        <div className="text-sm text-gray-500">
                          ${(plan.annualPrice! * 12).toLocaleString()} billed annually
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-3xl font-bold text-gray-900">Custom</div>
                  )}
                </div>

                {/* Features */}
                <div className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start space-x-3">
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                        feature.included 
                          ? 'bg-orange-100' 
                          : 'bg-gray-100'
                      }`}>
                        <i className={`${feature.included ? 'ri-check-line text-orange-600' : 'ri-close-line text-gray-400'} text-sm`}></i>
                      </div>
                      <span className={`text-sm ${feature.included ? 'text-gray-900' : 'text-gray-400'}`}>
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                {plan.monthlyPrice ? (
                  <Link
                    to="/auth/signup"
                    className={`block w-full text-center px-6 py-3 text-sm font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      plan.popular
                        ? 'text-white bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 shadow-md'
                        : 'text-gray-900 bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                ) : (
                  <button
                    onClick={() => window.location.href = 'mailto:sales@sigmasense.ai'}
                    className="w-full px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 rounded-lg transition-all shadow-md cursor-pointer whitespace-nowrap"
                  >
                    {plan.cta}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Trust Indicators */}
        <div 
          className={`mt-16 flex flex-wrap justify-center gap-8 transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ transitionDelay: '400ms' }}
        >
          {[
            { icon: 'ri-shield-check-line', text: 'Enterprise-grade security' },
            { icon: 'ri-refresh-line', text: 'Cancel anytime' },
            { icon: 'ri-customer-service-2-line', text: '24/7 support included' },
            { icon: 'ri-money-dollar-circle-line', text: '30-day money back' }
          ].map((item, idx) => (
            <div key={idx} className="flex items-center space-x-2">
              <i className={`${item.icon} text-orange-500 text-lg`}></i>
              <span className="text-sm text-gray-700">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
