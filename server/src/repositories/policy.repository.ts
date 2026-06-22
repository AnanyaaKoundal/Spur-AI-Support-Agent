import { prisma } from '../config/database.js';
import type { StorePolicy } from '@prisma/client';

const CACHE_TTL = 5 * 60 * 1000;

let cachedPolicies: StorePolicy[] | null = null;
let lastLoaded = 0;

export async function getAllPolicies(): Promise<StorePolicy[]> {
  const now = Date.now();

  if (cachedPolicies && now - lastLoaded < CACHE_TTL) {
    return cachedPolicies;
  }

  cachedPolicies = await prisma.storePolicy.findMany({
    orderBy: { createdAt: 'asc' },
  });
  lastLoaded = now;

  console.log(`[PolicyRepo] Loaded ${cachedPolicies.length} policies from DB (cache refreshed)`);

  return cachedPolicies;
}
