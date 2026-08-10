export type UserRole = 'cliente' | 'admin' | 'dueño' | 'repartidor' | 'empleado';

export interface AppUser {
  id: number;
  role: UserRole;
  name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'suspended';
}

export interface LoginResponse {
  token: string;
  user: AppUser;
}
