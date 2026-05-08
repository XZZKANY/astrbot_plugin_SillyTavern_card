import assert from 'node:assert/strict';
import { createParticipantToken, createSpectatorToken, verifyRoomToken } from './src/auth/tokens.js';

process.env.TAVERN_WEB_AUTH_SECRET = 'test-secret-minimum-32-characters';

const participant = await createParticipantToken({ roomId: 'room-a', userId: 'u1', userName: '玩家一' });
const spectator = await createSpectatorToken({ roomId: 'room-a' });

const participantClaims = await verifyRoomToken(participant, { roomId: 'room-a', requiredRole: 'participant' });
assert.equal(participantClaims.room_id, 'room-a');
assert.equal(participantClaims.user_id, 'u1');
assert.equal(participantClaims.user_name, '玩家一');
assert.equal(participantClaims.role, 'participant');

const spectatorClaims = await verifyRoomToken(spectator, { roomId: 'room-a', requiredRole: 'spectator' });
assert.equal(spectatorClaims.role, 'spectator');

await assert.rejects(
  () => verifyRoomToken(spectator, { roomId: 'room-a', requiredRole: 'participant' }),
  /forbidden_role/,
);

await assert.rejects(
  () => verifyRoomToken(participant, { roomId: 'room-b', requiredRole: 'participant' }),
  /room_mismatch/,
);

console.log('tavern-web auth verification passed');
