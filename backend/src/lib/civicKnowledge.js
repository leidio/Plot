/**
 * Civic knowledge layer: find similar ideas and movements across Plot.
 * Used by AI routes to enrich context (no UI). Option A: tag + city/state overlap.
 */

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

function clampLimit(limit) {
  const n = parseInt(limit, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Find movements similar to the one with the given id.
 * Similarity: shared tags or same city/state. Excludes the source movement.
 * @param {object} prisma - Prisma client
 * @param {string} movementId - Source movement id
 * @param {number} limit - Max results (default 5, max 20)
 * @returns {Promise<Array<{ id, name, description, city, state, tags }>>}
 */
async function getSimilarMovements(prisma, movementId, limit = DEFAULT_LIMIT) {
  const take = clampLimit(limit);
  const source = await prisma.movement.findUnique({
    where: { id: movementId },
    select: { id: true, tags: true, city: true, state: true }
  });
  if (!source) return [];

  const orConditions = [];
  if (source.tags && source.tags.length > 0) {
    orConditions.push({ tags: { hasSome: source.tags } });
  }
  orConditions.push({ city: source.city, state: source.state });

  const candidates = await prisma.movement.findMany({
    where: {
      id: { not: movementId },
      isActive: true,
      OR: orConditions
    },
    select: {
      id: true,
      name: true,
      description: true,
      city: true,
      state: true,
      tags: true
    },
    take: take * 2
  });

  // Score: more shared tags and same city/state = higher
  const scored = candidates.map((m) => {
    const sharedTags = source.tags && m.tags
      ? m.tags.filter((t) => source.tags.includes(t)).length
      : 0;
    const samePlace = m.city === source.city && m.state === source.state ? 1 : 0;
    return { ...m, _score: sharedTags * 2 + samePlace };
  });
  scored.sort((a, b) => b._score - a._score);

  return scored.slice(0, take).map(({ _score, ...m }) => m);
}

/**
 * Find ideas similar to the one with the given id.
 * Similarity: ideas from other movements in the same city/state or with overlapping movement tags.
 * @param {object} prisma - Prisma client
 * @param {string} ideaId - Source idea id
 * @param {number} limit - Max results (default 5, max 20)
 * @returns {Promise<Array<{ id, title, description, movementName, city, state }>>}
 */
async function getSimilarIdeas(prisma, ideaId, limit = DEFAULT_LIMIT) {
  const take = clampLimit(limit);
  const source = await prisma.idea.findUnique({
    where: { id: ideaId },
    include: {
      movement: { select: { id: true, tags: true, city: true, state: true, name: true } }
    }
  });
  if (!source || !source.movement) return [];

  const mov = source.movement;
  const orConditions = [];
  if (mov.tags && mov.tags.length > 0) {
    orConditions.push({ tags: { hasSome: mov.tags } });
  }
  orConditions.push({ city: mov.city, state: mov.state });

  const otherMovementIds = await prisma.movement.findMany({
    where: {
      id: { not: mov.id },
      isActive: true,
      OR: orConditions
    },
    select: { id: true }
  }).then((rows) => rows.map((r) => r.id));

  if (otherMovementIds.length === 0) return [];

  const ideas = await prisma.idea.findMany({
    where: {
      id: { not: ideaId },
      movementId: { in: otherMovementIds }
    },
    select: {
      id: true,
      title: true,
      description: true,
      movement: { select: { name: true, city: true, state: true } }
    },
    take
  });

  return ideas.map((i) => ({
    id: i.id,
    title: i.title,
    description: (i.description || '').slice(0, 300),
    movementName: i.movement?.name,
    city: i.movement?.city,
    state: i.movement?.state
  }));
}

module.exports = { getSimilarMovements, getSimilarIdeas, clampLimit };
