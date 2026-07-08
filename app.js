const DEFAULT_CONFIG = {
  mode: "local",
  spaceId: "friends-void",
  accessCode: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
};

const config = {
  ...DEFAULT_CONFIG,
  ...(window.VOID_LOG_CONFIG || {}),
};

const STORAGE_PREFIX = `void-log:${config.spaceId}`;
const APP_VERSION = "0.2";
const MESSAGE_LIMIT = 240;
const ROOM_LIFETIME_HOURS = 24;

const state = {
  identity: null,
  rooms: [],
  messages: [],
  pendingMessages: [],
  activeRoomId: null,
  activeEditRoomId: null,
  chatMinimized: false,
  provider: null,
  toastTimer: null,
  forceScrollMessages: false,
  hasNewMessages: false,
  renderedMessageIds: {},
  lastRenderedRoomId: null,
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  state.identity = getOrCreateIdentity();
  paintIdentity();
  setupGate();
  setupCreateRoomDialog();
  setupEditRoomDialog();
  setupChat();
  setupStarfield();

  state.provider = makeProvider();
  await refreshFromProvider();
  state.provider.subscribe?.(applySnapshot);
  render();
});

function bindElements() {
  Object.assign(els, {
    voidStage: document.querySelector("#voidStage"),
    gate: document.querySelector("#gate"),
    gateForm: document.querySelector("#gateForm"),
    gateError: document.querySelector("#gateError"),
    accessCode: document.querySelector("#accessCode"),
    identityButton: document.querySelector("#identityButton"),
    identityDot: document.querySelector("#identityDot"),
    identityName: document.querySelector("#identityName"),
    newRoomButton: document.querySelector("#newRoomButton"),
    mobileIdentityButton: document.querySelector("#mobileIdentityButton"),
    mobileIdentityDot: document.querySelector("#mobileIdentityDot"),
    mobileIdentityName: document.querySelector("#mobileIdentityName"),
    mobileNewRoomButton: document.querySelector("#mobileNewRoomButton"),
    createRoomDialog: document.querySelector("#createRoomDialog"),
    createRoomForm: document.querySelector("#createRoomForm"),
    cancelCreateButton: document.querySelector("#cancelCreateButton"),
    editRoomDialog: document.querySelector("#editRoomDialog"),
    editRoomForm: document.querySelector("#editRoomForm"),
    cancelEditButton: document.querySelector("#cancelEditButton"),
    editSwatches: document.querySelector("#editSwatches"),
    identityDialog: document.querySelector("#identityDialog"),
    identityForm: document.querySelector("#identityForm"),
    cancelIdentityButton: document.querySelector("#cancelIdentityButton"),
    swatches: document.querySelector("#swatches"),
    roomsLayer: document.querySelector("#roomsLayer"),
    roomRailSection: document.querySelector("#roomRailSection"),
    roomRail: document.querySelector("#roomRail"),
    roomRailCount: document.querySelector("#roomRailCount"),
    emptyState: document.querySelector("#emptyState"),
    versionLabel: document.querySelector("#versionLabel"),
    minimizedChatBar: document.querySelector("#minimizedChatBar"),
    minimizedRoomTitle: document.querySelector("#minimizedRoomTitle"),
    minimizedRoomCount: document.querySelector("#minimizedRoomCount"),
    chatPanel: document.querySelector("#chatPanel"),
    closeChatButton: document.querySelector("#closeChatButton"),
    editRoomButton: document.querySelector("#editRoomButton"),
    activeRoomMood: document.querySelector("#activeRoomMood"),
    activeRoomTitle: document.querySelector("#activeRoomTitle"),
    activeRoomDescription: document.querySelector("#activeRoomDescription"),
    messages: document.querySelector("#messages"),
    newMessagesButton: document.querySelector("#newMessagesButton"),
    messageForm: document.querySelector("#messageForm"),
    messageInput: document.querySelector("#messageInput"),
    toast: document.querySelector("#toast"),
    starfield: document.querySelector("#starfield"),
  });
}

