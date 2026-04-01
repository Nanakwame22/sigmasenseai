import { useState } from 'react';

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    industry: '',
    message: '',
    interest: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    // Validate message length
    if (formData.message.length > 500) {
      setErrorMessage('Message must be 500 characters or less');
      setIsSubmitting(false);
      setSubmitStatus('error');
      return;
    }

    try {
      // Prepare form data in application/x-www-form-urlencoded format
      const formBody = new URLSearchParams();
      Object.entries(formData).forEach(([key, value]) => {
        if (value) {
          formBody.append(key, value);
        }
      });

      const response = await fetch('https://readdy.ai/api/form/d4n6rc9btbscp07qba2g', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString()
      });

      if (response.ok) {
        setSubmitStatus('success');
        // Reset form
        setFormData({
          name: '',
          email: '',
          company: '',
          phone: '',
          industry: '',
          message: '',
          interest: ''
        });
      } else {
        throw new Error('Submission failed');
      }
    } catch (error) {
      setSubmitStatus('error');
      setErrorMessage('Failed to submit form. Please try again.');
      console.error('Form submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = 500 - formData.message.length;

  return (
    <section id="contact" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left Side - Info */}
          <div>
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Get Started with SigmaSense AI
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Ready to transform your manufacturing operations? Fill out the form and our team will reach out to schedule a personalized demo and discuss how we can help achieve your process improvement goals.
            </p>

            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i className="ri-time-line text-blue-600 text-xl"></i>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Quick Response</h3>
                  <p className="text-gray-600">We'll get back to you within 24 hours</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i className="ri-shield-check-line text-blue-600 text-xl"></i>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Secure & Private</h3>
                  <p className="text-gray-600">Your information is protected and never shared</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i className="ri-gift-line text-blue-600 text-xl"></i>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Free Trial Included</h3>
                  <p className="text-gray-600">Start with a 14-day free trial, no credit card required</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Form */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <form 
              id="contact-form"
              onSubmit={handleSubmit} 
              data-readdy-form
              className="space-y-6"
            >
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-gray-900 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="John Smith"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-900 mb-2">
                  Work Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="john@company.com"
                />
              </div>

              <div>
                <label htmlFor="company" className="block text-sm font-semibold text-gray-900 mb-2">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="Acme Manufacturing"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-semibold text-gray-900 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div>
                <label htmlFor="industry" className="block text-sm font-semibold text-gray-900 mb-2">
                  Industry <span className="text-red-500">*</span>
                </label>
                <select
                  id="industry"
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm cursor-pointer"
                >
                  <option value="">Select your industry</option>
                  <option value="Automotive">Automotive</option>
                  <option value="Aerospace">Aerospace</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Pharmaceuticals">Pharmaceuticals</option>
                  <option value="Food & Beverage">Food & Beverage</option>
                  <option value="Chemical">Chemical</option>
                  <option value="Textile">Textile</option>
                  <option value="Metal Fabrication">Metal Fabrication</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="interest" className="block text-sm font-semibold text-gray-900 mb-2">
                  I'm interested in <span className="text-red-500">*</span>
                </label>
                <select
                  id="interest"
                  name="interest"
                  value={formData.interest}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm cursor-pointer"
                >
                  <option value="">Select an option</option>
                  <option value="Scheduling a Demo">Scheduling a Demo</option>
                  <option value="Starting Free Trial">Starting Free Trial</option>
                  <option value="Pricing Information">Pricing Information</option>
                  <option value="Technical Questions">Technical Questions</option>
                  <option value="Partnership Opportunities">Partnership Opportunities</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-semibold text-gray-900 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={4}
                  maxLength={500}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                  placeholder="Tell us about your process improvement goals..."
                />
                <div className="mt-1 text-right">
                  <span className={`text-xs ${remainingChars < 50 ? 'text-red-500' : 'text-gray-500'}`}>
                    {remainingChars} characters remaining
                  </span>
                </div>
              </div>

              {/* Status Messages */}
              {submitStatus === 'success' && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
                  <i className="ri-checkbox-circle-fill text-green-600 text-xl flex-shrink-0"></i>
                  <div>
                    <p className="text-green-800 font-semibold">Thank you for your interest!</p>
                    <p className="text-green-700 text-sm">We've received your message and will get back to you within 24 hours.</p>
                  </div>
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
                  <i className="ri-error-warning-fill text-red-600 text-xl flex-shrink-0"></i>
                  <div>
                    <p className="text-red-800 font-semibold">Submission Failed</p>
                    <p className="text-red-700 text-sm">{errorMessage || 'Please try again or contact us directly.'}</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-xl transition-all cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center space-x-2">
                    <i className="ri-loader-4-line animate-spin"></i>
                    <span>Submitting...</span>
                  </span>
                ) : (
                  'Submit Request'
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                By submitting this form, you agree to our Privacy Policy and Terms of Service
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
