import SEOHead from '../../components/common/SEOHead';
import Navigation from './components/Navigation';
import Hero from './components/Hero';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import Testimonials from './components/Testimonials';
import Pricing from './components/Pricing';
import TrustSecurity from './components/TrustSecurity';
import CTA from './components/CTA';
import Footer from './components/Footer';
import ContactForm from './components/ContactForm';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://example.com';

const homeJsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'SigmaSenseAI',
    url: SITE_URL,
    description: 'AI-powered Six Sigma process improvement platform for manufacturing, healthcare, and supply chain industries.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'SigmaSenseAI',
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description: 'Enterprise AI-powered Six Sigma and process improvement analytics platform.',
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      availableLanguage: 'English',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SigmaSenseAI',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: 'AI-powered Six Sigma process improvement platform featuring DMAIC project management, real-time metrics, root cause analysis, predictive simulations, and advanced analytics.',
    offers: [
      {
        '@type': 'Offer',
        name: 'Starter',
        priceCurrency: 'USD',
        price: '0',
        description: 'Free tier for teams getting started with process improvement.',
      },
      {
        '@type': 'Offer',
        name: 'Professional',
        priceCurrency: 'USD',
        price: '99',
        description: 'Full analytics suite for growing operations teams.',
      },
      {
        '@type': 'Offer',
        name: 'Enterprise',
        priceCurrency: 'USD',
        price: '499',
        description: 'Enterprise-grade analytics with dedicated support and custom integrations.',
      },
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '500',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is SigmaSenseAI?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'SigmaSenseAI is an AI-powered Six Sigma and process improvement platform that provides real-time metrics, DMAIC project management, root cause analysis, predictive simulations, and advanced analytics for manufacturing, healthcare, and supply chain industries.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does SigmaSenseAI help with DMAIC process improvement?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'SigmaSenseAI automates and streamlines the DMAIC (Define, Measure, Analyze, Improve, Control) methodology with AI-powered root cause analysis, statistical hypothesis testing, predictive simulations, and real-time monitoring dashboards.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is there a free trial for SigmaSenseAI?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, SigmaSenseAI offers a 14-day free trial with no credit card required, giving you full access to all core features including DMAIC tools, analytics dashboards, and AI-powered insights.',
        },
      },
    ],
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <SEOHead
        title="SigmaSenseAI | AI-Powered Six Sigma Process Improvement Platform"
        description="Transform your operations with SigmaSenseAI — AI-powered Six Sigma tools featuring real-time metrics, DMAIC project management, root cause analysis, and predictive simulations for manufacturing, healthcare, and supply chain excellence."
        keywords="Six Sigma, DMAIC, process improvement, manufacturing analytics, root cause analysis, AI analytics, KPI monitoring"
        canonicalPath="/"
        jsonLd={homeJsonLd}
      />
      <Navigation />
      <Hero />
      <Features />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <TrustSecurity />
      <CTA />
      <ContactForm />
      <Footer />
    </div>
  );
}
