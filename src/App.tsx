import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppRoutes } from './router';
import ConnectionError from './components/common/ConnectionError';
import { ToastContainer } from './components/common/Toast';

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
        <AppContent />
        <ToastContainer />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
