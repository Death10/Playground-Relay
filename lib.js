"use strict";
// Helpers: wire-format building, streaming JSON splitting, text extraction.
//
// !! The AI Studio "wire" layout below is a best-effort reconstruction. Index 1 (contents)
// !! and the text/inline-data part shapes are confirmed by the userscript's own code.
// !! The generationConfig layout (index 3) is a guess: capture one real GenerateContent
// !! request in DevTools (Network tab) and adjust WIRE below if values land in wrong slots.

const WIRE = {
  // positions inside generationConfig array (index 3 of the wire)
  gen: {
    maxOutputTokens: 3,
    temperature: 4,
    topP: 5,
    topK: 6,
    thinkingConfig: Number(process.env.THINKING_CONFIG_INDEX ?? 16),
  },
  genLength: 17,
};

// Default mapping from named thinking levels to AI Studio wire codes.
// Override via THINKING_MAP='{"minimal":1,"low":2,"medium":3,"high":4}'
const DEFAULT_THINKING_MAP = {
  off: 0,
  none: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 4,
};

// Optional: put a generationConfig array captured from a real AI Studio request (with
// thinking enabled) in gen-template.json next to this file. It becomes the base config;
// maxOutputTokens/temperature/topP/topK from the client are then written over it.
let GEN_TEMPLATE = null;
try {
  const t = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "gen-template.json"), "utf8"));
  if (Array.isArray(t)) GEN_TEMPLATE = t;
} catch (_) {}

// Optional: wire-template.json = a full captured GenerateContent body (see make-template.js).
// Everything except model, contents, sampling values and the signature is kept as captured.
let WIRE_TEMPLATE = null;
try {
  const t = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "wire-template.json"), "utf8"));
  if (Array.isArray(t) && Array.isArray(t[3])) WIRE_TEMPLATE = t;
} catch (_) {}

function textPart(text) {
  return [null, String(text)];
}

function inlinePart(mime, b64) {
  // userscript digest code: part[2] = [mime, data]
  return [null, null, [mime, b64]];
}

function convertContentPart(p) {
  if (typeof p === "string") return textPart(p);
  if (!p || typeof p !== "object") return null;
  if (p.type === "text") return textPart(p.text ?? "");
  if (p.type === "image_url") {
    const url = typeof p.image_url === "string" ? p.image_url : p.image_url?.url || "";
    const m = /^data:([^;,]+);base64,(.+)$/s.exec(url);
    if (m) return inlinePart(m[1], m[2]);
    return textPart(`[image: ${url}]`); // remote URLs can't be fetched by the page
  }
  return null;
}

function resolveThinkingConfig(body) {
  const raw =
    body.thinking_level ??
    body.thinkingLevel ??
    body.reasoning_effort ??
    body.extra_body?.google?.thinking_config?.thinking_level ??
    body.extra_body?.thinking_level ??
    null;

  const budget =
    body.thinking_budget ??
    body.thinkingBudget ??
    body.extra_body?.google?.thinking_config?.thinking_budget ??
    null;

  let envMap = {};
  try {
    envMap = JSON.parse(process.env.THINKING_MAP || "{}");
  } catch (_) {}
  const map = { ...DEFAULT_THINKING_MAP, ...envMap };

  const fallback = process.env.THINKING_LEVEL != null && process.env.THINKING_LEVEL !== ""
    ? process.env.THINKING_LEVEL
    : null;

  const chosen = raw !== null && raw !== undefined && raw !== "" ? raw : fallback;

  let levelName = null;
  let levelCode = null;

  if (chosen !== null && chosen !== undefined && chosen !== "") {
    if (typeof chosen === "number" && Number.isFinite(chosen)) {
      levelCode = chosen;
    } else {
      const key = String(chosen).trim().toLowerCase();
      if (/^-?\d+$/.test(key)) {
        levelCode = Number(key);
      } else {
        levelName = key;
        if (Object.prototype.hasOwnProperty.call(map, key) && Number.isFinite(Number(map[key]))) {
          levelCode = Number(map[key]);
        }
      }
    }
  }

  const parsedBudget =
    budget !== null && budget !== undefined && budget !== "" && Number.isFinite(Number(budget))
      ? Number(budget)
      : null;

  return { levelName, levelCode, budget: parsedBudget };
}

