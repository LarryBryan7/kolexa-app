// roles.guard.ts — Guard de autorización por roles

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserPayload } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Leer los roles requeridos del decorador @Roles() (método o clase)
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si no hay roles requeridos, se permite el acceso
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // El usuario autenticado (inyectado por JwtAuthGuard → JwtStrategy.validate())
    const user = context.switchToHttp().getRequest().user as UserPayload;

    // Si no hay usuario o no tiene roles → 403
    if (!user || !Array.isArray(user.roles) || user.roles.length === 0) {
      throw new ForbiddenException('No tienes permisos para acceder a este recurso');
    }

    // Verificar que el usuario tenga al menos uno de los roles requeridos
    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('No tienes permisos para acceder a este recurso');
    }

    return true;
  }
}