function setupGate() {
  const savedAccess = sessionStorage.getItem(`${STORAGE_PREFIX}:access-ok`);
  const needsAccess = Boolean(config.accessCode);

  if (needsAccess && savedAccess !== "true") {
    els.gate.hidden = false;
    els.accessCode.focus();
  }

  els.gateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = new FormData(els.gateForm).get("accessCode")?.trim();

    if (input === config.accessCode) {
      sessionStorage.setItem(`${STORAGE_PREFIX}:access-ok`, "true");
      els.gate.hidden = true;
      showToast("입장 완료. 조용히 떠다녀보자.");
      return;
    }

    els.gateError.textContent = "코드가 맞지 않습니다.";
  });
}

function setupCreateRoomDialog() {
  els.newRoomButton.addEventListener("click", openCreateRoomDialog);
  els.mobileNewRoomButton.addEventListener("click", openCreateRoomDialog);

  els.cancelCreateButton.addEventListener("click", () => {
    els.createRoomDialog.close();
  });

  setupSwatches(els.swatches, els.createRoomForm);

  els.createRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(els.createRoomForm);
    const room = buildRoom({
      title: cleanText(formData.get("title"), 28) || "이름 없는 방",
      description: cleanText(formData.get("description"), 72),
      mood: cleanText(formData.get("mood"), 16) || "고요함",
      color: formData.get("color") || "#67e8f9",
    });

    try {
      addRoomOptimistically(room);
      await state.provider.createRoom(room);
      resetRoomForm(els.createRoomForm, els.swatches);
      els.createRoomDialog.close();
      showToast("새 방이 떠올랐습니다.");
      await refreshFromProvider();
      openRoom(room.id);
    } catch (error) {
      removeRoomOptimistically(room.id);
      showToast("방을 만들지 못했습니다. 설정을 확인해 주세요.");
      console.error(error);
    }
  });
}

function setupEditRoomDialog() {
  els.editRoomButton.addEventListener("click", () => {
    const room = getActiveRoom();
    if (!room || !canEditRoom(room)) return;
    openEditRoomDialog(room);
  });

  els.cancelEditButton.addEventListener("click", () => {
    els.editRoomDialog.close();
  });

  setupSwatches(els.editSwatches, els.editRoomForm);

  els.editRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const room = state.rooms.find((item) => item.id === state.activeEditRoomId);
    if (!room || !canEditRoom(room)) return;

    const formData = new FormData(els.editRoomForm);
    const patch = {
      title: cleanText(formData.get("title"), 28) || "이름 없는 방",
      description: cleanText(formData.get("description"), 72),
      mood: cleanText(formData.get("mood"), 16) || "고요함",
      color: formData.get("color") || "#67e8f9",
      updatedAt: new Date().toISOString(),
    };

    try {
      updateRoomOptimistically(room.id, patch);
      await state.provider.updateRoom(room.id, patch);
      els.editRoomDialog.close();
      showToast("방 정보를 저장했습니다.");
      await refreshFromProvider();
    } catch (error) {
      showToast("방 정보를 저장하지 못했습니다.");
      await refreshFromProvider();
      console.error(error);
    }
  });
}

