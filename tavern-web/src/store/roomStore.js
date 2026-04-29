import { db } from '../db/sqlite.js';
import { config } from '../config.js';

const upsertRoomStmt = db.prepare(`
  INSERT INTO rooms (
    room_id, group_id, owner_id, owner_name, script_name, started, locked,
    phase_name, turn_index, current_actor_id, current_actor_name,
    member_count, public_status, presentation_json, updated_at, is_closed, closed_at
  ) VALUES (
    @room_id, @group_id, @owner_id, @owner_name, @script_name, @started, @locked,
    @phase_name, @turn_index, @current_actor_id, @current_actor_name,
    @member_count, @public_status, @presentation_json, @updated_at, @is_closed, @closed_at
  )
  ON CONFLICT(room_id) DO UPDATE SET
    group_id=excluded.group_id,
    owner_id=excluded.owner_id,
    owner_name=excluded.owner_name,
    script_name=excluded.script_name,
    started=excluded.started,
    locked=excluded.locked,
    phase_name=excluded.phase_name,
    turn_index=excluded.turn_index,
    current_actor_id=excluded.current_actor_id,
    current_actor_name=excluded.current_actor_name,
    member_count=excluded.member_count,
    public_status=excluded.public_status,
    presentation_json=excluded.presentation_json,
    updated_at=excluded.updated_at,
    is_closed=excluded.is_closed,
    closed_at=excluded.closed_at
`);

const deleteMembersStmt = db.prepare('DELETE FROM room_members WHERE room_id = ?');
const insertMemberStmt = db.prepare(`
  INSERT INTO room_members (room_id, user_id, user_name, is_owner, joined_at)
  VALUES (@room_id, @user_id, @user_name, @is_owner, @joined_at)
`);
const insertTimelineStmt = db.prepare(`
  INSERT INTO room_timeline (room_id, event_type, title, content, created_at)
  VALUES (@room_id, @event_type, @title, @content, @created_at)
`);
const closeRoomStmt = db.prepare(`
  UPDATE rooms
  SET is_closed = 1, closed_at = @closed_at, updated_at = @updated_at
  WHERE room_id = @room_id
`);
const getRoomStmt = db.prepare('SELECT * FROM rooms WHERE room_id = ?');
const getMembersStmt = db.prepare('SELECT room_id, user_id, user_name, is_owner, joined_at FROM room_members WHERE room_id = ? ORDER BY is_owner DESC, joined_at ASC, user_name ASC');
const getTimelineStmt = db.prepare(`
  SELECT id, room_id, event_type, title, content, created_at
  FROM room_timeline
  WHERE room_id = ?
  ORDER BY datetime(created_at) DESC, id DESC
  LIMIT ?
`);
const insertChatMessageStmt = db.prepare(`
  INSERT INTO room_chat_messages (room_id, user_name, content, created_at)
  VALUES (@room_id, @user_name, @content, @created_at)
`);
const getChatMessageStmt = db.prepare(`
  SELECT id, room_id, user_name, content, created_at
  FROM room_chat_messages
  WHERE id = ?
`);
const getParticipantChatStmt = db.prepare(`
  SELECT id, room_id, user_name, content, created_at
  FROM room_chat_messages
  WHERE room_id = ?
  ORDER BY datetime(created_at) DESC, id DESC
  LIMIT ?
`);

function normalizeRoom(input) {
  return {
    room_id: String(input.room_id || ''),
    group_id: String(input.group_id || input.room_id || ''),
    owner_id: String(input.owner_id || ''),
    owner_name: String(input.owner_name || ''),
    script_name: String(input.script_name || ''),
    started: input.started ? 1 : 0,
    locked: input.locked ? 1 : 0,
    phase_name: String(input.phase_name || ''),
    turn_index: Number(input.turn_index || 0),
    current_actor_id: String(input.current_actor_id || ''),
    current_actor_name: String(input.current_actor_name || ''),
    member_count: Number(input.member_count || 0),
    public_status: String(input.public_status || ''),
    presentation_json: '{}',
    updated_at: String(input.updated_at || new Date().toISOString()),
    is_closed: input.is_closed ? 1 : 0,
    closed_at: String(input.closed_at || ''),
  };
}

