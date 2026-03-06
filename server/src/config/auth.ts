import { env } from './env.js';

export const authConfig = {
  googleClientId: env.GOOGLE_CLIENT_ID,
  googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  adminEmails: env.ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean),
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: '7d',
};
