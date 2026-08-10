// jwt.strategy.ts — Estrategia de validación JWT

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserPayload } from '../../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      // fromAuthHeaderAsBearerToken() extrae el token del header:
      // Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // ignoreExpiration: false → rechaza tokens expirados (seguridad)
      ignoreExpiration: false,

      // La misma clave secreta usada para firmar el token en AuthService
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any): Promise<UserPayload> {
    // Verificar que el usuario sigue existiendo y está activo.
    // Un usuario podría haber sido desactivado después de obtener el token.
    const user = await this.prisma.user.findFirst({
      where: {
        id: BigInt(payload.sub),
        isActive: true,
        deletedAt: null, // no está eliminado
      },
      include: {
        // Cargamos los roles para incluirlos en el payload
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    // Retornamos el objeto que quedará en request.user
    return {
      sub: user.id,
      email: user.email,
      roles: user.userRoles.map((ur) => ur.role.name),
      schoolId: user.userRoles[0]?.schoolId ?? undefined,
    };
  }
}