function setupChat() {
  els.closeChatButton.addEventListener("click", () => {
    state.chatMinimized = true;
    state.hasNewMessages = false;
    render();
  });

  els.minimizedChatBar.addEventListener("click", () => {
    if (!state.activeRoomId) return;
    state.chatMinimized = false;
    state.forceScrollMessages = true;
    render();
    focusComposerIfDesktop();
  });

  els.newMessagesButton.addEventListener("click", () => {
    scrollMessagesToBottom();
    state.hasNewMessages = false;
    renderNewMessageButton();
  });

  els.messages.addEventListener("scroll", () => {
    if (isMessagesNearBottom()) {
      state.hasNewMessages = false;
      renderNewMessageButton();
    }
  });

  els.messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = cleanText(els.messageInput.value, MESSAGE_LIMIT);
    if (!state.activeRoomId || !content) return;

    const message = buildMessage({
      roomId: state.activeRoomId,
      content,
    });

    els.messageInput.value = "";
    state.pendingMessages = [
      ...state.pendingMessages,
      {
        ...message,
        status: "pending",
      },
    ];
    state.forceScrollMessages = true;
    render();

    try {
      await state.provider.createMessage(message);
      state.pendingMessages = state.pendingMessages.filter((item) => item.id !== message.id);
      await refreshFromProvider();
    } catch (error) {
      state.pendingMessages = state.pendingMessages.map((item) =>
        item.id === message.id
          ? {
              ...item,
              status: "failed",
            }
          : item,
      );
      if (!els.messageInput.value) {
        els.messageInput.value = content;
      }
      render();
      showToast("메시지를 보내지 못했습니다. 입력창에 다시 넣어뒀습니다.");
      console.error(error);
    }
  });

  els.identityButton.addEventListener("click", openIdentityDialog);
  els.mobileIdentityButton.addEventListener("click", openIdentityDialog);

  els.cancelIdentityButton.addEventListener("click", () => {
    els.identityDialog.close();
  });

  els.identityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(els.identityForm);
    const name = cleanText(formData.get("name"), 18);
    if (!name) return;

    state.identity.name = name;
    localStorage.setItem(`${STORAGE_PREFIX}:identity`, JSON.stringify(state.identity));
    paintIdentity();
    els.identityDialog.close();
    showToast("익명 이름을 바꿨습니다.");
  });
}

function openIdentityDialog() {
  els.identityForm.elements.name.value = state.identity.name;
  if (typeof els.identityDialog.showModal === "function") {
    els.identityDialog.showModal();
  } else {
    els.identityDialog.setAttribute("open", "");
  }
  els.identityForm.elements.name.focus();
}

function openCreateRoomDialog() {
  openDialog(els.createRoomDialog, els.createRoomForm.elements.title);
}

function openEditRoomDialog(room) {
  state.activeEditRoomId = room.id;
  els.editRoomForm.elements.title.value = room.title;
  els.editRoomForm.elements.description.value = room.description || "";
  els.editRoomForm.elements.mood.value = room.mood || "고요함";
  setSelectedSwatch(els.editSwatches, els.editRoomForm, room.color || "#67e8f9");
  openDialog(els.editRoomDialog, els.editRoomForm.elements.title);
}

function openDialog(dialog, focusTarget) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
  requestAnimationFrame(() => focusTarget?.focus());
}

function setupSwatches(container, form) {
  container.addEventListener("click", (event) => {
    const swatch = event.target.closest(".swatch");
    if (!swatch) return;
    setSelectedSwatch(container, form, swatch.dataset.color);
  });
}

function setSelectedSwatch(container, form, color) {
  form.elements.color.value = color;
  container.querySelectorAll(".swatch").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.color === color);
  });
}

function resetRoomForm(form, swatches) {
  form.reset();
  setSelectedSwatch(swatches, form, "#67e8f9");
}

