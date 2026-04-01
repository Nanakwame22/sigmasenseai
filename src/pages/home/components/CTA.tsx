import { useState } from 'react';
import BookDemoModal from './BookDemoModal';

export default function CTA() {
  const [isBookDemoOpen, setIsBookDemoOpen] = useState(false);

  return (
    <>
      <section className="py-24 bg-gradient-to-br from-teal-600 to-teal-700">
        <div className="w-full px-6 lg:px-12">
          <div className="text-center max-w-4xl mx-auto">
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
              Build better products with data
            </h2>
            <p className="text-lg text-white/90 mb-10 max-w-2xl mx-auto leading-relaxed">
              Join thousands of manufacturing and operations teams already achieving breakthrough results.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => window.REACT_APP_NAVIGATE('/auth/signup')}
                className="px-8 py-4 bg-white text-gray-900 rounded-xl text-base font-semibold hover:bg-gray-50 transition-all cursor-pointer whitespace-nowrap shadow-xl"
              >
                Get Started Free
              </button>
              <button 
                onClick={() => setIsBookDemoOpen(true)}
                className="px-8 py-4 bg-transparent text-white rounded-xl text-base font-semibold border-2 border-white/30 hover:bg-white/10 transition-all cursor-pointer whitespace-nowrap"
              >
                Book a Demo
              </button>
            </div>
          </div>
        </div>
      </section>

      <BookDemoModal isOpen={isBookDemoOpen} onClose={() => setIsBookDemoOpen(false)} />
    </>
  );
}
