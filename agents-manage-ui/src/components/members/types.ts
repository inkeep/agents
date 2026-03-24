import type { OrgRole } from '@inkeep/agents-core/client-exports';
import { OrgRoles } from '@inkeep/agents-core/client-exports';
import type { useAuthClient } from '@/contexts/auth-client';

type AuthClient = ReturnType<typeof useAuthClient>;

export type Member = AuthClient['$Infer']['Member'];
export type Invitation = AuthClient['$Infer']['Invitation'];

interface RoleOption {
  value: OrgRole;
  label: string;
  description: string;
}

export const ROLE_OPTIONS: RoleOption[] = [
  {
    value: OrgRoles.ADMIN,
    label: 'Admin',
    description: 'Full access to manage organization settings and members',
  },
  {
    value: OrgRoles.MEMBER,
    label: 'Member',
    description: 'Must be added to projects individually with a project role',
  },
];

export const getDisplayRole = (role: string | null): string => {
  if (!role) return '';
  if (role === OrgRoles.OWNER) return 'Owner';
  const roleOption = ROLE_OPTIONS.find((r) => r.value === role);
  return roleOption?.label || role.charAt(0).toUpperCase() + role.slice(1);
};
