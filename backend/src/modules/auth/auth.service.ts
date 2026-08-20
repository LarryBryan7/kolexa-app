// auth.service.ts — Lógica de negocio de autenticación

import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterWithTokenDto } from './dto/register.dto';
import { GoogleLoginDto } from './dto/google-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private storage: SupabaseStorageService,
  ) {}

  private async _signAvatarPaths(
    students: { avatar: string | null }[],
  ): Promise<Map<string, string>> {
    const paths = students
      .map((s) => s.avatar)
      .filter((a): a is string => a !== null);
    if (paths.length === 0) return new Map();
    const signed = await this.storage.getSignedUrls(paths, 3600, 'avatars');
    return new Map(paths.map((p, i) => [p, signed[i] ?? '']));
  }

  // ── LOGIN ──────────────────────────────────────────────
  // Verifica credenciales y devuelve accessToken + refreshToken
  async login(dto: LoginDto) {
    // 1. Buscar el usuario por email en la BD (solo campos directos, sin joins)
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true, email: true, passwordHash: true, firstName: true, lastName: true,
        avatar: true, needsPasswordChange: true, isActive: true, deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const [isPasswordValid, rolesData, studentsData] = await Promise.all([
      bcrypt.compare(dto.password, user.passwordHash),
      this._loadRolesForLogin(user.id),
      this._loadStudentsForLogin(user.id),
    ]);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const roles = rolesData
      .map((r) => r.roleName)
      .filter((n): n is string => n !== null && n !== undefined);
    const schoolId = rolesData[0]?.schoolId ?? null;

    const [tokens] = await Promise.all([
      this.generateTokens(user, roles, schoolId),
      (async () => {
        if (dto.firebaseToken) {
          try {
            await this.savePushToken(user.id, dto.firebaseToken);
          } catch (err) {
            // savePushToken no debe bloquear ni romper el login.
            console.error('[AUTH-LOGIN] Error al guardar push token:', err);
          }
        }
      })(),
    ]);

    // 5. Cargar hijos si es padre de familia
    const isParent = rolesData.some((r) => r.roleName === 'parent');
    let children: {
      id: string; firstName: string; lastName: string; code: string;
      birthday: string | null; section: string | null; avatarUrl: string | null;
    }[] = [];
    if (isParent) {
      const signedAvatars = await this._signAvatarPaths(studentsData.map((l) => l.student));
      children = studentsData.map((l) => ({
        id: l.student.id.toString(),
        firstName: l.student.firstName,
        lastName: l.student.lastName,
        code: l.student.code ?? '',
        birthday: l.student.birthday ? l.student.birthday.toISOString().split('T')[0] : null,
        section: l.student.enrollments[0]?.classroom?.name ?? null,
        avatarUrl: l.student.avatar ? (signedAvatars.get(l.student.avatar) ?? null) : null,
      }));
    }

    // 6. Devolver los tokens y la información del usuario
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      needsPasswordChange: user.needsPasswordChange,
      user: {
        id: user.id.toString(), // BigInt no se serializa en JSON → convertir a string
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        roles: rolesData.map((ur) => ({
          role: ur.roleName,
          schoolId: ur.schoolId?.toString(),
          schoolName: ur.schoolName,
        })),
        children,
      },
    };
  }

  // ── LOGIN CON GOOGLE (FASE 1) ──────────────────────────
  // ── loginWithGoogle ───────────────────────────────────────
  async loginWithGoogle(dto: GoogleLoginDto) {
    // 1. Validar el ID Token con Google — SIN CAMBIOS respecto a la
    //    validación criptográfica original (firma, issuer, audience, exp).
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new UnauthorizedException('Google Sign-In no está configurado');
    }

    const client = new OAuth2Client(clientId);
    let payload: any;
    try {
      const ticket = await client.verifyIdToken({
        idToken: dto.idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (err) {
      throw new UnauthorizedException('El ID Token de Google es inválido o ha expirado');
    }

    if (!payload || !payload.sub || !payload.email) {
      throw new UnauthorizedException('El ID Token de Google no contiene datos válidos');
    }
    if (payload.email_verified !== true) {
      throw new UnauthorizedException('INVITATION_EMAIL_MISMATCH');
    }
    const googleEmail = (payload.email as string).trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { googleSub: payload.sub },
      select: {
        id: true, email: true, firstName: true, lastName: true, avatar: true,
        needsPasswordChange: true, isActive: true, deletedAt: true,
      },
    });
    if (existing && (!existing.isActive || existing.deletedAt)) {
      throw new UnauthorizedException('La cuenta está inactiva o ha sido eliminada');
    }

    let user = existing;

    const returningParent = existing && !dto.invitationToken
      ? await this.prisma.parent.findFirst({ where: { userId: existing.id }, select: { id: true } })
      : null;

    if (existing && returningParent) {
    } else {
    if (!dto.invitationToken) {
      throw new UnauthorizedException('INVITATION_REQUIRED');
    }

    const invitation = await this.prisma.schoolInvitation.findUnique({
      where: { token: dto.invitationToken },
    });
    if (!invitation) throw new NotFoundException('INVITATION_NOT_FOUND');

    // Validación estructural: la invitación debe ser de tipo Parent.
    const parentRole = await this.prisma.role.findUnique({
      where: { name: 'parent' },
      select: { id: true },
    });
    if (!parentRole || invitation.roleId !== parentRole.id || !invitation.parentId) {
      throw new BadRequestException('INVITATION_INVALID_ROLE');
    }

    const parentRecord = await this.prisma.parent.findUnique({ where: { id: invitation.parentId } });
    if (!parentRecord || parentRecord.schoolId !== invitation.schoolId) {
      throw new BadRequestException('INVITATION_INVALID_ROLE');
    }

    // 4. Ramificación por el estado de Parent.userId — Casos A/B/C.
    if (parentRecord.userId !== null) {
      if (existing && parentRecord.userId === existing.id) {
        user = existing;
      } else {
        // Caso C — vinculado a otro usuario. Rechazar siempre, sin excepción.
        throw new ConflictException('INVITATION_ALREADY_USED');
      }
    } else {
      if (invitation.usedAt) throw new ConflictException('INVITATION_ALREADY_USED');
      if (invitation.expiresAt < new Date()) throw new BadRequestException('INVITATION_EXPIRED');

      // Regla de identidad del padre: email obligatorio, coincidencia exacta
      // normalizada. Nunca se permite elegir qué Parent reclamar.
      if (!invitation.email) {
        throw new BadRequestException('INVITATION_INVALID_ROLE');
      }
      if (invitation.email.trim().toLowerCase() !== googleEmail) {
        throw new UnauthorizedException('INVITATION_EMAIL_MISMATCH');
      }

      let precomputedPasswordHash: string | undefined;
      if (!user) {
        const randomPassword = crypto.randomBytes(32).toString('hex');
        precomputedPasswordHash = await bcrypt.hash(randomPassword, 10);
      }

      const runLinkingTransaction = async (knownUser: typeof user) => {
        return this.prisma.$transaction(async (tx) => {
          let txUser = knownUser;
          if (!txUser) {
            txUser = await tx.user.create({
              data: {
                email: googleEmail,
                passwordHash: precomputedPasswordHash!,
                firstName: payload.given_name ?? '',
                lastName: payload.family_name ?? '',
                avatar: payload.picture ?? null,
                googleSub: payload.sub,
                isActive: true,
              },
            });
          }

          await tx.userRole.upsert({
            where: {
              userId_roleId_schoolId: {
                userId: txUser.id,
                roleId: invitation.roleId,
                schoolId: invitation.schoolId,
              },
            },
            create: { userId: txUser.id, roleId: invitation.roleId, schoolId: invitation.schoolId },
            update: {},
          });

          const linked = await tx.parent.updateMany({
            where: { id: invitation.parentId!, userId: null },
            data: { userId: txUser.id, linkStatus: 'linked' },
          });
          if (linked.count === 0) {
            const current = await tx.parent.findUnique({
              where: { id: invitation.parentId! },
              select: { userId: true },
            });
            if (current?.userId !== txUser.id) {
              throw new ConflictException('INVITATION_ALREADY_USED');
            }
            // Ganamos nosotros mismos en la petición gemela — continuar.
          }

          const parentStudents = await tx.parentStudent.findMany({
            where: { parentId: invitation.parentId! },
            select: { studentId: true, relationship: true, isPrimary: true },
          });
          if (parentStudents.length > 0) {
            await tx.userStudent.createMany({
              data: parentStudents.map((ps) => ({
                userId: txUser!.id,
                studentId: ps.studentId,
                relationship: ps.relationship,
                isPrimary: ps.isPrimary,
              })),
              skipDuplicates: true,
            });
          }

          const claimed = await tx.schoolInvitation.updateMany({
            where: { id: invitation.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          if (claimed.count === 0) {
            const currentInv = await tx.schoolInvitation.findUnique({
              where: { id: invitation.id },
              select: { usedAt: true },
            });
            if (!currentInv?.usedAt) {
              throw new ConflictException('INVITATION_ALREADY_USED');
            }
            // Idempotente — la petición gemela ya la consumió, no relanzar.
          }

          return txUser;
        });
      };

      try {
        user = await runLinkingTransaction(user);
      } catch (err: any) {
        if (err?.code === 'P2002' && !user) {
          const raceWinner = await this.prisma.user.findUnique({ where: { googleSub: payload.sub } });
          if (raceWinner) {
            user = await runLinkingTransaction(raceWinner);
          } else {
            throw new ConflictException(
              'Ya existe una cuenta con este correo. Inicia sesión con tu correo y contraseña.',
            );
          }
        } else {
          throw err;
        }
      }
    }
    } // fin else (no era un padre de retorno) — ver comentario del paso 2

    if (!user) {
      throw new UnauthorizedException('No se pudo resolver la cuenta de usuario');
    }

    // 6. Cargar roles + students (mismo mecanismo que login).
    const [rolesData, studentsData] = await Promise.all([
      this._loadRolesForLogin(user.id),
      this._loadStudentsForLogin(user.id),
    ]);

    const roles = rolesData
      .map((r) => r.roleName)
      .filter((n): n is string => n !== null && n !== undefined);
    const schoolId = rolesData[0]?.schoolId ?? null;

    // 7. Generar tokens + guardar push token (en paralelo, igual que login).
    const [tokens] = await Promise.all([
      this.generateTokens(user, roles, schoolId),
      (async () => {
        if (dto.firebaseToken) {
          try {
            await this.savePushToken(user.id, dto.firebaseToken);
          } catch (err) {
            console.error('[AUTH-GOOGLE] Error al guardar push token:', err);
          }
        }
      })(),
    ]);

    // 8. Cargar hijos si es padre (misma estructura que login).
    const isParent = rolesData.some((r) => r.roleName === 'parent');
    let children: {
      id: string; firstName: string; lastName: string; code: string;
      birthday: string | null; section: string | null; avatarUrl: string | null;
    }[] = [];
    if (isParent) {
      const signedAvatars = await this._signAvatarPaths(studentsData.map((l) => l.student));
      children = studentsData.map((l) => ({
        id: l.student.id.toString(),
        firstName: l.student.firstName,
        lastName: l.student.lastName,
        code: l.student.code ?? '',
        birthday: l.student.birthday ? l.student.birthday.toISOString().split('T')[0] : null,
        section: l.student.enrollments[0]?.classroom?.name ?? null,
        avatarUrl: l.student.avatar ? (signedAvatars.get(l.student.avatar) ?? null) : null,
      }));
    }

    // 9. Devolver la misma estructura de respuesta que login.
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      needsPasswordChange: user.needsPasswordChange ?? false,
      user: {
        id: user.id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        roles: rolesData.map((ur) => ({
          role: ur.roleName,
          schoolId: ur.schoolId?.toString(),
          schoolName: ur.schoolName,
        })),
        children,
      },
    };
  }

  // ── CAMBIO DE CONTRASEÑA ───────────────────────────────
  async changePassword(userId: bigint, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Verificar que la contraseña actual es correcta
    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    // Hashear la nueva contraseña (10 rondas de salt = balance seguridad/velocidad)
    const newHash = await bcrypt.hash(dto.newPassword, 10);

    // Actualizar la contraseña y marcar que ya no necesita cambiarla
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        needsPasswordChange: false,
      },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  // ── LOGOUT ─────────────────────────────────────────────
  async logout(userId: bigint, firebaseToken?: string, refreshToken?: string) {
    if (firebaseToken) {
      await this.prisma.pushToken.deleteMany({ where: { userId, token: firebaseToken } });
    }
    if (refreshToken) {
      await this.prisma.userToken.deleteMany({
        where: { userId, tokenType: 'refresh', token: refreshToken },
      });
    } else {
      await this.prisma.userToken.deleteMany({ where: { userId, tokenType: 'refresh' } });
    }
    return { message: 'Sesión cerrada correctamente' };
  }

  // ── REGISTRO CON TOKEN DE INVITACIÓN ──────────────────
  async registerWithToken(dto: RegisterWithTokenDto) {
    const inv = await this.prisma.schoolInvitation.findUnique({
      where: { token: dto.token },
      include: { school: true, role: true },
    });

    if (!inv) throw new NotFoundException('Invitación no encontrada');
    if (inv.usedAt) throw new ConflictException('Esta invitación ya fue utilizada');
    if (inv.expiresAt < new Date()) throw new BadRequestException('Esta invitación ha expirado');
    if (inv.parentId) {
      throw new BadRequestException('Esta invitación requiere iniciar sesión con Google');
    }
    if (!inv.email) {
      throw new BadRequestException('Esta invitación no tiene un email asociado');
    }

    const existing = await this.prisma.user.findFirst({
      where: { email: inv.email, deletedAt: null },
    });

    if (existing && existing.passwordHash) {
      throw new ConflictException('Este email ya tiene una cuenta registrada');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const newUser = await this.prisma.$transaction(async (tx) => {
      let user;
      if (existing) {
        user = await tx.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            needsPasswordChange: false,
            isActive: true,
          },
        });
      } else {
        // Cuenta nueva: se crea el usuario y su rol.
        user = await tx.user.create({
          data: {
            email: inv.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            isActive: true,
          },
        });

        await tx.userRole.create({
          data: { userId: user.id, roleId: inv.roleId, schoolId: inv.schoolId },
        });
      }

      const claimed = await tx.schoolInvitation.updateMany({
        where: { id: inv.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Esta invitación ya fue utilizada');
      }

      return user;
    });

    const userWithRoles = await this.prisma.user.findUnique({
      where: { id: newUser.id },
      include: { userRoles: { include: { role: true, school: true } } },
    });

    if (dto.firebaseToken) {
      await this.savePushToken(newUser.id, dto.firebaseToken);
    }

    const roles = userWithRoles!.userRoles.map((ur) => ur.role.name);
    const schoolId = userWithRoles!.userRoles[0]?.schoolId ?? null;
    const tokens = await this.generateTokens(userWithRoles!, roles, schoolId);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      needsPasswordChange: false,
      user: {
        id: newUser.id.toString(),
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        avatar: null,
        roles: userWithRoles!.userRoles.map((ur) => ({
          role: ur.role.name,
          schoolId: ur.schoolId?.toString(),
          schoolName: ur.school?.name,
        })),
        children: [],
      },
    };
  }

  async refresh(refreshToken: string) {
    // Verificar que el refresh token sea un JWT válido
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET') ?? this.configService.get('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    // Verificar que no haya sido revocado (logout)
    const stored = await this.prisma.userToken.findFirst({
      where: { token: refreshToken, tokenType: 'refresh' },
    });
    if (!stored) throw new UnauthorizedException('Sesión cerrada. Inicia sesión nuevamente');

    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(payload.sub), isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    const newAccessToken = this.jwtService.sign(
      {
        sub: payload.sub,
        email: payload.email,
        roles: payload.roles,
        schoolId: payload.schoolId,
      },
      { expiresIn: this.configService.get('JWT_EXPIRES_IN') ?? '7d' },
    );

    return { accessToken: newAccessToken };
  }

  // ── HELPERS PRIVADOS ───────────────────────────────────

  private async _loadRolesForLogin(userId: bigint) {
    // 1 query: user_roles (solo los IDs necesarios)
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true, schoolId: true },
    });

    const roleIds = [...new Set(userRoles.map((r) => r.roleId))];
    const schoolIds = [
      ...new Set(userRoles.map((r) => r.schoolId).filter((s): s is bigint => s !== null)),
    ];

    // A2: roles y schools en paralelo (independientes entre sí)
    const [roles, schools] = await Promise.all([
      this.prisma.role.findMany({ where: { id: { in: roleIds } } }),
      schoolIds.length > 0
        ? this.prisma.school.findMany({ where: { id: { in: schoolIds } } })
        : Promise.resolve([]),
    ]);

    const roleMap = new Map(roles.map((r) => [r.id, r.name]));
    const schoolMap = new Map(schools.map((s) => [s.id, s.name]));

    return userRoles.map((ur) => ({
      roleId: ur.roleId,
      schoolId: ur.schoolId,
      // El role siempre existe (dato de referencia); se asume igual que el
      // findFirst original que accedía a ur.role.name directamente.
      roleName: roleMap.get(ur.roleId)!,
      schoolName: ur.schoolId !== null ? schoolMap.get(ur.schoolId) ?? null : null,
    }));
  }

  private async _loadStudentsForLogin(userId: bigint) {
    // Fase 1: user_students (ordenados por isPrimary desc, igual que el include original)
    const userStudents = await this.prisma.userStudent.findMany({
      where: { userId },
      orderBy: { isPrimary: 'desc' },
      select: { studentId: true },
    });

    const studentIds = userStudents.map((us) => us.studentId);

    // Fase 2 (paralela): students (campos directos) y student_enrollments (todos,
    // ordenados por academicYear desc para tomar el más reciente).
    const [students, enrollments] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: {
          id: true, firstName: true, lastName: true, code: true, birthday: true, avatar: true,
        },
      }),
      this.prisma.studentEnrollment.findMany({
        where: { studentId: { in: studentIds } },
        orderBy: { academicYear: 'desc' },
        select: { studentId: true, classroomId: true },
      }),
    ]);

    // Fase 3: classrooms (depende de los classroomIds de enrollments).
    const classroomIds = [...new Set(enrollments.map((e) => e.classroomId))];
    const classrooms = classroomIds.length > 0
      ? await this.prisma.classroom.findMany({
          where: { id: { in: classroomIds } },
          select: { id: true, name: true },
        })
      : [];

    // Reconstruir la estructura equivalente al include original:
    // userStudents[].student.{...campos, enrollments:[{classroom:{name}}]}
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const classroomNameMap = new Map(classrooms.map((c) => [c.id, c.name]));
    // Primer enrollment por student (el más reciente, por el orderBy desc)
    const enrollmentByStudent = new Map<bigint, { classroomId: bigint }>();
    for (const e of enrollments) {
      if (!enrollmentByStudent.has(e.studentId)) {
        enrollmentByStudent.set(e.studentId, { classroomId: e.classroomId });
      }
    }

    return userStudents.map((us) => {
      const student = studentMap.get(us.studentId)!;
      const enrollment = enrollmentByStudent.get(us.studentId);
      return {
        student: {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          code: student.code,
          birthday: student.birthday,
          avatar: student.avatar,
          enrollments: enrollment
            ? [{ classroom: { name: classroomNameMap.get(enrollment.classroomId) ?? null } }]
            : [],
        },
      };
    });
  }

  // Genera el access token (corta duración) y refresh token (larga duración)
  private async generateTokens(
    user: { id: bigint; email: string },
    roles: string[],
    schoolId: bigint | null,
  ) {

    // Payload del JWT: datos que viajan dentro del token
    // NO incluir datos sensibles (contraseña, etc.)
    const payload = {
      sub: user.id.toString(), // "subject" = identificador del usuario
      email: user.email,
      roles,
      schoolId: schoolId ? schoolId.toString() : undefined,
    };

    // Access token: vida corta (1 hora), se usa en cada petición
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_EXPIRES_IN') ?? '1h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET') ?? this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });

    // Guardar el refresh token en BD para poder invalidarlo en logout
    await this.prisma.userToken.create({
      data: {
        userId: user.id,
        tokenType: 'refresh',
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });

    return { accessToken, refreshToken };
  }

  private async savePushToken(userId: bigint, token: string) {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform: 'android' },
      // Si el mismo dispositivo hace login con otra cuenta, lo reasignamos
      update: { userId },
    });
  }
}
