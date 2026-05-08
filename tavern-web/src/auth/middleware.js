import { verifyRoomToken } from './tokens.js';

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

export function requireRoomToken(role) {
  return async (req, res, next) => {
    try {
      const claims = await verifyRoomToken(bearerToken(req), {
        roomId: String(req.params.roomId || ''),
        requiredRole: role,
      });
      req.roomToken = claims;
      next();
    } catch (error) {
      const message = String(error?.message || 'invalid_token');
      if (message === 'forbidden_role' || message === 'room_mismatch') {
        res.status(403).json({ error: message });
        return;
      }
      res.status(401).json({ error: 'invalid_or_missing_token' });
    }
  };
}
