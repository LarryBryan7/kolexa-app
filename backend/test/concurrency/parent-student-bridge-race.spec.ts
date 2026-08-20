import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuthService } from '../../src/modules/auth/auth.service';
import { SupabaseStorageService } from '../../src/modules/storage/supabase-storage.service';
import { InvitationsService } from '../../src/modules/invitations/invitations.service';
import { AdminService } from '../../src/modules/admin/admin.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertLocalTestDatabase } from '../helpers/db-guard';

assertLocalTestDatabase();

const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

const PARENT_ROLE_ID = 3;
const ITERATIONS = 20;

describe('IM-8 — race createParentStudentLink() vs. primer login de Google (Postgres real)', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let invitationsService: InvitationsService;
  let adminService: AdminService;
  let schoolId: bigint;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService, InvitationsService, AdminService, PrismaService, SupabaseStorageService,
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('jwt.fake') } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('fake-client-id') } },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);
    invitationsService = moduleRef.get(InvitationsService);
    adminService = moduleRef.get(AdminService);
    await prisma.$connect();

    const school = await prisma.school.create({ data: { name: `IM8-Race ${Date.now()}`, isActive: true } });
    schoolId = school.id;
  });

  afterAll(async () => {
    const testUsers = await prisma.user.findMany({
      where: { email: { contains: '@im8-race.kolexa' } },
      select: { id: true },
    });
    const ids = testUsers.map((u) => u.id);
    await prisma.userToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.pushToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userStudent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.schoolInvitation.deleteMany({ where: { schoolId } });
    await prisma.parentStudent.deleteMany({ where: { parent: { schoolId } } });
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.parent.deleteMany({ where: { schoolId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.school.delete({ where: { id: schoolId } });
    await prisma.$disconnect();
  });

  it(`${ITERATIONS} iteraciones concurrentes: nunca queda un ParentStudent sin su UserStudent`, async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const dni = `IM8-${i}-${Date.now().toString(36)}`;
      const email = `${dni}@im8-race.kolexa`;
      const sub = crypto.randomUUID();

      const parent = await prisma.parent.create({
        data: { schoolId, firstName: 'Padre', lastName: `Race${i}`, dni, email },
      });
      const student = await prisma.student.create({
        data: { schoolId, firstName: 'Hijo', lastName: `Race${i}`, code: `IM8-STU-${i}-${Date.now().toString(36)}` },
      });
      const invitation = await invitationsService.create(
        { schoolId, email, roleId: PARENT_ROLE_ID, parentId: parent.id },
        1n,
      );

      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ sub, email, email_verified: true, given_name: 'Padre', family_name: `Race${i}`, picture: null }),
      });

      await Promise.all([
        adminService.createParentStudentLink(schoolId, {
          parentId: Number(parent.id), studentId: Number(student.id), relationship: 'padre', isPrimary: true,
        } as any),
        authService.loginWithGoogle({ idToken: 'x', invitationToken: invitation.token } as any),
      ]);

      const linkedParent = await prisma.parent.findUnique({ where: { id: parent.id }, select: { userId: true } });
      expect(linkedParent!.userId).not.toBeNull(); // el login siempre tiene éxito (invitación propia, sin conflicto)

      const bridged = await prisma.userStudent.findUnique({
        where: { userId_studentId: { userId: linkedParent!.userId!, studentId: student.id } },
      });
      expect(bridged).not.toBeNull(); // NUNCA debe faltar — este es el invariante de IM-8

      const parentStudent = await prisma.parentStudent.findFirst({
        where: { parentId: parent.id, studentId: student.id },
      });
      expect(parentStudent).not.toBeNull(); // el ParentStudent del admin también debe existir
    }
  }, 60_000);
});
