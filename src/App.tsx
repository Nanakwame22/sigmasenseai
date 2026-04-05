import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppRoutes } from './router';
import ConnectionError from './components/common/ConnectionError';
import { ToastContainer } from './components/common/Toast';
import ErrorBoundary from './components/common/ErrorBoundary';

function AppContent() {
  const { connectionError } = useAuth();

  if (connectionError) {
    return <ConnectionError />;
  }

  return <AppRoutes />;
}

function App() {
  return (
    <BrowserRouter basename={__BASE_PATH__}>
      <AuthProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
        <ToastContainer />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