function normalizePresentation(input = {}) {
  const settlementTips = Array.isArray(input.settlement_tips)
    ? input.settlement_tips.filter(Boolean).map((item) => String(item)).slice(0, 3)
    : [];
  return {
    opening: String(input.opening || ''),
    phase_event: String(input.phase_event || ''),
    phase_goal: String(input.phase_goal || ''),
    public_action_hint: String(input.public_action_hint || ''),
    next_step: String(input.next_step || ''),
    settlement_tips: settlementTips,
    phase_index: Number(input.phase_index || 0),
    phase_total: Number(input.phase_total || 0),
  };
}

function serializePresentation(input) {
  return JSON.stringify(normalizePresentation(input));
}

function parsePresentation(raw) {
  try {
    return normalizePresentation(JSON.parse(raw || '{}'));
  } catch {
    return normalizePresentation({});
  }
}

function formatLocalTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
  ].join('');
}

function denormalizeRoom(row) {
  if (!row) return null;
  const { presentation_json: presentationJson, ...room } = row;
  return {
    ...room,
    presentation: parsePresentation(presentationJson),
  };
}

function normalizeMembers(roomId, members) {
  return (members || []).map((member, index) => ({
    room_id: roomId,
    user_id: String(member.user_id || ''),
    user_name: String(member.user_name || ''),
    is_owner: member.is_owner ? 1 : 0,
    joined_at: String(member.joined_at || `${index}`),
  }));
}

function normalizePublicEvent(roomId, publicEvent, updatedAt) {
  if (!publicEvent) return null;
  return {
    room_id: roomId,
    event_type: String(publicEvent.event_type || 'room_updated'),
    title: String(publicEvent.title || '状态更新'),
    content: String(publicEvent.content || ''),
    created_at: String(publicEvent.created_at || updatedAt || new Date().toISOString()),
  };
}

const syncTransaction = db.transaction((payload) => {
  const room = normalizeRoom(payload.room || {});
  room.presentation_json = serializePresentation(payload.presentation || {});
  upsertRoomStmt.run(room);
  deleteMembersStmt.run(room.room_id);
  for (const member of normalizeMembers(room.room_id, payload.members || [])) {
    insertMemberStmt.run(member);
  }
  const publicEvent = normalizePublicEvent(room.room_id, payload.public_event, room.updated_at);
  if (publicEvent && publicEvent.content) {
    insertTimelineStmt.run(publicEvent);
  }
  return room.room_id;
});

export function fullSync(payload) {
  return syncTransaction(payload);
}

export function closeRoom(roomId, closedAt) {
  const timestamp = String(closedAt || new Date().toISOString());
  closeRoomStmt.run({ room_id: roomId, closed_at: timestamp, updated_at: timestamp });
}

export function getRoom(roomId) {
  return denormalizeRoom(getRoomStmt.get(roomId));
}

export function getMembers(roomId) {
  return getMembersStmt.all(roomId).map((item) => ({
    ...item,
    is_owner: Boolean(item.is_owner),
  }));
}

export function getPublicTimeline(roomId, limit = config.timelineLimit) {
  return getTimelineStmt.all(roomId, limit);
}

export function getTimeline(roomId, limit = config.timelineLimit) {
  return getPublicTimeline(roomId, limit);
}

export function addParticipantChat(roomId, input = {}) {
  const userName = String(input.user_name || '').trim().slice(0, 24);
  const content = String(input.content || '').trim().slice(0, 300);
  const createdAt = String(input.created_at || formatLocalTimestamp());
  const result = insertChatMessageStmt.run({
    room_id: roomId,
    user_name: userName,
    content,
    created_at: createdAt,
  });
  return getChatMessageStmt.get(result.lastInsertRowid);
}

export function getParticipantChat(roomId, limit = config.timelineLimit) {
  return getParticipantChatStmt.all(roomId, limit);
}

export function getRoomView(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  return {
    room,
    members: getMembers(roomId),
    presentation: room.presentation,
    public_timeline: getPublicTimeline(roomId, config.timelineLimit),
    participant_chat: getParticipantChat(roomId, config.timelineLimit),
  };
}

export function getSpectatorView(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  return {
    room,
    presentation: room.presentation,
    public_timeline: getPublicTimeline(roomId, config.timelineLimit),
  };
}
