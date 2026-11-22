"use strict";
// Self-hosted relay: HTTP API  <->  WebSocket  <->  Playground Executor userscript (in your browser)

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { openAIToWire, ArraySplitter, extractParts, extractUsage, stripPrefix } = require("./lib");

// THINK_TAGS=1 -> put thoughts inside <think>…</think> in normal content instead of reasoning_content
const THINK_TAGS = process.env.THINK_TAGS === "1";
// DEBUG_DUMP=1 -> append raw upstream responses to debug-responses.log (to inspect the format)
const DEBUG_DUMP = process.env.DEBUG_DUMP === "1";
function dump(label, text) {
  if (!DEBUG_DUMP) return;
  try {
    fs.appendFileSync(path.join(__dirname, "debug-responses.log"), `--- ${new Date().toISOString()} ${label}\n${String(text).slice(0, 20000)}\n`);
  } catch (_) {}
}

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
// Comma-separated keys. Empty = accept any key (each distinct key gets its own executor slot).
const ALLOWED_KEYS = (process.env.API_KEYS || "").split(",").map((s) => s.trim()).filter(Boolean);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 300000);
const WS_PATH = "/api/playground/ws";
// Model list shown to clients (SillyTavern etc). Override with MODELS=a,b,c
const MODELS = (process.env.MODELS || "gemini-4-neon,gemini-4-carbon,gemini-4-argon,gemini-4-hydrogen,gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-pro-preview,gemini-3.1-flash-lite,gemini-3.6-flash,,gemini-3-flash-preview,gemma-4-26b-a4b-it,gemma-4-31b-it")
  .split(",").map((s) => s.trim()).filter(Boolean);
const PUBLIC_DIR = path.join(__dirname, "public");

const CLOSE_EXECUTOR_REPLACED = 4001;
const CLOSE_POLICY_VIOLATION = 1008;

/** apiKey -> { ws, tier, since } */
const executors = new Map();
/** requestId -> { key, onChunk, onEnd, onError, onResponse } */
const pending = new Map();

const log = (...a) => console.log(new Date().toISOString(), ...a);
const keyOk = (k) => !!k && (ALLOWED_KEYS.length === 0 || ALLOWED_KEYS.includes(k));

// ---------------------------------------------------------------- WebSocket side
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });

wss.on("connection", (ws) => {
  let key = null;
  const registerTimer = setTimeout(() => ws.close(CLOSE_POLICY_VIOLATION, "register timeout"), 15000);

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch (_) {
      return;
    }

    if (msg.type === "register") {
      clearTimeout(registerTimer);
      const k = String(msg.apiKey || "").trim();
      if (msg.kind !== "playground") return ws.close(CLOSE_POLICY_VIOLATION, "unsupported executor kind");
      if (!keyOk(k)) return ws.close(CLOSE_POLICY_VIOLATION, "invalid API key");
      const old = executors.get(k);
      if (old && old.ws !== ws) old.ws.close(CLOSE_EXECUTOR_REPLACED, "replaced");
      key = k;
      executors.set(k, { ws, tier: msg.subscriptionTier || "unknown", since: Date.now() });
      ws.send(JSON.stringify({ type: "registered" }));
      log("executor registered", mask(k), "v" + msg.clientVersion, "tier=" + (msg.subscriptionTier || "?"));
      return;
    }

    if (!key) return;

    if (msg.type === "subscription") {
      const e = executors.get(key);
      if (e && e.ws === ws) e.tier = msg.subscriptionTier || "unknown";
      return;
    }

    const p = pending.get(msg.requestId);
    if (!p || p.key !== key) return;
    switch (msg.type) {
      case "stream-chunk":
        p.onChunk(msg.chunkBody || "");
        break;
      case "stream-end":
        pending.delete(msg.requestId);
        p.onEnd(msg.status || 200);
        break;
      case "response":
        pending.delete(msg.requestId);
        p.onResponse(msg.status || 200, msg.responseBody || "");
        break;
      case "error":
      case "stream-error":
        pending.delete(msg.requestId);
        p.onError(msg.status || 502, msg.error || {});
        break;
    }
  });

  ws.on("close", () => {
    clearTimeout(registerTimer);
    if (!key) return;
    const e = executors.get(key);
    if (e && e.ws === ws) executors.delete(key);
    for (const [id, p] of pending) {
      if (p.key === key) {
        pending.delete(id);
        p.onError(503, { code: "executor_disconnected", message: "Browser executor disconnected" });
      }
    }
    log("executor disconnected", mask(key));
  });
  ws.on("error", () => {});
});

