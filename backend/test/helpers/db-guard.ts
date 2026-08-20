// db-guard.ts — Cinturón de seguridad para tests contra Postgres real
export function assertLocalTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  const isLocal = /:\/\/[^/]*(localhost|127\.0\.0\.1)/i.test(url);
  if (!isLocal) {
    const redacted = url.replace(/:\/\/([^:/]+):[^@]*@/, '://$1:***@');
    throw new Error(
      'BLOQUEADO: este archivo de test escribe en Postgres real y ' +
        `DATABASE_URL no apunta a localhost (valor actual: "${redacted || '(vacía)'}"). ` +
        'Ejecuta con, por ejemplo: ' +
        'DATABASE_URL="postgresql://<user>@localhost:5432/kolexa_dev" npm run test:integration',
    );
  }
}
