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

  private static readonly ACTIVE_CACHE_TTL_MS = 30_000;
  private readonly activeUserCache = new Map<string, { email: string; expiresAt: number }>();

  private static readonly ACTIVE_WRITE_THROTTLE_MS = 60_000;
  private readonly lastActiveWriteCache = new Map<string, number>();

  async validate(payload: any): Promise<UserPayload> {
    const userId = BigInt(payload.sub);
    const cacheKey = String(payload.sub);
    const cached = this.activeUserCache.get(cacheKey);
    const now = Date.now();

    let email: string;
    if (cached && cached.expiresAt > now) {
      email = cached.email;
    } else {
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
          isActive: true,
          deletedAt: null, // no está eliminado
        },
        select: {
          id: true,
          email: true,
        },
      });

      if (!user) {
        this.activeUserCache.delete(cacheKey);
        throw new UnauthorizedException('Usuario no encontrado o inactivo');
      }

      email = user.email;
      this.activeUserCache.set(cacheKey, {
        email,
        expiresAt: now + JwtStrategy.ACTIVE_CACHE_TTL_MS,
      });
    }

    // Fire-and-forget, nunca bloquea el request: si esta escritura falla o
    // tarda, no debe afectar la respuesta real que pidió el usuario.
    const lastWrite = this.lastActiveWriteCache.get(cacheKey) ?? 0;
    if (now - lastWrite > JwtStrategy.ACTIVE_WRITE_THROTTLE_MS) {
      this.lastActiveWriteCache.set(cacheKey, now);
      this.prisma.user
        .update({ where: { id: userId }, data: { lastActiveAt: new Date() } })
        .catch(() => {});
    }

    let schoolId: bigint | undefined;
    if (payload.schoolId) {
      schoolId = BigInt(payload.schoolId);
    } else {
      const role = await this.prisma.userRole.findFirst({
        where: { userId },
        select: { schoolId: true },
      });
      schoolId = role?.schoolId ?? undefined;
    }

    return {
      sub: userId,
      email,
      roles: payload.roles ?? [],
      schoolId,
    };
  }
}