function buildRoom({ title, description, mood, color }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ROOM_LIFETIME_HOURS * 60 * 60 * 1000);

  return {
    id: crypto.randomUUID(),
    spaceId: config.spaceId,
    title,
    description,
    mood,
    color,
    creatorId: state.identity.id,
    x: randomBetween(12, 88),
    y: randomBetween(18, 82),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function buildMessage({ roomId, content }) {
  return {
    id: crypto.randomUUID(),
    spaceId: config.spaceId,
    roomId,
    authorId: state.identity.id,
    authorName: state.identity.name,
    authorColor: state.identity.color,
    content,
    createdAt: new Date().toISOString(),
  };
}

function makeProvider() {
  const shouldUseSupabase =
    config.mode === "supabase" &&
    config.supabaseUrl &&
    config.supabaseAnonKey &&
    window.supabase?.createClient;

  if (shouldUseSupabase) {
    return new SupabaseProvider(config);
  }

  if (config.mode === "supabase") {
    showToast("Supabase 설정이 없어 로컬 모드로 시작합니다.");
  }

  return new LocalProvider(config.spaceId);
}

async function refreshFromProvider() {
  const snapshot = await state.provider.load();
  applySnapshot(snapshot);
}

function applySnapshot(snapshot) {
  state.rooms = snapshot.rooms.filter(isRoomAlive).sort(sortByCreatedAt);
  const liveRoomIds = new Set(state.rooms.map((room) => room.id));
  state.messages = snapshot.messages
    .filter((message) => liveRoomIds.has(message.roomId))
    .sort(sortByCreatedAt);
  state.pendingMessages = state.pendingMessages.filter((message) => liveRoomIds.has(message.roomId));
  render();
}

function render() {
  renderShellState();
  renderRooms();
  renderRoomRail();
  renderChat();
  renderMinimizedChat();
  renderStatus();
}

function renderShellState() {
  const hasActiveRoom = Boolean(getActiveRoom());
  els.voidStage.classList.toggle("is-chat-open", hasActiveRoom && !state.chatMinimized);
  els.voidStage.classList.toggle("is-chat-minimized", hasActiveRoom && state.chatMinimized);
}

function renderRooms() {
  els.roomsLayer.innerHTML = "";
  els.emptyState.hidden = state.rooms.length > 0;

  state.rooms.forEach((room) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "room-node";
    button.classList.toggle("is-active", room.id === state.activeRoomId);
    button.classList.toggle("is-owned", canEditRoom(room));
    button.style.setProperty("--x", `${room.x}%`);
    button.style.setProperty("--y", `${room.y}%`);
    button.style.setProperty("--room-color", room.color);
    const visual = getRoomVisual(room.id);
    button.style.setProperty("--delay", `${visual.delay}s`);
    button.style.setProperty("--drift", `${visual.drift}s`);
    button.dataset.roomId = room.id;

    const count = getMessagesForRoom(room.id, { includePending: true }).length;
    button.innerHTML = `
      <span class="room-node__title"></span>
      <p class="room-node__desc"></p>
      <span class="room-node__meta">
        <span>${escapeHtml(room.mood)}</span>
        <span>${count}개</span>
      </span>
    `;

    button.querySelector(".room-node__title").textContent = room.title;
    button.querySelector(".room-node__desc").textContent =
      room.description || "말 없이 떠 있는 방";
    button.addEventListener("click", () => openRoom(room.id));
    els.roomsLayer.appendChild(button);
  });
}

function renderRoomRail() {
  els.roomRail.innerHTML = "";
  els.roomRailCount.textContent = String(state.rooms.length);

  state.rooms.forEach((room) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "room-rail-card";
    card.classList.toggle("is-active", room.id === state.activeRoomId);
    card.style.setProperty("--room-color", room.color);
    card.dataset.roomId = room.id;

    const count = getMessagesForRoom(room.id, { includePending: true }).length;
    card.innerHTML = `
      <span class="room-rail-card__glow"></span>
      <strong></strong>
      <span></span>
    `;
    card.querySelector("strong").textContent = room.title;
    card.querySelector("span:last-child").textContent = `${room.mood} · ${count}개`;
    card.addEventListener("click", () => openRoom(room.id));
    els.roomRail.appendChild(card);
  });
}

