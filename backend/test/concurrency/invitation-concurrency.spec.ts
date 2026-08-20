// Test de concurrencia OBLIGATORIO — Postgres real, sin mocks de BD

import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuthService } from '../../src/modules/auth/auth.service';
import { SupabaseStorageService } from '../../src/modules/storage/supabase-storage.service';
import { InvitationsService } from '../../src/modules/invitations/invitations.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertLocalTestDatabase } from '../helpers/db-guard';

assertLocalTestDatabase();

const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

describe('Concurrencia real — consumo de invitación (Postgres, sin mocks de BD)', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let invitationsService: InvitationsService;
  let schoolId: bigint;
  const PARENT_ROLE_ID = 3;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        InvitationsService,
        PrismaService,
        SupabaseStorageService,
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('jwt.fake') } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('fake-client-id') } },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);
    invitationsService = moduleRef.get(InvitationsService);
    await prisma.$connect();

    const school = await prisma.school.create({ data: { name: `Concurrency Test ${Date.now()}`, isActive: true } });
    schoolId = school.id;
  });

  afterAll(async () => {
    const testUsers = await prisma.user.findMany({
      where: { email: { contains: '@concurrency-test.kolexa' } },
      select: { id: true },
    });
    const ids = testUsers.map((u) => u.id);
    await prisma.userToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.pushToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.schoolInvitation.deleteMany({ where: { schoolId } });
    await prisma.parent.deleteMany({ where: { schoolId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.school.delete({ where: { id: schoolId } });
    await prisma.$disconnect();
  });

  it('A) 10 peticiones concurrentes, MISMA identidad: todas exitosas, exactamente 1 vinculación consistente', async () => {
    const parent = await prisma.parent.create({
      data: { schoolId, firstName: 'Padre', lastName: 'Concurrencia', dni: 'CC-A', email: 'mismo@concurrency-test.kolexa' },
    });
    const email = parent.email!;
    const sub = crypto.randomUUID();
    const inv = await invitationsService.create({ schoolId, email, roleId: PARENT_ROLE_ID, parentId: parent.id }, 1n);

    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub, email, email_verified: true, given_name: 'Padre', family_name: 'Concurrencia', picture: null,
      }),
    });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        authService.loginWithGoogle({ idToken: 'x', invitationToken: inv.token } as any),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(10);
    expect(rejected.length).toBe(0);

    // Todas las respuestas exitosas apuntan al MISMO userId — sin duplicados.
    const userIds = new Set(fulfilled.map((r: any) => r.value.user.id));
    expect(userIds.size).toBe(1);

    const linked = await prisma.parent.findUnique({ where: { id: parent.id } });
    expect(linked!.userId).not.toBeNull();
    expect(linked!.linkStatus).toBe('linked');

    const usersCreated = await prisma.user.count({ where: { email } });
    expect(usersCreated).toBe(1); // ninguna carrera duplicó el User

    const invFinal = await prisma.schoolInvitation.findUnique({ where: { token: inv.token } });
    expect(invFinal!.usedAt).not.toBeNull();
  });

  it('B) 10 peticiones concurrentes, 1 identidad legítima + 9 distintas: exactamente 1 éxito, 9 rechazos por email', async () => {
    const parent = await prisma.parent.create({
      data: { schoolId, firstName: 'Padre', lastName: 'Legitimo', dni: 'CC-B', email: 'legitimo@concurrency-test.kolexa' },
    });
    const correctEmail = parent.email!;
    const correctSub = crypto.randomUUID();
    const inv = await invitationsService.create(
      { schoolId, email: correctEmail, roleId: PARENT_ROLE_ID, parentId: parent.id },
      1n,
    );

    // 1 identidad correcta + 9 impostoras (mismo token, emails distintos).
    const identities = [
      { sub: correctSub, email: correctEmail },
      ...Array.from({ length: 9 }, (_, i) => ({
        sub: crypto.randomUUID(),
        email: `impostor${i}@concurrency-test.kolexa`,
      })),
    ];

    mockVerifyIdToken.mockImplementation(async ({ idToken }: any) => {
      const identity = identities.find((id) => id.sub === idToken)!;
      return {
        getPayload: () => ({
          sub: identity.sub, email: identity.email, email_verified: true,
          given_name: 'Test', family_name: 'Test', picture: null,
        }),
      };
    });

    const results = await Promise.allSettled(
      identities.map((id) =>
        authService.loginWithGoogle({ idToken: id.sub, invitationToken: inv.token } as any),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(9);
    for (const r of rejected) {
      expect((r.reason as Error).message).toBe('INVITATION_EMAIL_MISMATCH');
    }

    const linked = await prisma.parent.findUnique({ where: { id: parent.id } });
    expect(linked!.userId).not.toBeNull();

    // Ninguna de las 9 identidades impostoras llegó a crear un User.
    const impostorCount = await prisma.user.count({
      where: { email: { contains: 'impostor', endsWith: '@concurrency-test.kolexa' } },
    });
    expect(impostorCount).toBe(0);
  });
});
