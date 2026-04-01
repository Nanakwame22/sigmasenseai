import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { exportToPDF, exportToCSV, exportToExcel, exportChartAsImage, downloadTemplate } from '../../utils/exportUtils';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface TeamMember {
  id: string;
  user_id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'admin' | 'manager' | 'analyst' | 'viewer';
  department?: string;
  job_title?: string;
  phone?: string;
  avatar_url?: string;
  status: 'active' | 'inactive' | 'pending';
  permissions: {
    metrics: { read: boolean; write: boolean; delete: boolean };
    projects: { read: boolean; write: boolean; delete: boolean };
    reports: { read: boolean; write: boolean; delete: boolean };
    team: { read: boolean; write: boolean; delete: boolean };
    settings: { read: boolean; write: boolean; delete: boolean };
  };
  last_active_at?: string;
  invited_at?: string;
  invited_by?: string;
  joined_at?: string;
  created_at: string;
}

interface InviteForm {
  email: string;
  full_name: string;
  role: TeamMember['role'];
  department: string;
  job_title: string;
  message: string;
}

const TeamPage: React.FC = () => {
  const { user, organizationId } = useAuth();
  const { showToast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: '',
    full_name: '',
    role: 'viewer',
    department: '',
    job_title: '',
    message: '',
  });

  const rolePermissions = {
    owner: {
      metrics: { read: true, write: true, delete: true },
      projects: { read: true, write: true, delete: true },
      reports: { read: true, write: true, delete: true },
      team: { read: true, write: true, delete: true },
      settings: { read: true, write: true, delete: true },
    },
    admin: {
      metrics: { read: true, write: true, delete: true },
      projects: { read: true, write: true, delete: true },
      reports: { read: true, write: true, delete: true },
      team: { read: true, write: true, delete: false },
      settings: { read: true, write: true, delete: false },
    },
    manager: {
      metrics: { read: true, write: true, delete: false },
      projects: { read: true, write: true, delete: false },
      reports: { read: true, write: true, delete: false },
      team: { read: true, write: false, delete: false },
      settings: { read: true, write: false, delete: false },
    },
    analyst: {
      metrics: { read: true, write: true, delete: false },
      projects: { read: true, write: false, delete: false },
      reports: { read: true, write: true, delete: false },
      team: { read: true, write: false, delete: false },
      settings: { read: false, write: false, delete: false },
    },
    viewer: {
      metrics: { read: true, write: false, delete: false },
      projects: { read: true, write: false, delete: false },
      reports: { read: true, write: false, delete: false },
      team: { read: true, write: false, delete: false },
      settings: { read: false, write: false, delete: false },
    },
  };

  useEffect(() => {
    if (organizationId) {
      fetchTeamMembers();
    }
  }, [organizationId]);

  const fetchTeamMembers = async () => {
    try {
      setLoading(true);
      
      // Fetch user_organizations data
      const { data: userOrgs, error: userOrgsError } = await supabase
        .from('user_organizations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (userOrgsError) throw userOrgsError;

      // Get unique user IDs
      const userIds = userOrgs?.map(org => org.user_id).filter(Boolean) || [];

      // Fetch user profiles separately if we have user IDs
      let userProfiles: any[] = [];
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);

        if (!profilesError && profiles) {
          userProfiles = profiles;
        }
      }

      // Create a map of user profiles for quick lookup
      const profileMap = new Map(userProfiles.map(p => [p.id, p]));

      // Format members with profile data
      const formattedMembers = userOrgs?.map(member => {
        const profile = profileMap.get(member.user_id);
        return {
          id: member.id,
          user_id: member.user_id,
          organization_id: member.organization_id,
          email: member.email || '',
          full_name: profile?.full_name || member.email || 'Unknown',
          role: member.role,
          department: member.department,
          job_title: member.job_title,
          phone: member.phone,
          avatar_url: profile?.avatar_url,
          status: member.status,
          permissions: member.permissions || rolePermissions[member.role as keyof typeof rolePermissions],
          last_active_at: member.last_active_at,
          invited_at: member.invited_at,
          invited_by: member.invited_by,
          joined_at: member.joined_at,
          created_at: member.created_at,
        };
      }) || [];

      setMembers(formattedMembers);
    } catch (error) {
      console.error('Error fetching team members:', error);
      showToast('Failed to load team members', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('user_organizations').insert({
        organization_id: organizationId,
        email: inviteForm.email,
        role: inviteForm.role,
        department: inviteForm.department,
        job_title: inviteForm.job_title,
        status: 'pending',
        permissions: rolePermissions[inviteForm.role],
        invited_at: new Date().toISOString(),
        invited_by: user?.id,
      });

      if (error) throw error;

      setShowInviteModal(false);
      setInviteForm({
        email: '',
        full_name: '',
        role: 'viewer',
        department: '',
        job_title: '',
        message: '',
      });
      fetchTeamMembers();
      showToast('Invitation sent successfully!', 'success');
    } catch (error) {
      console.error('Error inviting member:', error);
      showToast('Failed to send invitation', 'error');
    }
  };

  const handleUpdateMember = async (memberId: string, updates: Partial<TeamMember>) => {
    try {
      const { error } = await supabase
        .from('user_organizations')
        .update(updates)
        .eq('id', memberId);

      if (error) throw error;
      fetchTeamMembers();
      showToast('Member updated successfully', 'success');
    } catch (error) {
      console.error('Error updating member:', error);
      showToast('Failed to update member', 'error');
    }
  };

  const handleUpdatePermissions = async () => {
    if (!selectedMember) return;
    try {
      const { error } = await supabase
        .from('user_organizations')
        .update({ permissions: selectedMember.permissions })
        .eq('id', selectedMember.id);

      if (error) throw error;
      setShowPermissionsModal(false);
      fetchTeamMembers();
      showToast('Permissions updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating permissions:', error);
      showToast('Failed to update permissions', 'error');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setMemberToDelete(memberId);
    setShowDeleteConfirm(true);
  };

  const confirmRemoveMember = async () => {
    if (!memberToDelete) return;
    
    try {
      const { error } = await supabase
        .from('user_organizations')
        .delete()
        .eq('id', memberToDelete);

      if (error) throw error;
      fetchTeamMembers();
      showToast('Team member removed successfully', 'success');
    } catch (error) {
      console.error('Error removing member:', error);
      showToast('Failed to remove member', 'error');
    } finally {
      setShowDeleteConfirm(false);
      setMemberToDelete(null);
    }
  };

  const handleDownloadTemplate = () => {
    downloadTemplate(
      'Team_Members_Import_Template',
      [
        { name: 'name', description: 'Full name (required)', example: 'John Smith' },
        { name: 'email', description: 'Email address (required)', example: 'john.smith@company.com' },
        { name: 'role', description: 'admin/analyst/viewer (required)', example: 'analyst' },
        { name: 'department', description: 'Department name', example: 'Quality Improvement' },
        { name: 'job_title', description: 'Job title', example: 'Quality Analyst' },
        { name: 'status', description: 'active/pending/inactive', example: 'active' }
      ]
    );
  };

  const handleExportPDF = () => {
    exportToPDF(
      'Team Members Report',
      filteredMembers,
      [
        { header: 'Name', dataKey: 'full_name' },
        { header: 'Email', dataKey: 'email' },
        { header: 'Role', dataKey: 'role' },
        { header: 'Department', dataKey: 'department' },
        { header: 'Job Title', dataKey: 'job_title' },
        { header: 'Status', dataKey: 'status' },
      ],
      {
        orientation: 'landscape',
        includeDate: true,
        includeStats: [
          { label: 'Total Members', value: stats.total.toString() },
          { label: 'Active Members', value: stats.active.toString() },
          { label: 'Pending Invites', value: stats.pending.toString() },
          { label: 'Admins', value: stats.admins.toString() },
        ]
      }
    );
  };

  const handleExportCSV = () => {
    exportToCSV(filteredMembers, 'team_members');
  };

  const handleExportExcel = () => {
    exportToExcel(
      filteredMembers,
      'Team_Members',
      'Team Members',
      {
        includeStats: [
          { label: 'Total Members', value: stats.total.toString() },
          { label: 'Active Members', value: stats.active.toString() },
          { label: 'Pending Invites', value: stats.pending.toString() },
          { label: 'Admins', value: stats.admins.toString() },
        ],
        columns: ['full_name', 'email', 'role', 'department', 'job_title', 'status', 'last_active_at']
      }
    );
  };

  const handleExportRoleChart = async () => {
    const chartElement = document.querySelector('#role-chart-container');
    if (chartElement) {
      await exportChartAsImage(chartElement as HTMLElement, 'team_roles_distribution');
    }
  };

  const handleExportDepartmentChart = async () => {
    const chartElement = document.querySelector('#department-chart-container');
    if (chartElement) {
      await exportChartAsImage(chartElement as HTMLElement, 'department_distribution');
    }
  };

  const filteredMembers = members.filter(member => {
    const matchesSearch = member.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || member.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || member.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const stats = {
    total: members.length,
    active: members.filter(m => m.status === 'active').length,
    pending: members.filter(m => m.status === 'pending').length,
    admins: members.filter(m => ['owner', 'admin'].includes(m.role)).length,
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-700';
      case 'admin': return 'bg-blue-100 text-blue-700';
      case 'manager': return 'bg-green-100 text-green-700';
      case 'analyst': return 'bg-yellow-100 text-yellow-700';
      case 'viewer': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'inactive': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="text-sm text-gray-600 mt-1">Manage team members, roles, and permissions</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Export Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap flex items-center"
            >
              <i className="ri-download-2-line mr-2"></i>
              <span className="hidden sm:inline">Download Template</span>
              <span className="sm:hidden">Template</span>
            </button>
            
            <button
              onClick={handleExportPDF}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap flex items-center"
            >
              <i className="ri-file-pdf-line mr-2"></i>
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 whitespace-nowrap"
              title="Export to CSV"
            >
              <i className="ri-file-excel-line"></i>
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
              title="Export to Excel"
            >
              <i className="ri-file-excel-2-line"></i>
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-2"
            >
              <i className="ri-user-add-line"></i>
              Invite Member
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-600">Total Members</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          <div className="text-sm text-gray-600">Active</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-sm text-gray-600">Pending Invites</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">{stats.admins}</div>
          <div className="text-sm text-gray-600">Admins</div>
        </div>
      </div>

      {/* NEW: Visualizations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Roles Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6" id="role-chart-container">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Team Roles Distribution</h3>
            <button
              onClick={handleExportRoleChart}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Export Chart"
            >
              <i className="ri-download-line"></i>
            </button>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={getRoleDistribution(members)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={90}
                fill="#8884d8"
                dataKey="value"
              >
                {getRoleDistribution(members).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={ROLE_COLORS[entry.name as keyof typeof ROLE_COLORS] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Department Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6" id="department-chart-container">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Department Distribution</h3>
            <button
              onClick={handleExportDepartmentChart}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Export Chart"
            >
              <i className="ri-download-line"></i>
            </button>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={getDepartmentDistribution(members)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis dataKey="department" type="category" stroke="#6b7280" style={{ fontSize: '12px' }} width={100} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="count" fill="#14b8a6" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="grid grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Search members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="analyst">Analyst</option>
            <option value="viewer">Viewer</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Team Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMembers.map((member) => (
          <div key={member.id} className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt={member.full_name} className="w-12 h-12 rounded-full" />
                  ) : (
                    <span className="text-teal-600 font-semibold text-lg">
                      {member.full_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{member.full_name}</div>
                  <div className="text-sm text-gray-600">{member.email}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {member.job_title && (
                <div className="text-sm text-gray-600">
                  <i className="ri-briefcase-line mr-2"></i>
                  {member.job_title}
                </div>
              )}
              {member.department && (
                <div className="text-sm text-gray-600">
                  <i className="ri-building-line mr-2"></i>
                  {member.department}
                </div>
              )}
              {member.last_active_at && (
                <div className="text-sm text-gray-600">
                  <i className="ri-time-line mr-2"></i>
                  Last active: {new Date(member.last_active_at).toLocaleDateString()}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(member.role)}`}>
                {member.role?.toUpperCase() || 'UNKNOWN'}
              </span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(member.status || 'inactive')}`}>
                {member.status?.toUpperCase() || 'INACTIVE'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedMember(member);
                  setShowEditModal(true);
                }}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  setSelectedMember(member);
                  setShowPermissionsModal(true);
                }}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Permissions
              </button>
              {member.role !== 'owner' && (
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="px-3 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Invite Team Member</h2>
            </div>
            <form onSubmit={handleInviteMember} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={inviteForm.full_name}
                    onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as TeamMember['role'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="analyst">Analyst</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={inviteForm.department}
                    onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={inviteForm.job_title}
                  onChange={(e) => setInviteForm({ ...inviteForm, job_title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Personal Message (Optional)</label>
                <textarea
                  value={inviteForm.message}
                  onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Add a personal message to the invitation..."
                />
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Role Permissions</h3>
                <div className="text-xs text-blue-700 space-y-1">
                  {inviteForm.role === 'viewer' && <p>• Can view all data but cannot make changes</p>}
                  {inviteForm.role === 'analyst' && <p>• Can view and edit metrics and reports</p>}
                  {inviteForm.role === 'manager' && <p>• Can manage projects and team members</p>}
                  {inviteForm.role === 'admin' && <p>• Full access except organization deletion</p>}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Edit Team Member</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={selectedMember.role}
                  onChange={(e) => setSelectedMember({ ...selectedMember, role: e.target.value as TeamMember['role'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={selectedMember.role === 'owner'}
                >
                  <option value="viewer">Viewer</option>
                  <option value="analyst">Analyst</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={selectedMember.status}
                  onChange={(e) => setSelectedMember({ ...selectedMember, status: e.target.value as TeamMember['status'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  value={selectedMember.department || ''}
                  onChange={(e) => setSelectedMember({ ...selectedMember, department: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={selectedMember.job_title || ''}
                  onChange={(e) => setSelectedMember({ ...selectedMember, job_title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleUpdateMember(selectedMember.id, {
                      role: selectedMember.role,
                      status: selectedMember.status,
                      department: selectedMember.department,
                      job_title: selectedMember.job_title,
                    });
                    setShowEditModal(false);
                  }}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showPermissionsModal && selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Manage Permissions</h2>
              <p className="text-sm text-gray-600 mt-1">{selectedMember.full_name} - {selectedMember.role}</p>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {Object.entries(selectedMember.permissions).map(([category, perms]) => (
                  <div key={category} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3 capitalize">{category}</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={perms.read}
                          onChange={(e) => {
                            const newPermissions = { ...selectedMember.permissions };
                            newPermissions[category as keyof typeof newPermissions].read = e.target.checked;
                            setSelectedMember({ ...selectedMember, permissions: newPermissions });
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-gray-700">Read</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={perms.write}
                          onChange={(e) => {
                            const newPermissions = { ...selectedMember.permissions };
                            newPermissions[category as keyof typeof newPermissions].write = e.target.checked;
                            setSelectedMember({ ...selectedMember, permissions: newPermissions });
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-gray-700">Write</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={perms.delete}
                          onChange={(e) => {
                            const newPermissions = { ...selectedMember.permissions };
                            newPermissions[category as keyof typeof newPermissions].delete = e.target.checked;
                            setSelectedMember({ ...selectedMember, permissions: newPermissions });
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-gray-700">Delete</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-6">
                <button
                  onClick={() => setShowPermissionsModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdatePermissions}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  Save Permissions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Remove Team Member"
        message="Are you sure you want to remove this team member? This action cannot be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={confirmRemoveMember}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setMemberToDelete(null);
        }}
        variant="danger"
      />
    </div>
  );
};

// Role colors for pie chart
const ROLE_COLORS = {
  'Owner': '#8b5cf6',
  'Admin': '#3b82f6',
  'Manager': '#14b8a6',
  'Analyst': '#f59e0b',
  'Viewer': '#6b7280'
};

// Helper function to get role distribution
function getRoleDistribution(members: any[]) {
  const roleCounts: Record<string, number> = {};
  members.forEach(member => {
    roleCounts[member.role] = (roleCounts[member.role] || 0) + 1;
  });
  
  return Object.entries(roleCounts).map(([name, value]) => ({ name, value }));
}

// Helper function to get department distribution
function getDepartmentDistribution(members: any[]) {
  const deptCounts: Record<string, number> = {};
  members.forEach(member => {
    const dept = member.department || 'Unassigned';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });
  
  return Object.entries(deptCounts)
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);
}

export default TeamPage;