/** OpenAI chat body -> wire array (wire[4], the signature, is filled in by the userscript). */
function openAIToWire(body) {
  const model = String(body.model || "gemini-2.5-flash").replace(/^models\//, "");
  const contents = [];
  let systemText = "";

  for (const msg of body.messages || []) {
    const raw = Array.isArray(msg.content) ? msg.content : [msg.content ?? ""];
    const parts = raw.map(convertContentPart).filter(Boolean);
    if (!parts.length) continue;
    if (msg.role === "system" || msg.role === "developer") {
      systemText += parts.filter((p) => typeof p[1] === "string").map((p) => p[1]).join("\n") + "\n";
      continue;
    }
    const role = msg.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last[1] === role) last[0].push(...parts);
    else contents.push([parts, role]);
  }
  if (systemText.trim()) {
    // Safe fallback: fold system prompt into the first user turn.
    if (contents[0] && contents[0][1] === "user") contents[0][0].unshift(textPart(systemText.trim() + "\n\n"));
    else contents.unshift([[textPart(systemText.trim())], "user"]);
  }
  if (!contents.length) contents.push([[textPart("")], "user"]);

  const genBase = WIRE_TEMPLATE ? WIRE_TEMPLATE[3] : GEN_TEMPLATE;
  const gen = genBase ? JSON.parse(JSON.stringify(genBase)) : new Array(WIRE.genLength).fill(null);
  const maxTok = body.max_completion_tokens ?? body.max_tokens;
  if (maxTok != null) gen[WIRE.gen.maxOutputTokens] = maxTok;
  if (body.temperature != null) gen[WIRE.gen.temperature] = body.temperature;
  if (body.top_p != null) gen[WIRE.gen.topP] = body.top_p;
  if (body.top_k != null) gen[WIRE.gen.topK] = body.top_k;

  // Thinking level & optional thinking budget:
  // gen[thinkingConfig] = [includeThoughts (1/0), thinkingBudget, null, thinkingLevelCode]
  const thinking = resolveThinkingConfig(body);
  if (thinking.levelCode != null || thinking.budget != null) {
    const idx = WIRE.gen.thinkingConfig;
    while (gen.length <= idx) gen.push(null);
    const cur = Array.isArray(gen[idx]) ? [...gen[idx]] : [1, null, null, null];
    if (thinking.levelCode === 0 && thinking.budget == null) {
      cur[0] = 0;
      cur[3] = 0;
    } else {
      if (cur[0] == null) cur[0] = 1;
      if (thinking.budget != null) cur[1] = thinking.budget;
      if (thinking.levelCode != null) cur[3] = thinking.levelCode;
    }
    gen[idx] = cur;
  }

  let wire;
  if (WIRE_TEMPLATE) {
    wire = JSON.parse(JSON.stringify(WIRE_TEMPLATE));
    wire[0] = "models/" + model;
    wire[1] = contents;
    wire[3] = gen;
    wire[4] = ""; // userscript fills in the signature
  } else {
    // [model, contents, safetySettings, generationConfig, signature]
    wire = ["models/" + model, contents, null, gen, ""];
  }

  // Non-indexed metadata (ignored by JSON.stringify(wire), available to server.js)
  wire._thinking = thinking;

  return { model, wire, thinking };
}

/** Incremental splitter for a streamed top-level JSON array: `)]}'\n[ [..], [..], ... ]` */
class ArraySplitter {
  constructor() {
    this.started = false;
    this.done = false;
    this.depth = 0;
    this.inStr = false;
    this.esc = false;
    this.buf = "";
  }
  feed(text) {
    const out = [];
    for (const ch of text) {
      if (this.done) break;
      if (!this.started) {
        if (ch === "[") {
          this.started = true;
          this.depth = 1;
        }
        continue;
      }
      if (this.inStr) {
        this.buf += ch;
        if (this.esc) this.esc = false;
        else if (ch === "\\") this.esc = true;
        else if (ch === '"') this.inStr = false;
        continue;
      }
      if (ch === '"') {
        this.inStr = true;
        this.buf += ch;
      } else if (ch === "[" || ch === "{") {
        this.depth++;
        this.buf += ch;
      } else if (ch === "]" || ch === "}") {
        this.depth--;
        if (this.depth === 0) {
          this.done = true;
          continue;
        }
        this.buf += ch;
        if (this.depth === 1) {
          try {
            out.push(JSON.parse(this.buf));
          } catch (_) {}
          this.buf = "";
        }
      } else if (this.depth >= 2) {
        this.buf += ch;
      }
    }
    return out;
  }
}

