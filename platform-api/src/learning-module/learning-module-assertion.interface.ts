import { UserRole } from 'src/user/user-role';

export interface LearningModuleAssertionPayload {
  sub: number;
  role: UserRole;
  aud: string;
  exp?: number;
}

export interface ModuleRequestContext {
  moduleId: string;
  userId: number;
  role: UserRole;
}
