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
    const user = await this.prisma.user.findFirst({
      where: {
        id: BigInt(payload.sub),
        isActive: true,
        deletedAt: null, // no está eliminado
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    let schoolId: bigint | undefined;
    if (payload.schoolId) {
      schoolId = BigInt(payload.schoolId);
    } else {
      const role = await this.prisma.userRole.findFirst({
        where: { userId: user.id },
        select: { schoolId: true },
      });
      schoolId = role?.schoolId ?? undefined;
    }

    return {
      sub: user.id,
      email: user.email,
      roles: payload.roles ?? [],
      schoolId,
    };
  }
}
