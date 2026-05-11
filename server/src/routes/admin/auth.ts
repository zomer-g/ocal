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
  // Always derive from the incoming request so the callback URL matches
  // whatever domain the user is accessing (e.g. ocal.org.il or the render URL).
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

    // Two-tier authorization:
    //   1. If the email already has an admin_users row → allow (the admin
    //      invited them via the UI; their role is stored there).
    //   2. Otherwise fall back to ADMIN_EMAILS env var for first-time
    //      bootstrap — auto-creates an admin_users row with role='admin'.
    //   3. Anyone not in either tier is rejected.
    let user = await db('admin_users').where({ email }).first();

    if (!user) {
      const inEnvAllowList =
        authConfig.adminEmails.length === 0 || authConfig.adminEmails.includes(email);
      if (!inEnvAllowList) {
        logger.warn({ email }, 'Login denied — not in admin_users and not in ADMIN_EMAILS');
        res.status(403).send(`
          <html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding:60px;">
            <h2>אין הרשאה</h2>
            <p>הכתובת <strong>${email}</strong> לא מורשית לגשת לממשק הניהול.</p>
            <a href="/">חזרה לעמוד הראשי</a>
          </body></html>
        `);
        return;
      }
      [user] = await db('admin_users').insert({
        email,
        google_id: googleId,
        name,
        picture_url: pictureUrl,
        last_login: new Date(),
        is_active: true,
      }).returning('*');
    } else {
      await db('admin_users').where({ id: user.id }).update({
        google_id: googleId,
        name,
        picture_url: pictureUrl,
        last_login: new Date(),
        updated_at: new Date(),
      });
      user = await db('admin_users').where({ id: user.id }).first();
    }

    if (!user.is_active) {
      res.status(403).send('Account is deactivated');
      return;
    }

    // Issue JWT (7 days) — include role so middleware can gate without
    // a DB lookup on every request (though it still does one for the
    // is_active check; the claim is informational/audit-friendly).
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role ?? 'admin' },
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

    // Redirect to the frontend admin dashboard.
    // Use CORS_ORIGIN as the base so we always land on the real domain
    // (ocal.org.il) even if the OAuth callback was served from a different host.
    const frontendBase = env.CORS_ORIGIN.replace(/\/$/, '');
    logger.info({ email, userId: user.id }, 'Admin login successful');
    res.redirect(`${frontendBase}/admin`);
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
      .select('id', 'email', 'name', 'picture_url', 'role')
      .first();

    if (!user) {
      res.status(401).json({ user: null });
      return;
    }

    // Normalize: rows from before migration 025 (or freshly inserted before
    // a default takes effect) may have NULL role — treat as 'admin'.
    res.json({ user: { ...user, role: user.role ?? 'admin' } });
  } catch {
    res.status(401).json({ user: null });
  }
});

// ─── POST /logout — Clear auth cookie ───────────────────────────────────────

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ ok: true });
});
