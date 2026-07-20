export type Role = 'super_admin' | 'admin_client' | 'hr' | 'manager' | 'candidate';
export interface SessionUser {
  id: string; email: string; role: Role;
  tenantSchema: string; djangoAccessToken?: string;
}
