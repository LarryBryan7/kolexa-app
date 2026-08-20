import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { InvitationsService } from '../../src/modules/invitations/invitations.service';
import { InvitationsController } from '../../src/modules/invitations/invitations.controller';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertLocalTestDatabase } from '../helpers/db-guard';

assertLocalTestDatabase();

const PARENT_ROLE_ID = 3;

describe('POST /invitations/validate — contrato y lógica (Postgres real)', () => {
  let prisma: PrismaService;
  let invitationsService: InvitationsService;
  let schoolId: bigint;
  let parentId: bigint;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [InvitationsService, PrismaService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    invitationsService = moduleRef.get(InvitationsService);
    await prisma.$connect();

    const school = await prisma.school.create({ data: { name: `IM6-Validate ${Date.now()}`, isActive: true } });
    schoolId = school.id;
    const parent = await prisma.parent.create({
      data: { schoolId, firstName: 'Padre', lastName: 'IM6', dni: `IM6-${Date.now()}`, email: `im6-${Date.now()}@idor-test.kolexa` },
    });
    parentId = parent.id;
  });

  afterAll(async () => {
    await prisma.schoolInvitation.deleteMany({ where: { schoolId } });
    await prisma.parent.deleteMany({ where: { schoolId } });
    await prisma.school.delete({ where: { id: schoolId } });
    await prisma.$disconnect();
  });

  it('el controller expone POST /invitations/validate — nunca GET (regresión de contrato)', () => {
    const reflector = new Reflector();
    const handler = InvitationsController.prototype.validate;
    const method: RequestMethod = reflector.get(METHOD_METADATA, handler);
    const path: string = reflector.get(PATH_METADATA, handler);

    expect(method).toBe(RequestMethod.POST);
    expect(path).toBe('validate');
    // Confirma que NO quedó ningún parámetro de ruta (":token") — el
    // token viaja en el body, no en la URL.
    expect(path).not.toContain(':');
  });

  it('token válido → devuelve los datos de la invitación', async () => {
    const inv = await invitationsService.create(
      { schoolId, email: 'im6-valid@idor-test.kolexa', roleId: PARENT_ROLE_ID, parentId },
      1n,
    );
    const result = await invitationsService.validate(inv.token);
    expect(result.email).toBe('im6-valid@idor-test.kolexa');
    expect(result.school.name).toContain('IM6-Validate');
  });

  it('token inexistente → NotFoundException (404), no 500', async () => {
    await expect(invitationsService.validate('token-que-no-existe-nunca')).rejects.toMatchObject({ status: 404 });
  });

  it('token expirado → BadRequestException (400)', async () => {
    const inv = await invitationsService.create(
      { schoolId, email: 'im6-expired@idor-test.kolexa', roleId: PARENT_ROLE_ID },
      1n,
    );
    await prisma.schoolInvitation.update({
      where: { token: inv.token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(invitationsService.validate(inv.token)).rejects.toMatchObject({ status: 400 });
  });

  it('token ya usado → BadRequestException (400)', async () => {
    const inv = await invitationsService.create(
      { schoolId, email: 'im6-used@idor-test.kolexa', roleId: PARENT_ROLE_ID },
      1n,
    );
    await prisma.schoolInvitation.update({ where: { token: inv.token }, data: { usedAt: new Date() } });
    await expect(invitationsService.validate(inv.token)).rejects.toMatchObject({ status: 400 });
  });
});