function mask(k) {
  return k.length <= 8 ? "***" : k.slice(0, 4) + "…" + k.slice(-2);
}

/** Send a request to the executor. Returns { id, cancel }. */
function dispatch(key, model, stream, wire, handlers) {
  const ex = executors.get(key);
  if (!ex || ex.ws.readyState !== 1) {
    handlers.onError(503, { code: "no_executor", message: "No browser executor connected for this API key" });
    return null;
  }
  const id = crypto.randomUUID();
  const timer = setTimeout(() => {
    if (pending.delete(id)) {
      cancel();
      handlers.onError(504, { code: "timeout", message: "Executor timed out" });
    }
  }, REQUEST_TIMEOUT_MS);
  const wrap = (fn) => (...a) => {
    clearTimeout(timer);
    fn(...a);
  };
  pending.set(id, {
    key,
    onChunk: handlers.onChunk,
    onEnd: wrap(handlers.onEnd),
    onResponse: wrap(handlers.onResponse),
    onError: wrap(handlers.onError),
  });
  function cancel() {
    clearTimeout(timer);
    if (pending.delete(id) && ex.ws.readyState === 1) ex.ws.send(JSON.stringify({ type: "cancel", requestId: id }));
  }
  const thinking = wire && wire._thinking ? wire._thinking : null;
  ex.ws.send(JSON.stringify({
    type: "request",
    requestId: id,
    stream,
    model,
    thinkingLevel: thinking?.levelName ?? thinking?.levelCode ?? null,
    thinkingBudget: thinking?.budget ?? null,
    requestBody: JSON.stringify(wire),
  }));
  return { id, cancel };
}

// ---------------------------------------------------------------- HTTP side
function readBody(req, limit = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, obj) {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(obj));
}

function authKey(req, url) {
  const h = req.headers;
  const bearer = /^Bearer\s+(.+)$/i.exec(h.authorization || "");
  return (bearer && bearer[1].trim()) || h["x-goog-api-key"] || h["x-api-key"] || url.searchParams.get("key") || "";
}

const openAIError = (res, status, e) =>
  json(res, status, { error: { message: e.message || "executor error", type: e.code || "executor_error", code: e.code, upstream: e.body ? tryParse(e.body) : undefined } });
const tryParse = (s) => {
  try {
    return JSON.parse(s);
  } catch (_) {
    return s;
  }
};

async function handleChat(req, res, key) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (_) {
    return json(res, 400, { error: { message: "invalid JSON body" } });
  }
  const stream = body.stream === true;
  const { model, wire } = openAIToWire(body);
  const id = "chatcmpl-" + crypto.randomBytes(8).toString("hex");
  const created = Math.floor(Date.now() / 1000);
  const mk = (delta, finish, usage) => ({
    id, object: "chat.completion.chunk", created, model,
    choices: [{ index: 0, delta, finish_reason: finish || null }],
    ...(usage ? { usage } : {}),
  });
  const usageOf = (u) => ({
    prompt_tokens: u.input ?? 0,
    completion_tokens: u.output ?? 0,
    total_tokens: (u.input ?? 0) + (u.output ?? 0),
  });

  if (stream) {
    let headerSent = false;
    const splitter = new ArraySplitter();
    const usage = { input: null, output: null };
    const send = (obj) => res.write("data: " + JSON.stringify(obj) + "\n\n");
    const open = () => {
      if (headerSent) return;
      headerSent = true;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      send(mk({ role: "assistant", content: "" }));
    };
    let prefixStripped = false;
    let inThink = false;
    let head = "";
    const handle = {
      onChunk(text) {
        dump("chunk", text);
        if (!prefixStripped) {
          head += text;
          if (head.length < 6 && !head.includes("[")) return;
          text = stripPrefix(head);
          head = "";
          prefixStripped = true;
        }
        for (const batch of splitter.feed(text)) {
          const u = extractUsage(batch);
          if (u.input != null) usage.input = u.input;
          if (u.output != null) usage.output = u.output;
          for (const part of extractParts(batch)) {
            if (!part.text) continue;
            open();
            if (part.thought && !THINK_TAGS) {
              send(mk({ reasoning_content: part.text }));
              continue;
            }
            let out = part.text;
            if (THINK_TAGS) {
              if (part.thought && !inThink) out = "<think>" + out;
              else if (!part.thought && inThink) out = "</think>\n" + out;
              inThink = part.thought;
            }
            send(mk({ content: out }));
          }
        }
      },
      onEnd() {
        open();
        if (inThink) send(mk({ content: "</think>" }));
        send(mk({}, "stop", usageOf(usage)));
        res.write("data: [DONE]\n\n");
        res.end();
      },
      onResponse() {},
      onError(status, e) {
        if (!headerSent) return openAIError(res, status, e);
        send({ error: { message: e.message, code: e.code } });
        res.end();
      },
    };
    const job = dispatch(key, model, true, wire, handle);
    res.on("close", () => !res.writableEnded && job && job.cancel());
    return;
  }

  const job = dispatch(key, model, false, wire, {
    onChunk() {},
    onEnd() {},
    onResponse(status, bodyText) {
      dump("response", bodyText);
      const sp = new ArraySplitter();
      const batches = sp.feed(stripPrefix(bodyText));
      const parts = batches.flatMap((b) => extractParts(b));
      const answer = parts.filter((p) => !p.thought).map((p) => p.text).join("");
      const thoughts = parts.filter((p) => p.thought).map((p) => p.text).join("");
      const text = THINK_TAGS && thoughts ? `<think>${thoughts}</think>\n${answer}` : answer;
      const usage = batches.reduce((acc, b) => Object.assign(acc, Object.fromEntries(Object.entries(extractUsage(b)).filter(([, v]) => v != null))), { input: null, output: null });
      json(res, 200, {
        id, object: "chat.completion", created, model,
        choices: [{ index: 0, message: { role: "assistant", content: text, ...(thoughts && !THINK_TAGS ? { reasoning_content: thoughts } : {}) }, finish_reason: "stop" }],
        usage: usageOf(usage),
      });
    },
    onError: (status, e) => openAIError(res, status, e),
  });
  res.on("close", () => !res.writableEnded && job && job.cancel());
}

