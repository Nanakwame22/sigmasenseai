import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"></div>
        <div className="absolute top-0 left-0 w-12 h-12 border-4 border-transparent border-t-teal-400 rounded-full animate-ping"></div>
      </div>
    </div>
  );
};

export { LoadingSpinner };
export default LoadingSpinner;
