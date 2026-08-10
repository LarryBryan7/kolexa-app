// current-user.decorator.ts — Decorador @CurrentUser()

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// UserPayload: el objeto que JwtStrategy.validate() devuelve
// y que queda guardado en request.user
export interface UserPayload {
  sub: bigint;     // ID del usuario (sub = "subject" en JWT)
  email: string;
  roles: string[]; // ['teacher', 'parent'] etc.
  schoolId?: bigint;
}

// createParamDecorator crea un decorador personalizado de parámetro.
// El segundo argumento 'ctx' nos da acceso al request HTTP.
export const CurrentUser = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserPayload;

    // Si se pasa una propiedad específica: @CurrentUser('email')
    // devuelve solo esa propiedad en lugar del objeto completo
    return data ? user?.[data] : user;
  },
);
