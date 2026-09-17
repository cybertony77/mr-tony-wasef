import { authMiddleware } from './authMiddleware';

/**
 * Prefer the role currently stored in Mongo over the JWT payload.
 * Role changes (assistant → admin, etc.) take effect without forcing
 * the user to log out and back in.
 */
export async function withLiveRole(tokenUser, db) {
  if (!tokenUser || !db) return tokenUser;

  const id = tokenUser.assistant_id;
  if (id === undefined || id === null || id === '') {
    return tokenUser;
  }

  const candidates = [id];
  if (typeof id === 'string' && /^\d+$/.test(id)) {
    candidates.push(Number(id));
  } else if (typeof id === 'number') {
    candidates.push(String(id));
  }

  const live = await db.collection('users').findOne(
    { id: { $in: candidates } },
    { projection: { role: 1, name: 1, id: 1 } }
  );

  if (!live) return tokenUser;

  return {
    ...tokenUser,
    role: live.role || tokenUser.role,
    name: live.name || tokenUser.name,
    assistant_id: live.id,
  };
}

/** Verify JWT, then overlay the latest role/name from `users`. */
export async function authWithLiveRole(req, db) {
  const tokenUser = await authMiddleware(req);
  return withLiveRole(tokenUser, db);
}
