// Crea o rehace el colegio demo para reclutadores (datos ficticios).
// Uso: npm run seed:demo
import { PrismaService } from '../src/prisma/prisma.service';
import { DemoService } from '../src/modules/demo/demo.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    await new DemoService(prisma).ensureFresh(true);
    console.log('Colegio demo listo.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