function renderChat() {
  const room = getActiveRoom();
  if (!room) {
    els.chatPanel.hidden = true;
    els.minimizedChatBar.hidden = true;
    els.newMessagesButton.hidden = true;
    return;
  }

  if (state.chatMinimized) {
    els.chatPanel.hidden = true;
    return;
  }

  const previousScrollTop = els.messages.scrollTop;
  const wasAtBottom = isMessagesNearBottom();
  const previousIds = state.renderedMessageIds[room.id] || [];

  els.chatPanel.hidden = false;
  els.activeRoomMood.textContent = room.mood;
  els.activeRoomTitle.textContent = room.title;
  els.activeRoomDescription.textContent = room.description || "설명 없음";
  els.editRoomButton.hidden = !canEditRoom(room);

  const roomMessages = getMessagesForRoom(room.id, { includePending: true });
  const messageIds = roomMessages.map((message) => message.id);
  const hasAddedMessages = messageIds.some((id) => !previousIds.includes(id));
  const shouldAutoScroll =
    state.forceScrollMessages ||
    state.lastRenderedRoomId !== room.id ||
    previousIds.length === 0 ||
    wasAtBottom;

  els.messages.innerHTML = "";

  if (!roomMessages.length) {
    const empty = document.createElement("div");
    empty.className = "message";
    empty.innerHTML = `
      <div class="message__meta">
        <span class="message__author">Void Log</span>
        <span>지금</span>
      </div>
      <p>아직 아무 말도 없습니다. 첫 흔적을 남겨보세요.</p>
    `;
    els.messages.appendChild(empty);
  }

  roomMessages.forEach((message) => {
    const node = document.createElement("article");
    node.className = "message";
    node.classList.toggle("is-me", message.authorId === state.identity.id);
    node.classList.toggle("is-pending", message.status === "pending");
    node.classList.toggle("is-failed", message.status === "failed");
    node.style.setProperty("--author-color", message.authorColor || "#67e8f9");
    node.innerHTML = `
      <div class="message__meta">
        <span class="message__author"></span>
        <span>${getMessageStatusLabel(message)}</span>
      </div>
      <p></p>
    `;
    node.querySelector(".message__author").textContent =
      message.authorName || "익명";
    node.querySelector("p").textContent = message.content;
    els.messages.appendChild(node);
  });

  requestAnimationFrame(() => {
    if (shouldAutoScroll) {
      scrollMessagesToBottom();
      state.hasNewMessages = false;
    } else {
      els.messages.scrollTop = previousScrollTop;
      state.hasNewMessages = state.hasNewMessages || hasAddedMessages;
    }
    state.forceScrollMessages = false;
    state.renderedMessageIds[room.id] = messageIds;
    state.lastRenderedRoomId = room.id;
    renderNewMessageButton();
  });
}

function renderMinimizedChat() {
  const room = getActiveRoom();
  const shouldShow = Boolean(room && state.chatMinimized);
  els.minimizedChatBar.hidden = !shouldShow;
  if (!shouldShow) return;

  const count = getMessagesForRoom(room.id, { includePending: true }).length;
  els.minimizedRoomTitle.textContent = room.title;
  els.minimizedRoomCount.textContent = `${count}개`;
  els.minimizedChatBar.style.setProperty("--room-color", room.color);
}

function renderNewMessageButton() {
  els.newMessagesButton.hidden = !state.hasNewMessages || state.chatMinimized;
}

function renderStatus() {
  els.versionLabel.textContent = `Void Log v${APP_VERSION}`;
}

function openRoom(roomId) {
  state.activeRoomId = roomId;
  state.chatMinimized = false;
  state.forceScrollMessages = true;
  state.hasNewMessages = false;
  render();
  focusComposerIfDesktop();
}

function getActiveRoom() {
  return state.rooms.find((item) => item.id === state.activeRoomId);
}

function getMessagesForRoom(roomId, options = {}) {
  const messages = state.messages.filter((message) => message.roomId === roomId);
  if (!options.includePending) return messages;

  const savedIds = new Set(messages.map((message) => message.id));
  const pending = state.pendingMessages.filter(
    (message) => message.roomId === roomId && !savedIds.has(message.id),
  );
  return [...messages, ...pending].sort(sortByCreatedAt);
}

function canEditRoom(room) {
  return Boolean(room.creatorId && room.creatorId === state.identity.id);
}

function addRoomOptimistically(room) {
  if (state.rooms.some((item) => item.id === room.id)) return;
  state.rooms = [...state.rooms, room].filter(isRoomAlive).sort(sortByCreatedAt);
  render();
}

function updateRoomOptimistically(roomId, patch) {
  state.rooms = state.rooms.map((room) =>
    room.id === roomId
      ? {
          ...room,
          ...patch,
        }
      : room,
  );
  render();
}

