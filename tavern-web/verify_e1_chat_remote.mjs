import { WebSocket } from 'ws';

const base = process.env.TAVERN_WEB_BASE || 'http://127.0.0.1:8088';
const roomId = process.env.TAVERN_WEB_ROOM_ID || '1083966574';
const parsedTimeoutMs = Number(process.env.TAVERN_WEB_VERIFY_TIMEOUT_MS);
const timeoutMs = Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0 ? parsedTimeoutMs : 5000;

function urlFor(pathname) {
  return `${base}${pathname}`;
}

async function fetchText(pathname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(urlFor(pathname), { signal: controller.signal });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`${pathname} returned ${response.status}${body ? `: ${body}` : ''}`);
    }
    return body;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${pathname} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(pathname, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let body = '';
  try {
    response = await fetch(urlFor(pathname), { ...options, signal: controller.signal });
    body = await response.text();
    if (!response.ok) {
      throw new Error(`${pathname} returned ${response.status}${body ? `: ${body}` : ''}`);
    }
    try {
      return JSON.parse(body);
    } catch (error) {
      throw new Error(`${pathname} returned ${response.status} with invalid JSON${body ? `: ${body}` : ''}; ${error.message}`);
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${pathname} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function assertIncludes(label, text, markers) {
  for (const marker of markers) {
    if (!text.includes(marker)) {
      throw new Error(`${label} missing marker ${marker}`);
    }
  }
}

function eventContent(message) {
  return message?.payload?.public_event?.content
    ?? message?.payload?.content
    ?? message?.public_event?.content
    ?? message?.content;
}

async function waitForChatMessage(messages, content) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = messages.some((message) => message?.type === 'chat_message' && eventContent(message) === content);
    if (found) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`missing chat_message broadcast for ${content}; received ${JSON.stringify(messages)}`);
}

const roomHtml = await fetchText(`/room/${encodeURIComponent(roomId)}`);
const spectatorHtml = await fetchText(`/spectator/${encodeURIComponent(roomId)}`);
assertIncludes('room page', roomHtml, ['room-chat-form', 'room-chat-name', 'room-chat-content', 'web-chat-card']);
assertIncludes('spectator page', spectatorHtml, ['spectator-chat-form', 'spectator-chat-name', 'spectator-chat-content', 'web-chat-card']);

const roomJs = await fetchText('/room.js');
assertIncludes('room.js', roomJs, ['submitPublicChat', 'chat_message', 'chat-bubble']);

const wsUrl = `${base.replace(/^http/i, 'ws')}/ws`;
const ws = new WebSocket(wsUrl);
const messages = [];
let closed = false;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`websocket open timeout: ${wsUrl}`)), timeoutMs);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  ws.on('message', (raw) => {
    try {
      messages.push(JSON.parse(raw.toString()));
    } catch (error) {
      messages.push({ type: 'invalid_json', raw: raw.toString(), error: error.message });
    }
  });
  ws.once('close', () => {
    closed = true;
  });

  ws.send(JSON.stringify({ type: 'subscribe', room_id: roomId }));
  await new Promise((resolve) => setTimeout(resolve, 150));

  const content = `E1 smoke ${Date.now()}`;
  await fetchJson(`/api/rooms/${encodeURIComponent(roomId)}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_name: '远端验证', content }),
  });

  await waitForChatMessage(messages, content);

  const spectator = await fetchJson(`/api/rooms/${encodeURIComponent(roomId)}/spectator`);
  const timeline = Array.isArray(spectator.timeline) ? spectator.timeline : [];
  if (!timeline.some((item) => item?.content === content)) {
    throw new Error(`spectator timeline missing ${content}; timeline=${JSON.stringify(timeline)}`);
  }
} finally {
  if (!closed) ws.close();
}

console.log('tavern-web remote E1 chat verification passed');
