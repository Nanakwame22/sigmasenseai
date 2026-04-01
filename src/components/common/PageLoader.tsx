export default function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="text-center">
        {/* Animated Logo */}
        <div className="mb-8 relative">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center animate-pulse">
            <i className="ri-line-chart-line text-white text-4xl"></i>
          </div>
          <div className="absolute inset-0 w-20 h-20 mx-auto bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl opacity-20 animate-ping"></div>
        </div>

        {/* Loading Text */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Sigma AI</h2>
        <p className="text-gray-600 mb-6">Loading your analytics platform...</p>

        {/* Progress Bar */}
        <div className="w-64 h-1 bg-gray-200 rounded-full overflow-hidden mx-auto">
          <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full animate-[loading_1.5s_ease-in-out_infinite]"></div>
        </div>
      </div>

      <style>{`
        @keyframes loading {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 75%; margin-left: 12.5%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}