function removeRoomOptimistically(roomId) {
  state.rooms = state.rooms.filter((room) => room.id !== roomId);
  render();
}

function isMessagesNearBottom() {
  if (!els.messages || els.messages.hidden) return true;
  const distance = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight;
  return distance < 48;
}

function scrollMessagesToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function focusComposerIfDesktop() {
  if (window.matchMedia("(min-width: 721px)").matches) {
    els.messageInput.focus();
  }
}

function getMessageStatusLabel(message) {
  if (message.status === "pending") return "전송 중";
  if (message.status === "failed") return "전송 실패";
  return formatTime(message.createdAt);
}

function getRoomVisual(roomId) {
  const hash = hashString(roomId);
  return {
    delay: -1 * ((hash % 800) / 100),
    drift: 8 + ((hash >> 3) % 700) / 100,
  };
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getOrCreateIdentity() {
  const key = `${STORAGE_PREFIX}:identity`;
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(key);
    }
  }

  const identity = {
    id: crypto.randomUUID(),
    name: `떠도는 사람 ${Math.floor(randomBetween(100, 999))}`,
    color: pick(["#67e8f9", "#a7f3d0", "#fbbf24", "#fb7185", "#c4b5fd"]),
  };
  localStorage.setItem(key, JSON.stringify(identity));
  return identity;
}

function paintIdentity() {
  els.identityName.textContent = state.identity.name;
  els.mobileIdentityName.textContent = state.identity.name;
  els.identityDot.style.background = state.identity.color;
  els.identityDot.style.boxShadow = `0 0 20px ${state.identity.color}`;
  els.mobileIdentityDot.style.background = state.identity.color;
  els.mobileIdentityDot.style.boxShadow = `0 0 20px ${state.identity.color}`;
}

function setupStarfield() {
  const canvas = els.starfield;
  const context = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let stars = [];
  let frame = 0;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.min(180, Math.max(90, Math.floor((window.innerWidth * window.innerHeight) / 9000)));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      radius: Math.random() * 1.4 + 0.2,
      alpha: Math.random() * 0.6 + 0.22,
      speed: Math.random() * 0.16 + 0.04,
    }));
  }

  function draw() {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    context.fillStyle = "#03050a";
    context.fillRect(0, 0, window.innerWidth, window.innerHeight);

    for (const star of stars) {
      if (!reduceMotion) {
        star.y += star.speed;
        if (star.y > window.innerHeight + 4) {
          star.y = -4;
          star.x = Math.random() * window.innerWidth;
        }
      }

      const pulse = reduceMotion ? 0 : Math.sin(frame * 0.02 + star.x) * 0.12;
      context.beginPath();
      context.fillStyle = `rgba(238, 246, 255, ${star.alpha + pulse})`;
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fill();
    }

    frame += 1;
    requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2400);
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isRoomAlive(room) {
  return !room.expiresAt || new Date(room.expiresAt).getTime() > Date.now();
}

function sortByCreatedAt(a, b) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

class LocalProvider {
  constructor(spaceId) {
    this.key = `void-log:${spaceId}:data`;
    this.channel = "BroadcastChannel" in window ? new BroadcastChannel(this.key) : null;
  }

  async load() {
    return this.read();
  }

  subscribe(callback) {
    this.channel?.addEventListener("message", (event) => {
      if (event.data?.type === "snapshot") {
        callback(event.data.snapshot);
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === this.key) {
        callback(this.read());
      }
    });
  }

  async createRoom(room) {
    const snapshot = this.read();
    snapshot.rooms.push(room);
    this.write(snapshot);
  }

  async updateRoom(roomId, patch) {
    const snapshot = this.read();
    snapshot.rooms = snapshot.rooms.map((room) =>
      room.id === roomId
        ? {
            ...room,
            ...patch,
          }
        : room,
    );
    this.write(snapshot);
  }

  async createMessage(message) {
    const snapshot = this.read();
    snapshot.messages.push(message);
    this.write(snapshot);
  }

