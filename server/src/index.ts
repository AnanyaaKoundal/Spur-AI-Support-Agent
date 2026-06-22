import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/database.js';

async function main() {
  await prisma.$connect();
  console.log('Database connected');

  app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
