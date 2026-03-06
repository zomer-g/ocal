import { Router } from 'express';
export const authRouter = Router();

// GET /google - Redirect to Google OAuth consent screen
authRouter.get('/google', (_req, res) => {
  // TODO: Implement Google OAuth redirect in Phase 2
  res.status(501).json({ message: 'Google OAuth not yet implemented' });
});

// GET /google/callback - Handle Google OAuth callback
authRouter.get('/google/callback', (_req, res) => {
  // TODO: Implement Google OAuth callback in Phase 2
  res.status(501).json({ message: 'Google OAuth callback not yet implemented' });
});

// GET /me - Get current authenticated admin user
authRouter.get('/me', (_req, res) => {
  // TODO: Implement in Phase 2
  res.status(501).json({ message: 'Not yet implemented' });
});

// POST /logout - Logout current admin user
authRouter.post('/logout', (_req, res) => {
  // TODO: Implement in Phase 2
  res.status(501).json({ message: 'Not yet implemented' });
});
