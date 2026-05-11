import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.js';
import { db } from '../config/database.js';

interface JWTPayload {
  sub: string;
  email: string;
  role?: AdminUserRole; // optional for backward-compat with tokens issued before migration 025
}

export type AdminUserRole = 'admin' | 'content_manager';

declare global {
  namespace Express {
    interface Request {
      adminUser?: {
        id: string;
        email: string;
        name: string | null;
        role: AdminUserRole;
      };
    }
  }
}

/**
 * Verifies the JWT, looks up the admin_users row, gates by role.
 *
 * Pass one or more allowed roles. Empty / no arg ⇒ admin only.
 */
export function requireRole(...allowed: AdminUserRole[]) {
  const allowedSet = new Set<AdminUserRole>(allowed.length ? allowed : ['admin']);

  return function (req: Request, res: Response, next: NextFunction) {
    const token = req.cookies?.auth_token;
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const payload = jwt.verify(token, authConfig.jwtSecret) as JWTPayload;

      db('admin_users')
        .where({ id: payload.sub, is_active: true })
        .first()
        .then((user) => {
          if (!user) {
            res.status(403).json({ error: 'Access denied' });
            return;
          }
          const role = (user.role as AdminUserRole) || 'admin';
          if (!allowedSet.has(role)) {
            res.status(403).json({ error: 'הרשאות לא מספיקות לפעולה זו' });
            return;
          }
          req.adminUser = { id: user.id, email: user.email, name: user.name, role };
          next();
        })
        .catch(next);
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

/**
 * Backwards-compatible alias. Equivalent to `requireRole('admin')`.
 * Keeps existing call sites working without churn.
 */
export const requireAdmin = requireRole('admin');

/**
 * Convenience: admin OR content_manager. The most common gate for
 * read/edit/approve endpoints that are open to both tiers.
 */
export const requireAdminOrContentManager = requireRole('admin', 'content_manager');
