// school-staff-access.ts — Bypass de lectura para school_admin

import { UserPayload } from '../decorators/current-user.decorator';

export function isSchoolAdminOf(user: UserPayload, resourceSchoolId: bigint): boolean {
  return user.roles.includes('school_admin') && user.schoolId === resourceSchoolId;
}
