import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { PaymentsController } from '../../src/modules/payments/payments.controller';

function makeContext(handler: Function, roles: string[]) {
  return {
    getHandler: () => handler,
    getClass: () => PaymentsController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 1n, email: 'x@x.com', roles } }),
    }),
  } as any;
}

describe('RolesGuard sobre PaymentsController — @Roles(\'school_admin\') real (BL-3)', () => {
  const guard = new RolesGuard(new Reflector());
  const proto = PaymentsController.prototype as any;

  it.each(['createConcept', 'assignObligations', 'recordPayment'])(
    'Parent → %s → RolesGuard rechaza (ForbiddenException)',
    (method) => {
      const ctx = makeContext(proto[method], ['parent']);
      expect(() => guard.canActivate(ctx)).toThrow();
      try {
        guard.canActivate(ctx);
      } catch (e: any) {
        expect(e.getStatus()).toBe(403);
      }
    },
  );

  it.each(['createConcept', 'assignObligations', 'recordPayment'])(
    'school_admin → %s → RolesGuard permite pasar (canActivate === true)',
    (method) => {
      const ctx = makeContext(proto[method], ['school_admin']);
      expect(guard.canActivate(ctx)).toBe(true);
    },
  );

  it('getConcepts (lectura, sin @Roles) sigue accesible para cualquier rol autenticado — no se rompió por accidente', () => {
    const ctx = makeContext(proto.getConcepts, ['parent']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('getStudentObligations (padre consultando sus propias deudas) sigue accesible — no se rompió por accidente', () => {
    const ctx = makeContext(proto.getStudentObligations, ['parent']);
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