  read() {
    const fallback = { rooms: [], messages: [] };
    const raw = localStorage.getItem(this.key);
    if (!raw) return fallback;

    try {
      const parsed = JSON.parse(raw);
      return {
        rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      };
    } catch {
      return fallback;
    }
  }

  write(snapshot) {
    localStorage.setItem(this.key, JSON.stringify(snapshot));
    this.channel?.postMessage({ type: "snapshot", snapshot });
  }
}

class SupabaseProvider {
  constructor(options) {
    this.spaceId = options.spaceId;
    this.client = window.supabase.createClient(
      options.supabaseUrl,
      options.supabaseAnonKey,
    );
  }

  async load() {
    const [{ data: rooms, error: roomError }, { data: messages, error: messageError }] =
      await Promise.all([
        this.client
          .from("rooms")
          .select("*")
          .eq("space_id", this.spaceId)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: true }),
        this.client
          .from("messages")
          .select("*")
          .eq("space_id", this.spaceId)
          .order("created_at", { ascending: true }),
      ]);

    if (roomError) throw roomError;
    if (messageError) throw messageError;

    return {
      rooms: rooms.map(fromDbRoom),
      messages: messages.map(fromDbMessage),
    };
  }

  subscribe(callback) {
    this.client
      .channel(`void-log-${this.spaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `space_id=eq.${this.spaceId}`,
        },
        async () => callback(await this.load()),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `space_id=eq.${this.spaceId}`,
        },
        async () => callback(await this.load()),
      )
      .subscribe();
  }

  async createRoom(room) {
    const { error } = await this.client.from("rooms").insert(toDbRoom(room));
    if (isMissingRoomMetadataError(error)) {
      const { error: legacyError } = await this.client.from("rooms").insert(toDbRoom(room, { legacy: true }));
      if (legacyError) throw legacyError;
      return;
    }
    if (error) throw error;
  }

  async updateRoom(roomId, patch) {
    const { error } = await this.client
      .from("rooms")
      .update(toDbRoomPatch(patch))
      .eq("id", roomId)
      .eq("space_id", this.spaceId);
    if (error) throw error;
  }

  async createMessage(message) {
    const { error } = await this.client.from("messages").insert(toDbMessage(message));
    if (error) throw error;
  }
}

function toDbRoom(room, options = {}) {
  const payload = {
    id: room.id,
    space_id: room.spaceId,
    title: room.title,
    description: room.description,
    mood: room.mood,
    color: room.color,
    position_x: room.x,
    position_y: room.y,
    created_at: room.createdAt,
    updated_at: room.updatedAt,
    expires_at: room.expiresAt,
  };

  if (!options.legacy) {
    payload.creator_id = room.creatorId;
  } else {
    delete payload.updated_at;
  }

  return payload;
}

function toDbRoomPatch(patch) {
  return {
    title: patch.title,
    description: patch.description,
    mood: patch.mood,
    color: patch.color,
    updated_at: patch.updatedAt,
  };
}

function fromDbRoom(room) {
  return {
    id: room.id,
    spaceId: room.space_id,
    title: room.title,
    description: room.description,
    mood: room.mood,
    color: room.color,
    creatorId: room.creator_id || "",
    x: room.position_x,
    y: room.position_y,
    createdAt: room.created_at,
    updatedAt: room.updated_at || room.created_at,
    expiresAt: room.expires_at,
  };
}

function toDbMessage(message) {
  return {
    id: message.id,
    space_id: message.spaceId,
    room_id: message.roomId,
    author_id: message.authorId,
    author_name: message.authorName,
    author_color: message.authorColor,
    content: message.content,
    created_at: message.createdAt,
  };
}

function fromDbMessage(message) {
  return {
    id: message.id,
    spaceId: message.space_id,
    roomId: message.room_id,
    authorId: message.author_id,
    authorName: message.author_name,
    authorColor: message.author_color,
    content: message.content,
    createdAt: message.created_at,
  };
}

function isMissingRoomMetadataError(error) {
  if (!error) return false;
  const text = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
  return text.includes("creator_id") || text.includes("updated_at");
}
