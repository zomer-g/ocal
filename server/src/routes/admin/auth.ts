import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { authConfig } from '../../config/auth.js';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export const authRouter = Router();

const CALLBACK_PATH = '/api/admin/auth/google/callback';

function buildCallbackUrl(req: import('express').Request): string {
  // Use CORS_ORIGIN in production (it's the public URL), otherwise derive from request
  if (env.NODE_ENV === 'production' && env.CORS_ORIGIN) {
    return env.CORS_ORIGIN.replace(/\/$/, '') + CALLBACK_PATH;
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}${CALLBACK_PATH}`;
}

// ─── GET /google — Redirect to Google OAuth consent screen ──────────────────

authRouter.get('/google', (req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    res.status(503).json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
    return;
  }

  const redirectUri = buildCallbackUrl(req);
  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });

  res.redirect(authUrl);
});

// ─── GET /google/callback — Handle OAuth callback ───────────────────────────

authRouter.get('/google/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).send('Missing authorization code');
    return;
  }

  try {
    const redirectUri = buildCallbackUrl(req);
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);

    // Exchange code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Verify the ID token and extract user info
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload()!;
    const email = payload.email!;
    const googleId = payload.sub;
    const name = payload.name || email;
    const pictureUrl = payload.picture || null;

    // Check if email is in the allowed admin list
    if (authConfig.adminEmails.length > 0 && !authConfig.adminEmails.includes(email)) {
      logger.warn({ email }, 'Login denied — email not in ADMIN_EMAILS');
      res.status(403).send(`
        <html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2>אין הרשאה</h2>
          <p>הכתובת <strong>${email}</strong> לא מורשית לגשת לממשק הניהול.</p>
          <a href="/">חזרה לעמוד הראשי</a>
        </body></html>
      `);
      return;
    }

    // Upsert admin user
    let user = await db('admin_users').where({ email }).first();
    if (user) {
      await db('admin_users').where({ id: user.id }).update({
        google_id: googleId,
        name,
        picture_url: pictureUrl,
        last_login: new Date(),
        updated_at: new Date(),
      });
      user = await db('admin_users').where({ id: user.id }).first();
    } else {
      [user] = await db('admin_users').insert({
        email,
        google_id: googleId,
        name,
        picture_url: pictureUrl,
        last_login: new Date(),
        is_active: true,
      }).returning('*');
    }

    if (!user.is_active) {
      res.status(403).send('Account is deactivated');
      return;
    }

    // Issue JWT (7 days)
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      authConfig.jwtSecret,
      { expiresIn: 7 * 24 * 60 * 60 }
    );

    // Set httpOnly cookie and redirect to admin dashboard
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.info({ email, userId: user.id }, 'Admin login successful');
    res.redirect('/admin');
  } catch (err) {
    logger.error({ err }, 'Google OAuth callback failed');
    res.status(500).send('Authentication failed. Please try again.');
  }
});

// ─── GET /me — Get current authenticated admin user ─────────────────────────

authRouter.get('/me', async (req, res) => {
  const token = req.cookies?.auth_token;
  if (!token) {
    res.status(401).json({ user: null });
    return;
  }

  try {
    const payload = jwt.verify(token, authConfig.jwtSecret) as { sub: string; email: string };
    const user = await db('admin_users')
      .where({ id: payload.sub, is_active: true })
      .select('id', 'email', 'name', 'picture_url')
      .first();

    if (!user) {
      res.status(401).json({ user: null });
      return;
    }

    res.json({ user });
  } catch {
    res.status(401).json({ user: null });
  }
});

// ─── POST /logout — Clear auth cookie ───────────────────────────────────────

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ ok: true });
});
