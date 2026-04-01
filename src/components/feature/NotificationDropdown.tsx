import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface Alert {
  id: string;
  message: string;
  severity: string;
  created_at: string;
  is_read: boolean;
  title?: string;
  type?: string;
}

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      fetchRecentAlerts();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const fetchRecentAlerts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('id, message, severity, created_at, is_read, title, type')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (alertId: string) => {
    try {
      await supabase
        .from('alerts')
        .update({ is_read: true })
        .eq('id', alertId);
      
      fetchRecentAlerts();
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const alertIds = alerts.map(a => a.id);
      await supabase
        .from('alerts')
        .update({ is_read: true })
        .in('id', alertIds);
      
      fetchRecentAlerts();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'text-red-600 bg-red-50';
      case 'high':
        return 'text-orange-600 bg-orange-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'low':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getTypeColor = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'metric':
        return 'bg-blue-100 text-blue-600';
      case 'anomaly':
        return 'bg-red-100 text-red-600';
      case 'forecast':
        return 'bg-purple-100 text-purple-600';
      case 'quality':
        return 'bg-yellow-100 text-yellow-600';
      case 'system':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-teal-100 text-teal-600';
    }
  };

  const getTypeIcon = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'metric':
        return 'ri-line-chart-line';
      case 'anomaly':
        return 'ri-error-warning-line';
      case 'forecast':
        return 'ri-time-line';
      case 'quality':
        return 'ri-shield-check-line';
      case 'system':
        return 'ri-settings-3-line';
      default:
        return 'ri-notification-3-line';
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const handleViewAll = () => {
    setIsOpen(false);
    navigate('/dashboard/alerts');
  };

  const unreadCount = alerts.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all hover-scale button-press"
      >
        <i className="ri-notification-3-line text-xl"></i>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-bounce-in">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 animate-scale-in">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-teal-600 hover:text-teal-700 transition-colors hover-scale"
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <LoadingSpinner />
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500 animate-fade-in">
                <i className="ri-notification-off-line text-4xl mb-2"></i>
                <p>No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {alerts.map((alert, index) => (
                  <div
                    key={alert.id}
                    className={`p-4 hover:bg-gray-50 transition-all cursor-pointer card-hover animate-slide-up ${
                      !alert.is_read ? 'bg-teal-50/50' : ''
                    }`}
                    style={{ animationDelay: `${index * 0.05}s` }}
                    onClick={() => markAsRead(alert.id)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getTypeColor(alert.type)} hover-scale transition-transform`}>
                        <i className={`${getTypeIcon(alert.type)} text-lg`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!alert.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {alert.title || 'Alert'}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                            {alert.severity}
                          </span>
                          <p className="text-xs text-gray-500">
                            {getTimeAgo(alert.created_at)}
                          </p>
                        </div>
                      </div>
                      {!alert.is_read && (
                        <div className="w-2 h-2 bg-teal-600 rounded-full flex-shrink-0 animate-pulse"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {alerts.length > 0 && (
            <div className="p-3 border-t border-gray-200 text-center">
              <button 
                onClick={handleViewAll}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium transition-colors hover-scale"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
