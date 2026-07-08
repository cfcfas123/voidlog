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
const MESSAGE_LIMIT = 240;
const ROOM_LIFETIME_HOURS = 24;

const state = {
  identity: null,
  rooms: [],
  messages: [],
  activeRoomId: null,
  provider: null,
  toastTimer: null,
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  state.identity = getOrCreateIdentity();
  paintIdentity();
  setupGate();
  setupCreateRoomDialog();
  setupChat();
  setupStarfield();

  state.provider = makeProvider();
  await refreshFromProvider();
  state.provider.subscribe?.(applySnapshot);
  render();
});

function bindElements() {
  Object.assign(els, {
    gate: document.querySelector("#gate"),
    gateForm: document.querySelector("#gateForm"),
    gateError: document.querySelector("#gateError"),
    accessCode: document.querySelector("#accessCode"),
    identityButton: document.querySelector("#identityButton"),
    identityDot: document.querySelector("#identityDot"),
    identityName: document.querySelector("#identityName"),
    newRoomButton: document.querySelector("#newRoomButton"),
    createRoomDialog: document.querySelector("#createRoomDialog"),
    createRoomForm: document.querySelector("#createRoomForm"),
    cancelCreateButton: document.querySelector("#cancelCreateButton"),
    identityDialog: document.querySelector("#identityDialog"),
    identityForm: document.querySelector("#identityForm"),
    cancelIdentityButton: document.querySelector("#cancelIdentityButton"),
    swatches: document.querySelector("#swatches"),
    roomsLayer: document.querySelector("#roomsLayer"),
    emptyState: document.querySelector("#emptyState"),
    connectionStatus: document.querySelector("#connectionStatus"),
    roomCount: document.querySelector("#roomCount"),
    messageCount: document.querySelector("#messageCount"),
    chatPanel: document.querySelector("#chatPanel"),
    closeChatButton: document.querySelector("#closeChatButton"),
    activeRoomMood: document.querySelector("#activeRoomMood"),
    activeRoomTitle: document.querySelector("#activeRoomTitle"),
    activeRoomDescription: document.querySelector("#activeRoomDescription"),
    messages: document.querySelector("#messages"),
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
  els.newRoomButton.addEventListener("click", () => {
    if (typeof els.createRoomDialog.showModal === "function") {
      els.createRoomDialog.showModal();
    } else {
      els.createRoomDialog.setAttribute("open", "");
    }

    els.createRoomForm.elements.title.focus();
  });

  els.cancelCreateButton.addEventListener("click", () => {
    els.createRoomDialog.close();
  });

  els.swatches.addEventListener("click", (event) => {
    const swatch = event.target.closest(".swatch");
    if (!swatch) return;

    els.swatches.querySelectorAll(".swatch").forEach((button) => {
      button.classList.toggle("is-selected", button === swatch);
    });
    els.createRoomForm.elements.color.value = swatch.dataset.color;
  });

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
      await state.provider.createRoom(room);
      els.createRoomForm.reset();
      els.createRoomForm.elements.color.value = "#67e8f9";
      els.swatches.querySelectorAll(".swatch").forEach((button, index) => {
        button.classList.toggle("is-selected", index === 0);
      });
      els.createRoomDialog.close();
      showToast("새 방이 떠올랐습니다.");
      await refreshFromProvider();
      openRoom(room.id);
    } catch (error) {
      showToast("방을 만들지 못했습니다. 설정을 확인해 주세요.");
      console.error(error);
    }
  });
}

function setupChat() {
  els.closeChatButton.addEventListener("click", () => {
    state.activeRoomId = null;
    els.chatPanel.hidden = true;
    renderRooms();
  });

  els.messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = cleanText(els.messageInput.value, MESSAGE_LIMIT);
    if (!state.activeRoomId || !content) return;

    els.messageInput.value = "";

    try {
      await state.provider.createMessage(
        buildMessage({
          roomId: state.activeRoomId,
          content,
        }),
      );
      await refreshFromProvider();
    } catch (error) {
      showToast("메시지를 보내지 못했습니다.");
      console.error(error);
    }
  });

  els.identityButton.addEventListener("click", () => {
    els.identityForm.elements.name.value = state.identity.name;
    if (typeof els.identityDialog.showModal === "function") {
      els.identityDialog.showModal();
    } else {
      els.identityDialog.setAttribute("open", "");
    }
    els.identityForm.elements.name.focus();
  });

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
    x: randomBetween(12, 88),
    y: randomBetween(18, 82),
    createdAt: now.toISOString(),
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
  render();
}

function render() {
  renderRooms();
  renderChat();
  renderStatus();
}

function renderRooms() {
  els.roomsLayer.innerHTML = "";
  els.emptyState.hidden = state.rooms.length > 0;

  state.rooms.forEach((room) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "room-node";
    button.classList.toggle("is-active", room.id === state.activeRoomId);
    button.style.setProperty("--x", `${room.x}%`);
    button.style.setProperty("--y", `${room.y}%`);
    button.style.setProperty("--room-color", room.color);
    button.style.setProperty("--delay", `${randomBetween(-8, 0)}s`);
    button.style.setProperty("--drift", `${randomBetween(8, 15)}s`);
    button.dataset.roomId = room.id;

    const count = getMessagesForRoom(room.id).length;
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

function renderChat() {
  const room = state.rooms.find((item) => item.id === state.activeRoomId);
  if (!room) {
    els.chatPanel.hidden = true;
    return;
  }

  els.chatPanel.hidden = false;
  els.activeRoomMood.textContent = room.mood;
  els.activeRoomTitle.textContent = room.title;
  els.activeRoomDescription.textContent = room.description || "설명 없음";

  const roomMessages = getMessagesForRoom(room.id);
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
    node.style.setProperty("--author-color", message.authorColor || "#67e8f9");
    node.innerHTML = `
      <div class="message__meta">
        <span class="message__author"></span>
        <span>${formatTime(message.createdAt)}</span>
      </div>
      <p></p>
    `;
    node.querySelector(".message__author").textContent =
      message.authorName || "익명";
    node.querySelector("p").textContent = message.content;
    els.messages.appendChild(node);
  });

  requestAnimationFrame(() => {
    els.messages.scrollTop = els.messages.scrollHeight;
  });
}

function renderStatus() {
  const providerLabel =
    state.provider instanceof SupabaseProvider ? "Supabase 실시간" : "로컬 모드";
  els.connectionStatus.textContent = providerLabel;
  els.roomCount.textContent = `방 ${state.rooms.length}개`;
  els.messageCount.textContent = `메시지 ${state.messages.length}개`;
}

function openRoom(roomId) {
  state.activeRoomId = roomId;
  render();
  els.messageInput.focus();
}

function getMessagesForRoom(roomId) {
  return state.messages.filter((message) => message.roomId === roomId);
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
  els.identityDot.style.background = state.identity.color;
  els.identityDot.style.boxShadow = `0 0 20px ${state.identity.color}`;
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
    if (error) throw error;
  }

  async createMessage(message) {
    const { error } = await this.client.from("messages").insert(toDbMessage(message));
    if (error) throw error;
  }
}

function toDbRoom(room) {
  return {
    id: room.id,
    space_id: room.spaceId,
    title: room.title,
    description: room.description,
    mood: room.mood,
    color: room.color,
    position_x: room.x,
    position_y: room.y,
    created_at: room.createdAt,
    expires_at: room.expiresAt,
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
    x: room.position_x,
    y: room.position_y,
    createdAt: room.created_at,
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