/** POST /raw  { model, stream, wire }  -> upstream body passed through untouched. */
async function handleRaw(req, res, key) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (_) {
    return json(res, 400, { error: { message: "invalid JSON body" } });
  }
  if (!Array.isArray(body.wire)) return json(res, 400, { error: { message: "`wire` array required" } });
  const stream = body.stream === true;
  const model = String(body.model || String(body.wire[0] || "").replace(/^models\//, ""));
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    res.writeHead(200, { "content-type": "application/json+protobuf; charset=UTF-8", "access-control-allow-origin": "*" });
  };
  const job = dispatch(key, model, stream, body.wire, {
    onChunk(t) {
      start();
      res.write(t);
    },
    onEnd() {
      start();
      res.end();
    },
    onResponse(status, text) {
      res.writeHead(status, { "content-type": "application/json+protobuf; charset=UTF-8", "access-control-allow-origin": "*" });
      res.end(text);
    },
    onError(status, e) {
      if (!started) return json(res, status, { error: e });
      res.end();
    },
  });
  res.on("close", () => !res.writableEnded && job && job.cancel());
}

function serveStatic(req, res, pathname) {
  const rel = pathname.replace(/^\/userscripts\//, "");
  const file = path.join(PUBLIC_DIR, "userscripts", path.basename(rel));
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: { message: "not found" } });
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization,content-type,x-goog-api-key,x-api-key",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, executors: executors.size, pending: pending.size });
    }
    if (req.method === "GET" && url.pathname.startsWith("/userscripts/")) return serveStatic(req, res, url.pathname);

    const key = authKey(req, url);
    if (!keyOk(key)) return json(res, 401, { error: { message: "invalid API key" } });

    if (req.method === "GET" && url.pathname === "/v1/models") {
      const now = Math.floor(Date.now() / 1000);
      return json(res, 200, {
        object: "list",
        data: MODELS.map((id) => ({ id, object: "model", created: now, owned_by: "google" })),
      });
    }
    if (req.method === "GET" && url.pathname === "/status") {
      const e = executors.get(key);
      return json(res, 200, { connected: !!e, tier: e?.tier, since: e?.since });
    }
    if (req.method === "POST" && url.pathname === "/v1/chat/completions") return handleChat(req, res, key);
    if (req.method === "POST" && url.pathname === "/raw") return handleRaw(req, res, key);
    json(res, 404, { error: { message: "not found" } });
  } catch (e) {
    log("handler error", e);
    json(res, 500, { error: { message: "internal error" } });
  }
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== WS_PATH) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

server.listen(PORT, HOST, () => {
  log(`relay listening on http://${HOST}:${PORT}  (ws path ${WS_PATH})`);
  log(ALLOWED_KEYS.length ? `${ALLOWED_KEYS.length} API key(s) configured` : "WARNING: API_KEYS empty — any key is accepted");
});