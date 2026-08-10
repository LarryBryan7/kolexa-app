// jwt-auth.guard.ts — Guard de autenticación JWT

import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  // canActivate se llama ANTES de que la petición llegue al controlador
  canActivate(context: ExecutionContext) {
    // Verificar si el endpoint está marcado como @Public()
    // Si es público, dejamos pasar sin verificar el JWT
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // decorador en el método
      context.getClass(),   // decorador en la clase
    ]);

    if (isPublic) {
      return true; // sin autenticación requerida
    }

    // Para endpoints protegidos, delegamos a AuthGuard('jwt')
    // que internamente llama a JwtStrategy.validate()
    return super.canActivate(context);
  }

  // handleRequest se llama después de que passport valida el token.
  // Si hay error o no hay usuario → lanzamos 401
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw new UnauthorizedException(
        'Token inválido o expirado. Por favor inicia sesión nuevamente.',
      );
    }
    return user; // el usuario queda disponible en request.user
  }
}
