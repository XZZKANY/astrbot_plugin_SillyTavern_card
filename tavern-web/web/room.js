let currentState = {
  room: null,
  members: [],
  public_timeline: [],
  participant_chat: [],
  presentation: {},
};

const commandPrefix = '@小预';
const nicknameStorageKey = 'tavern-room-chat-name';

function roomIdFromPath() {
  return decodeURIComponent(window.location.pathname.split('/').pop() || '');
}

function roomTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function authHeaders() {
  const token = roomTokenFromUrl();
  return token ? { authorization: `Bearer ${token}` } : {};
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function roomMetaItems(room) {
  return [
    ['房间号', room.room_id],
    ['房主', room.owner_name],
    ['剧本', room.script_name || '未定'],
    ['状态', room.public_status || (room.started ? '进行中' : '等待中')],
    ['阶段', room.phase_name || '未开始'],
    ['当前行动者', room.current_actor_name || '未定'],
    ['人数', `${room.member_count || 0}`],
    ['更新时间', room.updated_at || '-'],
  ];
}

function renderMeta(element, items) {
  element.innerHTML = items
    .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value || '-')}</dd></div>`)
    .join('');
}

function renderMembers(element, members) {
  element.innerHTML = members.length
    ? members
        .map((member) => `<li>${escapeHtml(member.user_name)}${member.is_owner ? '（房主）' : ''}</li>`)
        .join('')
    : '<li>暂无成员</li>';
}

function renderClosedBanner(room) {
  const banner = document.getElementById('room-closed-banner');
  banner.classList.toggle('hidden', !room?.is_closed);
}

function renderProgress(presentation) {
  const current = Number(presentation?.phase_index || 0);
  const total = Number(presentation?.phase_total || 0);
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
  document.getElementById('room-progress-text').textContent = total > 0 ? `${current}/${total}` : '-/-';
  document.getElementById('room-progress').style.width = `${percent}%`;
}

function renderPresentation(presentation = {}) {
  const sceneParts = [
    ['开场', presentation.opening],
    ['当前事件', presentation.phase_event],
  ].filter(([, value]) => value);
  const actionParts = [
    ['阶段目标', presentation.phase_goal],
    ['行动建议', presentation.public_action_hint],
    ['下一步', presentation.next_step],
  ].filter(([, value]) => value);
  document.getElementById('room-scene').innerHTML = sceneParts.length
    ? sceneParts.map(([label, value]) => `<p><strong>${escapeHtml(label)}：</strong>${escapeHtml(value)}</p>`).join('')
    : '<p>等待公开实况同步。</p>';
  document.getElementById('room-action').innerHTML = actionParts.length
    ? actionParts.map(([label, value]) => `<p><strong>${escapeHtml(label)}：</strong>${escapeHtml(value)}</p>`).join('')
    : '<p>等待阶段行动建议。</p>';
  renderProgress(presentation);
}

function commandText(command) {
  return `${commandPrefix} ${command}`;
}

function buildCommandSections(room, presentation = {}) {
  const phaseIndex = Number(presentation.phase_index || 0);
  const phaseTotal = Number(presentation.phase_total || 0);
  const recommended = room?.is_closed
    ? { label: '房间已关闭', command: commandText('酒馆启动 校园怪谈'), note: '重新开一桌时复制这条。' }
    : !room?.started
      ? { label: '等待开局', command: commandText('加入酒馆'), note: '普通玩家先加入；房主人数够了再开始。' }
      : phaseTotal > 0 && phaseIndex >= phaseTotal
        ? { label: '推荐下一步', command: commandText('下一回合'), note: '进入下一位玩家的准备阶段。' }
        : { label: '推荐下一步', command: commandText('下一回合'), note: '推进到下一个公开阶段。' };

  return [
    {
      title: '推荐下一步',
      items: [recommended],
    },
    {
      title: '普通玩家',
      items: [
        { label: '看当前阶段', command: commandText('当前回合'), note: '确认当前目标、事件和行动建议。' },
        { label: '看自己的身份', command: commandText('我的身份'), note: '只会在群里私聊/回复个人身份，不会显示在网页。' },
        { label: '查看大厅', command: commandText('酒馆状态'), note: '查看成员、阶段和网页链接。' },
      ],
    },
    {
      title: '房主操作',
      items: [
        { label: '推进阶段', command: commandText('下一回合'), note: '只有房主能推进。' },
        { label: '结束本局', command: commandText('结束酒馆'), note: '保留房间和成员，可重新开局。' },
        { label: '解散房间', command: commandText('酒馆解散'), note: '危险操作：会清空当前房间。', danger: true },
      ],
    },
  ];
}

function buildSpeechTemplates(room, presentation = {}) {
  const phaseName = room?.phase_name || '';
  if (phaseName.includes('行动')) {
    return ['我要调查：____', '我要追问：____', '我要保护/协助：____', '理由是：____'];
  }
  if (phaseName.includes('结算')) {
    return ['我现在最相信：____', '我现在最怀疑：____', '下一轮我建议先查：____', '关键理由是：____'];
  }
  if (phaseName.includes('情报')) {
    return ['我发现：____', '我怀疑：____', '我要追问：____', '我希望下一步先看：____'];
  }
  return [
    '我的公开自我介绍：____',
    '我想先观察：____',
    presentation.phase_goal ? `本阶段目标：${presentation.phase_goal}` : '我准备先听大家发言。',
  ];
}

function renderCopyButton(text) {
  return `<button class="copy-button" type="button" data-copy-text="${escapeHtml(text)}">复制</button>`;
}

function renderCommandPanel(element, room, presentation) {
  const sections = buildCommandSections(room, presentation);
  element.innerHTML = sections
    .map(
      (section) => `
        <section class="command-section">
          <h3>${escapeHtml(section.title)}</h3>
          <div class="command-grid">
            ${section.items
              .map(
                (item) => `
                  <article class="command-card${item.danger ? ' danger-command' : ''}">
                    <div>
                      <strong>${escapeHtml(item.label)}</strong>
                      <code>${escapeHtml(item.command)}</code>
                      <p>${escapeHtml(item.note)} <span class="copy-hint">复制回群发送</span></p>
                    </div>
                    ${renderCopyButton(item.command)}
                  </article>
                `,
              )
              .join('')}
          </div>
        </section>
      `,
    )
    .join('');
}

function renderTemplatePanel(element, room, presentation) {
  const templates = buildSpeechTemplates(room, presentation);
  element.innerHTML = `
    <ul class="template-list">
      ${templates
        .map(
          (template) => `
            <li>
              <span>${escapeHtml(template)}</span>
              ${renderCopyButton(template)}
            </li>
          `,
        )
        .join('')}
    </ul>
  `;
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  const original = button.textContent;
  button.textContent = '已复制';
  button.classList.add('copied');
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove('copied');
  }, 1200);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy-text]');
  if (!button) return;
  copyText(button.dataset.copyText || '', button);
});

function setChatStatus(text, isError = false) {
  const status = document.getElementById('room-chat-status');
  status.textContent = text;
  status.classList.toggle('error-text', isError);
}

function renderChatComposer(room) {
  const form = document.getElementById('room-chat-form');
  const disabled = Boolean(room?.is_closed);
  for (const field of form.querySelectorAll('input, textarea, button')) {
    field.disabled = disabled;
  }
  if (disabled) {
    setChatStatus('房间已关闭，网页聊天已停止。', true);
  }
}

function rememberNickname(value) {
  localStorage.setItem(nicknameStorageKey, value);
}

function restoreNickname() {
  const savedValue = localStorage.getItem(nicknameStorageKey) || '';
  document.getElementById('room-chat-name').value = savedValue;
}

function currentViewerName() {
  const input = document.getElementById('room-chat-name');
  const inputValue = String(input?.value || '').trim();
  if (inputValue) return inputValue;
  return String(localStorage.getItem(nicknameStorageKey) || '').trim();
}

function publicFeedId(item = {}) {
  if (item.id != null) return `public:${item.id}`;
  return `public:${item.event_type || 'event'}:${item.created_at || ''}:${item.title || ''}:${item.content || ''}`;
}

function participantFeedId(item = {}) {
  if (item.id != null) return `chat:${item.id}`;
  return `chat:${item.created_at || ''}:${item.user_name || ''}:${item.content || ''}`;
}

function mergeFeed(publicTimeline = [], participantChat = []) {
  const publicItems = publicTimeline.map((item) => ({
    ...item,
    feed_kind: 'public',
    feed_id: publicFeedId(item),
  }));
  const chatItems = participantChat.map((item) => ({
    ...item,
    title: item.user_name,
    event_type: 'participant_chat',
    feed_kind: 'participant',
    feed_id: participantFeedId(item),
  }));
  return [...publicItems, ...chatItems].sort((a, b) => `${b.created_at || ''}|${b.feed_id}`.localeCompare(`${a.created_at || ''}|${a.feed_id}`));
}

function renderFeed(element, feed) {
  const viewerName = currentViewerName();
  element.innerHTML = feed.length
    ? feed
        .map((item) => {
          if (item.feed_kind === 'participant') {
            const isMine = Boolean(viewerName) && String(item.user_name || '').trim() === viewerName;
            return `
              <article class="feed-entry participant-feed-entry participant-message ${isMine ? 'mine-message' : 'other-message'}">
                <div class="feed-entry-header message-meta">
                  <strong class="message-author">${escapeHtml(item.user_name || item.title || '匿名参与者')}</strong>
                  <span class="feed-label">${isMine ? '我的发言' : '参与者聊天'}</span>
                </div>
                <p class="message-body">${escapeHtml(item.content || '')}</p>
                <time>${escapeHtml(item.created_at || '-')}</time>
              </article>
            `;
          }
          return `
            <article class="feed-entry public-feed-entry system-message">
              <div class="feed-entry-header">
                <strong>${escapeHtml(item.title || '主持人播报')}</strong>
                <span class="feed-label">公开播报</span>
              </div>
              <p>${escapeHtml(item.content || '')}</p>
              <time>${escapeHtml(item.created_at || '-')}</time>
            </article>
          `;
        })
        .join('')
    : '<article class="feed-entry empty-feed-entry"><strong>暂无本局消息</strong><p>等待主持人播报或参与者发言。</p></article>';
}

function dedupeBy(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function prependPublicEvent(publicEvent) {
  if (!publicEvent?.content) return;
  currentState.public_timeline = dedupeBy([publicEvent, ...(currentState.public_timeline || [])], publicFeedId).slice(0, 50);
}

function prependParticipantChat(chatMessage) {
  if (!chatMessage?.content) return;
  currentState.participant_chat = dedupeBy([chatMessage, ...(currentState.participant_chat || [])], participantFeedId).slice(0, 50);
}

function renderState() {
  const { room, members, public_timeline: publicTimeline, participant_chat: participantChat, presentation } = currentState;
  if (!room) return;
  document.getElementById('room-title').textContent = room.script_name ? `${room.script_name} · 房间 ${room.room_id}` : `房间 ${room.room_id}`;
  document.getElementById('room-subtitle').textContent = `${room.public_status || '状态未知'}｜当前阶段：${room.phase_name || '未开始'}｜当前行动者：${room.current_actor_name || '未定'}`;
  renderClosedBanner(room);
  renderPresentation(presentation);
  renderCommandPanel(document.getElementById('room-command-panel'), room, presentation);
  renderTemplatePanel(document.getElementById('room-template-panel'), room, presentation);
  renderMeta(document.getElementById('room-meta'), roomMetaItems(room));
  renderMembers(document.getElementById('member-list'), members);
  renderFeed(document.getElementById('room-chat-feed'), mergeFeed(publicTimeline, participantChat));
  renderChatComposer(room);
}

function renderAll(payload) {
  currentState = {
    room: payload.room,
    members: payload.members || [],
    public_timeline: payload.public_timeline || [],
    participant_chat: payload.participant_chat || [],
    presentation: payload.presentation || payload.room?.presentation || {},
  };
  restoreNickname();
  renderState();
}

async function fetchJson(url, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(authHeaders())) {
    headers.set(key, value);
  }
  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    throw new Error(`request_failed:${response.status}:${detail}`);
  }
  return response.json();
}

async function loadRoomView(roomId) {
  return fetchJson(`/api/rooms/${encodeURIComponent(roomId)}/room-view`);
}

function applyRoomUpdatedPayload(payload) {
  if (!payload?.room || !Array.isArray(payload.members)) return false;
  currentState.room = {
    ...(currentState.room || {}),
    ...payload.room,
  };
  currentState.members = payload.members;
  currentState.presentation = payload.presentation || currentState.presentation || payload.room?.presentation || {};
  prependPublicEvent(payload.public_event);
  renderState();
  return true;
}

function applyRoomClosedPayload(payload) {
  if (!currentState.room) return false;
  currentState.room = {
    ...currentState.room,
    is_closed: 1,
    closed_at: payload?.closed_at || currentState.room.closed_at || '',
    public_status: '已关闭',
  };
  renderState();
  return true;
}

async function handleRealtimeMessage(message, roomId) {
  if (message.type === 'room_updated') {
    if (applyRoomUpdatedPayload(message.payload || {})) return;
  }
  if (message.type === 'chat_message') {
    prependParticipantChat(message.payload?.chat_message);
    renderState();
    return;
  }
  if (message.type === 'room_closed') {
    if (applyRoomClosedPayload(message.payload || {})) return;
  }
  await fallbackToFullLoad(roomId);
}

async function fallbackToFullLoad(roomId) {
  const payload = await loadRoomView(roomId);
  renderAll(payload);
}

function connectWs(roomId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let reconnectTimer = null;

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1200);
  }

  function connect() {
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', room_id: roomId, channel: 'room' }));
    });
    ws.addEventListener('message', async (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.room_id !== roomId) return;
      if (message.type === 'room_updated' || message.type === 'room_closed' || message.type === 'chat_message') {
        await handleRealtimeMessage(message, roomId);
      }
    });
    ws.addEventListener('close', () => scheduleReconnect());
    ws.addEventListener('error', () => ws.close());
  }

  connect();
}

async function submitParticipantChat(roomId) {
  const nameInput = document.getElementById('room-chat-name');
  const contentInput = document.getElementById('room-chat-content');
  const userName = nameInput.value.trim();
  const content = contentInput.value.trim();
  if (!userName || !content) {
    setChatStatus('请填写网页昵称和发言内容。', true);
    return;
  }
  rememberNickname(userName);
  try {
    const payload = await fetchJson(`/api/rooms/${encodeURIComponent(roomId)}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_name: userName, content }),
    });
    prependParticipantChat(payload.chat_message);
    renderState();
    contentInput.value = '';
    setChatStatus('已发送到本局聊天。');
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('request_failed:409')) {
      setChatStatus('房间已关闭，无法继续发送。', true);
      return;
    }
    if (message.includes('request_failed:400')) {
      setChatStatus('请填写网页昵称和发言内容。', true);
      return;
    }
    setChatStatus('发送失败，请稍后再试。', true);
  }
}

(async function main() {
  const roomId = roomIdFromPath();
  try {
    const payload = await loadRoomView(roomId);
    renderAll(payload);
    document.getElementById('room-chat-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitParticipantChat(roomId);
    });
    connectWs(roomId);
  } catch {
    document.getElementById('room-title').textContent = '房间不存在';
    document.getElementById('room-subtitle').textContent = '请确认房间号是否正确，或稍后再试。';
  }
})();
