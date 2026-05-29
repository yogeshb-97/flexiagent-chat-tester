const sessionId = crypto.randomUUID();
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const typingWrap = document.getElementById("typingWrap");
const botNameEl = document.getElementById("botName");
const statusEl = document.getElementById("statusText");
const welcomeTime = document.getElementById("welcomeTime");

// History modal
const historyBtn = document.getElementById("historyBtn");
const historyModal = document.getElementById("historyModal");
const closeModal = document.getElementById("closeModal");
const historyBody = document.getElementById("historyBody");

// Settings modal
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const setWebhookUrl = document.getElementById("setWebhookUrl");
const setApiKey = document.getElementById("setApiKey");
const setBotName = document.getElementById("setBotName");
const testWebhookBtn = document.getElementById("testWebhookBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const testResult = document.getElementById("testResult");
const toggleKey = document.getElementById("toggleKey");
const currentKeyHint = document.getElementById("currentKeyHint");
const incomingUrlEl = document.getElementById("incomingUrl");
const copyIncomingBtn = document.getElementById("copyIncomingBtn");

// ── Init ─────────────────────────────────────────────────────────────────────

welcomeTime.textContent = formatTime(new Date());

let echoBadge = null;

function applyConfig(cfg) {
  botNameEl.textContent = cfg.botName || "FlexiAgent";
  const headerInfo = document.querySelector(".header-info");

  if (!cfg.webhookConfigured) {
    if (!echoBadge) {
      echoBadge = document.createElement("span");
      echoBadge.className = "echo-badge";
      echoBadge.textContent = cfg.localAgentActive ? "local agent" : "echo mode";
      echoBadge.style.background = cfg.localAgentActive ? "rgba(34,197,94,0.15)" : "";
      echoBadge.style.borderColor = cfg.localAgentActive ? "rgba(34,197,94,0.3)" : "";
      echoBadge.style.color = cfg.localAgentActive ? "#86efac" : "";
      headerInfo.appendChild(echoBadge);
    }
    statusEl.textContent = cfg.localAgentActive ? "Powered by FlexiAgent KB" : "Set webhook or add ANTHROPIC_API_KEY";
    statusEl.style.color = cfg.localAgentActive ? "#86efac" : "#f59e0b";
  } else {
    if (echoBadge) { echoBadge.remove(); echoBadge = null; }
    statusEl.textContent = "Online";
    statusEl.style.color = "";
  }

  if (cfg.incomingWebhookUrl) incomingUrlEl.textContent = cfg.incomingWebhookUrl;
}

fetch("/api/config").then(r => r.json()).then(applyConfig).catch(() => {});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function appendMessage(role, text, isError = false) {
  const wrap = document.createElement("div");
  wrap.className = `message ${isError ? "error" : role}`;
  if (role === "bot" || isError) {
    const av = document.createElement("div");
    av.className = "msg-avatar";
    av.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>`;
    wrap.appendChild(av);
  }
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const p = document.createElement("p");
  p.textContent = text;
  bubble.appendChild(p);
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatTime(new Date());
  bubble.appendChild(time);
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return wrap;
}
function setTyping(visible) {
  typingWrap.style.display = visible ? "flex" : "none";
  if (visible) scrollToBottom();
}
function setInputLocked(locked) {
  inputEl.disabled = locked;
  sendBtn.disabled = locked;
}

// ── Send ──────────────────────────────────────────────────────────────────────

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  inputEl.style.height = "auto";
  appendMessage("user", text);
  setInputLocked(true);
  setTyping(true);
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId }),
    });
    const data = await res.json();
    setTyping(false);
    if (!res.ok || data.error) {
      appendMessage("bot", data.error || "Something went wrong.", true);
    } else {
      appendMessage("bot", data.reply);
    }
  } catch {
    setTyping(false);
    appendMessage("bot", "Network error — could not reach server.", true);
  } finally {
    setInputLocked(false);
    inputEl.focus();
  }
}

sendBtn.addEventListener("click", sendMessage);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});

// ── History Modal ─────────────────────────────────────────────────────────────

historyBtn.addEventListener("click", async () => {
  historyModal.style.display = "flex";
  historyBody.innerHTML = "Loading…";
  try {
    const turns = await fetch("/api/history").then(r => r.json());
    if (!turns.length) {
      historyBody.innerHTML = `<p style="text-align:center;color:var(--text-dim)">No history yet.</p>`;
      return;
    }
    historyBody.innerHTML = turns.map(t => `
      <div class="history-turn">
        <div class="history-ts">${t.timestamp} · Session: ${t.sessionId.slice(0, 8)}…</div>
        <div class="history-user">You: ${escHtml(t.user)}</div>
        <div class="history-agent">Agent: ${escHtml(t.agent)}</div>
      </div>`).join("");
  } catch {
    historyBody.innerHTML = `<p style="color:var(--error)">Failed to load history.</p>`;
  }
});
closeModal.addEventListener("click", () => { historyModal.style.display = "none"; });
historyModal.addEventListener("click", (e) => { if (e.target === historyModal) historyModal.style.display = "none"; });

// ── Settings Modal ────────────────────────────────────────────────────────────

async function openSettings() {
  testResult.style.display = "none";
  settingsModal.style.display = "flex";
  try {
    const s = await fetch("/api/settings").then(r => r.json());
    setWebhookUrl.value = s.webhookUrl || "";
    setApiKey.value = "";
    setApiKey.placeholder = s.hasApiKey
      ? `Current: ${s.apiKey} — leave blank to keep`
      : "Leave blank if not required";
    if (s.hasApiKey) {
      currentKeyHint.textContent = `Current key ends in ${s.apiKey.slice(-4)}`;
      currentKeyHint.style.display = "block";
    } else {
      currentKeyHint.style.display = "none";
    }
    setBotName.value = s.botName || "";
  } catch {
    setWebhookUrl.placeholder = "Failed to load — try refreshing";
  }
}

settingsBtn.addEventListener("click", openSettings);
closeSettings.addEventListener("click", () => { settingsModal.style.display = "none"; });
settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.style.display = "none"; });

// Show/hide API key
toggleKey.addEventListener("click", () => {
  const isPass = setApiKey.type === "password";
  setApiKey.type = isPass ? "text" : "password";
  toggleKey.querySelector("svg").style.opacity = isPass ? "0.5" : "1";
});

// Test webhook connection
testWebhookBtn.addEventListener("click", async () => {
  // Save current URL first so the test uses it
  const url = setWebhookUrl.value.trim();
  if (!url) {
    showTestResult(false, "Enter a webhook URL first");
    return;
  }

  testWebhookBtn.disabled = true;
  testWebhookBtn.textContent = "Testing…";
  testResult.style.display = "none";

  // Temporarily save the URL so /api/test-webhook uses it
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl: url,
      ...(setApiKey.value && !setApiKey.value.startsWith("••••") ? { apiKey: setApiKey.value } : {}),
    }),
  }).catch(() => {});

  try {
    const res = await fetch("/api/test-webhook", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      showTestResult(true, `Connected — HTTP ${data.status}${data.body ? `\nResponse: ${data.body.slice(0, 120)}` : ""}`);
    } else {
      showTestResult(false, data.error || `HTTP ${data.status}`);
    }
  } catch (err) {
    showTestResult(false, `Network error: ${err.message}`);
  } finally {
    testWebhookBtn.disabled = false;
    testWebhookBtn.textContent = "Test Connection";
  }
});

function showTestResult(ok, msg) {
  testResult.style.display = "block";
  testResult.className = `test-result ${ok ? "success" : "fail"}`;
  testResult.textContent = (ok ? "✓ " : "✗ ") + msg;
}

// Save settings
saveSettingsBtn.addEventListener("click", async () => {
  saveSettingsBtn.disabled = true;
  saveSettingsBtn.textContent = "Saving…";
  try {
    const body = {
      webhookUrl: setWebhookUrl.value.trim(),
      botName: setBotName.value.trim(),
    };
    if (setApiKey.value && !setApiKey.value.startsWith("••••")) {
      body.apiKey = setApiKey.value;
    }
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      applyConfig({ botName: data.botName, webhookConfigured: data.webhookConfigured });
      settingsModal.style.display = "none";
    }
  } catch {
    alert("Failed to save settings");
  } finally {
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = "Save Settings";
  }
});

// Copy incoming webhook URL
copyIncomingBtn.addEventListener("click", () => {
  const url = incomingUrlEl.textContent;
  navigator.clipboard.writeText(url).then(() => {
    copyIncomingBtn.textContent = "Copied!";
    copyIncomingBtn.classList.add("copied");
    setTimeout(() => {
      copyIncomingBtn.textContent = "Copy";
      copyIncomingBtn.classList.remove("copied");
    }, 2000);
  });
});
