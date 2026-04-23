import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Organization } from '../lib/supabase';
import type { PermissionMatrix } from '../services/accessControl';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  organization: Organization | null;
  organizationId: string | null;
  userRole: string | null;
  userPermissions: PermissionMatrix | null;
  connectionError: string | null;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setCurrentOrganization: (org: Organization, role: string) => void;
  retryConnection: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface PendingInvitation {
  id: string;
  organization_id: string;
  full_name: string | null;
  role: string;
  department: string | null;
  job_title: string | null;
  permissions: PermissionMatrix | null;
  invited_at: string;
  invited_by: string | null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<PermissionMatrix | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserOrganization(session.user);
      } else {
        setOrganization(null);
        setUserRole(null);
        setUserPermissions(null);
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
        await loadUserOrganization(session.user);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to initialize auth:', err);
      setConnectionError('Connection failed. Please refresh the page or try again later.');
      setLoading(false);
    }
  };

  const ensureUserProfile = async (user: User, preferredFullName?: string | null) => {
    const userId = user.id;

    const { data: existingProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      const isNetworkError =
        profileError.message?.includes('Failed to fetch') ||
        profileError.message?.includes('NetworkError') ||
        profileError.message?.includes('fetch');

      if (isNetworkError) {
        setConnectionError('Unable to reach the database. Please check your internet connection and try again.');
        throw profileError;
      }

      throw profileError;
    }

    const fallbackName =
      preferredFullName?.trim() ||
      (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null) ||
      user.email?.split('@')[0] ||
      'User';

    if (!existingProfile) {
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          full_name: fallbackName,
        });

      if (insertError && insertError.code !== '23505') {
        throw insertError;
      }

      return;
    }

    if ((!existingProfile.full_name || existingProfile.full_name === 'User') && fallbackName) {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ full_name: fallbackName })
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating user profile name:', updateError);
      }
    }
  };

  const claimPendingInvitation = async (user: User) => {
    if (!user.email) return false;

    const { data: invitation, error: invitationError } = await supabase
      .from('organization_invitations')
      .select('id, organization_id, full_name, role, department, job_title, permissions, invited_at, invited_by')
      .ilike('email', user.email)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false })
      .limit(1)
      .maybeSingle<PendingInvitation>();

    if (invitationError) {
      console.error('Error loading pending invitation:', invitationError);
      return false;
    }

    if (!invitation) return false;

    await ensureUserProfile(user, invitation.full_name);

    const membershipPayload = {
      user_id: user.id,
      organization_id: invitation.organization_id,
      role: invitation.role,
      department: invitation.department,
      job_title: invitation.job_title,
      status: 'active',
      permissions: invitation.permissions,
      email: user.email,
      invited_at: invitation.invited_at,
      invited_by: invitation.invited_by,
      joined_at: new Date().toISOString(),
    };

    const { error: membershipError } = await supabase
      .from('user_organizations')
      .insert(membershipPayload);

    if (membershipError && membershipError.code !== '23505') {
      console.error('Error claiming invitation membership:', membershipError);
      return false;
    }

    const { error: invitationUpdateError } = await supabase
      .from('organization_invitations')
      .update({
        status: 'accepted',
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    if (invitationUpdateError) {
      console.error('Error marking invitation accepted:', invitationUpdateError);
    }

    const { error: auditError } = await supabase.from('audit_logs').insert({
      organization_id: invitation.organization_id,
      user_id: user.id,
      action: 'team.invitation.accepted',
      entity_type: 'organization_invitation',
      entity_id: invitation.id,
      details: {
        role: invitation.role,
        email: user.email,
      },
      severity: 'info',
      status: 'success',
    });

    if (auditError) {
      console.error('Error writing invitation acceptance audit log:', auditError);
    }

    return true;
  };

  const loadUserOrganization = async (user: User) => {
    try {
      await ensureUserProfile(user);

      let { data: userOrgs, error: orgError } = await supabase
        .from('user_organizations')
        .select('*, organizations(*)')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!userOrgs && user.email) {
        await claimPendingInvitation(user);

        const retryResult = await supabase
          .from('user_organizations')
          .select('*, organizations(*)')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        userOrgs = retryResult.data;
        orgError = retryResult.error;
      }

      if (orgError) {
        console.error('Error loading organization:', orgError);
      }

      if (userOrgs) {
        setOrganization(userOrgs.organizations as Organization);
        setUserRole(userOrgs.role);
        setUserPermissions((userOrgs.permissions as PermissionMatrix | null) ?? null);
      } else {
        setOrganization(null);
        setUserRole(null);
        setUserPermissions(null);
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
    setUserPermissions(null);
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
        userPermissions,
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
