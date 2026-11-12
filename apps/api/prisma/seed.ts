import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { INITIAL_COMMUNITIES } from '@circle/constants';
import { communitySchema } from '@circle/validation';
import { z } from 'zod';
const communities = z
  .array(communitySchema)
  .length(5)
  .parse(INITIAL_COMMUNITIES);
if (new Set(communities.map((c) => c.slug)).size !== 5)
  throw new Error('Community slugs must be unique');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }),
});
try {
  await db.$transaction(async (tx) => {
    for (const c of communities) {
      const current = await tx.community.findUnique({
        where: { slug: c.slug },
        select: { description: true },
      });
      await tx.community.upsert({
        where: { slug: c.slug },
        create: c,
        update: {
          name: c.name,
          description: current?.description ?? c.description,
        },
      });
    }
  });
  console.log(
    'Seeded five canonical Circle.social communities. Existing IDs and slugs preserved.',
  );
} finally {
  await db.$disconnect();
}
