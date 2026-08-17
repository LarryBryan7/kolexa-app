// roles.decorator.ts — Decorador @Roles()

import { SetMetadata } from '@nestjs/common';

// Clave usada por RolesGuard para leer este metadato
export const ROLES_KEY = 'roles';

// @Roles(...roles) es un alias de @SetMetadata('roles', roles)
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
