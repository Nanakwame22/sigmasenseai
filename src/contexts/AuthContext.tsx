import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, UserOrganization, Organization } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  organization: Organization | null;
  organizationId: string | null;
  userRole: string | null;
  connectionError: string | null;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setCurrentOrganization: (org: Organization, role: string) => void;
  retryConnection: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserOrganization(session.user.id);
      } else {
        setOrganization(null);
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const initializeAuth = async () => {
    try {
      setConnectionError(null);
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Auth session error:', error);
        setConnectionError('Unable to connect to authentication service. Please check your internet connection.');
        setLoading(false);
        return;
      }

      setUser(session?.user ?? null);
      if (session?.user) {
        await loadUserOrganization(session.user.id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to initialize auth:', err);
      setConnectionError('Connection failed. Please refresh the page or try again later.');
      setLoading(false);
    }
  };

  const loadUserOrganization = async (userId: string) => {
    try {
      // First, ensure user profile exists
      const { data: existingProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        const isNetworkError =
          profileError.message?.includes('Failed to fetch') ||
          profileError.message?.includes('NetworkError') ||
          profileError.message?.includes('fetch');

        if (isNetworkError) {
          setConnectionError('Unable to reach the database. Please check your internet connection and try again.');
          setLoading(false);
          return;
        }

        console.error('Error checking user profile:', profileError);
        setLoading(false);
        return;
      }

      // If no profile exists, create one
      if (!existingProfile) {
        console.log('Creating missing user profile...');
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            id: userId,
            full_name: 'User',
          });

        if (insertError && insertError.code !== '23505') {
          console.error('Error creating user profile:', insertError);
        }
      }

      // Then load organization
      const { data: userOrgs, error: orgError } = await supabase
        .from('user_organizations')
        .select('*, organizations(*)')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (orgError) {
        console.error('Error loading organization:', orgError);
      } else if (userOrgs) {
        setOrganization(userOrgs.organizations as Organization);
        setUserRole(userOrgs.role);
      }
    } catch (error: any) {
      const isNetworkError =
        error?.message?.includes('Failed to fetch') ||
        error?.message?.includes('NetworkError') ||
        error?.message?.includes('fetch');

      if (isNetworkError) {
        setConnectionError('Connection failed. Please check your internet connection and refresh the page.');
      } else {
        console.error('Error loading organization:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/auth/login`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) throw error;

      if (data.user) {
        await supabase.from('user_profiles').insert({
          id: data.user.id,
          full_name: fullName,
        });
      }
    } catch (error: any) {
      if (error.message?.includes('fetch')) {
        throw new Error('Connection failed. Please check your internet connection and try again.');
      }
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();

        if (!existingProfile) {
          await supabase.from('user_profiles').insert({
            id: data.user.id,
            full_name: data.user.email?.split('@')[0] || 'User',
          });
        }
      }
    } catch (error: any) {
      if (error.message?.includes('fetch')) {
        throw new Error('Connection failed. Please check your internet connection and try again.');
      }
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setOrganization(null);
    setUserRole(null);
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    } catch (error: any) {
      if (error.message?.includes('fetch')) {
        throw new Error('Connection failed. Please check your internet connection and try again.');
      }
      throw error;
    }
  };

  const setCurrentOrganization = (org: Organization, role: string) => {
    setOrganization(org);
    setUserRole(role);
  };

  const retryConnection = async () => {
    setLoading(true);
    await initializeAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        organization,
        organizationId: organization?.id || null,
        userRole,
        connectionError,
        signUp,
        signIn,
        signOut,
        resetPassword,
        setCurrentOrganization,
        retryConnection,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
