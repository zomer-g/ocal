import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.js';
import { db } from '../config/database.js';

interface JWTPayload {
  sub: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      adminUser?: {
        id: string;
        email: string;
        name: string | null;
      };
    }
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
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
        req.adminUser = { id: user.id, email: user.email, name: user.name };
        next();
      })
      .catch(next);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
