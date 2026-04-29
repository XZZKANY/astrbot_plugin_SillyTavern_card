let currentState = {
  room: null,
  public_timeline: [],
  presentation: {},
};

const commandPrefix = '@小预';

function roomIdFromPath() {
  return decodeURIComponent(window.location.pathname.split('/').pop() || '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMeta(element, room) {
  const items = [
    ['剧本', room.script_name || '未定'],
    ['状态', room.public_status || (room.started ? '进行中' : '等待中')],
    ['阶段', room.phase_name || '未开始'],
    ['当前行动者', room.current_actor_name || '未定'],
    ['当前人数', `${room.member_count || 0} 人`],
  ];
  element.innerHTML = items
    .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value || '-')}</dd></div>`)
    .join('');
}

function renderClosedBanner(room) {
  const banner = document.getElementById('spectator-closed-banner');
  banner.classList.toggle('hidden', !room?.is_closed);
}

function renderProgress(presentation) {
  const current = Number(presentation?.phase_index || 0);
  const total = Number(presentation?.phase_total || 0);
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
  document.getElementById('spectator-progress-text').textContent = total > 0 ? `${current}/${total}` : '-/-';
  document.getElementById('spectator-progress').style.width = `${percent}%`;
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
  document.getElementById('spectator-scene').innerHTML = sceneParts.length
    ? sceneParts.map(([label, value]) => `<p><strong>${escapeHtml(label)}：</strong>${escapeHtml(value)}</p>`).join('')
    : '<p>等待公开实况同步。</p>';
  document.getElementById('spectator-action').innerHTML = actionParts.length
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
    { title: '推荐下一步', items: [recommended] },
    {
      title: '公开查询',
      items: [
        { label: '看当前阶段', command: commandText('当前回合'), note: '确认当前目标、事件和行动建议。' },
        { label: '查看大厅', command: commandText('酒馆状态'), note: '查看成员、阶段和网页链接。' },
      ],
    },
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

function publicFeedId(item = {}) {
  if (item.id != null) return `public:${item.id}`;
  return `public:${item.event_type || 'event'}:${item.created_at || ''}:${item.title || ''}:${item.content || ''}`;
}

function dedupePublicTimeline(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = publicFeedId(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderSpectatorFeed(element, timeline = []) {
  element.innerHTML = timeline.length
    ? timeline
        .map(
          (item) => `
            <article class="feed-entry public-feed-entry host-card">
              <div class="feed-entry-header">
                <strong>${escapeHtml(item.title || '主持人播报')}</strong>
                <span class="feed-label">公开播报</span>
              </div>
              <p>${escapeHtml(item.content || '')}</p>
              <time>${escapeHtml(item.created_at || '-')}</time>
            </article>
          `,
        )
        .join('')
    : '<article class="feed-entry empty-feed-entry"><strong>暂无公开实况</strong><p>房间还没有主持人公开播报。</p></article>';
}

function prependPublicEvent(publicEvent) {
  if (!publicEvent?.content) return;
  currentState.public_timeline = dedupePublicTimeline([publicEvent, ...(currentState.public_timeline || [])]).slice(0, 50);
}

function renderState() {
  const { room, public_timeline: publicTimeline, presentation } = currentState;
  if (!room) return;
  document.getElementById('spectator-title').textContent = room.script_name ? `${room.script_name} · 实况旁观` : `房间 ${room.room_id} · 实况旁观`;
  document.getElementById('spectator-subtitle').textContent = `${room.public_status || '状态未知'}｜当前阶段：${room.phase_name || '未开始'}｜当前行动者：${room.current_actor_name || '未定'}`;
  renderClosedBanner(room);
  renderPresentation(presentation);
  renderSpectatorFeed(document.getElementById('spectator-chat-feed'), publicTimeline);
  renderCommandPanel(document.getElementById('spectator-command-panel'), room, presentation);
  renderMeta(document.getElementById('spectator-meta'), room);
}

function renderAll(payload) {
  currentState = {
    room: payload.room,
    public_timeline: payload.public_timeline || [],
    presentation: payload.presentation || payload.room?.presentation || {},
  };
  renderState();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`request_failed:${response.status}`);
  }
  return response.json();
}

async function loadSpectator(roomId) {
  return fetchJson(`/api/rooms/${encodeURIComponent(roomId)}/spectator`);
}

function applyRoomUpdatedPayload(payload) {
  if (!payload?.room) return false;
  currentState.room = {
    ...(currentState.room || {}),
    ...payload.room,
  };
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
  if (message.type === 'room_closed') {
    if (applyRoomClosedPayload(message.payload || {})) return;
  }
  await fallbackToFullLoad(roomId);
}

async function fallbackToFullLoad(roomId) {
  const payload = await loadSpectator(roomId);
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
      ws.send(JSON.stringify({ type: 'subscribe', room_id: roomId, channel: 'spectator' }));
    });
    ws.addEventListener('message', async (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.room_id !== roomId) return;
      if (message.type === 'room_updated' || message.type === 'room_closed') {
        await handleRealtimeMessage(message, roomId);
      }
    });
    ws.addEventListener('close', () => scheduleReconnect());
    ws.addEventListener('error', () => ws.close());
  }

  connect();
}

(async function main() {
  const roomId = roomIdFromPath();
  try {
    const payload = await loadSpectator(roomId);
    renderAll(payload);
    connectWs(roomId);
  } catch {
    document.getElementById('spectator-title').textContent = '房间不存在';
    document.getElementById('spectator-subtitle').textContent = '请确认房间号是否正确，或稍后再试。';
  }
})();
