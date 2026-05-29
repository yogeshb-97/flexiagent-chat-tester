require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
// On Vercel the project root is read-only; use /tmp for mutable files
const STORAGE_DIR = process.env.VERCEL ? "/tmp" : __dirname;
const MEMORY_FILE = path.join(STORAGE_DIR, "memory.md");
const CONFIG_FILE = path.join(STORAGE_DIR, "config.json");

// ── Runtime config (env defaults, overridden by config.json) ─────────────────
let cfg = {
  webhookUrl: process.env.FLEXI_AGENT_WEBHOOK_URL || "",
  apiKey: process.env.FLEXI_AGENT_API_KEY || "",
  botName: process.env.BOT_NAME || "FlexiAgent",
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")));
  } catch { /* ignore corrupt config */ }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}
function appendToMemory(sessionId, userMessage, agentReply) {
  const block = [
    `\n## [${timestamp()}] Session: ${sessionId}`,
    `**User:** ${userMessage}`,
    `**Agent:** ${agentReply}`,
    `---\n`,
  ].join("\n");
  fs.appendFileSync(MEMORY_FILE, block, "utf8");
}

// ── POST /api/chat — core relay ───────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const sid = sessionId || "unknown";
  log(`CHAT [${sid}] → "${message.slice(0, 80)}"`);

  if (!cfg.webhookUrl) {
    log("WARN: webhookUrl not configured — echo mode");
    const reply = `[Echo — no webhook configured] You said: "${message}"`;
    appendToMemory(sid, message, reply);
    return res.json({ reply });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({ message, sessionId: sid }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log(`ERROR: webhook ${response.status} — ${errText.slice(0, 200)}`);
      return res.status(502).json({ error: `Webhook returned ${response.status}` });
    }

    const data = await response.json();
    const reply = data.reply || data.message || data.text || data.output || JSON.stringify(data);

    log(`REPLY [${sid}] ← "${String(reply).slice(0, 80)}"`);
    appendToMemory(sid, message, reply);
    return res.json({ reply });

  } catch (err) {
    if (err.name === "AbortError") {
      log("ERROR: webhook timed out after 15s");
      return res.status(504).json({ error: "Agent timeout — no response in 15s" });
    }
    log(`ERROR: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/settings — return current config (key masked) ───────────────────
app.get("/api/settings", (req, res) => {
  res.json({
    webhookUrl: cfg.webhookUrl,
    apiKey: cfg.apiKey ? "••••••••" + cfg.apiKey.slice(-4) : "",
    hasApiKey: !!cfg.apiKey,
    botName: cfg.botName,
    webhookConfigured: !!cfg.webhookUrl,
  });
});

// ── POST /api/settings — update config at runtime ────────────────────────────
app.post("/api/settings", (req, res) => {
  const { webhookUrl, apiKey, botName } = req.body;

  if (webhookUrl !== undefined) cfg.webhookUrl = String(webhookUrl).trim();
  // Only update apiKey if a non-masked value is sent
  if (apiKey !== undefined && !apiKey.startsWith("••••")) {
    cfg.apiKey = String(apiKey).trim();
  }
  if (botName !== undefined) cfg.botName = String(botName).trim() || "FlexiAgent";

  saveConfig();
  log(`CONFIG UPDATED: webhookUrl=${cfg.webhookUrl || "(none)"}, botName=${cfg.botName}`);

  res.json({ ok: true, webhookConfigured: !!cfg.webhookUrl, botName: cfg.botName });
});

// ── POST /api/test-webhook — verify the webhook URL is reachable ─────────────
app.post("/api/test-webhook", async (req, res) => {
  if (!cfg.webhookUrl) {
    return res.status(400).json({ ok: false, error: "No webhook URL configured" });
  }

  log(`TEST WEBHOOK → ${cfg.webhookUrl}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({ type: "ping", message: "__test__", sessionId: "test-ping" }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const statusText = `${response.status} ${response.statusText}`;
    log(`TEST RESULT: ${statusText}`);

    if (response.ok) {
      const body = await response.text().catch(() => "");
      return res.json({ ok: true, status: response.status, body: body.slice(0, 300) });
    } else {
      return res.json({ ok: false, status: response.status, error: `HTTP ${statusText}` });
    }
  } catch (err) {
    if (err.name === "AbortError") {
      return res.json({ ok: false, error: "Timed out — no response in 10s" });
    }
    return res.json({ ok: false, error: err.message });
  }
});

// ── GET /api/history — parse memory.md into JSON ─────────────────────────────
app.get("/api/history", (req, res) => {
  try {
    const raw = fs.readFileSync(MEMORY_FILE, "utf8");
    const blocks = raw.split(/\n## \[/).slice(1);
    const turns = blocks.map((block) => {
      const lines = block.trim().split("\n");
      const header = lines[0] || "";
      const tsMatch = header.match(/^(.+?)\] Session: (.+)/);
      const userLine = lines.find((l) => l.startsWith("**User:**")) || "";
      const agentLine = lines.find((l) => l.startsWith("**Agent:**")) || "";
      return {
        timestamp: tsMatch ? tsMatch[1] : "",
        sessionId: tsMatch ? tsMatch[2] : "",
        user: userLine.replace("**User:** ", ""),
        agent: agentLine.replace("**Agent:** ", ""),
      };
    });
    res.json(turns);
  } catch {
    res.json([]);
  }
});

// ── POST /webhook/incoming — async push-back from FlexiAgent ─────────────────
// FlexiAgent calls this URL to push a reply back (for async flows).
// Payload: { sessionId, reply } or { sessionId, message }
app.post("/webhook/incoming", (req, res) => {
  const { sessionId, reply, message, text, output } = req.body;
  const content = reply || message || text || output || JSON.stringify(req.body);
  log(`INCOMING WEBHOOK [${sessionId || "?"}]: "${String(content).slice(0, 120)}"`);

  // Store as a pending message keyed by sessionId so the browser can poll it
  if (sessionId) {
    pendingReplies[sessionId] = { reply: content, at: Date.now() };
  }

  res.json({ received: true });
});

// ── GET /api/poll/:sessionId — browser polls for async replies ────────────────
const pendingReplies = {};

app.get("/api/poll/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const pending = pendingReplies[sessionId];
  if (pending) {
    delete pendingReplies[sessionId];
    return res.json({ reply: pending.reply });
  }
  res.json({ reply: null });
});

// ── GET /api/config — legacy + runtime info ───────────────────────────────────
app.get("/api/config", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  res.json({
    botName: cfg.botName,
    webhookConfigured: !!cfg.webhookUrl,
    incomingWebhookUrl: `${proto}://${host}/webhook/incoming`,
  });
});

// Export for Vercel serverless; listen locally
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    log(`Server running at http://localhost:${PORT}`);
    log(`Outgoing webhook: ${cfg.webhookUrl || "NOT SET (echo mode)"}`);
    log(`Incoming webhook: http://localhost:${PORT}/webhook/incoming`);
  });
}

module.exports = app;
