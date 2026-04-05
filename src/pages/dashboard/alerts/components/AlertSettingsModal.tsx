import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';
import { addToast } from '../../../../hooks/useToast';
import { useAuth } from '../../../../contexts/AuthContext';

interface AlertPreferences {
  id?: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  sms_enabled: boolean;
  slack_enabled: boolean;
  frequency: string;
  critical_always: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  notification_email: string;
  sms_phone: string;
  slack_webhook_url: string;
  slack_channel: string;
}

interface AlertSettingsModalProps {
  onClose: () => void;
}

const DEFAULT_PREFS: AlertPreferences = {
  email_enabled: true,
  in_app_enabled: true,
  sms_enabled: false,
  slack_enabled: false,
  frequency: 'realtime',
  critical_always: true,
  quiet_hours_start: '',
  quiet_hours_end: '',
  notification_email: '',
  sms_phone: '',
  slack_webhook_url: '',
  slack_channel: '',
};

export default function AlertSettingsModal({ onClose }: AlertSettingsModalProps) {
  const { user, organization } = useAuth();
  const [prefs, setPrefs] = useState<AlertPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'channels' | 'delivery' | 'schedule'>('channels');
  const [testing, setTesting] = useState<string | null>(null);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [handleEscape]);

  useEffect(() => {
    const fetchPrefs = async () => {
      if (!user?.id || !organization?.id) { setLoading(false); return; }
      try {
        const { data } = await supabase
          .from('alert_preferences')
          .select('*')
          .eq('user_id', user.id)
          .eq('organization_id', organization.id)
          .maybeSingle();

        if (data) {
          setPrefs({
            id: data.id,
            email_enabled: data.email_enabled ?? true,
            in_app_enabled: data.in_app_enabled ?? true,
            sms_enabled: data.sms_enabled ?? false,
            slack_enabled: data.slack_enabled ?? false,
            frequency: data.frequency ?? 'realtime',
            critical_always: data.critical_always ?? true,
            quiet_hours_start: data.quiet_hours_start ?? '',
            quiet_hours_end: data.quiet_hours_end ?? '',
            notification_email: data.notification_email ?? '',
            sms_phone: data.sms_phone ?? '',
            slack_webhook_url: data.slack_webhook_url ?? '',
            slack_channel: data.slack_channel ?? '',
          });
          if (data.quiet_hours_start && data.quiet_hours_end) setQuietHoursEnabled(true);
        } else {
          // Pre-fill email from user account
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('email')
            .eq('id', user.id)
            .maybeSingle();
          if (profile?.email) {
            setPrefs(prev => ({ ...prev, notification_email: profile.email }));
          }
        }
      } catch (err) {
        console.error('Error fetching alert preferences:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPrefs();
  }, [user, organization]);

  const toggle = (field: keyof AlertPreferences) => {
    setPrefs(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSave = async () => {
    if (!user?.id || !organization?.id) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        organization_id: organization.id,
        email_enabled: prefs.email_enabled,
        in_app_enabled: prefs.in_app_enabled,
        sms_enabled: prefs.sms_enabled,
        slack_enabled: prefs.slack_enabled,
        frequency: prefs.frequency,
        critical_always: prefs.critical_always,
        quiet_hours_start: quietHoursEnabled && prefs.quiet_hours_start ? prefs.quiet_hours_start : null,
        quiet_hours_end: quietHoursEnabled && prefs.quiet_hours_end ? prefs.quiet_hours_end : null,
        notification_email: prefs.notification_email.trim() || null,
        sms_phone: prefs.sms_phone.trim() || null,
        slack_webhook_url: prefs.slack_webhook_url.trim() || null,
        slack_channel: prefs.slack_channel.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (prefs.id) {
        const { error } = await supabase.from('alert_preferences').update(payload).eq('id', prefs.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('alert_preferences').insert(payload).select('id').maybeSingle();
        if (error) throw error;
        if (data) setPrefs(prev => ({ ...prev, id: data.id }));
      }

      addToast('Alert preferences saved', 'success');
      onClose();
    } catch (err) {
      console.error('Error saving preferences:', err);
      addToast('Failed to save preferences', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async (channel: 'email' | 'sms' | 'slack') => {
    if (!user?.id || !organization?.id) return;

    // Validate credential exists
    if (channel === 'email' && !prefs.notification_email) {
      addToast('Please enter an email address first', 'warning'); return;
    }
    if (channel === 'sms' && !prefs.sms_phone) {
      addToast('Please enter a phone number first', 'warning'); return;
    }
    if (channel === 'slack' && !prefs.slack_webhook_url) {
      addToast('Please enter a Slack webhook URL first', 'warning'); return;
    }

    setTesting(channel);
    try {
      // Create a temporary test alert
      const { data: testAlert, error: insertErr } = await supabase
        .from('alerts')
        .insert({
          organization_id: organization.id,
          title: 'Test Notification from Sigma',
          message: 'This is a test notification to verify your alert delivery settings are working correctly.',
          description: 'If you received this, your notification channel is configured correctly.',
          severity: 'low',
          alert_type: 'info',
          category: 'System',
          status: 'new',
          is_read: false,
        })
        .select('id')
        .maybeSingle();

      if (insertErr || !testAlert) throw insertErr || new Error('Failed to create test alert');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/send-alert-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            alertId: testAlert.id,
            organizationId: organization.id,
            userId: user.id,
          }),
        }
      );

      const result = await res.json();

      // Clean up test alert
      await supabase.from('alerts').update({ status: 'resolved', is_read: true }).eq('id', testAlert.id);

      if (result.results?.[channel]?.sent) {
        addToast(`Test ${channel} notification sent successfully!`, 'success');
      } else if (result.results?.[channel]?.error) {
        addToast(`${channel} test failed: ${result.results[channel].error}`, 'error');
      } else {
        addToast(`${channel} test sent — check your ${channel === 'email' ? 'inbox' : channel === 'sms' ? 'phone' : 'Slack channel'}`, 'info');
      }
    } catch (err) {
      console.error('Test notification error:', err);
      addToast(`Failed to send test ${channel} notification`, 'error');
    } finally {
      setTesting(null);
    }
  };

  const ToggleSwitch = ({ checked, onChange, label, description, icon }: {
    checked: boolean; onChange: () => void; label: string; description?: string; icon: string;
  }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checked ? 'bg-teal-50' : 'bg-gray-50'}`}>
          <i className={`${icon} text-sm ${checked ? 'text-teal-600' : 'text-gray-400'}`}></i>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
        </div>
      </div>
      <button
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 ${checked ? 'bg-teal-500' : 'bg-gray-200'}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${checked ? 'left-[22px]' : 'left-1'}`} />
      </button>
    </div>
  );

  const tabs = [
    { key: 'channels', label: 'Channels', icon: 'ri-notification-3-line' },
    { key: 'delivery', label: 'Delivery Setup', icon: 'ri-send-plane-line' },
    { key: 'schedule', label: 'Schedule', icon: 'ri-time-line' },
  ] as const;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
              <i className="ri-settings-3-line text-white text-base"></i>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Alert Preferences</h2>
              <p className="text-xs text-gray-500">Configure how and when you receive alerts</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
            <i className="ri-close-line text-gray-500 text-lg"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <i className={`${tab.icon} text-sm`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* ── CHANNELS TAB ── */}
              {activeTab === 'channels' && (
                <>
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Notification Channels</h3>
                    <div className="bg-gray-50/60 rounded-xl px-4 border border-gray-100">
                      <ToggleSwitch
                        checked={prefs.in_app_enabled}
                        onChange={() => toggle('in_app_enabled')}
                        label="In-App Notifications"
                        description="Show alerts inside the dashboard"
                        icon="ri-notification-3-line"
                      />
                      <ToggleSwitch
                        checked={prefs.email_enabled}
                        onChange={() => toggle('email_enabled')}
                        label="Email Notifications"
                        description="Send alerts to your registered email"
                        icon="ri-mail-line"
                      />
                      <ToggleSwitch
                        checked={prefs.sms_enabled}
                        onChange={() => toggle('sms_enabled')}
                        label="SMS Notifications"
                        description="Receive text messages for critical alerts"
                        icon="ri-message-2-line"
                      />
                      <ToggleSwitch
                        checked={prefs.slack_enabled}
                        onChange={() => toggle('slack_enabled')}
                        label="Slack Integration"
                        description="Post alerts to your Slack workspace"
                        icon="ri-slack-line"
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Priority Rules</h3>
                    <div className="bg-gray-50/60 rounded-xl px-4 border border-gray-100">
                      <ToggleSwitch
                        checked={prefs.critical_always}
                        onChange={() => toggle('critical_always')}
                        label="Always Notify for Critical Alerts"
                        description="Override quiet hours for critical severity alerts"
                        icon="ri-alarm-warning-line"
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Delivery Frequency</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'realtime', label: 'Real-time', icon: 'ri-flashlight-line', desc: 'Instant' },
                        { value: 'hourly', label: 'Hourly', icon: 'ri-time-line', desc: 'Digest' },
                        { value: 'daily', label: 'Daily', icon: 'ri-calendar-line', desc: 'Summary' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setPrefs(prev => ({ ...prev, frequency: opt.value }))}
                          className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all cursor-pointer ${
                            prefs.frequency === opt.value
                              ? 'border-teal-400 bg-teal-50 text-teal-700'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <i className={`${opt.icon} text-lg`}></i>
                          <span className="text-xs font-semibold">{opt.label}</span>
                          <span className="text-xs opacity-70">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── DELIVERY SETUP TAB ── */}
              {activeTab === 'delivery' && (
                <div className="space-y-5">
                  {/* Info banner */}
                  <div className="flex items-start gap-3 bg-teal-50 border border-teal-200 rounded-xl p-4">
                    <i className="ri-information-line text-teal-600 text-lg flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-teal-700 leading-relaxed">
                      Configure where notifications are delivered. Enable each channel in the <strong>Channels</strong> tab, then enter the destination here. Use <strong>Test</strong> to verify delivery.
                    </p>
                  </div>

                  {/* Email */}
                  <div className={`rounded-xl border p-4 transition-all ${prefs.email_enabled ? 'border-teal-200 bg-teal-50/30' : 'border-gray-200 bg-gray-50/50 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-white border border-teal-200 flex items-center justify-center">
                          <i className="ri-mail-line text-teal-600 text-sm"></i>
                        </div>
                        <span className="text-sm font-semibold text-gray-800">Email</span>
                        {prefs.email_enabled && prefs.notification_email && (
                          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold">Active</span>
                        )}
                      </div>
                      {prefs.email_enabled && (
                        <button
                          onClick={() => handleTestNotification('email')}
                          disabled={testing !== null}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-teal-700 bg-white border border-teal-300 rounded-lg hover:bg-teal-50 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {testing === 'email' ? <div className="w-3 h-3 border-2 border-teal-400/30 border-t-teal-600 rounded-full animate-spin" /> : <i className="ri-send-plane-line text-xs"></i>}
                          Test
                        </button>
                      )}
                    </div>
                    <input
                      type="email"
                      value={prefs.notification_email}
                      onChange={e => setPrefs(prev => ({ ...prev, notification_email: e.target.value }))}
                      placeholder="you@company.com"
                      disabled={!prefs.email_enabled}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    {!prefs.email_enabled && (
                      <p className="text-xs text-gray-400 mt-1.5">Enable Email in the Channels tab to configure this.</p>
                    )}
                  </div>

                  {/* SMS */}
                  <div className={`rounded-xl border p-4 transition-all ${prefs.sms_enabled ? 'border-teal-200 bg-teal-50/30' : 'border-gray-200 bg-gray-50/50 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-white border border-teal-200 flex items-center justify-center">
                          <i className="ri-message-2-line text-teal-600 text-sm"></i>
                        </div>
                        <span className="text-sm font-semibold text-gray-800">SMS</span>
                        {prefs.sms_enabled && prefs.sms_phone && (
                          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold">Active</span>
                        )}
                      </div>
                      {prefs.sms_enabled && (
                        <button
                          onClick={() => handleTestNotification('sms')}
                          disabled={testing !== null}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-teal-700 bg-white border border-teal-300 rounded-lg hover:bg-teal-50 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {testing === 'sms' ? <div className="w-3 h-3 border-2 border-teal-400/30 border-t-teal-600 rounded-full animate-spin" /> : <i className="ri-send-plane-line text-xs"></i>}
                          Test
                        </button>
                      )}
                    </div>
                    <input
                      type="tel"
                      value={prefs.sms_phone}
                      onChange={e => setPrefs(prev => ({ ...prev, sms_phone: e.target.value }))}
                      placeholder="+1 555 000 0000 (include country code)"
                      disabled={!prefs.sms_enabled}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    {prefs.sms_enabled && (
                      <p className="text-xs text-gray-400 mt-1.5">Powered by Twilio. Requires Twilio credentials in server settings.</p>
                    )}
                    {!prefs.sms_enabled && (
                      <p className="text-xs text-gray-400 mt-1.5">Enable SMS in the Channels tab to configure this.</p>
                    )}
                  </div>

                  {/* Slack */}
                  <div className={`rounded-xl border p-4 transition-all ${prefs.slack_enabled ? 'border-teal-200 bg-teal-50/30' : 'border-gray-200 bg-gray-50/50 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-white border border-teal-200 flex items-center justify-center">
                          <i className="ri-slack-line text-teal-600 text-sm"></i>
                        </div>
                        <span className="text-sm font-semibold text-gray-800">Slack</span>
                        {prefs.slack_enabled && prefs.slack_webhook_url && (
                          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold">Active</span>
                        )}
                      </div>
                      {prefs.slack_enabled && (
                        <button
                          onClick={() => handleTestNotification('slack')}
                          disabled={testing !== null}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-teal-700 bg-white border border-teal-300 rounded-lg hover:bg-teal-50 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {testing === 'slack' ? <div className="w-3 h-3 border-2 border-teal-400/30 border-t-teal-600 rounded-full animate-spin" /> : <i className="ri-send-plane-line text-xs"></i>}
                          Test
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        type="url"
                        value={prefs.slack_webhook_url}
                        onChange={e => setPrefs(prev => ({ ...prev, slack_webhook_url: e.target.value }))}
                        placeholder="https://hooks.slack.com/services/..."
                        disabled={!prefs.slack_enabled}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                      <input
                        type="text"
                        value={prefs.slack_channel}
                        onChange={e => setPrefs(prev => ({ ...prev, slack_channel: e.target.value }))}
                        placeholder="#alerts (optional — uses webhook default)"
                        disabled={!prefs.slack_enabled}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                    {prefs.slack_enabled && (
                      <p className="text-xs text-gray-400 mt-1.5">
                        Create an Incoming Webhook in your Slack workspace settings and paste the URL above.
                      </p>
                    )}
                    {!prefs.slack_enabled && (
                      <p className="text-xs text-gray-400 mt-1.5">Enable Slack in the Channels tab to configure this.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── SCHEDULE TAB ── */}
              {activeTab === 'schedule' && (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Quiet Hours</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Suppress non-critical notifications during these hours</p>
                      </div>
                      <button
                        onClick={() => setQuietHoursEnabled(v => !v)}
                        className={`relative w-11 h-6 rounded-full transition-all duration-300 cursor-pointer ${quietHoursEnabled ? 'bg-teal-500' : 'bg-gray-200'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${quietHoursEnabled ? 'left-[22px]' : 'left-1'}`} />
                      </button>
                    </div>

                    <div className={`overflow-hidden transition-all duration-300 ${quietHoursEnabled ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                      <div className="bg-gray-50/60 rounded-xl p-4 border border-gray-100">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                            <input
                              type="time"
                              value={prefs.quiet_hours_start}
                              onChange={e => setPrefs(prev => ({ ...prev, quiet_hours_start: e.target.value }))}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                            <input
                              type="time"
                              value={prefs.quiet_hours_end}
                              onChange={e => setPrefs(prev => ({ ...prev, quiet_hours_end: e.target.value }))}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Priority Override</h3>
                    <div className="bg-gray-50/60 rounded-xl px-4 border border-gray-100">
                      <ToggleSwitch
                        checked={prefs.critical_always}
                        onChange={() => toggle('critical_always')}
                        label="Always Notify for Critical Alerts"
                        description="Override quiet hours for critical severity alerts"
                        icon="ri-alarm-warning-line"
                      />
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <i className="ri-time-line text-amber-600 text-sm flex-shrink-0 mt-0.5"></i>
                      <div>
                        <p className="text-xs font-semibold text-amber-800">How Quiet Hours Work</p>
                        <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                          During quiet hours, email, SMS, and Slack notifications are suppressed. In-app notifications are always delivered. If "Always Notify for Critical" is on, critical alerts bypass quiet hours.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <i className="ri-save-line"></i>
                Save Preferences
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