/** Heuristic: model content looks like [ [part, part...], "model" ]; text part looks like [null, "text"]. */
function extractText(node, acc = []) {
  if (!Array.isArray(node)) return acc;
  if (node[1] === "model" && Array.isArray(node[0])) {
    for (const part of node[0]) {
      if (Array.isArray(part) && typeof part[1] === "string") acc.push(part[1]);
    }
    return acc;
  }
  for (const child of node) extractText(child, acc);
  return acc;
}

// Like extractText but keeps each part separate and tags thought parts.
// A normal text part is [null, "text"]. Thought parts are assumed to carry an extra flag === 1
// somewhere after index 1 (heuristic). Override with THOUGHT_INDEX=<n> once you know the slot.
const THOUGHT_INDEX = process.env.THOUGHT_INDEX !== undefined ? Number(process.env.THOUGHT_INDEX) : null;
function isThoughtPart(part) {
  if (THOUGHT_INDEX !== null && Number.isInteger(THOUGHT_INDEX)) return part[THOUGHT_INDEX] === 1;
  return part.length > 2 && part.slice(2).some((v) => v === 1);
}
function extractParts(node, acc = []) {
  if (!Array.isArray(node)) return acc;
  if (node[1] === "model" && Array.isArray(node[0])) {
    for (const part of node[0]) {
      if (Array.isArray(part) && typeof part[1] === "string") acc.push({ text: part[1], thought: isThoughtPart(part) });
    }
    return acc;
  }
  for (const child of node) extractParts(child, acc);
  return acc;
}

function extractUsage(node, usage = { input: null, output: null }) {
  if (!Array.isArray(node)) return usage;
  // chunk[2] = [inputTokens, outputTokens] (same assumption the userscript makes)
  const c = node[2];
  if (Array.isArray(c) && (Number.isSafeInteger(c[0]) || Number.isSafeInteger(c[1])) && c.length <= 4) {
    if (Number.isSafeInteger(c[0])) usage.input = c[0];
    if (Number.isSafeInteger(c[1])) usage.output = c[1];
  }
  for (const child of node) if (Array.isArray(child)) extractUsage(child, usage);
  return usage;
}

function stripPrefix(s) {
  return s.replace(/^\s*\)\]\}'\s*/, "");
}

// The stream looks like  [ [ chunk, chunk, ... ] ]  (outer array -> batch array -> chunks).
// Emit each chunk (depth 3 element) as soon as it closes, so streaming is incremental.
class ChunkSplitter {
  constructor(emitDepth = 2) {
    this.E = emitDepth;
    this.started = false;
    this.done = false;
    this.depth = 0;
    this.inStr = false;
    this.esc = false;
    this.buf = "";
  }
  feed(text) {
    const out = [];
    for (const ch of text) {
      if (this.done) break;
      if (!this.started) {
        if (ch === "[") {
          this.started = true;
          this.depth = 1;
        }
        continue;
      }
      const inside = this.depth > this.E;
      if (this.inStr) {
        if (inside) this.buf += ch;
        if (this.esc) this.esc = false;
        else if (ch === "\\") this.esc = true;
        else if (ch === '"') this.inStr = false;
        continue;
      }
      if (ch === '"') {
        this.inStr = true;
        if (inside) this.buf += ch;
      } else if (ch === "[" || ch === "{") {
        this.depth++;
        if (this.depth > this.E) this.buf += ch;
      } else if (ch === "]" || ch === "}") {
        if (this.depth > this.E) {
          this.buf += ch;
          this.depth--;
          if (this.depth === this.E) {
            try {
              out.push(JSON.parse(this.buf));
            } catch (_) {}
            this.buf = "";
          }
        } else {
          this.depth--;
          if (this.depth === 0) this.done = true;
        }
      } else if (inside) {
        this.buf += ch;
      }
    }
    return out;
  }
}

// chunk = [candidates, null, [promptTokens, candidateTokens, total, null, [...], ..., thoughtTokens], ...]
function extractChunkUsage(chunk, usage = { input: null, output: null }) {
  const c = Array.isArray(chunk) ? chunk[2] : null;
  if (Array.isArray(c)) {
    if (Number.isSafeInteger(c[0])) usage.input = c[0];
    if (Number.isSafeInteger(c[1])) usage.output = c[1] + (Number.isSafeInteger(c[9]) ? c[9] : 0); // include thinking tokens
  }
  return usage;
}

module.exports = {
  openAIToWire,
  resolveThinkingConfig,
  ArraySplitter: ChunkSplitter,
  extractText,
  extractParts,
  extractUsage: extractChunkUsage,
  stripPrefix,
  WIRE,
};