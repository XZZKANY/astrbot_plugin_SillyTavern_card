import { SignJWT, jwtVerify } from 'jose';

function secretKey() {
  const secret = process.env.TAVERN_WEB_AUTH_SECRET || process.env.TAVERN_WEB_SYNC_TOKEN || '';
  if (secret.length < 16) {
    throw new Error('missing_auth_secret');
  }
  return new TextEncoder().encode(secret);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function signRoomToken(payload, expiresInSeconds) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(nowSeconds())
    .setExpirationTime(nowSeconds() + expiresInSeconds)
    .sign(secretKey());
}

export async function createParticipantToken({ roomId, userId, userName, expiresInSeconds = 86400 }) {
  return signRoomToken(
    {
      room_id: String(roomId || ''),
      user_id: String(userId || ''),
      user_name: String(userName || ''),
      role: 'participant',
    },
    expiresInSeconds,
  );
}

export async function createSpectatorToken({ roomId, expiresInSeconds = 86400 }) {
  return signRoomToken(
    {
      room_id: String(roomId || ''),
      role: 'spectator',
    },
    expiresInSeconds,
  );
}

export async function verifyRoomToken(token, { roomId, requiredRole }) {
  if (!token) {
    throw new Error('missing_token');
  }
  const { payload } = await jwtVerify(String(token), secretKey());
  if (String(payload.room_id || '') !== String(roomId || '')) {
    throw new Error('room_mismatch');
  }
  if (requiredRole && payload.role !== requiredRole) {
    throw new Error('forbidden_role');
  }
  return payload;
}
