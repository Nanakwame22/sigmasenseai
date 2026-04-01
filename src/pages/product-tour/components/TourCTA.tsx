import { Link } from 'react-router-dom';

export default function TourCTA() {
  return (
    <section className="py-24 bg-gradient-to-br from-gray-950 to-teal-950 relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/3 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-cyan-400/8 rounded-full blur-3xl"></div>
      </div>
      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-400/15 border border-teal-400/25 rounded-full text-teal-300 text-sm font-medium mb-8">
          <i className="ri-rocket-line"></i>
          Ready to get started?
        </div>
        <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight tracking-tight">
          Turn your healthcare data
          <br />
          <span className="text-teal-400">into decisions today</span>
        </h2>
        <p className="text-xl text-white/55 mb-12 leading-relaxed max-w-2xl mx-auto">
          Join 400+ healthcare organizations using SigmaSenseAI to eliminate operational chaos,
          reduce readmissions, and move fast on improvement.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link
            to="/auth/signup"
            className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-teal-500 to-teal-400 text-white font-bold rounded-xl hover:from-teal-400 hover:to-teal-300 transition-all duration-200 cursor-pointer whitespace-nowrap text-lg shadow-2xl shadow-teal-500/30"
          >
            Start Free — No Credit Card
          </Link>
          <Link
            to="/"
            className="w-full sm:w-auto px-10 py-4 bg-white/10 text-white font-semibold rounded-xl border border-white/20 hover:bg-white/15 transition-all duration-200 cursor-pointer whitespace-nowrap text-base"
          >
            View Pricing
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {[
            { icon: 'ri-time-line', text: 'Up in 15 minutes' },
            { icon: 'ri-lock-2-line', text: 'HIPAA compliant' },
            { icon: 'ri-customer-service-2-line', text: '24/7 support' },
            { icon: 'ri-shield-check-line', text: 'SOC 2 Type II' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-center gap-2 text-white/50 text-sm">
              <i className={`${item.icon} text-teal-400`}></i>
              {item.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
