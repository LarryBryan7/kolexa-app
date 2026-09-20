import { ForbiddenException } from '@nestjs/common';
import { AuthService } from '../../src/modules/auth/auth.service';
import { ClassroomService } from '../../src/modules/classroom/classroom.service';
import { DemoService } from '../../src/modules/demo/demo.service';
import { isDemoEmail } from '../../src/common/utils/demo-account';

const limaDay = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

describe('isDemoEmail', () => {
  it('reconoce el dominio demo sin distinguir mayúsculas y rechaza el resto', () => {
    expect(isDemoEmail('padre@demo.kolexa.app')).toBe(true);
    expect(isDemoEmail('PADRE@Demo.Kolexa.App')).toBe(true);
    expect(isDemoEmail('padre@gmail.com')).toBe(false);
    expect(isDemoEmail('demo.kolexa.app@gmail.com')).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
  });
});

describe('cuentas demo — cambio de contraseña', () => {
  it('rechaza changePassword para un usuario demo sin tocar la contraseña', async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 1n, email: 'padre@demo.kolexa.app', passwordHash: 'x' }),
        update: jest.fn(),
      },
    };
    const service = new AuthService(prisma, {} as any, {} as any, {} as any);

    await expect(
      service.changePassword(1n, { currentPassword: 'Demo1234', newPassword: 'Otra12345' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('cuentas demo — sincronización con Google', () => {
  const cacheRow = (extra: object) => [{ last_synced_at: null, course_count: 3n, ...extra }];

  it('syncStudent no llama a Google si el token es demo', async () => {
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue(cacheRow({ coursework_count: 7n })),
      googleToken: { findUnique: jest.fn().mockResolvedValue({ googleEmail: 'alumno1@demo.kolexa.app' }) },
    };
    const service = new ClassroomService(prisma, { get: jest.fn() } as any, {} as any);
    const authSpy = jest.spyOn(service as any, 'getAuthClientForStudent');

    const result = await service.syncStudent(3n, true);

    expect(result).toEqual({ courses: 3, courseworks: 7, cacheHit: true });
    expect(authSpy).not.toHaveBeenCalled();
  });

  it('syncTeacher no llama a Google si el token es demo', async () => {
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue(cacheRow({ submission_count: 5n })),
      teacherGoogleToken: { findUnique: jest.fn().mockResolvedValue({ googleEmail: 'docente@demo.kolexa.app' }) },
    };
    const service = new ClassroomService(prisma, { get: jest.fn() } as any, {} as any);
    const authSpy = jest.spyOn(service as any, 'getAuthClientForTeacher');

    const result = await service.syncTeacher(9n);

    expect(result).toEqual({ courses: 3, submissions: 5, cacheHit: true });
    expect(authSpy).not.toHaveBeenCalled();
  });
});

describe('DemoService — reinicio diario', () => {
  it('no reconstruye si el colegio demo ya se preparó hoy', async () => {
    const prisma: any = {
      school: { findFirst: jest.fn().mockResolvedValue({ metadata: { demoResetDay: limaDay() } }) },
      $transaction: jest.fn(),
    };

    await new DemoService(prisma).ensureFresh();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reconstruye si la marca es de otro día, y con force aunque sea de hoy', async () => {
    const prisma: any = {
      school: { findFirst: jest.fn().mockResolvedValue({ metadata: { demoResetDay: '2020-01-01' } }) },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    await new DemoService(prisma).ensureFresh();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    prisma.school.findFirst.mockResolvedValue({ metadata: { demoResetDay: limaDay() } });
    await new DemoService(prisma).ensureFresh(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('ensureFreshWithin no propaga errores del reinicio (el login sigue)', async () => {
    const prisma: any = {
      school: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockRejectedValue(new Error('boom')),
    };

    await expect(new DemoService(prisma).ensureFreshWithin(1000)).resolves.toBeUndefined();
  });
});
