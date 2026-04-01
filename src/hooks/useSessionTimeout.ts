import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface UseSessionTimeoutOptions {
  /** Total timeout duration in milliseconds (default: 15 min) */
  timeoutDuration?: number;
  /** Warning threshold in milliseconds before logout (default: 2 min) */
  warningDuration?: number;
  /** Callback when warning is triggered */
  onWarning?: () => void;
  /** Callback when timeout occurs */
  onTimeout?: () => void;
}

export function useSessionTimeout({
  timeoutDuration = 15 * 60 * 1000, // 15 minutes
  warningDuration = 2 * 60 * 1000, // 2 minutes before timeout
  onWarning,
  onTimeout,
}: UseSessionTimeoutOptions = {}) {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Log session timeout to audit log (HIPAA requirement)
  const logSessionTimeout = useCallback(async () => {
    if (!user?.id) return;

    try {
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'session_timeout',
        resource_type: 'authentication',
        resource_id: user.id,
        details: {
          reason: 'Automatic logout due to inactivity',
          duration_minutes: timeoutDuration / 1000 / 60,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to log session timeout:', error);
    }
  }, [user, timeoutDuration]);

  // Clear all timers
  const clearAllTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  // Handle timeout - auto logout
  const handleTimeout = useCallback(async () => {
    clearAllTimers();
    setShowWarning(false);

    // Log to audit trail
    await logSessionTimeout();

    // Fire callback
    onTimeout?.();

    // Sign out user
    await signOut();
  }, [clearAllTimers, logSessionTimeout, onTimeout, signOut]);

  // Handle warning display
  const handleWarning = useCallback(() => {
    setShowWarning(true);
    setRemainingTime(warningDuration);

    // Start countdown interval
    const startTime = Date.now();
    countdownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, warningDuration - elapsed);
      setRemainingTime(remaining);

      if (remaining === 0 && countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }, 100); // Update every 100ms for smooth countdown

    onWarning?.();
  }, [warningDuration, onWarning]);

  // Reset inactivity timer
  const resetTimer = useCallback(() => {
    if (!user) return;

    clearAllTimers();
    setShowWarning(false);
    lastActivityRef.current = Date.now();

    // Schedule warning
    warningTimeoutRef.current = setTimeout(() => {
      handleWarning();
    }, timeoutDuration - warningDuration);

    // Schedule timeout
    timeoutRef.current = setTimeout(() => {
      handleTimeout();
    }, timeoutDuration);
  }, [user, clearAllTimers, handleWarning, handleTimeout, timeoutDuration, warningDuration]);

  // Activity event handler
  const handleActivity = useCallback(() => {
    const now = Date.now();
    // Throttle: only reset if more than 1 second since last activity
    if (now - lastActivityRef.current > 1000) {
      resetTimer();
    }
  }, [resetTimer]);

  // Stay logged in - user acknowledged warning
  const stayLoggedIn = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  // Initialize and setup event listeners
  useEffect(() => {
    if (!user) {
      clearAllTimers();
      return;
    }

    // Initial timer setup
    resetTimer();

    // Activity events that reset the timer
    const events = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Cleanup on unmount or user change
    return () => {
      clearAllTimers();
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [user, handleActivity, resetTimer, clearAllTimers]);

  return {
    showWarning,
    remainingTime,
    stayLoggedIn,
    resetTimer,
  };
}