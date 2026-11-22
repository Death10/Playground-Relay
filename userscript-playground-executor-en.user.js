// ==UserScript==
// @name         Playground Executor (self-hosted)
// @namespace    pg-executor.self-hosted
// @version      0.1.24
// @description  Connects the GG public relay with Google AI Studio.
// @match        https://aistudio.google.com/*
// @run-at       document-start
// @inject-into  content
// @grant        none
// @updateURL    http://localhost:8787/userscripts/playground-executor.meta.js
// @downloadURL  http://localhost:8787/userscripts/playground-executor.user.js
// @noframes
//
// Lucide icons (ISC).
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
// as part of Feather (MIT). All other copyright (c) for Lucide are held
// by Lucide Contributors 2022.
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
// ==/UserScript==

(function runExecutor(inPage) {
    "use strict";
    const BOOTSTRAP_MODEL = "gemini-3.8-flash";
    function promptsBasePath() {
        if (location.origin !== "https://aistudio.google.com") return "";
        return location.pathname.match(/^(\/(?:u\/\d+\/)?prompts)(?:\/|$)/)?.[1] || "";
    }
    function isPromptsPage() {
        return promptsBasePath() !== "";
    }
    function currentAccountIndex() {
        return promptsBasePath().match(/^\/u\/(\d+)\//)?.[1] || "0";
    }
    function isTemporaryChatPage() {
        const basePath = promptsBasePath();
        return basePath !== "" && location.pathname === basePath + "/new_chat" && new URLSearchParams(location.search).get("temporary") === "true";
    }
    function temporaryChatURL() {
        return "https://aistudio.google.com" + promptsBasePath() + "/new_chat?temporary=true&model=" + BOOTSTRAP_MODEL;
    }
    function isBootstrapChatPage() {
        return isTemporaryChatPage() && new URLSearchParams(location.search).get("model") === BOOTSTRAP_MODEL;
    }
    function waitForPromptsEntry() {
        let stopped = false;
        let timer;
        const stop = () => {
            if (stopped) return;
            stopped = true;
            window.clearInterval(timer);
            window.removeEventListener("popstate", check);
            window.removeEventListener("hashchange", check);
            window.navigation?.removeEventListener("currententrychange", check);
        };
        const check = () => {
            if (stopped || !isPromptsPage()) return;
            stop();
            runExecutor(false);
        };
        window.addEventListener("popstate", check);
        window.addEventListener("hashchange", check);
        window.navigation?.addEventListener("currententrychange", check);
        timer = window.setInterval(check, 500);
        check();
    }
    if (!isPromptsPage()) {
        if (!inPage) waitForPromptsEntry();
        return;
    }
    const startedAttribute = "data-pg-executor-started";
    if (document.documentElement?.hasAttribute(startedAttribute)) return;
    if (!inPage) {
        let observer;
        let timeout;
        let finished = false;
        function finish(error) {
            finished = true;
            observer?.disconnect();
            clearTimeout(timeout);
            if (!error || !isPromptsPage()) return;
            const notice = document.createElement("div");
            notice.id = "pg-executor-startup-error";
            notice.textContent = "Executor failed to start. Please refresh the page and try again.";
            notice.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:12px 16px;max-width:calc(100vw - 32px);box-sizing:border-box;border:1px solid #ef4444;border-radius:8px;background:#fff;color:#991b1b;font:14px/1.5 system-ui";
            (document.body || document.documentElement)?.appendChild(notice);
        }
        function inject() {
            if (finished) return true;
            if (!isPromptsPage()) {
                finish();
                return true;
            }
            const root = document.documentElement;
            if (root?.hasAttribute(startedAttribute)) {
                finish();
                return true;
            }
            const nonce = document.querySelector("script[nonce]")?.nonce;
            if (!root || !nonce) return false;
            const script = document.createElement("script");
            try {
                script.nonce = nonce;
                const source = `(${runExecutor.toString()})(true);`;
                script.textContent = window.trustedTypes ? window.trustedTypes.createPolicy("pg-executor-bootstrap", {
                    createScript: () => source
                }).createScript("") : source;
                (document.head || root).appendChild(script);
                if (!root.hasAttribute(startedAttribute)) {
                    throw new Error("Nonce-authorized executor did not start");
                }
                finish();
            } catch (error) {
                finish(error);
            } finally {
                script.remove();
            }
            return true;
        }
        if (!inject()) {
            observer = new MutationObserver(inject);
            observer.observe(document, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [ "nonce" ]
            });
            timeout = setTimeout(() => finish(new Error("No page script nonce found")), 15e3);
        }
        return;
    }
    document.documentElement.setAttribute(startedAttribute, "");
    const W = window;
    const SCRIPT_VERSION = "0.1.24";
    const SCRIPT_UPDATE_URL = "http://localhost:8787/userscripts/playground-executor.meta.js";
    const SCRIPT_DOWNLOAD_URL = "http://localhost:8787/userscripts/playground-executor.user.js";
    const EXECUTOR_KIND = "playground";
    const GENERATE_PATH = "/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/GenerateContent";
    const GENERATE_URL = "https://alkalimakersuite-pa.clients6.google.com" + GENERATE_PATH;
    const UPSTREAM_KEEPALIVE_URL = "https://alkalimakersuite-pa.clients6.google.com/generate_204";
    const UPSTREAM_KEEPALIVE_INTERVAL_MS = 15e3;
    const UPSTREAM_KEEPALIVE_TIMEOUT_MS = 1e4;
    const ORIGIN = "https://aistudio.google.com";
    const DEFAULT_API_KEY = "AIzaSyDdP816MREB3SkjZO04QXbjsigfcI0GWOs";
    const DEFAULT_WS_URL = "ws://localhost:8787/api/playground/ws";
    const CONNECTION_HANDOFF_TTL_MS = 12e4;
    const TRIGGER_PROMPT = "hi";
    const BOOTSTRAP_TIMEOUT_MS = 45e3;
    const PAGE_SEND_TIMEOUT_MS = 15e3;
    const MAX_WEBSOCKET_BUFFERED_AMOUNT = 1024 * 1024;
    const WEBSOCKET_BACKPRESSURE_POLL_MS = 10;
    const MAX_ACTIVITY_ROWS = 30;
    const MAX_ERROR_MESSAGE_LENGTH = 1e3;
    const MAX_ERROR_BODY_DISPLAY_LENGTH = 64 * 1024;
    const CLOSE_EXECUTOR_REPLACED = 4001;
    const CLOSE_API_KEY_CHANGED = 4002;
    const CLOSE_POLICY_VIOLATION = 1008;
    const STORAGE = {
        apiKey: "gogcli_pg_executor_api_key_local",
        remember: "gogcli_pg_executor_remember_key",
        theme: "gogcli_pg_executor_theme",
        keepAlive: "gogcli_pg_executor_keepalive",
        wsUrl: "gogcli_pg_executor_ws_url_local",
        connectionHandoff: "gogcli_pg_executor_connection_handoff"
    };
    const KEEPALIVE_AUDIO_SAMPLE_RATE = 8e3;
    const KEEPALIVE_AUDIO_DURATION_SECONDS = 8;
    const KEEPALIVE_AUDIO_FREQUENCY = 16;
    const KEEPALIVE_AUDIO_AMPLITUDE = 64;
    const KEEPALIVE_AUDIO_REWIND_LEAD_SECONDS = 2;
    const KEEPALIVE_AUDIO_REWIND_TARGET_SECONDS = .01;
    const PIP_WIDTH = 320;
    const PIP_HEIGHT = 180;
    const PIP_FRAME_RATE = 1;
    const PIP_FRAME_INTERVAL_MS = 1e3;
    const themeMediaQuery = W.matchMedia("(prefers-color-scheme: dark)");
    const state = {
        socket: null,
        status: "disconnected",
        shouldReconnect: false,
        reconnectTimer: null,
        reconnectDelay: 1e3,
        registered: false,
        versionRejected: false,
        connectedAt: 0,
        durationTimer: null,
        updateCheckPromise: null,
        active: new Map,
        activities: [],
        activitySequence: 0,
        successCount: 0,
        failureCount: 0,
        service: null,
        snapKey: null,
        template: null,
        bootstrapPromise: null,
        pageBasePath: promptsBasePath(),
        handoff: {
            armed: false,
            suppress: false,
            ctx: null
        },
        keepAliveMode: "none",
        keepAliveAudio: null,
        keepAliveTransitioning: false,
        pipCanvas: null,
        pipStream: null,
        pipFrameTimer: null
    };
    const sleep = ms => new Promise(r => W.setTimeout(r, ms));
    async function waitFor(fn, timeoutMs, intervalMs, signal) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            if (signal) assertExecutionPage(signal);
            let v = null;
            try {
                v = fn();
            } catch (_) {}
            if (v) return v;
            if (Date.now() > deadline) return null;
            await sleep(intervalMs || 200);
        }
    }
    function modelAccessDialogError() {
        for (const dialog of document.querySelectorAll?.('mat-dialog-container, mat-mdc-dialog-container, [role="dialog"], [role="alertdialog"], dialog[open]') || []) {
            if (dialog.checkVisibility ? !dialog.checkVisibility({
                visibilityProperty: true
            }) : !dialog.getClientRects().length) continue;
            const text = String(dialog.innerText || dialog.textContent || "").slice(0, 4e3).replace(/\s+/g, " ");
            if (!/\bUnlock\s+Gemini\b/i.test(text) || !/\bneeds a Google AI plan or a Gemini API key\b/i.test(text)) continue;
            const error = executionError(403, "model_access_required", "The model currently selected in Google AI Studio is not unlocked, so the request could not be initialized. Please select a model available to the current account on the web page, then try again.");
            error.body = JSON.stringify({
                error: {
                    code: 403,
                    message: error.message,
                    status: "PERMISSION_DENIED"
                }
            });
            return error;
        }
        return null;
    }
    async function waitForPageState(fn, timeoutMs, intervalMs, signal) {
        let accessError = null;
        const result = await waitFor(() => {
            const ready = fn();
            if (ready) return ready;
            accessError = modelAccessDialogError();
            return accessError;
        }, timeoutMs, intervalMs, signal);
        if (accessError) throw accessError;
        return result;
    }
    async function sha256Hex(text) {
        const data = (new TextEncoder).encode(text);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return [ ...new Uint8Array(digest) ].map(b => b.toString(16).padStart(2, "0")).join("");
    }
    async function sha1Hex(text) {
        const data = (new TextEncoder).encode(text);
        const digest = await crypto.subtle.digest("SHA-1", data);
        return [ ...new Uint8Array(digest) ].map(b => b.toString(16).padStart(2, "0")).join("");
    }
    function executionError(status, code, message) {
        const error = new Error(message);
        error.status = status;
        error.code = code;
        error.body = null;
        return error;
    }
    function normalizeExecutionError(error) {
        if (error && error.name === "AbortError") {
            return {
                status: 499,
                code: "request_cancelled",
                message: "Request cancelled",
                body: null
            };
        }
        return {
            status: Number(error && error.status) || 502,
            code: String(error && error.code || "executor_failed"),
            message: String(error && error.message || "Executor request failed").slice(0, MAX_ERROR_MESSAGE_LENGTH),
            body: typeof (error && error.body) === "string" ? error.body : ""
        };
    }
    function truncateErrorBodyForDisplay(body) {
        const text = typeof body === "string" ? body : "";
        if (text.length <= MAX_ERROR_BODY_DISPLAY_LENGTH) return text;
        return `${text.slice(0, MAX_ERROR_BODY_DISPLAY_LENGTH)}\n\n[Raw response too long, truncated]`;
    }
    function parseJSONBody(text) {
        if (!text || !String(text).trim()) return null;
        try {
            return JSON.parse(String(text));
        } catch (_) {
            return null;
        }
    }
    function googleResponseError(status, rawBody) {
        const text = String(rawBody || "").trim();
        const payload = parseJSONBody(text.replace(/^\)\]\}'\s*/, ""));
        const message = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1][1] : payload?.error?.message;
        const error = executionError(status, String(payload?.error?.status || "upstream_http_error"), (typeof message === "string" && message.trim() ? message : text || "Upstream HTTP " + status).slice(0, MAX_ERROR_MESSAGE_LENGTH));
        error.body = rawBody;
        return error;
    }
    function formatErrorBody(body) {
        const payload = parseJSONBody(body);
        return payload === null ? String(body || "") : JSON.stringify(payload, null, 2);
    }
    function formatActivityErrorMessage(error) {
        let message = String(error.message || "Executor request failed");
        for (const raw of [ error.message, error.body ]) {
            const text = String(raw || "").trim().replace(/^\)\]\}'\s*/, "");
            const payload = parseJSONBody(text.replace(/^\[\s*,/, "[null,"));
            const detail = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1][1] : payload?.error?.message;
            if (typeof detail === "string" && detail.trim()) {
                message = detail;
                break;
            }
        }
        const retryHint = "Please refresh the page and try again";
        if (Number(error.status) === 504 && !message.includes(retryHint)) {
            message = `${message}\n${retryHint}.`;
        }
        return message;
    }
    function parseCookies() {
        const out = {};
        try {
            for (const seg of String(document.cookie || "").split(";")) {
                const t = seg.trim();
                if (!t) continue;
                const i = t.indexOf("=");
                if (i <= 0) continue;
                out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
            }
        } catch (_) {}
        return out;
    }
    async function freshAuthorization() {
        const cookies = parseCookies();
        const sapisid = cookies["SAPISID"] || cookies["__Secure-1PAPISID"] || "";
        if (!sapisid) return "";
        const sapisid1p = cookies["__Secure-1PAPISID"] || sapisid;
        const sapisid3p = cookies["__Secure-3PAPISID"] || sapisid;
        const ts = Math.floor(Date.now() / 1e3);
        const calc = async val => sha1Hex(ts + " " + val + " " + ORIGIN);
        const parts = [ "SAPISIDHASH " + ts + "_" + await calc(sapisid), "SAPISID1PHASH " + ts + "_" + await calc(sapisid1p), "SAPISID3PHASH " + ts + "_" + await calc(sapisid3p) ];
        return parts.join(" ");
    }
    function takeConnectionHandoff() {
        try {
            const raw = sessionStorage.getItem(STORAGE.connectionHandoff);
            sessionStorage.removeItem(STORAGE.connectionHandoff);
            if (!raw || !isTemporaryChatPage()) return null;
            const entry = JSON.parse(raw);
            const age = Date.now() - entry.createdAt;
            if (!Number.isFinite(entry.createdAt) || age < 0 || age > CONNECTION_HANDOFF_TTL_MS || entry.promptsPath !== promptsBasePath() || typeof entry.apiKey !== "string" || !entry.apiKey.trim()) return null;
            return entry.apiKey.trim();
        } catch (_) {
            return null;
        }
    }
    function assertExecutionPage(signal) {
        if (signal?.aborted) throw executionError(499, "cancelled", "Request cancelled");
        if (!isTemporaryChatPage() || state.pageBasePath !== promptsBasePath()) {
            throw executionError(409, "temporary_chat_required", "Please reconnect on the temporary chat page.");
        }
    }
    const cfg = {
        apiKey: "",
        remember: false,
        wsUrl: DEFAULT_WS_URL
    };
    function loadCfg() {
        try {
            cfg.remember = localStorage.getItem(STORAGE.remember) === "true";
            if (cfg.remember) {
                cfg.apiKey = localStorage.getItem(STORAGE.apiKey) || "";
            } else {
                localStorage.removeItem(STORAGE.apiKey);
            }
            let ws = localStorage.getItem(STORAGE.wsUrl) || "";
            if (ws.endsWith("/api/build/ws")) {
                ws = ws.slice(0, -"/api/build/ws".length) + "/api/playground/ws";
            }
            if (ws) cfg.wsUrl = ws;
        } catch (_) {}
    }
    function persistCfg() {
        try {
            if (cfg.remember) localStorage.setItem(STORAGE.apiKey, cfg.apiKey); else localStorage.removeItem(STORAGE.apiKey);
            localStorage.setItem(STORAGE.remember, String(cfg.remember));
            localStorage.setItem(STORAGE.wsUrl, cfg.wsUrl);
        } catch (error) {
            cfg.remember = false;
            if (elements.rememberKey) elements.rememberKey.checked = false;
            try {
                localStorage.removeItem(STORAGE.apiKey);
                localStorage.setItem(STORAGE.remember, "false");
            } catch (_) {}
            setMessage("Failed to save local settings; this change will not persist after refresh.", "error");
        }
    }
    function findComposer() {
        const list = [ ...document.querySelectorAll("ms-prompt-box textarea, textarea") ];
        return list.find(el => {
            try {
                return el.checkVisibility ? el.checkVisibility({
                    visibilityProperty: true
                }) : true;
            } catch (_) {
                return false;
            }
        }) || null;
    }
    async function setComposerText(text, signal) {
        assertExecutionPage(signal);
        const ta = findComposer();
        if (!ta) throw executionError(503, "composer_missing", "Visible prompt input box not found");
        const setter = Object.getOwnPropertyDescriptor(W.HTMLTextAreaElement.prototype, "value").set;
        setter.call(ta, text);
        ta.dispatchEvent(new W.InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: text
        }));
        ta.dispatchEvent(new W.Event("change", {
            bubbles: true
        }));
        return ta;
    }
    async function clickRun(signal) {
        assertExecutionPage(signal);
        const selectors = [ "button.ctrl-enter-submits", "button.build-button", "button[aria-label*='Run']", "button[aria-label*='运行']" ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
                el.click();
                return "selector:" + sel;
            }
        }
        const btns = [ ...document.querySelectorAll("button") ];
        const hit = btns.find(b => /^(Run|Build|运行|发送)$/i.test((b.innerText || "").trim()));
        if (hit) {
            hit.click();
            return "text:" + (hit.innerText || "").trim();
        }
        const ta = findComposer();
        if (ta) {
            ta.focus();
            ta.dispatchEvent(new W.KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
            return "keydown-Enter";
        }
        return null;
    }
    function installPageHooks() {
        const dms = W.default_MakerSuite;
        if (!dms) return "no_default_MakerSuite";
        const currentKey = state.snapKey;
        if (currentKey && dms[currentKey] && dms[currentKey].__pgWrapped) return currentKey;
        let snapKey = null;
        for (const key of Object.keys(dms)) {
            try {
                if (typeof dms[key] !== "function") continue;
                const s = dms[key].toString();
                if (s.includes(".snapshot") && s.includes("content") && s.includes("yield")) {
                    snapKey = key;
                    break;
                }
            } catch (_) {}
        }
        if (!snapKey) return "no_snapshot_fn";
        const original = dms[snapKey];
        const wrapped = function(...args) {
            if (!isTemporaryChatPage()) return original.apply(this, args);
            const service = args[0];
            if (service && (typeof service === "object" || typeof service === "function")) {
                state.service = service;
            }
            return original.apply(this, args);
        };
        wrapped.__pgWrapped = true;
        dms[snapKey] = wrapped;
        state.snapKey = snapKey;
        return snapKey;
    }
    function normalizeHeaders(source) {
        const out = {};
        if (!source) return out;
        try {
            if (typeof source.forEach === "function") {
                source.forEach((value, name) => {
                    out[String(name).toLowerCase()] = String(value);
                });
            } else if (Array.isArray(source)) {
                for (const pair of source) {
                    if (Array.isArray(pair) && pair.length >= 2) {
                        out[String(pair[0]).toLowerCase()] = String(pair[1]);
                    }
                }
            } else if (typeof source === "object") {
                for (const [name, value] of Object.entries(source)) {
                    out[String(name).toLowerCase()] = String(value);
                }
            }
        } catch (_) {}
        return out;
    }
    function createAccountTierSupport() {
        const names = [ "Free", "Pro", "Ultra", "Plus" ];
        const headerTiers = {
            TIER0: 3,
            TIER1: 1,
            TIER2: 2
        };
        let account = currentAccountIndex();
        let tier = null;
        let pending = null;
        let nextProbe = 0;
        function value() {
            return account === currentAccountIndex() ? names[tier]?.toLowerCase() || "unknown" : "unknown";
        }
        function updateLabel() {
            const label = elements.tier;
            if (!label) return;
            const name = account === currentAccountIndex() ? names[tier] : null;
            label.textContent = name || (pending ? "Detecting" : "Unknown");
            label.dataset.tier = name ? String(tier) : "unknown";
            label.title = name ? `Google AI Studio ${name}` : pending ? "Detecting Google AI Studio plan tier" : "Google AI Studio plan tier unknown";
        }
        function report() {
            if (state.registered && state.socket && state.socket.readyState === WebSocket.OPEN) {
                websocketSendNow({
                    type: "subscription",
                    subscriptionTier: value()
                });
            }
        }
        function reset() {
            pending?.controller.abort();
            pending = null;
            account = currentAccountIndex();
            tier = null;
            nextProbe = 0;
            updateLabel();
        }
        function observe(metadata) {
            if (account !== currentAccountIndex()) reset();
            const headers = normalizeHeaders(metadata);
            if (headers["x-goog-authuser"] && headers["x-goog-authuser"] !== account) return;
            const known = headerTiers[headers["x-aistudio-g1-tier"]];
            if (!Number.isInteger(known)) return;
            pending?.controller.abort();
            pending = null;
            const changed = tier !== known;
            tier = known;
            nextProbe = Date.now() + 3e5;
            updateLabel();
            if (changed) report();
        }
        function refresh(metadata = state.template?.headers || {}) {
            if (!isPromptsPage()) return;
            observe(metadata);
            if (pending) return pending.promise;
            if (Date.now() < nextProbe) return;
            let data = W.WIZ_global_data;
            if (!data?.WIu0Nc) {
                for (const script of document.querySelectorAll?.('script[type="application/json"]') || []) {
                    const text = script.textContent || "";
                    if (!text.includes('"WIu0Nc"')) continue;
                    try {
                        data = JSON.parse(text);
                    } catch (_) {
                        continue;
                    }
                    if (data?.WIu0Nc) break;
                }
            }
            if (typeof data?.WIu0Nc !== "string" || !/^[\x20-\x7e]{1,256}$/.test(data.WIu0Nc) || String(data.QrtxK ?? "0") !== account) return;
            const controller = new W.AbortController;
            const entry = {
                controller: controller,
                account: account,
                promise: null
            };
            pending = entry;
            nextProbe = Date.now() + 3e5;
            updateLabel();
            entry.promise = (async () => {
                const timer = W.setTimeout(() => controller.abort(), 3500);
                try {
                    const captured = normalizeHeaders(metadata);
                    const auth = await (captured.authorization || freshAuthorization());
                    if (pending !== entry || !isPromptsPage() || currentAccountIndex() !== entry.account || controller.signal.aborted) return;
                    const headers = {
                        "content-type": "application/json+protobuf",
                        "x-user-agent": "grpc-web-javascript/0.1",
                        "x-goog-api-key": data.WIu0Nc,
                        "x-goog-authuser": entry.account,
                        ...auth ? {
                            authorization: auth
                        } : {}
                    };
                    const fetch = W.fetch.__pgOriginal || W.fetch;
                    const response = await fetch.call(W, GENERATE_URL.replace(/\/GenerateContent$/, "/GetAiStudioBenefitTier"), {
                        method: "POST",
                        headers: headers,
                        body: "[]",
                        credentials: "include",
                        signal: controller.signal
                    });
                    if (!response.ok) return;
                    const raw = await response.text();
                    if (raw.length > 65536 || pending !== entry || !isPromptsPage() || currentAccountIndex() !== entry.account || controller.signal.aborted) return;
                    const result = parseJSONBody(raw.replace(/^\)\]\}'\s*/, ""));
                    const known = Array.isArray(result) ? result[0] ?? 0 : null;
                    if (!Number.isInteger(known) || known < 0 || known >= names.length) return;
                    const changed = tier !== known;
                    tier = known;
                    if (changed) report();
                } catch (_) {} finally {
                    W.clearTimeout(timer);
                    if (pending === entry) {
                        pending = null;
                        updateLabel();
                    }
                }
            })();
            return entry.promise;
        }
        function headers() {
            const header = account === currentAccountIndex() ? {
                1: "TIER1",
                2: "TIER2",
                3: "TIER0"
            }[tier] : null;
            return header ? {
                "x-aistudio-g1-tier": header
            } : {};
        }
        return {
            value: value,
            refresh: refresh,
            observe: observe,
            headers: headers,
            reset: reset,
            updateLabel: updateLabel,
            report: report
        };
    }
    const accountTier = createAccountTierSupport();
    function installFetchHooks() {
        if (typeof W.fetch !== "function" || W.fetch.__pgWrapped) return;
        const original = W.fetch;
        const wrapper = function(input, init) {
            if (!isTemporaryChatPage()) return original.apply(this, arguments);
            let outcome = null;
            try {
                const url = typeof input === "string" ? input : input && input.url || "";
                if (url.includes("MakerSuiteService")) {
                    if (url.includes("SavePrompt") || url.includes("CreatePrompt")) {
                        return Promise.resolve(new Response("[]", {
                            status: 200,
                            headers: {
                                "Content-Type": "application/json+protobuf"
                            }
                        }));
                    }
                    const path = new URL(url, location.href).pathname;
                    if (path.endsWith("MakerSuiteService/GenerateContent")) {
                        const captured = normalizeHeaders(init && init.headers);
                        if (Object.keys(captured).length) state.template = {
                            headers: captured
                        };
                        const method = String(init && init.method || input && input.method || "GET").toUpperCase();
                        const bodyStr = init && typeof init.body === "string" ? init.body : null;
                        if (method === "POST" && bodyStr && state.handoff.armed) {
                            const claim = claimPageSend("fetch");
                            if (claim) {
                                if (claim.suppress) {
                                    outcome = Promise.resolve(new Response("", {
                                        status: 502,
                                        headers: {
                                            "content-type": "application/json+protobuf"
                                        }
                                    }));
                                } else {
                                    claim.completion = performHandoffSend(captured, "fetch", null, claim);
                                    outcome = claim.completion.catch(() => {}).then(() => new Response("", {
                                        status: 200,
                                        headers: {
                                            "content-type": "application/json+protobuf; charset=UTF-8"
                                        }
                                    }));
                                }
                            }
                        }
                    }
                }
            } catch (_) {}
            if (outcome) return outcome;
            return original.apply(this, arguments);
        };
        wrapper.__pgWrapped = true;
        wrapper.__pgOriginal = original;
        W.fetch = wrapper;
    }
    function installXhrHooks() {
        const proto = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
        if (!proto || !proto.open || proto.open.__pgWrapped) return;
        const origOpen = proto.open;
        const origSet = proto.setRequestHeader;
        const origSend = proto.send;
        const calls = new WeakMap;
        const callState = xhr => {
            let entry = calls.get(xhr);
            if (!entry) {
                entry = {
                    url: "",
                    headers: {}
                };
                calls.set(xhr, entry);
            }
            return entry;
        };
        const open = function() {
            if (!isTemporaryChatPage()) return origOpen.apply(this, arguments);
            try {
                callState(this).url = String(arguments[1]);
            } catch (_) {}
            return origOpen.apply(this, arguments);
        };
        open.__pgWrapped = true;
        const set = function(name, value) {
            if (!isTemporaryChatPage()) return origSet.apply(this, arguments);
            try {
                callState(this).headers[String(name).toLowerCase()] = String(value);
            } catch (_) {}
            return origSet.apply(this, arguments);
        };
        const send = function(body) {
            if (!isTemporaryChatPage()) return origSend.apply(this, arguments);
            let outcome = null;
            try {
                const entry = callState(this);
                const isTarget = String(entry.url).includes("MakerSuiteService/GenerateContent") && typeof body === "string";
                if (isTarget) {
                    const path = new URL(entry.url, location.href).pathname;
                    if (path.endsWith("MakerSuiteService/GenerateContent")) {
                        if (Object.keys(entry.headers).length) {
                            state.template = {
                                headers: {
                                    ...entry.headers
                                }
                            };
                        }
                    }
                }
                if (isTarget && state.handoff.armed) {
                    const claim = claimPageSend("xhr");
                    if (claim) {
                        outcome = {
                            claimed: true
                        };
                        if (claim.suppress) {
                            const suppressDelivery = createLocalXhrDelivery(this);
                            suppressDelivery.ready();
                            suppressDelivery.fail(502, "");
                        } else {
                            const delivery = createLocalXhrDelivery(this);
                            delivery.ready();
                            claim.completion = performHandoffSend({
                                ...entry.headers
                            }, "xhr", this, claim, delivery);
                            claim.completion.catch(() => {});
                        }
                    }
                }
            } catch (_) {}
            if (outcome) return;
            return origSend.apply(this, arguments);
        };
        send.__pgWrapped = true;
        proto.open = open;
        proto.setRequestHeader = set;
        proto.send = send;
    }
    function computeDigestFromWire(wire) {
        const contents = wire && wire[1];
        if (!Array.isArray(contents)) throw executionError(500, "wire_contents_missing", "wire is missing contents");
        const partsOut = [];
        for (const content of contents) {
            const parts = Array.isArray(content) ? content[0] : null;
            if (!Array.isArray(parts)) continue;
            for (const part of parts) {
                if (!Array.isArray(part)) {
                    partsOut.push("");
                    continue;
                }
                if (typeof part[1] === "string") {
                    partsOut.push(part[1]);
                } else if (Array.isArray(part[2])) {
                    partsOut.push(part[2][1] != null ? String(part[2][1]) : "");
                } else if (Array.isArray(part[8])) {
                    partsOut.push(part[8][1] != null ? String(part[8][1]) : "");
                } else if (Array.isArray(part[9])) {
                    partsOut.push(part[9][1] != null ? String(part[9][1]) : "");
                } else {
                    partsOut.push("");
                }
            }
        }
        return sha256Hex(partsOut.join(" "));
    }
    async function generateSnapshot(digest) {
        const dms = W.default_MakerSuite;
        const key = state.snapKey;
        if (!dms || !key || typeof dms[key] !== "function") {
            throw executionError(503, "waa_not_ready", "Signing function not ready");
        }
        if (!state.service) {
            throw executionError(503, "waa_service_missing", "BotGuardService not captured");
        }
        const proof = await dms[key](state.service, digest);
        if (typeof proof !== "string" || !proof.startsWith("!")) {
            throw executionError(502, "waa_proof_invalid", "Signature result has an invalid prefix");
        }
        return proof;
    }
    async function buildHeaders() {
        const tpl = state.template && state.template.headers || {};
        accountTier.observe(tpl);
        const headers = {};
        for (const [k, v] of Object.entries(tpl)) {
            const lk = k.toLowerCase();
            if (lk === "host" || lk === "content-length" || lk === "authorization") continue;
            headers[lk] = v;
        }
        headers["content-type"] = "application/json+protobuf";
        if (!headers["x-goog-api-key"]) headers["x-goog-api-key"] = DEFAULT_API_KEY;
        if (promptsBasePath().startsWith("/u/")) headers["x-goog-authuser"] = currentAccountIndex(); else if (!headers["x-goog-authuser"]) headers["x-goog-authuser"] = "0";
        if (!headers["x-user-agent"]) headers["x-user-agent"] = "grpc-web-javascript/0.1";
        const auth = await freshAuthorization();
        if (auth) headers["authorization"] = auth; else if (tpl["authorization"]) headers["authorization"] = tpl["authorization"];
        return headers;
    }
    function isIOSDevice() {
        return /iP(?:hone|ad|od)/.test(navigator.userAgent || "") || /Mac/.test(navigator.platform || navigator.userAgent || "") && navigator.maxTouchPoints > 1;
    }
    const upstreamConnectionKeepAlive = {
        requests: new Set,
        timer: null,
        pending: null,
        acquire(signal) {
            if (signal?.aborted) return () => {};
            const request = {
                signal: signal,
                pagePath: promptsBasePath(),
                release: null
            };
            const release = () => {
                if (!this.requests.delete(request)) return;
                signal?.removeEventListener("abort", release);
                if (this.requests.size) return;
                W.clearInterval(this.timer);
                this.timer = null;
                const pending = this.pending;
                this.pending = null;
                if (pending) {
                    W.clearTimeout(pending.timeout);
                    pending.controller.abort();
                }
            };
            request.release = release;
            this.requests.add(request);
            signal?.addEventListener("abort", release, {
                once: true
            });
            if (this.timer === null) {
                this.timer = W.setInterval(() => {
                    void this.ping();
                }, UPSTREAM_KEEPALIVE_INTERVAL_MS);
            }
            return release;
        },
        async ping() {
            for (const request of this.requests) {
                if (request.signal?.aborted || !isTemporaryChatPage() || request.pagePath !== promptsBasePath()) {
                    request.release();
                }
            }
            if (!this.requests.size || this.pending) return;
            const controller = new W.AbortController;
            const pending = {
                controller: controller,
                timeout: null
            };
            this.pending = pending;
            pending.timeout = W.setTimeout(() => controller.abort(), UPSTREAM_KEEPALIVE_TIMEOUT_MS);
            try {
                const fetch = W.fetch.__pgOriginal || W.fetch;
                await fetch.call(W, `${UPSTREAM_KEEPALIVE_URL}?_=${Date.now()}`, {
                    method: "GET",
                    mode: "no-cors",
                    credentials: "include",
                    cache: "no-store",
                    signal: controller.signal
                });
            } catch (_) {} finally {
                if (this.pending === pending) {
                    W.clearTimeout(pending.timeout);
                    this.pending = null;
                }
            }
        }
    };
    function startCountTokensKeepAlive(signal) {
        if (signal?.aborted) return () => {};
        const pagePath = promptsBasePath();
        const controller = new W.AbortController;
        let stopped = false;
        let timer;
        let deadline;
        function stop() {
            if (stopped) return;
            stopped = true;
            W.clearTimeout(timer);
            W.clearTimeout(deadline);
            signal?.removeEventListener("abort", stop);
            controller.abort();
        }
        async function send() {
            try {
                if (stopped) return;
                assertExecutionPage(signal);
                if (pagePath !== promptsBasePath()) return;
                deadline = W.setTimeout(stop, 1e4);
                const headers = await buildHeaders();
                if (stopped || pagePath !== promptsBasePath()) return;
                assertExecutionPage(signal);
                const fetch = W.fetch.__pgOriginal || W.fetch;
                const response = await fetch.call(W, GENERATE_URL.replace(/\/GenerateContent$/, "/CountTokens"), {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify([ "models/" + BOOTSTRAP_MODEL, [ [ [ [ null, TRIGGER_PROMPT ] ], "user" ] ] ]),
                    credentials: "include",
                    signal: controller.signal
                });
                await response.text();
            } catch (_) {} finally {
                stop();
            }
        }
        signal?.addEventListener("abort", stop, {
            once: true
        });
        timer = W.setTimeout(send, 2e3);
        return stop;
    }
    async function sendWireStreaming(wire, headers, signal, onDelta, countTokensKeepAlive = false) {
        assertExecutionPage(signal);
        const releaseConnectionKeepAlive = upstreamConnectionKeepAlive.acquire(signal);
        try {
            const fetch = W.fetch.__pgOriginal || W.fetch;
            const pending = fetch.call(W, GENERATE_URL, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(wire),
                credentials: "include",
                signal: signal
            });
            const stopKeepAlive = countTokensKeepAlive ? startCountTokensKeepAlive(signal) : () => {};
            let resp;
            try {
                resp = await pending;
            } finally {
                stopKeepAlive();
            }
            if (!resp.ok) {
                let rawBody = "";
                try {
                    rawBody = await resp.text();
                } catch (_) {}
                throw googleResponseError(resp.status, rawBody);
            }
            let full = "";
            if (resp.body) {
                const reader = resp.body.getReader();
                const decoder = new TextDecoder;
                for (;;) {
                    const {done: done, value: value} = await reader.read();
                    if (done) break;
                    const delta = decoder.decode(value || new Uint8Array, {
                        stream: true
                    });
                    if (delta) {
                        full += delta;
                        if (onDelta) await onDelta(delta);
                    }
                }
                const tail = decoder.decode();
                if (tail) {
                    full += tail;
                    if (onDelta) await onDelta(tail);
                }
            } else {
                full = await resp.text();
                if (onDelta && full) await onDelta(full);
            }
            return {
                status: resp.status,
                text: full,
                usage: readWireTokenUsage(full)
            };
        } finally {
            releaseConnectionKeepAlive();
        }
    }
    function readWireTokenUsage(text) {
        const usage = {
            inputTokens: null,
            outputTokens: null
        };
        try {
            const batches = JSON.parse(text.trimStart().replace(/^\)\]\}'\s*/, ""));
            if (!Array.isArray(batches)) return usage;
            for (const batch of batches) {
                if (!Array.isArray(batch)) continue;
                for (const chunk of batch) {
                    const counts = Array.isArray(chunk) ? chunk[2] : null;
                    if (!Array.isArray(counts)) continue;
                    if (Number.isSafeInteger(counts[0]) && counts[0] >= 0) usage.inputTokens = counts[0];
                    if (Number.isSafeInteger(counts[1]) && counts[1] >= 0) usage.outputTokens = counts[1];
                }
            }
        } catch (_) {}
        return usage;
    }
    function claimPageSend(kind) {
        if (!state.handoff.armed) return null;
        state.handoff.armed = false;
        const suppress = state.handoff.suppress;
        state.handoff.suppress = false;
        const ctx = state.handoff.ctx;
        state.handoff.ctx = null;
        if (suppress) return {
            kind: kind,
            suppress: true
        };
        return ctx ? Object.assign(ctx, {
            kind: kind,
            claimedAt: Date.now()
        }) : null;
    }
    function armHandoff(ctx) {
        state.handoff.armed = true;
        state.handoff.suppress = false;
        state.handoff.ctx = ctx || null;
    }
    function armSuppress() {
        state.handoff.armed = true;
        state.handoff.suppress = true;
        state.handoff.ctx = null;
    }
    function disarmHandoff() {
        state.handoff.armed = false;
        state.handoff.suppress = false;
        state.handoff.ctx = null;
    }
    function createLocalXhrDelivery(xhr) {
        const inner = {
            responseType: "",
            text: ""
        };
        try {
            inner.responseType = String(xhr.responseType || "");
        } catch (_) {}
        const def = (k, v) => {
            try {
                Object.defineProperty(xhr, k, {
                    configurable: true,
                    get: () => v
                });
            } catch (_) {}
        };
        def("responseURL", GENERATE_URL);
        def("getResponseHeader", name => String(name).toLowerCase() === "content-type" ? "application/json+protobuf; charset=UTF-8" : null);
        const updateBody = () => {
            def("responseText", inner.text);
            if (inner.responseType === "json" && inner.text) {
                let parsed = inner.text;
                try {
                    parsed = JSON.parse(inner.text);
                } catch (_) {}
                def("response", parsed);
            } else {
                def("response", inner.text);
            }
        };
        const fire = type => {
            try {
                xhr.dispatchEvent(new W.Event(type));
            } catch (_) {}
        };
        return {
            ready() {
                def("readyState", 2);
                def("status", 0);
                updateBody();
                fire("readystatechange");
            },
            pushChunk(text) {
                inner.text = text;
                def("readyState", 3);
                def("status", 200);
                def("statusText", "OK");
                updateBody();
                fire("readystatechange");
                try {
                    xhr.dispatchEvent(new W.ProgressEvent("progress", {
                        lengthComputable: false,
                        loaded: text.length,
                        total: 0
                    }));
                } catch (_) {}
            },
            finish() {
                def("readyState", 4);
                def("status", 200);
                def("statusText", "OK");
                updateBody();
                fire("readystatechange");
                fire("load");
                fire("loadend");
            },
            fail(status, text) {
                inner.text = text || "";
                def("readyState", 4);
                def("status", status);
                def("statusText", "Error");
                updateBody();
                fire("readystatechange");
                fire("load");
                fire("loadend");
            }
        };
    }
    async function performHandoffSend(headers, kind, xhr, ctx, providedDelivery) {
        const req = ctx && ctx.req;
        if (!req) return true;
        const delivery = providedDelivery || (kind === "xhr" && xhr ? createLocalXhrDelivery(xhr) : null);
        if (delivery && delivery !== providedDelivery) delivery.ready();
        let wire;
        try {
            wire = JSON.parse(JSON.stringify(req.wire));
        } catch (e) {
            if (delivery) delivery.fail(502, "");
            throw executionError(500, "wire_clone_failed", String(e));
        }
        try {
            const digest = await computeDigestFromWire(wire);
            wire[4] = await generateSnapshot(digest);
            let chunkBuffer = "";
            const res = await sendWireStreaming(wire, headers, req.controller.signal, req.stream ? async delta => {
                chunkBuffer += delta;
                if (delivery) delivery.pushChunk(chunkBuffer);
                await websocketSend({
                    type: "stream-chunk",
                    requestId: req.requestID,
                    chunkBody: delta
                });
            } : null);
            if (req.stream) {
                await websocketSend({
                    type: "stream-end",
                    requestId: req.requestID,
                    status: res.status
                });
            } else {
                await websocketSend({
                    type: "response",
                    requestId: req.requestID,
                    status: res.status,
                    responseBody: res.text
                });
            }
            if (delivery) delivery.finish();
            state.successCount++;
            addActivity({
                requestID: req.requestID,
                model: req.model,
                stream: req.stream,
                result: "success",
                message: "Success (bootstrap merge)",
                durationMS: performance.now() - req.startedAt,
                ...res.usage
            });
            return true;
        } catch (e) {
            if (req.controller.signal.aborted) {
                if (delivery) delivery.fail(499, "");
                await sendExecutionError(req.requestID, req.stream, 499, "cancelled", "Request cancelled");
                addActivity({
                    requestID: req.requestID,
                    model: req.model,
                    stream: req.stream,
                    result: "error",
                    message: "Cancelled",
                    durationMS: performance.now() - req.startedAt
                });
                return true;
            }
            const details = normalizeExecutionError(e);
            if (delivery) delivery.fail(details.status || 502, details.body);
            if (details.status === 403 || details.status === 401) {
                throw details;
            }
            state.failureCount++;
            await sendExecutionError(req.requestID, req.stream, details.status || 502, details.code, details.message, details.body);
            addActivity({
                requestID: req.requestID,
                model: req.model,
                stream: req.stream,
                result: "error",
                message: details.message,
                durationMS: performance.now() - req.startedAt,
                error: {
                    status: details.status || 502,
                    code: details.code,
                    message: details.message,
                    body: details.body
                }
            });
            return true;
        } finally {
            try {
                await setComposerText("");
            } catch (_) {}
        }
    }
    async function sendAndRelayOnce(req, phase) {
        const controller = req.controller;
        try {
            const wire = JSON.parse(JSON.stringify(req.wire));
            const digest = await computeDigestFromWire(wire);
            wire[4] = await generateSnapshot(digest);
            const headers = await buildHeaders();
            const res = await sendWireStreaming(wire, headers, controller.signal, req.stream ? async delta => {
                await websocketSend({
                    type: "stream-chunk",
                    requestId: req.requestID,
                    chunkBody: delta
                });
            } : null, true);
            if (req.stream) {
                await websocketSend({
                    type: "stream-end",
                    requestId: req.requestID,
                    status: res.status
                });
            } else {
                await websocketSend({
                    type: "response",
                    requestId: req.requestID,
                    status: res.status,
                    responseBody: res.text
                });
            }
            state.successCount++;
            addActivity({
                requestID: req.requestID,
                model: req.model,
                stream: req.stream,
                result: "success",
                message: "Success" + (phase === "primary" ? "" : " (" + phase + ")"),
                durationMS: performance.now() - req.startedAt,
                ...res.usage
            });
            return true;
        } catch (e) {
            if (controller.signal.aborted) {
                await sendExecutionError(req.requestID, req.stream, 499, "cancelled", "Request cancelled");
                addActivity({
                    requestID: req.requestID,
                    model: req.model,
                    stream: req.stream,
                    result: "error",
                    message: "Cancelled",
                    durationMS: performance.now() - req.startedAt
                });
                return true;
            }
            if (e && (e.status === 403 || e.status === 401)) return normalizeExecutionError(e);
            throw e;
        }
    }
    async function reSignViaPageSend(signal) {
        assertExecutionPage(signal);
        const existing = state.bootstrapPromise;
        if (existing) {
            await existing;
            assertExecutionPage(signal);
            if (state.service && state.snapKey) return;
        }
        const ctx = {
            req: null,
            claimedAt: 0
        };
        armHandoff(ctx);
        try {
            await setComposerText(TRIGGER_PROMPT, signal);
            await sleep(200);
            const via = await clickRun(signal);
            if (!via) throw executionError(503, "run_button_missing", "Could not trigger a page send (Run button not found)");
            const claimed = await waitForPageState(() => ctx.claimedAt ? true : null, BOOTSTRAP_TIMEOUT_MS, 100, signal);
            if (!claimed) throw executionError(504, "resign_no_page_send", "The page did not send a request; signature rebuild failed");
        } catch (e) {
            if (e?.code === "model_access_required") armSuppress(); else disarmHandoff();
            throw e;
        }
        assertExecutionPage(signal);
        if (state.handoff.armed) armSuppress();
        if (!state.service || !state.snapKey) {
            throw executionError(504, "resign_incomplete", "Signature rebuild incomplete");
        }
    }
    async function runBootstrap(req) {
        const signal = req.controller.signal;
        assertExecutionPage(signal);
        const ctx = {
            req: req,
            claimedAt: 0
        };
        armHandoff(ctx);
        try {
            await setComposerText(TRIGGER_PROMPT, signal);
            await sleep(200);
            const via = await clickRun(signal);
            if (!via) throw executionError(503, "run_button_missing", "Could not trigger a page send (Run button not found)");
            const ok = await waitForPageState(() => state.service && state.snapKey ? true : null, BOOTSTRAP_TIMEOUT_MS, 200, signal);
            if (!ok) throw executionError(504, "bootstrap_timeout", "Bootstrap timed out: the page did not finish the signing pipeline");
            await sleep(800);
            const claimed = await waitForPageState(() => ctx.claimedAt ? true : null, PAGE_SEND_TIMEOUT_MS, 100, signal);
            if (!claimed) {
                disarmHandoff();
            } else {
                await ctx.completion;
                assertExecutionPage(signal);
                armSuppress();
                return;
            }
        } catch (e) {
            if (e?.code === "model_access_required") {
                state.service = null;
                armSuppress();
            } else disarmHandoff();
            throw e;
        }
        const result = await sendAndRelayOnce(req, "primary");
        if (result !== true) throw result;
    }
    async function sendAndRelay(req, phase = "primary", initialResult = null) {
        let result = initialResult ?? await sendAndRelayOnce(req, phase);
        if (result && (result.status === 403 || result.status === 401)) {
            req.controller.signal.throwIfAborted?.();
            if (req.controller.signal.aborted) return;
            state.service = null;
            try {
                await reSignViaPageSend(req.controller.signal);
            } catch (e) {
                state.failureCount++;
                const details = normalizeExecutionError(e);
                await sendExecutionError(req.requestID, req.stream, details.status || 504, details.code, details.message, details.body);
                addActivity({
                    requestID: req.requestID,
                    model: req.model,
                    stream: req.stream,
                    result: "error",
                    message: "Signature rebuild failed: " + details.message,
                    durationMS: performance.now() - req.startedAt,
                    error: {
                        status: details.status || 504,
                        code: details.code,
                        message: details.message,
                        body: details.body
                    }
                });
                return;
            }
            if (req.controller.signal.aborted) return;
            req._isRetry = true;
            result = await sendAndRelayOnce(req, "retry");
        }
        if (result !== true) {
            state.failureCount++;
            const details = normalizeExecutionError(result);
            await sendExecutionError(req.requestID, req.stream, details.status, details.code, details.message, details.body);
            addActivity({
                requestID: req.requestID,
                model: req.model,
                stream: req.stream,
                result: "error",
                message: details.message,
                durationMS: performance.now() - req.startedAt,
                error: {
                    status: details.status,
                    code: details.code,
                    message: details.message,
                    body: details.body
                }
            });
        }
    }
    async function handleRequest(msg) {
        if (!isTemporaryChatPage()) {
            disconnect();
            return;
        }
        const startedAt = performance.now();
        const requestID = String(msg.requestId || "").trim();
        const stream = msg.stream === true;
        const model = String(msg.model || "");
        let payload = null;
        try {
            payload = JSON.parse(String(msg.requestBody || ""));
        } catch (_) {
            await sendExecutionError(requestID, stream, 400, "invalid_request_body", "requestBody is not valid JSON");
            addActivity({
                requestID: requestID,
                model: model,
                stream: stream,
                result: "error",
                message: "requestBody is not valid JSON",
                durationMS: performance.now() - startedAt,
                error: {
                    status: 400,
                    code: "invalid_request_body",
                    message: "requestBody is not valid JSON"
                }
            });
            return;
        }
        const wire = payload;
        if (!requestID || !Array.isArray(wire)) {
            await sendExecutionError(requestID, stream, 400, "invalid_payload", "requestBody is not a wire array");
            addActivity({
                requestID: requestID,
                model: model,
                stream: stream,
                result: "error",
                message: "requestBody is missing the wire array",
                durationMS: performance.now() - startedAt,
                error: {
                    status: 400,
                    code: "invalid_payload",
                    message: "requestBody is not a wire array"
                }
            });
            return;
        }
        const controller = new AbortController;
        const req = {
            requestID: requestID,
            stream: stream,
            model: model,
            wire: wire,
            controller: controller,
            startedAt: startedAt
        };
        state.active.set(requestID, {
            controller: controller,
            stream: stream,
            startedAt: startedAt
        });
        updateControls();
        try {
            if (state.service && state.snapKey) {
                await sendAndRelay(req, "primary");
                return;
            }
            if (!state.bootstrapPromise) {
                const bootstrap = runBootstrap(req).finally(() => {
                    if (state.bootstrapPromise === bootstrap) state.bootstrapPromise = null;
                });
                state.bootstrapPromise = bootstrap;
                try {
                    await state.bootstrapPromise;
                } catch (e) {
                    if (!e || e.code === "model_access_required" || e.status !== 403 && e.status !== 401) throw e;
                    await sendAndRelay(req, "primary", normalizeExecutionError(e));
                }
            } else {
                await state.bootstrapPromise;
                if (state.service && state.snapKey) {
                    await sendAndRelay(req, "primary");
                } else {
                    await sendAndRelay(req, "after-bootstrap");
                }
            }
        } catch (e) {
            state.failureCount++;
            const details = normalizeExecutionError(e);
            await sendExecutionError(requestID, stream, details.status || 502, details.code, details.message, details.body);
            addActivity({
                requestID: requestID,
                model: model,
                stream: stream,
                result: "error",
                message: details.message,
                durationMS: performance.now() - startedAt,
                error: {
                    status: details.status || 502,
                    code: details.code,
                    message: details.message,
                    body: details.body
                }
            });
        } finally {
            state.active.delete(requestID);
            updateControls();
        }
    }
    function websocketSendNow(payload, socket = state.socket) {
        if (!socket || socket !== state.socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }
        try {
            socket.send(JSON.stringify(payload));
            return true;
        } catch (e) {
            return false;
        }
    }
    async function websocketSend(payload, signal) {
        const socket = state.socket;
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;
        while (socket.bufferedAmount > MAX_WEBSOCKET_BUFFERED_AMOUNT) {
            if (signal && signal.aborted || socket !== state.socket || socket.readyState !== WebSocket.OPEN) {
                return false;
            }
            await sleep(WEBSOCKET_BACKPRESSURE_POLL_MS);
        }
        if (signal && signal.aborted) return false;
        return websocketSendNow(payload, socket);
    }
    async function sendExecutionError(requestID, stream, status, code, message, body) {
        if (!requestID) return;
        await websocketSend({
            type: stream ? "stream-error" : "error",
            requestId: requestID,
            status: status,
            error: {
                code: code,
                message: message,
                body: body || ""
            }
        });
    }
    function setStatus(statusName, text) {
        if (!elements.status) return;
        elements.status.dataset.state = statusName;
        elements.status.title = text;
        if (elements.statusText) elements.statusText.textContent = text;
    }
    function startDurationTimer() {
        stopDurationTimer();
        const update = () => {
            if (!elements.connectionDuration) return;
            const elapsed = Math.max(0, Date.now() - state.connectedAt);
            const seconds = Math.floor(elapsed / 1e3);
            const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
            const m = String(Math.floor(seconds % 3600 / 60)).padStart(2, "0");
            const s = String(seconds % 60).padStart(2, "0");
            elements.connectionDuration.textContent = `${h}:${m}:${s}`;
        };
        update();
        state.durationTimer = W.setInterval(update, 1e3);
    }
    function stopDurationTimer() {
        if (state.durationTimer !== null) {
            clearInterval(state.durationTimer);
            state.durationTimer = null;
        }
        if (!state.registered && elements.connectionDuration) {
            elements.connectionDuration.textContent = "00:00:00";
        }
    }
    function clearReconnectTimer() {
        if (state.reconnectTimer !== null) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }
    }
    function scheduleReconnect() {
        if (!state.shouldReconnect || !isTemporaryChatPage()) return;
        const basePath = promptsBasePath();
        if (state.pageBasePath !== basePath) {
            syncPageRoute();
            return;
        }
        const delay = Math.min(state.reconnectDelay, 3e4);
        state.reconnectDelay = Math.min(state.reconnectDelay * 2, 3e4);
        state.reconnectTimer = W.setTimeout(() => {
            state.reconnectTimer = null;
            if (promptsBasePath() !== basePath) {
                syncPageRoute();
                return;
            }
            connect();
        }, delay);
    }
    function connect({allowNavigation: allowNavigation = false} = {}) {
        syncPageRoute();
        if (!isPromptsPage()) return;
        const userAPIKey = elements.apiKey ? elements.apiKey.value.trim() : cfg.apiKey;
        if (!userAPIKey) {
            setMessage("Please enter the relay API Key", "error");
            if (elements.apiKey) elements.apiKey.focus();
            return;
        }
        if (!isTemporaryChatPage() || !state.shouldReconnect && !isBootstrapChatPage()) {
            disconnect();
            if (!allowNavigation) {
                if (isTemporaryChatPage()) setMessage("The bootstrap model parameter did not take effect. Click Connect to reopen the temporary chat page.", "error");
                return;
            }
            cfg.apiKey = userAPIKey;
            persistCfg();
            try {
                sessionStorage.setItem(STORAGE.connectionHandoff, JSON.stringify({
                    apiKey: userAPIKey,
                    createdAt: Date.now(),
                    promptsPath: promptsBasePath()
                }));
            } catch (_) {}
            try {
                W.location.assign(temporaryChatURL());
            } catch (_) {
                takeConnectionHandoff();
                setMessage("Unable to open the temporary chat page. Please open it manually and try again.", "error");
            }
            return;
        }
        if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) return;
        cfg.apiKey = userAPIKey;
        persistCfg();
        installPageHooks();
        installFetchHooks();
        installXhrHooks();
        if (state.reconnectTimer !== null) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }
        state.shouldReconnect = true;
        state.versionRejected = false;
        state.registered = false;
        setStatus("connecting", "Connecting");
        setMessage("");
        let socket;
        try {
            socket = new WebSocket(cfg.wsUrl);
        } catch (error) {
            scheduleReconnect();
            return;
        }
        state.socket = socket;
        state.status = "connecting";
        updateControls();
        const connectionBasePath = promptsBasePath();
        socket.onopen = () => {
            if (socket !== state.socket) return;
            if (!isTemporaryChatPage() || promptsBasePath() !== connectionBasePath) {
                disconnect();
                return;
            }
            const register = () => {
                if (socket !== state.socket) return;
                if (!isTemporaryChatPage() || promptsBasePath() !== connectionBasePath) {
                    syncPageRoute();
                    return;
                }
                websocketSendNow({
                    type: "register",
                    clientVersion: SCRIPT_VERSION,
                    apiKey: cfg.apiKey,
                    kind: EXECUTOR_KIND,
                    subscriptionTier: accountTier.value()
                });
            };
            const preparing = accountTier.refresh();
            return preparing ? preparing.then(register, register) : register();
        };
        socket.onmessage = event => {
            if (socket !== state.socket) return;
            if (promptsBasePath() !== connectionBasePath) {
                syncPageRoute();
                return;
            }
            let message;
            try {
                message = JSON.parse(String(event.data));
            } catch (_) {
                return;
            }
            handleServerMessage(message).catch(() => setMessage("Failed to process connection message. Please reconnect.", "error"));
        };
        socket.onclose = event => {
            if (socket !== state.socket) return;
            state.socket = null;
            state.registered = false;
            state.status = "disconnected";
            stopDurationTimer();
            setStatus("offline", "Disconnected");
            updateControls();
            if (event.code === CLOSE_EXECUTOR_REPLACED) {
                setMessage("This connection was replaced by a new browser connection.", "error");
                state.shouldReconnect = false;
                return;
            }
            if (event.code === CLOSE_API_KEY_CHANGED) {
                state.shouldReconnect = false;
                setMessage("API Key changed. Update the Key and reconnect.", "error");
                return;
            }
            if (event.code === CLOSE_POLICY_VIOLATION) {
                state.shouldReconnect = false;
                setMessage(event.reason || "Registration rejected", "error");
                return;
            }
            scheduleReconnect();
        };
        socket.onerror = () => {
            if (socket !== state.socket) return;
            setMessage("Connection failed. Check your network or try again later.", "error");
        };
    }
    async function handleServerMessage(message) {
        if (!isTemporaryChatPage()) {
            disconnect();
            return;
        }
        if (message.type === "registered") {
            state.registered = true;
            state.connectedAt = Date.now();
            state.reconnectDelay = 1e3;
            state.status = "connected";
            accountTier.report();
            startDurationTimer();
            setStatus("online", "Connected");
            setMessage("");
            updateControls();
            return;
        }
        if (message.type === "error") {
            const text = String(message.message || "Connection failed");
            if (message.code === "client_version_outdated") {
                state.versionRejected = true;
                state.shouldReconnect = false;
                setStatus("error", "Version expired");
                setMessage(text, "error");
                if (state.socket) state.socket.close(1008, "client version outdated");
                return;
            }
            setMessage(text, "error");
            return;
        }
        if (message.type === "cancel") {
            const rid = String(message.requestId || "");
            const active = state.active.get(rid);
            if (active) {
                try {
                    active.controller.abort();
                } catch (_) {}
            }
            return;
        }
        if (message.type === "request") {
            await handleRequest(message);
        }
    }
    function disconnect() {
        state.shouldReconnect = false;
        for (const active of state.active.values()) active.controller.abort();
        disarmHandoff();
        if (state.reconnectTimer !== null) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }
        if (state.socket) {
            try {
                state.socket.close(1e3, "Client disconnected");
            } catch (_) {}
            state.socket = null;
        }
        state.registered = false;
        state.status = "disconnected";
        stopDurationTimer();
        setStatus("offline", "Disconnected");
        setMessage("");
        updateControls();
    }
    function syncPageRoute() {
        const basePath = promptsBasePath();
        const accountChanged = state.pageBasePath !== basePath;
        state.pageBasePath = basePath;
        updateAccountMenu();
        const visible = isPromptsPage();
        if (visible && !elements.root && document.readyState !== "loading") buildPanel();
        if (elements.root) {
            const wasHidden = elements.root.hidden;
            elements.root.hidden = !visible;
            if (visible && wasHidden) void checkForUpdate();
        }
        if (isTemporaryChatPage() && !accountChanged) return;
        const wasRunning = state.socket || state.shouldReconnect || state.active.size;
        disconnect();
        state.service = null;
        state.template = null;
        state.bootstrapPromise = null;
        if (accountChanged || !visible) accountTier.reset();
        stopMobileKeepAlive();
        stopPictureInPictureKeepAlive();
        updateKeepAliveControls();
        if (visible && wasRunning) {
            setMessage(accountChanged ? "Google account switched. Please reconnect." : "Left the temporary chat page. Please reconnect.", "error");
        }
    }
    function installRouteHooks() {
        for (const name of [ "pushState", "replaceState" ]) {
            const original = W.history[name];
            W.history[name] = function(...args) {
                const result = original.apply(this, args);
                syncPageRoute();
                return result;
            };
        }
        W.addEventListener("popstate", syncPageRoute);
        W.addEventListener("hashchange", syncPageRoute);
        W.navigation?.addEventListener("currententrychange", syncPageRoute);
    }
    let keepAliveAudioSource = "";
    function createKeepAliveAudioSource() {
        if (keepAliveAudioSource) return keepAliveAudioSource;
        const sampleCount = KEEPALIVE_AUDIO_SAMPLE_RATE * KEEPALIVE_AUDIO_DURATION_SECONDS;
        const dataLength = sampleCount * 2;
        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);
        const writeText = (offset, value) => {
            for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
        };
        writeText(0, "RIFF");
        view.setUint32(4, 36 + dataLength, true);
        writeText(8, "WAVE");
        writeText(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, KEEPALIVE_AUDIO_SAMPLE_RATE, true);
        view.setUint32(28, KEEPALIVE_AUDIO_SAMPLE_RATE * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeText(36, "data");
        view.setUint32(40, dataLength, true);
        for (let i = 0; i < sampleCount; i++) {
            const phase = 2 * Math.PI * KEEPALIVE_AUDIO_FREQUENCY * i / KEEPALIVE_AUDIO_SAMPLE_RATE;
            view.setInt16(44 + i * 2, Math.round(KEEPALIVE_AUDIO_AMPLITUDE * Math.sin(phase)), true);
        }
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        keepAliveAudioSource = `data:audio/wav;base64,${btoa(binary)}`;
        return keepAliveAudioSource;
    }
    function setupMediaSession() {
        if (!("mediaSession" in navigator)) return;
        try {
            navigator.mediaSession.playbackState = "playing";
            if (typeof MediaMetadata === "function") {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: "Mobile keep-alive",
                    artist: "PG Executor",
                    album: "Playground Executor"
                });
            }
            navigator.mediaSession.setActionHandler("play", () => void changeKeepAliveMode("audio"));
            navigator.mediaSession.setActionHandler("pause", () => void changeKeepAliveMode("none"));
            navigator.mediaSession.setActionHandler("stop", () => void changeKeepAliveMode("none"));
            navigator.mediaSession.setActionHandler("previoustrack", null);
            navigator.mediaSession.setActionHandler("nexttrack", null);
            navigator.mediaSession.setActionHandler("seekbackward", null);
            navigator.mediaSession.setActionHandler("seekforward", null);
        } catch (_) {}
    }
    function clearMediaSession() {
        if (!("mediaSession" in navigator)) return;
        try {
            navigator.mediaSession.playbackState = "none";
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.setActionHandler("play", null);
            navigator.mediaSession.setActionHandler("pause", null);
            navigator.mediaSession.setActionHandler("stop", null);
        } catch (_) {}
    }
    function playKeepAliveMedia(media) {
        const playback = media.play();
        let timeout;
        const deadline = new Promise((_, reject) => {
            timeout = W.setTimeout(() => {
                media.pause();
                reject(Object.assign(new Error("Media playback did not start within 10s"), {
                    name: "TimeoutError"
                }));
            }, 1e4);
        });
        return Promise.race([ playback, deadline ]).finally(() => W.clearTimeout(timeout));
    }
    function configureKeepAliveAudioLoop(audio) {
        let pending = null;
        audio.loop = false;
        const rewind = () => {
            if (state.keepAliveAudio !== audio || state.keepAliveMode !== "audio" || audio.error) return;
            const duration = audio.duration;
            if (!Number.isFinite(duration) || duration <= KEEPALIVE_AUDIO_REWIND_LEAD_SECONDS + KEEPALIVE_AUDIO_REWIND_TARGET_SECONDS) return;
            const threshold = duration - KEEPALIVE_AUDIO_REWIND_LEAD_SECONDS;
            if (pending) {
                if (!audio.paused && !audio.seeking && audio.currentTime > KEEPALIVE_AUDIO_REWIND_TARGET_SECONDS + .05 && audio.currentTime < threshold) pending = null;
                return;
            }
            if (!audio.ended && (audio.paused || audio.seeking || audio.currentTime < threshold)) return;
            const attempt = {};
            pending = attempt;
            const failed = () => {
                if (state.keepAliveAudio !== audio || state.keepAliveMode !== "audio" || pending !== attempt) return;
                pending = null;
                audio.pause();
                setMessage("Audio keep-alive was interrupted. Click the play button to retry.", "error");
                updateKeepAliveControls();
            };
            try {
                audio.currentTime = KEEPALIVE_AUDIO_REWIND_TARGET_SECONDS;
                Promise.resolve(audio.play()).catch(failed);
            } catch (_) {
                failed();
            }
        };
        audio.addEventListener("timeupdate", rewind);
        audio.addEventListener("ended", rewind);
        audio.addEventListener("pause", () => {
            pending = null;
        });
        audio.addEventListener("error", () => {
            pending = null;
        });
    }
    async function startMobileKeepAlive() {
        let audio = state.keepAliveAudio;
        if (audio && !audio.paused && !audio.error) return true;
        if (!audio) {
            audio = document.createElement("audio");
            audio.src = createKeepAliveAudioSource();
            configureKeepAliveAudioLoop(audio);
            audio.preload = "auto";
            audio.playsInline = true;
            audio.setAttribute("playsinline", "true");
            audio.volume = 1;
            audio.controls = false;
            audio.className = "pg-keepalive-audio";
            for (const eventName of [ "pause", "error" ]) {
                audio.addEventListener(eventName, () => {
                    if (state.keepAliveAudio !== audio) return;
                    if ("mediaSession" in navigator) {
                        try {
                            navigator.mediaSession.playbackState = "paused";
                        } catch (_) {}
                    }
                    if (!state.keepAliveTransitioning && state.keepAliveMode === "audio") {
                        setMessage("Audio keep-alive was interrupted. Click the play button to retry.", "error");
                    }
                    updateKeepAliveControls();
                });
            }
            document.body.appendChild(audio);
            state.keepAliveAudio = audio;
        }
        try {
            if (audio.error) audio.load();
            await playKeepAliveMedia(audio);
            if (audio.paused) throw new Error("Audio remained paused after play()");
        } catch (error) {
            setMessage(error.name === "NotAllowedError" ? "Click the play button next to Background keep-alive to start audio." : "Audio playback failed. Click the play button to retry.", "error");
            return false;
        }
        setupMediaSession();
        setMessage("");
        return true;
    }
    function stopMobileKeepAlive() {
        const audio = state.keepAliveAudio;
        if (!audio) return;
        state.keepAliveAudio = null;
        try {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
            audio.remove();
        } catch (_) {}
        clearMediaSession();
    }
    const NATIVE_PIP_VIDEO = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANlbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAH0AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAApB0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAH0AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAUAAAAC0AAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAB9AAAAAAAABAAAAAAIIbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAACAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABs21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAXNzdGJsAAAAu3N0c2QAAAAAAAAAAQAAAKthdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAUAAtABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMSBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAAMWF2Y0MBQsAe/+EAGWdCwB7ZAUGfnwEQAAADABAAAAMAQPFi5IABAAVoy4CUsgAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAPhAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAQAAAgAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAQAAAAAQAAAFRzdHN6AAAAAAAAAAAAAAAQAAADPAAAAAsAAAALAAAACwAAAAsAAAALAAAACwAAAAsAAAALAAAACwAAAAsAAAALAAAACwAAAAsAAAALAAAACwAAABRzdGNvAAAAAAAAAAEAAAOVAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2My4xLjEwMQAAAAhmcmVlAAAD6W1kYXQAAAJwBgX//2zcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY1IHIzMjIyIGIzNTYwNWEgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI1IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgxOjB4MTExIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9NiBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj0yIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0zNS4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAxGWIhAV8RigACdHH0nJycnJycnJycnJycnJycnJycnXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXgAAAAHQZo4CvgPGAAAAAdBmlQCvgPGAAAAB0GaYBXwHjAAAAAHQZqAFfAeMAAAAAdBmqAV8B4wAAAAB0GawBXwHjAAAAAHQZrgFfAeMAAAAAdBmwAV8B4wAAAAB0GbIBXwHjAAAAAHQZtAFfAeMAAAAAdBm2AV8B4wAAAAB0GbgBTwHjAAAAAHQZugFPAeMAAAAAdBm8AU8B4wAAAAB0Gb4BLwHjA=";
    function prepareNativePictureInPictureVideo() {
        const video = elements.keepAliveVideo;
        if (video.src === NATIVE_PIP_VIDEO) return video;
        cleanupPictureInPictureKeepAlive();
        video.srcObject = null;
        video.muted = true;
        video.loop = true;
        video.preload = "auto";
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.src = NATIVE_PIP_VIDEO;
        video.load();
        return video;
    }
    async function startNativePictureInPictureKeepAlive() {
        if (isPictureInPictureActive()) return true;
        let playback;
        let stage = "playback";
        try {
            const video = prepareNativePictureInPictureVideo();
            const ready = video.readyState >= 2;
            playback = playKeepAliveMedia(video);
            if (!ready) {
                await playback;
                setMessage("Video is ready. Click the play button again to open Picture-in-Picture.", "error");
                return false;
            }
            stage = "entry";
            let entry;
            if (supportsWebKitPictureInPicture(video)) {
                video.webkitSetPresentationMode("picture-in-picture");
            } else if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function") {
                entry = video.requestPictureInPicture();
            } else {
                throw Object.assign(new Error("Picture-in-picture is not supported for this video"), {
                    name: "NotSupportedError"
                });
            }
            await Promise.all([ playback, entry ]);
            if (!await waitFor(isPictureInPictureActive, 2e3, 50)) {
                throw Object.assign(new Error("Browser did not enter picture-in-picture"), {
                    name: "PictureInPictureNotEntered"
                });
            }
            setMessage("");
            return true;
        } catch (error) {
            void playback?.catch(() => {});
            elements.keepAliveVideo?.pause();
            const reason = /^[A-Za-z]{1,48}$/.test(error?.name || "") ? error.name : "UnknownError";
            setMessage(stage === "playback" ? `Video playback failed (${reason}). Click the play button again to retry.` : `Failed to open Picture-in-Picture (${reason}). Click the play button again to retry.`, "error");
            return false;
        }
    }
    function supportsPictureInPictureKeepAlive() {
        const video = elements.keepAliveVideo;
        const supportsStandardAPI = Boolean(document.pictureInPictureEnabled && typeof video?.requestPictureInPicture === "function");
        const supportsWebKitAPI = Boolean(typeof video?.webkitSupportsPresentationMode === "function" && typeof video?.webkitSetPresentationMode === "function");
        return Boolean(video && (isIOSDevice() || typeof HTMLCanvasElement.prototype.captureStream === "function") && (supportsStandardAPI || supportsWebKitAPI));
    }
    function preparePictureInPictureVideo() {
        const video = elements.keepAliveVideo;
        if (state.pipStream && video.srcObject === state.pipStream) return true;
        const canvas = document.createElement("canvas");
        canvas.width = PIP_WIDTH;
        canvas.height = PIP_HEIGHT;
        if (!drawPictureInPictureFrame(canvas, 0)) return false;
        const stream = canvas.captureStream(PIP_FRAME_RATE);
        state.pipCanvas = canvas;
        state.pipStream = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.srcObject = stream;
        return true;
    }
    function drawPictureInPictureFrame(canvas, frameNumber) {
        const context = canvas.getContext("2d");
        if (!context) return false;
        if (frameNumber === 0) {
            context.fillStyle = "#101012";
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.fillStyle = frameNumber % 2 === 0 ? "#101012" : "#111113";
        context.fillRect(canvas.width - 2, canvas.height - 2, 2, 2);
        return true;
    }
    function isPictureInPictureActive() {
        const video = elements.keepAliveVideo;
        return Boolean(video && (document.pictureInPictureElement === video || video.webkitPresentationMode === "picture-in-picture"));
    }
    function supportsWebKitPictureInPicture(video) {
        if (typeof video.webkitSupportsPresentationMode !== "function" || typeof video.webkitSetPresentationMode !== "function") {
            return false;
        }
        try {
            return video.webkitSupportsPresentationMode("picture-in-picture");
        } catch (_) {
            return false;
        }
    }
    function startPictureInPictureFrameTimer() {
        if (state.pipFrameTimer !== null) return;
        let frame = 0;
        state.pipFrameTimer = W.setInterval(() => {
            if (!state.pipCanvas || !isPictureInPictureActive()) return;
            frame += 1;
            drawPictureInPictureFrame(state.pipCanvas, frame);
        }, PIP_FRAME_INTERVAL_MS);
    }
    function stopPictureInPictureFrameTimer() {
        if (state.pipFrameTimer !== null) {
            clearInterval(state.pipFrameTimer);
            state.pipFrameTimer = null;
        }
    }
    async function startPictureInPictureKeepAlive() {
        if (isIOSDevice()) return startNativePictureInPictureKeepAlive();
        const video = elements.keepAliveVideo;
        if (isPictureInPictureActive()) return true;
        let playback;
        try {
            if (!video || !supportsPictureInPictureKeepAlive() || !preparePictureInPictureVideo()) {
                setMessage("This browser does not support Picture-in-Picture keep-alive", "error");
                return false;
            }
            video.muted = true;
            const hadMetadata = video.readyState >= 1;
            playback = playKeepAliveMedia(video);
            if (!hadMetadata) {
                await playback;
                if (typeof video.webkitSetPresentationMode === "function") {
                    setMessage("Click the play button next to Background keep-alive to open Picture-in-Picture.", "error");
                    return false;
                }
            }
            let entry;
            if (supportsWebKitPictureInPicture(video)) {
                video.webkitSetPresentationMode("picture-in-picture");
            } else if (typeof video.requestPictureInPicture === "function") {
                entry = video.requestPictureInPicture();
            } else {
                await playback;
                setMessage("This browser does not support Picture-in-Picture keep-alive", "error");
                return false;
            }
            await Promise.all([ playback, entry ]);
            if (!await waitFor(isPictureInPictureActive, 2e3, 50)) {
                throw new Error("Browser did not enter picture-in-picture");
            }
        } catch (error) {
            void playback?.catch(() => {});
            setMessage("Picture-in-Picture failed to open. Click the play button to retry.", "error");
            return false;
        }
        startPictureInPictureFrameTimer();
        setMessage("");
        return true;
    }
    function cleanupPictureInPictureKeepAlive() {
        stopPictureInPictureFrameTimer();
        if (state.pipStream) {
            try {
                for (const track of state.pipStream.getTracks()) track.stop();
            } catch (_) {}
            state.pipStream = null;
        }
        state.pipCanvas = null;
        const video = elements.keepAliveVideo;
        if (video?.src === NATIVE_PIP_VIDEO) {
            video.pause();
            video.removeAttribute("src");
            video.load();
        }
    }
    function stopPictureInPictureKeepAlive() {
        const video = elements.keepAliveVideo;
        if (!video || !state.pipStream && !video.srcObject && video.src !== NATIVE_PIP_VIDEO && !isPictureInPictureActive()) return;
        try {
            if (isPictureInPictureActive()) {
                if (typeof video.webkitSetPresentationMode === "function") {
                    video.webkitSetPresentationMode("inline");
                } else if (document.exitPictureInPicture) {
                    void document.exitPictureInPicture().catch(() => {});
                }
            }
        } catch (_) {}
        cleanupPictureInPictureKeepAlive();
        try {
            video.pause();
            video.srcObject = null;
        } catch (_) {}
    }
    function normalizeKeepAliveMode(mode) {
        if (mode === "audio" || mode === "pip") return mode;
        return "none";
    }
    async function changeKeepAliveMode(requestedMode) {
        if (!isPromptsPage()) return false;
        const nextMode = normalizeKeepAliveMode(requestedMode);
        if (state.keepAliveTransitioning) {
            updateKeepAliveControls();
            return false;
        }
        state.keepAliveTransitioning = true;
        state.keepAliveMode = nextMode;
        updateKeepAliveControls();
        try {
            if (nextMode !== "audio") stopMobileKeepAlive();
            if (nextMode !== "pip") stopPictureInPictureKeepAlive();
            try {
                localStorage.setItem(STORAGE.keepAlive, nextMode);
            } catch (_) {}
            if (nextMode === "audio") return await startMobileKeepAlive();
            if (nextMode === "pip") return await startPictureInPictureKeepAlive();
            setMessage("");
            return true;
        } finally {
            state.keepAliveTransitioning = false;
            updateKeepAliveControls();
        }
    }
    function updateKeepAliveControls() {
        const mode = state.keepAliveMode;
        if (elements.keepAliveMode) {
            elements.keepAliveMode.value = mode;
            elements.keepAliveMode.disabled = state.keepAliveTransitioning;
        }
        if (elements.keepAliveStart) {
            const running = mode === "audio" ? state.keepAliveAudio && !state.keepAliveAudio.paused && !state.keepAliveAudio.error : mode === "pip" && isPictureInPictureActive();
            elements.keepAliveStart.hidden = mode === "none" || Boolean(running);
            elements.keepAliveStart.disabled = state.keepAliveTransitioning;
        }
        if (elements.message && (!elements.message.textContent || elements.message.dataset.state === "keepalive")) {
            setMessage();
        }
    }
    function handlePictureInPictureExit() {
        cleanupPictureInPictureKeepAlive();
        if (!state.keepAliveTransitioning && state.keepAliveMode === "pip") {
            state.keepAliveMode = "none";
            if (elements.keepAliveMode) elements.keepAliveMode.value = "none";
            try {
                localStorage.setItem(STORAGE.keepAlive, "none");
            } catch (_) {}
        }
        updateKeepAliveControls();
    }
    function applyThemeMode(requestedMode, persist = true) {
        const mode = requestedMode === "light" || requestedMode === "dark" ? requestedMode : "system";
        const dark = mode === "dark" || mode === "system" && themeMediaQuery.matches;
        elements.root.dataset.theme = dark ? "dark" : "light";
        elements.root.dataset.themeMode = mode;
        for (const option of elements.themeOptions) {
            option.setAttribute("aria-pressed", String(option.dataset.themeOption === mode));
        }
        if (!persist) return;
        try {
            if (mode === "system") localStorage.removeItem(STORAGE.theme); else localStorage.setItem(STORAGE.theme, mode);
        } catch (_) {}
    }
    function handleSystemThemeChange() {
        if (elements.root?.dataset.themeMode === "system") {
            applyThemeMode("system", false);
        }
    }
    function addActivity(activity) {
        state.activities.unshift({
            ...activity,
            at: new Date,
            id: ++state.activitySequence,
            errorExpanded: false
        });
        if (state.activities.length > MAX_ACTIVITY_ROWS) {
            state.activities.length = MAX_ACTIVITY_ROWS;
        }
        renderActivity();
    }
    function formatDuration(ms) {
        if (ms == null || !Number.isFinite(ms)) return "-";
        const duration = Math.max(0, ms);
        return duration < 1e3 ? `${Math.round(duration)} ms` : `${(duration / 1e3).toFixed(2)} s`;
    }
    function tokenUsageElement(usage) {
        const hasCount = value => Number.isSafeInteger(value) && value >= 0;
        if (!hasCount(usage.inputTokens) && !hasCount(usage.outputTokens)) {
            return h("span", {
                class: "pg-token-usage",
                text: "-"
            });
        }
        const group = h("span", {
            class: "pg-token-usage"
        });
        for (const [key, label, name] of [ [ "inputTokens", "Input", "move-up" ], [ "outputTokens", "Output", "move-down" ] ]) {
            const value = hasCount(usage[key]) ? usage[key].toLocaleString("en-US") : "-";
            const arrow = icon(name);
            arrow.setAttribute("viewBox", "6 0 12 24");
            group.appendChild(h("span", {
                class: `pg-token-value pg-token-${key === "inputTokens" ? "input" : "output"}`,
                title: `${label} Token`,
                "aria-label": `${label} Token ${value}`
            }, [ arrow, h("span", {
                text: value
            }) ]));
        }
        return group;
    }
    function renderActivity() {
        if (!elements.activityBody) return;
        if (elements.clearActivity) elements.clearActivity.disabled = state.activities.length === 0;
        if (state.activities.length === 0) {
            const row = document.createElement("tr");
            row.className = "pg-empty-row";
            const cell = document.createElement("td");
            cell.colSpan = 6;
            cell.textContent = "No requests yet";
            row.appendChild(cell);
            elements.activityBody.replaceChildren(row);
            return;
        }
        const rows = [];
        for (const activity of state.activities) {
            const row = document.createElement("tr");
            row.className = "pg-activity-row";
            const cellClasses = [ "pg-activity-time", "pg-activity-model", "pg-activity-mode", "pg-activity-result-cell", "pg-numeric pg-activity-tokens", "pg-numeric pg-activity-duration" ];
            const values = [ activity.at.toLocaleTimeString("zh-CN", {
                hour12: false
            }), activity.model || "-", activity.stream ? "Stream" : "Non-stream", activity.result === "success" ? "Success" : activity.error && activity.error.status >= 200 && activity.error.status < 300 ? "Abnormal" : "Failed", "", formatDuration(activity.durationMS) ];
            values.forEach((value, index) => {
                const cell = document.createElement("td");
                cell.className = cellClasses[index];
                if (index === 2) {
                    const badge = document.createElement("span");
                    badge.className = "pg-mode-badge";
                    badge.textContent = value;
                    cell.appendChild(badge);
                } else if (index === 3) {
                    if (activity.error) {
                        const detailsID = `pg-activity-error-${activity.id}`;
                        const toggle = h("button", {
                            type: "button",
                            class: "pg-result-badge pg-result-error pg-error-details-button",
                            "aria-label": "View error details",
                            title: "View error details",
                            "aria-expanded": String(activity.errorExpanded),
                            "aria-controls": detailsID
                        }, [ `${value} ${activity.error.status}`, icon(activity.errorExpanded ? "chevron-up" : "chevron-down") ]);
                        toggle.addEventListener("click", () => {
                            activity.errorExpanded = !activity.errorExpanded;
                            toggle.setAttribute("aria-expanded", String(activity.errorExpanded));
                            toggle.lastElementChild.replaceWith(icon(activity.errorExpanded ? "chevron-up" : "chevron-down"));
                            elements.activityBody.querySelector(`#${detailsID}`).hidden = !activity.errorExpanded;
                        });
                        cell.appendChild(toggle);
                    } else {
                        cell.appendChild(h("span", {
                            class: `pg-result-badge ${activity.result === "success" ? "pg-result-success" : "pg-result-error"}`,
                            text: value
                        }));
                    }
                } else if (index === 4) {
                    cell.appendChild(tokenUsageElement(activity));
                } else {
                    cell.textContent = value;
                }
                if (index === 1) cell.title = value;
                row.appendChild(cell);
            });
            rows.push(row);
            if (activity.error) {
                const detailRow = document.createElement("tr");
                detailRow.id = `pg-activity-error-${activity.id}`;
                detailRow.className = "pg-activity-error-row";
                detailRow.hidden = !activity.errorExpanded;
                const detailCell = document.createElement("td");
                detailCell.colSpan = 6;
                const detail = document.createElement("div");
                detail.className = "pg-activity-error-detail";
                const metadata = document.createElement("dl");
                metadata.className = "pg-activity-error-metadata";
                const fields = [ [ "Request ID", activity.requestID || "-" ], [ "Status code", String(activity.error.status) ], [ "Error code", activity.error.code || "-" ], [ "Error message", formatActivityErrorMessage(activity.error) ] ];
                for (const [label, value] of fields) {
                    const term = document.createElement("dt");
                    term.textContent = label;
                    const description = document.createElement("dd");
                    description.textContent = value;
                    metadata.append(term, description);
                }
                detail.appendChild(metadata);
                if (activity.error.body) {
                    const bodyLabel = document.createElement("div");
                    bodyLabel.className = "pg-activity-error-body-label";
                    bodyLabel.textContent = "Raw response";
                    const body = document.createElement("pre");
                    body.className = "pg-activity-error-body";
                    body.textContent = formatErrorBody(truncateErrorBodyForDisplay(activity.error.body));
                    detail.append(bodyLabel, body);
                }
                detailCell.appendChild(detail);
                detailRow.appendChild(detailCell);
                rows.push(detailRow);
            }
        }
        elements.activityBody.replaceChildren(...rows);
    }
    function isNewerScriptVersion(latest, current) {
        if (!/^\d+\.\d+\.\d+$/.test(latest) || !/^\d+\.\d+\.\d+$/.test(current)) return false;
        const available = latest.split(".").map(Number);
        const installed = current.split(".").map(Number);
        if (![ ...available, ...installed ].every(Number.isSafeInteger)) return false;
        for (let index = 0; index < available.length; index++) {
            if (available[index] !== installed[index]) return available[index] > installed[index];
        }
        return false;
    }
    function checkForUpdate() {
        if (!isPromptsPage() || !elements.updateNotice || typeof W.fetch !== "function") return;
        if (state.updateCheckPromise) return state.updateCheckPromise;
        const controller = new AbortController;
        const timeout = W.setTimeout(() => controller.abort(), 5e3);
        state.updateCheckPromise = (async () => {
            try {
                const fetch = W.fetch.__pgOriginal || W.fetch;
                const response = await fetch.call(W, SCRIPT_UPDATE_URL, {
                    cache: "no-store",
                    credentials: "omit",
                    referrerPolicy: "no-referrer",
                    signal: controller.signal
                });
                if (!response.ok) return;
                const metadata = await response.text();
                const latest = metadata.match(/^\/\/\s*@version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1];
                if (!latest) return;
                const available = isNewerScriptVersion(latest, SCRIPT_VERSION);
                elements.updateNotice.hidden = !available;
                if (available) elements.updateVersion.textContent = `New version ${latest}`;
            } catch (_) {}
        })().finally(() => {
            W.clearTimeout(timeout);
            state.updateCheckPromise = null;
        });
        return state.updateCheckPromise;
    }
    function setMessage(text = "", stateName = "") {
        if (!elements.message) return;
        if (!text && !state.keepAliveTransitioning) {
            const mode = state.keepAliveMode;
            const running = mode === "audio" ? state.keepAliveAudio && !state.keepAliveAudio.paused && !state.keepAliveAudio.error : mode === "pip" && isPictureInPictureActive();
            if (!running && (mode === "audio" || mode === "pip")) {
                text = mode === "audio" ? "Click the play button next to Background keep-alive to start audio." : "Click the play button next to Background keep-alive to open Picture-in-Picture.";
                stateName = "keepalive";
            }
        }
        elements.message.textContent = text;
        if (stateName) elements.message.dataset.state = stateName; else delete elements.message.dataset.state;
    }
    function updateControls() {
        const connected = state.registered;
        if (elements.connect) {
            elements.connect.textContent = connected ? "Connected" : "Connect";
            elements.connect.disabled = connected || state.status === "connecting";
        }
        if (elements.disconnect) elements.disconnect.disabled = !state.socket;
        if (elements.activeCount) elements.activeCount.textContent = String(state.active.size);
        if (elements.successCount) elements.successCount.textContent = String(state.successCount);
        if (elements.failureCount) elements.failureCount.textContent = String(state.failureCount);
    }
    function updateAccountMenu() {
        const current = Number(currentAccountIndex());
        for (const option of elements.accountOptions || []) {
            const selected = Number(option.dataset.accountIndex) === current;
            option.disabled = selected;
            option.setAttribute("aria-current", String(selected));
            option.setAttribute("aria-label", `Account ${option.dataset.accountIndex}${selected ? " (current)" : ""}`);
            option.querySelector(".pg-account-current").hidden = !selected;
        }
    }
    function switchAccount(index) {
        if (!isPromptsPage() || !Number.isInteger(index) || index < 0 || index > 5 || index === Number(currentAccountIndex())) return;
        disconnect();
        if (elements.accountSwitch) elements.accountSwitch.open = false;
        cfg.apiKey = elements.apiKey ? elements.apiKey.value.trim() : cfg.apiKey;
        persistCfg();
        try {
            sessionStorage.removeItem(STORAGE.connectionHandoff);
        } catch (_) {}
        try {
            W.location.assign(`https://aistudio.google.com/u/${index}/prompts/new_chat?temporary=true&model=${BOOTSTRAP_MODEL}`);
        } catch (_) {
            setMessage("Unable to switch Google account. Please try again.", "error");
        }
    }
    const PANEL_CSS = `\n  :host {\n    all: initial;\n    color-scheme: light;\n    --pg-background: #f7f7f8;\n    --pg-foreground: #18181b;\n    --pg-card: #ffffff;\n    --pg-secondary: #f0f0f1;\n    --pg-muted: #f1f1f2;\n    --pg-muted-foreground: #6b6b72;\n    --pg-border: #dedee2;\n    --pg-border-strong: #c9c9cf;\n    --pg-primary: #18181b;\n    --pg-primary-foreground: #ffffff;\n    --pg-success: #15803d;\n    --pg-warning: #b26a00;\n    --pg-danger: #dc2626;\n    --pg-info: #2563eb;\n    --pg-ring: #18181b;\n    --pg-header-background: rgb(255 255 255 / 0.92);\n    --pg-status-neutral: #a1a1aa;\n    --pg-control-foreground: #3f3f46;\n    --pg-primary-hover: #303034;\n    --pg-toggle-track-background: #d4d4d8;\n    --pg-toggle-knob-background: #ffffff;\n    --pg-shadow-color: rgb(24 24 27 / 0.22);\n  }\n  :host([data-theme="dark"]) {\n    color-scheme: dark;\n    --pg-background: #101012;\n    --pg-foreground: #f4f4f5;\n    --pg-card: #18181b;\n    --pg-secondary: #242427;\n    --pg-muted: #202024;\n    --pg-muted-foreground: #a1a1aa;\n    --pg-border: #303034;\n    --pg-border-strong: #45454b;\n    --pg-primary: #ffffff;\n    --pg-primary-foreground: #111113;\n    --pg-success: #4ade80;\n    --pg-warning: #facc15;\n    --pg-danger: #f87171;\n    --pg-info: #60a5fa;\n    --pg-ring: #e4e4e7;\n    --pg-header-background: rgb(24 24 27 / 0.92);\n    --pg-status-neutral: #71717a;\n    --pg-control-foreground: #d4d4d8;\n    --pg-primary-hover: #e4e4e7;\n    --pg-toggle-track-background: #45454b;\n    --pg-toggle-knob-background: #f4f4f5;\n    --pg-shadow-color: rgb(0 0 0 / 0.48);\n  }\n\n  :host([hidden]) { display: none !important; }\n\n  :host {\n    display: block;\n    position: fixed;\n    right: 20px;\n    bottom: 20px;\n    z-index: 2147483000;\n    width: min(640px, calc(100vw - 32px));\n    max-height: calc(100vh - 40px);\n    max-height: calc(100dvh - 40px);\n    overflow: auto;\n    border: 1px solid var(--pg-border);\n    border-radius: 8px;\n    background: var(--pg-background);\n    color: var(--pg-foreground);\n    box-shadow: 0 12px 40px var(--pg-shadow-color);\n    font-family: Inter, "Noto Sans SC", "Segoe UI", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif;\n    font-size: 13px;\n    line-height: 1.5;\n    text-align: left;\n    text-rendering: optimizeLegibility;\n    overscroll-behavior: contain;\n  }\n\n  *, *::before, *::after { box-sizing: border-box; letter-spacing: 0; }\n  [hidden] { display: none !important; }\n  svg { width: 16px; height: 16px; flex: 0 0 auto; }\n\n  button, input, select, summary { font: inherit; }\n\n  :where(button, .pg-account-switch > summary) {\n    display: inline-flex;\n    align-items: center;\n    justify-content: center;\n    gap: 6px;\n    min-height: 38px;\n    padding: 0 14px;\n    border: 1px solid var(--pg-border);\n    border-radius: 6px;\n    background: var(--pg-card);\n    color: var(--pg-foreground);\n    cursor: pointer;\n    transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;\n  }\n  :where(button:hover:not(:disabled), .pg-account-switch > summary:hover) {\n    border-color: var(--pg-border-strong);\n    background: var(--pg-secondary);\n  }\n  :where(button, input, select, summary):focus-visible {\n    outline: 2px solid var(--pg-ring);\n    outline-offset: 2px;\n  }\n  button:disabled { cursor: not-allowed; opacity: 0.48; }\n\n  .pg-app-header {\n    position: sticky;\n    top: 0;\n    z-index: 20;\n    border-bottom: 1px solid var(--pg-border);\n    background: var(--pg-header-background);\n    backdrop-filter: blur(12px);\n  }\n  .pg-app-header-inner {\n    display: flex;\n    min-height: 56px;\n    padding: 10px 16px;\n    align-items: center;\n    justify-content: space-between;\n    gap: 12px;\n    cursor: grab;\n    user-select: none;\n    touch-action: none;\n  }\n  :host([data-dragging="true"]) .pg-app-header-inner { cursor: grabbing; }\n  .pg-brand-copy { min-width: 0; flex: 1; }\n  .pg-brand-copy strong {\n    display: block;\n    overflow: hidden;\n    font-size: 15px;\n    font-weight: 700;\n    line-height: 1.3;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n  }\n  .pg-header-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }\n\n  .pg-update-notice {\n    display: flex;\n    padding: 8px 16px;\n    align-items: center;\n    justify-content: space-between;\n    gap: 12px;\n    border-top: 1px solid var(--pg-border);\n    color: var(--pg-foreground);\n    font-size: 12px;\n    line-height: 1.5;\n  }\n  .pg-update-notice[hidden] { display: none; }\n  .pg-update-notice span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n  .pg-update-notice a { flex-shrink: 0; color: var(--pg-success); text-decoration: none; font-weight: 600; }\n  .pg-update-notice a:hover { text-decoration: underline; }\n\n  .pg-theme-segmented {\n    display: inline-flex;\n    flex: 0 0 auto;\n    padding: 3px;\n    align-items: center;\n    gap: 2px;\n    border: 1px solid var(--pg-border);\n    border-radius: 7px;\n    background: var(--pg-secondary);\n  }\n  .pg-theme-segmented button {\n    display: inline-grid;\n    width: 32px;\n    min-height: 28px;\n    padding: 0;\n    place-items: center;\n    border: 0;\n    border-radius: 5px;\n    background: transparent;\n    color: var(--pg-muted-foreground);\n    font-size: 11px;\n    font-weight: 600;\n  }\n  .pg-theme-segmented button:hover:not(:disabled) {\n    border-color: transparent;\n    background: color-mix(in srgb, var(--pg-card) 65%, transparent);\n  }\n  .pg-theme-segmented button[aria-pressed="true"] {\n    background: var(--pg-card);\n    box-shadow: 0 1px 2px var(--pg-shadow-color);\n    color: var(--pg-foreground);\n  }\n\n  .pg-connection-status {\n    display: inline-flex;\n    min-height: 34px;\n    padding: 0 10px;\n    align-items: center;\n    gap: 8px;\n    border: 1px solid var(--pg-border);\n    border-radius: 6px;\n    background: var(--pg-secondary);\n    color: var(--pg-muted-foreground);\n    font-size: 12px;\n    font-weight: 600;\n    white-space: nowrap;\n  }\n  .pg-status-indicator {\n    width: 8px;\n    height: 8px;\n    flex: 0 0 auto;\n    border-radius: 50%;\n    background: var(--pg-status-neutral);\n  }\n  .pg-tier-badge {\n    min-width: 44px; max-width: 80px; justify-content: center; flex: 0 0 auto;\n    border-color: color-mix(in srgb, currentColor 20%, transparent);\n    background: color-mix(in srgb, currentColor 9%, var(--pg-card));\n  }\n  .pg-tier-badge[data-tier="0"] { color: var(--pg-warning); }\n  .pg-tier-badge[data-tier="1"] { color: var(--pg-info); }\n  .pg-tier-badge[data-tier="2"] { color: var(--pg-danger); }\n  .pg-connection-status[data-state="connecting"] {\n    border-color: color-mix(in srgb, var(--pg-warning) 22%, transparent);\n    background: color-mix(in srgb, var(--pg-warning) 8%, transparent);\n    color: var(--pg-warning);\n  }\n  .pg-connection-status[data-state="connecting"] .pg-status-indicator { background: var(--pg-warning); }\n  .pg-connection-status[data-state="online"] {\n    border-color: color-mix(in srgb, var(--pg-success) 20%, transparent);\n    background: color-mix(in srgb, var(--pg-success) 8%, transparent);\n    color: var(--pg-success);\n  }\n  .pg-connection-status[data-state="online"] .pg-status-indicator { background: var(--pg-success); }\n  .pg-connection-status[data-state="error"] {\n    border-color: color-mix(in srgb, var(--pg-danger) 20%, transparent);\n    background: color-mix(in srgb, var(--pg-danger) 7%, transparent);\n    color: var(--pg-danger);\n  }\n  .pg-connection-status[data-state="error"] .pg-status-indicator { background: var(--pg-danger); }\n\n  .pg-app-main { display: grid; padding: 16px; gap: 16px; container-type: inline-size; }\n  :host([data-collapsed="true"]) .pg-app-main { display: none; }\n\n  .pg-panel { min-width: 0; }\n\n  .pg-connection-form {\n    display: grid;\n    grid-template-columns: minmax(0, 1fr) auto;\n    align-items: end;\n    gap: 12px;\n  }\n  .pg-key-field {\n    display: flex;\n    min-width: 0;\n    flex-direction: column;\n    gap: 7px;\n    color: var(--pg-control-foreground);\n    font-size: 12px;\n    font-weight: 600;\n  }\n  .pg-key-input-wrap { display: grid; grid-template-columns: minmax(0, 1fr) auto; }\n  .pg-key-entry { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr); align-items: center; }\n  .pg-tier-mobile { display: none; }\n  .pg-key-input-wrap input {\n    width: 100%;\n    min-width: 0;\n    height: 40px;\n    padding: 0 11px;\n    border: 1px solid var(--pg-border-strong);\n    border-right: 0;\n    border-radius: 6px 0 0 6px;\n    background: var(--pg-card);\n    color: var(--pg-foreground);\n    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;\n    font-size: 13px;\n    outline: none;\n    transition: border-color 150ms ease, box-shadow 150ms ease;\n  }\n  .pg-key-input-wrap:focus-within input,\n  .pg-key-input-wrap:focus-within .pg-input-action { border-color: var(--pg-ring); }\n  .pg-key-input-wrap:focus-within {\n    border-radius: 6px;\n    box-shadow: 0 0 0 1px var(--pg-ring);\n  }\n  .pg-key-input-wrap input:focus-visible,\n  .pg-input-action:focus-visible { outline: none; }\n  .pg-input-action {\n    width: 40px;\n    min-height: 40px;\n    padding: 0;\n    height: 40px;\n    border-color: var(--pg-border-strong);\n    border-radius: 0 6px 6px 0;\n    background: var(--pg-secondary);\n    font-size: 12px;\n    font-weight: 600;\n  }\n\n  .pg-connection-actions { display: flex; gap: 8px; }\n  .pg-connection-actions button { min-width: 82px; height: 40px; }\n  .pg-primary-button {\n    border-color: var(--pg-primary);\n    background: var(--pg-primary);\n    color: var(--pg-primary-foreground);\n    font-weight: 600;\n  }\n  .pg-primary-button:hover:not(:disabled) {\n    border-color: var(--pg-primary-hover);\n    background: var(--pg-primary-hover);\n  }\n  .pg-outline-button { background: var(--pg-card); }\n\n  .pg-account-switch { position: relative; min-width: 82px; }\n  .pg-account-switch > summary { height: 40px; list-style: none; white-space: nowrap; }\n  .pg-account-switch > summary::-webkit-details-marker { display: none; }\n  .pg-account-switch > summary svg { width: 14px; height: 14px; transition: transform 150ms ease; }\n  .pg-account-switch[open] > summary svg { transform: rotate(180deg); }\n  .pg-account-menu {\n    position: absolute;\n    top: calc(100% + 6px);\n    right: 0;\n    z-index: 30;\n    display: grid;\n    grid-template-columns: repeat(6, minmax(0, 1fr));\n    gap: 4px;\n    width: min(288px, calc(100vw - 48px));\n    padding: 6px;\n    border: 1px solid var(--pg-border);\n    border-radius: 6px;\n    background: var(--pg-card);\n    box-shadow: 0 6px 20px var(--pg-shadow-color);\n  }\n  .pg-account-switch .pg-account-menu button {\n    min-width: 0;\n    width: 100%;\n    height: 52px;\n    padding: 4px;\n    flex-direction: column;\n    gap: 0;\n    font-variant-numeric: tabular-nums;\n  }\n  .pg-account-menu button[aria-current="true"] {\n    border-color: var(--pg-primary);\n    background: var(--pg-primary);\n    color: var(--pg-primary-foreground);\n    cursor: default;\n    opacity: 1;\n  }\n  .pg-account-current { font-size: 11px; line-height: 16px; }\n\n  .pg-connection-options {\n    display: flex;\n    grid-column: 1 / -1;\n    min-height: 30px;\n    align-items: center;\n    flex-wrap: wrap;\n    gap: 12px 22px;\n  }\n  .pg-toggle-control {\n    display: inline-flex;\n    align-items: center;\n    gap: 8px;\n    color: var(--pg-control-foreground);\n    cursor: pointer;\n    font-size: 12px;\n    font-weight: 500;\n    user-select: none;\n  }\n  .pg-toggle-control input {\n    position: absolute;\n    width: 1px;\n    height: 1px;\n    margin: -1px;\n    overflow: hidden;\n    clip: rect(0, 0, 0, 0);\n    white-space: nowrap;\n  }\n  .pg-toggle-track {\n    position: relative;\n    display: inline-block;\n    width: 32px;\n    height: 18px;\n    flex: 0 0 auto;\n    border: 1px solid var(--pg-border-strong);\n    border-radius: 9px;\n    background: var(--pg-toggle-track-background);\n    transition: background-color 150ms ease, border-color 150ms ease;\n  }\n  .pg-toggle-track::after {\n    position: absolute;\n    top: 2px;\n    left: 2px;\n    width: 12px;\n    height: 12px;\n    border-radius: 50%;\n    background: var(--pg-toggle-knob-background);\n    box-shadow: 0 1px 2px var(--pg-shadow-color);\n    content: "";\n    transition: transform 150ms ease;\n  }\n  .pg-toggle-control input:checked + .pg-toggle-track {\n    border-color: var(--pg-primary);\n    background: var(--pg-primary);\n  }\n  .pg-toggle-control input:checked + .pg-toggle-track::after { transform: translateX(14px); background: var(--pg-primary-foreground); }\n  .pg-toggle-control input:focus-visible + .pg-toggle-track { outline: 2px solid var(--pg-ring); outline-offset: 2px; }\n\n  .pg-keepalive-control {\n    display: inline-flex;\n    align-items: center;\n    gap: 8px;\n    color: var(--pg-control-foreground);\n    font-size: 12px;\n    font-weight: 500;\n  }\n  .pg-keepalive-control select {\n    min-width: 88px;\n    height: 30px;\n    padding: 0 8px;\n    border: 1px solid var(--pg-border-strong);\n    border-radius: 6px;\n    background: var(--pg-card);\n    color: var(--pg-foreground);\n    font: inherit;\n    outline: none;\n  }\n  .pg-keepalive-control select:focus-visible {\n    border-color: var(--pg-ring);\n    box-shadow: 0 0 0 1px var(--pg-ring);\n  }\n  .pg-keepalive-control select:disabled { cursor: wait; opacity: 0.58; }\n  .pg-keepalive-start[hidden] { display: none; }\n\n  .pg-connection-message {\n    margin-top: 12px;\n    padding: 8px 11px;\n    align-items: center;\n    border: 1px solid var(--pg-border);\n    border-radius: 6px;\n    background: var(--pg-secondary);\n    color: var(--pg-muted-foreground);\n    font-size: 12px;\n    line-height: 1.6;\n    overflow-wrap: anywhere;\n  }\n  .pg-connection-message:empty { display: none; }\n  .pg-connection-message[data-state="error"],\n  .pg-connection-message[data-state="keepalive"] {\n    border-color: color-mix(in srgb, var(--pg-danger) 20%, transparent);\n    background: color-mix(in srgb, var(--pg-danger) 7%, transparent);\n    color: var(--pg-danger);\n  }\n  .pg-connection-message[data-state="success"] {\n    border-color: color-mix(in srgb, var(--pg-success) 18%, transparent);\n    background: color-mix(in srgb, var(--pg-success) 6%, transparent);\n    color: var(--pg-success);\n  }\n\n  .pg-metrics-grid {\n    display: grid;\n    grid-template-columns: repeat(4, minmax(0, 1fr));\n    gap: 12px;\n    padding: 16px 0;\n    border-top: 1px solid var(--pg-border);\n    border-bottom: 1px solid var(--pg-border);\n  }\n  .pg-metric-card {\n    display: flex;\n    min-width: 0;\n    padding: 0 12px;\n    border-left: 1px solid var(--pg-border);\n    flex-direction: column;\n    justify-content: center;\n    gap: 8px;\n  }\n  .pg-metric-card:first-child { padding-left: 0; border-left: 0; }\n  .pg-metric-label { color: var(--pg-muted-foreground); font-size: 12px; font-weight: 500; }\n  .pg-metric-value {\n    overflow: hidden;\n    color: var(--pg-foreground);\n    font-size: 22px;\n    font-weight: 650;\n    font-variant-numeric: tabular-nums;\n    line-height: 1;\n    text-overflow: ellipsis;\n  }\n  .pg-metric-active .pg-metric-value { color: var(--pg-foreground); }\n  .pg-metric-success .pg-metric-value { color: var(--pg-success); }\n  .pg-metric-failure .pg-metric-value { color: var(--pg-danger); }\n  .pg-metric-time { font-size: 18px; }\n\n  .pg-activity-panel { overflow: hidden; }\n  .pg-panel-header {\n    display: flex;\n    min-width: 0;\n    align-items: center;\n    justify-content: space-between;\n    gap: 16px;\n  }\n  .pg-activity-heading { min-height: 34px; margin-bottom: 12px; }\n  .pg-activity-heading h2 { margin: 0; font-size: 15px; font-weight: 650; }\n  .pg-icon-button { width: 30px; min-height: 30px; padding: 0; background: transparent; color: var(--pg-muted-foreground); }\n\n  .pg-activity-table-wrap {\n    width: 100%;\n    overflow-x: auto;\n    border: 1px solid var(--pg-border);\n    border-radius: 6px;\n    background: var(--pg-card);\n  }\n  .pg-activity-table-wrap table {\n    width: 100%;\n    border-collapse: collapse;\n    table-layout: fixed;\n    font-size: 13px;\n  }\n  .pg-activity-table-wrap th,\n  .pg-activity-table-wrap td {\n    padding: 10px 8px;\n    border-bottom: 1px solid var(--pg-border);\n    text-align: left;\n    vertical-align: middle;\n    overflow-wrap: break-word;\n  }\n  .pg-activity-table-wrap th {\n    height: 40px;\n    background: color-mix(in srgb, var(--pg-muted) 70%, transparent);\n    color: var(--pg-muted-foreground);\n    font-size: 11px;\n    font-weight: 600;\n  }\n  .pg-activity-table-wrap tbody tr { transition: background-color 120ms ease; }\n  .pg-activity-table-wrap tbody tr:hover {\n    background: color-mix(in srgb, var(--pg-muted) 48%, transparent);\n  }\n  .pg-activity-table-wrap tbody tr:last-child td { border-bottom: 0; }\n  .pg-activity-table-wrap th:first-child { width: 76px; }\n  .pg-activity-table-wrap th:nth-child(3) { width: 56px; }\n  .pg-activity-table-wrap th:nth-child(4) { width: 90px; }\n  .pg-activity-table-wrap th:nth-child(5) { width: 144px; text-align: right; }\n  .pg-activity-table-wrap th:last-child { width: 80px; text-align: right; }\n  .pg-activity-table-wrap .pg-numeric { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }\n  .pg-activity-time { color: var(--pg-muted-foreground); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }\n  .pg-activity-model { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }\n  .pg-token-usage, .pg-token-value { display: inline-flex; align-items: center; white-space: nowrap; }\n  .pg-token-usage { gap: 10px; font-size: 12px; font-variant-numeric: tabular-nums; }\n  .pg-token-value { gap: 4px; }\n  .pg-token-value svg { width: 8px; height: 14px; flex: 0 0 8px; }\n  .pg-token-input svg { color: var(--pg-info); }\n  .pg-token-output svg { color: var(--pg-success); }\n\n  .pg-result-badge,\n  .pg-mode-badge {\n    display: inline-flex;\n    min-height: 23px;\n    padding: 0 7px;\n    align-items: center;\n    border-radius: 5px;\n    font-size: 11px;\n    font-weight: 600;\n    white-space: nowrap;\n  }\n  .pg-mode-badge { background: var(--pg-secondary); color: var(--pg-control-foreground); }\n  .pg-result-success {\n    background: color-mix(in srgb, var(--pg-success) 9%, transparent);\n    color: var(--pg-success);\n  }\n  .pg-result-error {\n    background: color-mix(in srgb, var(--pg-danger) 8%, transparent);\n    color: var(--pg-danger);\n  }\n  .pg-error-details-button {\n    min-height: 23px;\n    border: 0;\n    color: var(--pg-danger);\n    font-size: 11px;\n    font-weight: 600;\n    white-space: nowrap;\n  }\n  .pg-error-details-button svg { width: 12px; height: 12px; }\n  .pg-error-details-button:hover:not(:disabled) {\n    background: color-mix(in srgb, var(--pg-danger) 14%, transparent);\n  }\n  .pg-activity-error-row[hidden] { display: none; }\n  .pg-activity-error-row td {\n    padding: 0;\n    background: color-mix(in srgb, var(--pg-danger) 4%, var(--pg-card));\n  }\n  .pg-activity-error-detail { padding: 14px 16px 16px; border-bottom: 1px solid var(--pg-border); }\n  .pg-activity-error-metadata {\n    display: grid;\n    grid-template-columns: 80px minmax(0, 1fr);\n    margin: 0;\n    gap: 7px 12px;\n    font-size: 12px;\n    line-height: 1.5;\n  }\n  .pg-activity-error-metadata dt { color: var(--pg-muted-foreground); font-weight: 600; }\n  .pg-activity-error-metadata dd {\n    min-width: 0;\n    margin: 0;\n    color: var(--pg-foreground);\n    overflow-wrap: anywhere;\n  }\n  .pg-activity-error-body-label {\n    margin-top: 14px;\n    color: var(--pg-muted-foreground);\n    font-size: 12px;\n    font-weight: 600;\n  }\n  .pg-activity-error-body {\n    max-height: 320px;\n    margin: 7px 0 0;\n    padding: 12px;\n    overflow: auto;\n    border: 1px solid var(--pg-border);\n    border-radius: 6px;\n    background: var(--pg-background);\n    color: var(--pg-foreground);\n    font: 12px/1.55 "SFMono-Regular", Consolas, "Liberation Mono", monospace;\n    overflow-wrap: anywhere;\n    white-space: pre-wrap;\n  }\n  .pg-empty-row td {\n    height: 120px;\n    color: var(--pg-muted-foreground);\n    text-align: center;\n  }\n\n  .pg-activity-actions { display: flex; align-items: center; gap: 6px; }\n\n  @container (max-width: 520px) {\n    .pg-connection-form { grid-template-columns: minmax(0, 1fr); }\n    .pg-connection-options { grid-row: 2; justify-content: space-between; gap: 10px; }\n    .pg-connection-actions { grid-row: 3; }\n    .pg-connection-actions > button, .pg-account-switch { min-width: 0; flex: 1; }\n    .pg-account-switch > summary { width: 100%; }\n    .pg-metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px; }\n    .pg-metric-card:nth-child(3) { padding-left: 0; border-left: 0; }\n  }\n  @container (max-width: 579px) {\n    .pg-activity-table-wrap { overflow: hidden; }\n    .pg-activity-table-wrap table, .pg-activity-table-wrap tbody { display: block; }\n    .pg-activity-table-wrap thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }\n    .pg-activity-table-wrap .pg-activity-row {\n      display: grid;\n      grid-template-columns: minmax(0, 1fr) auto auto;\n      align-items: center;\n      padding: 10px 12px;\n      gap: 6px 10px;\n      border-bottom: 1px solid var(--pg-border);\n    }\n    .pg-activity-table-wrap .pg-activity-row:last-child { border-bottom: 0; }\n    .pg-activity-row td { min-width: 0; padding: 0; border: 0; }\n    .pg-activity-time { grid-row: 2; grid-column: 1; }\n    .pg-activity-model { grid-row: 1; grid-column: 1 / 3; }\n    .pg-activity-mode { grid-row: 2; grid-column: 2 / 4; justify-self: end; }\n    .pg-activity-result-cell { grid-row: 1; grid-column: 3; justify-self: end; }\n    .pg-activity-row .pg-activity-tokens { grid-row: 3; grid-column: 1 / 3; text-align: left; }\n    .pg-activity-row .pg-activity-duration { grid-row: 3; grid-column: 3; font-size: 12px; }\n    .pg-activity-error-row:not([hidden]), .pg-activity-error-row td, .pg-empty-row, .pg-empty-row td { display: block; width: 100%; }\n    .pg-empty-row td { display: grid; place-items: center; }\n    .pg-activity-error-detail { padding: 12px; }\n    .pg-activity-error-metadata { grid-template-columns: 60px minmax(0, 1fr); gap: 6px 10px; }\n  }\n  @media (max-width: 560px) {\n    :host { right: max(8px, env(safe-area-inset-right)); bottom: max(8px, env(safe-area-inset-bottom)); width: calc(100vw - 16px); max-height: calc(100dvh - 32px - env(safe-area-inset-bottom)); }\n    .pg-app-header-inner { padding: 10px 12px; gap: 8px; }\n    .pg-brand-copy strong { font-size: 14px; }\n    .pg-header-actions { gap: 5px; }\n    .pg-theme-segmented { padding: 2px; gap: 0; }\n    .pg-theme-segmented button { width: 26px; min-height: 28px; }\n    .pg-app-main { padding: 12px; }\n    .pg-key-input-wrap input { font-size: 16px; }\n    .pg-key-entry { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }\n    .pg-tier-mobile { display: inline-flex; align-items: center; }\n    .pg-tier-mobile .pg-tier-badge { height: 40px; min-height: 40px; width: auto; padding: 0 10px; font-size: 13px; }\n  }\n  @media (max-width: 440px) {\n    .pg-connection-status { min-height: 28px; width: 28px; padding: 0; justify-content: center; }\n    #pg-connection-status-text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }\n  }\n  @media (prefers-reduced-motion: reduce) {\n    *, *::before, *::after { transition: none !important; }\n  }\n`;
    const elements = {};
    const ICON_NODES = {
        play: [ [ "polygon", {
            points: "6 3 20 12 6 21 6 3"
        } ] ],
        monitor: [ [ "rect", {
            width: 20,
            height: 14,
            x: 2,
            y: 3,
            rx: 2
        } ], [ "line", {
            x1: 8,
            x2: 16,
            y1: 21,
            y2: 21
        } ], [ "line", {
            x1: 12,
            x2: 12,
            y1: 17,
            y2: 21
        } ] ],
        sun: [ [ "circle", {
            cx: 12,
            cy: 12,
            r: 4
        } ], ...[ "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41" ].map(d => [ "path", {
            d: d
        } ]) ],
        moon: [ [ "path", {
            d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
        } ] ],
        eye: [ [ "path", {
            d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
        } ], [ "circle", {
            cx: 12,
            cy: 12,
            r: 3
        } ] ],
        "eye-off": [ "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49", "M14.084 14.158a3 3 0 0 1-4.242-4.242", "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143", "m2 2 20 20" ].map(d => [ "path", {
            d: d
        } ]),
        "chevron-down": [ [ "path", {
            d: "m6 9 6 6 6-6"
        } ] ],
        "chevron-up": [ [ "path", {
            d: "m18 15-6-6-6 6"
        } ] ],
        "move-up": [ [ "path", {
            d: "M8 6L12 2L16 6"
        } ], [ "path", {
            d: "M12 2V22"
        } ] ],
        "move-down": [ [ "path", {
            d: "M8 18L12 22L16 18"
        } ], [ "path", {
            d: "M12 2V22"
        } ] ],
        "trash-2": [ [ "path", {
            d: "M3 6h18"
        } ], [ "path", {
            d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
        } ], [ "path", {
            d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
        } ], [ "line", {
            x1: 10,
            x2: 10,
            y1: 11,
            y2: 17
        } ], [ "line", {
            x1: 14,
            x2: 14,
            y1: 11,
            y2: 17
        } ] ]
    };
    function icon(name) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        for (const [key, value] of Object.entries({
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": 2,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "aria-hidden": "true",
            focusable: "false"
        })) {
            svg.setAttribute(key, value);
        }
        for (const [tag, attrs] of ICON_NODES[name]) {
            const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
            for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
            svg.appendChild(node);
        }
        return svg;
    }
    function h(tag, attrs = {}, children = []) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k.startsWith("data-") || k.startsWith("aria-")) el.setAttribute(k, v); else if (k === "id") el.id = v; else if (k === "type") el.type = v; else if (k === "hidden") el.hidden = !!v; else el.setAttribute(k, v);
        }
        for (const child of [].concat(children)) {
            if (child instanceof Node) el.appendChild(child); else if (child != null) el.appendChild(document.createTextNode(String(child)));
        }
        return el;
    }
    function installPanelDrag(root, handle) {
        let position = null;
        let drag = null;
        function place(left, top, width, height) {
            const viewport = W.visualViewport;
            const minLeft = (viewport?.offsetLeft || 0) + 8;
            const minTop = (viewport?.offsetTop || 0) + 8;
            position = {
                left: Math.max(minLeft, Math.min(left, minLeft + (viewport?.width || W.innerWidth) - width - 16)),
                top: Math.max(minTop, Math.min(top, minTop + (viewport?.height || W.innerHeight) - height - 16))
            };
            root.style.left = `${position.left}px`;
            root.style.top = `${position.top}px`;
            root.style.right = "auto";
            root.style.bottom = "auto";
        }
        function stopDrag(event) {
            if (!drag || event?.pointerId != null && event.pointerId !== drag.id) return;
            const id = drag.id;
            drag = null;
            delete root.dataset.dragging;
            if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
        }
        function constrain() {
            if (!position || root.hidden) return;
            const bounds = root.getBoundingClientRect();
            if (drag) {
                drag.width = bounds.width;
                drag.height = bounds.height;
            }
            place(position.left, position.top, bounds.width, bounds.height);
        }
        handle.addEventListener("pointerdown", event => {
            if (drag || event.isPrimary === false || event.button !== 0) return;
            if (event.target.closest?.("button, a, input, select, textarea, summary, [role='button'], [contenteditable]")) return;
            const bounds = root.getBoundingClientRect();
            handle.setPointerCapture(event.pointerId);
            drag = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                left: bounds.left,
                top: bounds.top,
                width: bounds.width,
                height: bounds.height
            };
            root.dataset.dragging = "true";
            event.preventDefault();
        });
        handle.addEventListener("pointermove", event => {
            if (!drag || event.pointerId !== drag.id) return;
            place(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y, drag.width, drag.height);
        });
        for (const name of [ "pointerup", "pointercancel", "lostpointercapture" ]) {
            handle.addEventListener(name, stopDrag);
        }
        const resize = () => {
            stopDrag();
            constrain();
        };
        W.addEventListener("resize", resize);
        W.visualViewport?.addEventListener("resize", resize);
        W.visualViewport?.addEventListener("scroll", resize);
        W.addEventListener("blur", () => stopDrag());
        if (typeof W.ResizeObserver === "function") new W.ResizeObserver(constrain).observe(root);
    }
    function createAccountSwitcher() {
        const summary = h("summary", {
            "aria-controls": "pg-account-menu",
            "aria-label": "Switch Google account"
        }, [ h("span", {
            text: "Account"
        }), icon("chevron-down") ]);
        const options = Array.from({
            length: 6
        }, (_, index) => {
            const option = h("button", {
                type: "button",
                "data-account-index": String(index)
            }, [ h("span", {
                text: String(index)
            }), h("span", {
                class: "pg-account-current",
                text: "Current",
                hidden: true
            }) ]);
            option.addEventListener("click", () => switchAccount(index));
            return option;
        });
        const menu = h("details", {
            class: "pg-account-switch"
        }, [ summary, h("div", {
            id: "pg-account-menu",
            class: "pg-account-menu",
            role: "group",
            "aria-label": "Select Google account"
        }, options) ]);
        elements.accountSwitch = menu;
        elements.accountOptions = options;
        menu.addEventListener("toggle", () => {
            if (menu.open) updateAccountMenu();
        });
        menu.addEventListener("keydown", event => {
            if (event.key !== "Escape" || !menu.open) return;
            event.preventDefault();
            menu.open = false;
            summary.focus();
        });
        document.addEventListener("pointerdown", event => {
            if (menu.open && !event.composedPath().includes(menu)) menu.open = false;
        });
        updateAccountMenu();
        return menu;
    }
    function installTierBadgePlacement(badge, status, mobileSlot) {
        const media = W.matchMedia("(max-width: 560px)");
        const move = () => {
            if (media.matches) mobileSlot.appendChild(badge); else status.parentNode.insertBefore(badge, status);
        };
        media.addEventListener("change", move);
        move();
    }
    function buildPanel() {
        if (!isPromptsPage() || elements.root) return;
        const style = document.createElement("style");
        style.textContent = PANEL_CSS;
        const themeSegmented = h("div", {
            class: "pg-theme-segmented",
            role: "group",
            "aria-label": "Theme"
        }, [ h("button", {
            type: "button",
            "data-theme-option": "system",
            "aria-label": "Follow system",
            title: "Follow system",
            "aria-pressed": "false"
        }, [ icon("monitor") ]), h("button", {
            type: "button",
            "data-theme-option": "light",
            "aria-label": "Light theme",
            title: "Light theme",
            "aria-pressed": "false"
        }, [ icon("sun") ]), h("button", {
            type: "button",
            "data-theme-option": "dark",
            "aria-label": "Dark theme",
            title: "Dark theme",
            "aria-pressed": "false"
        }, [ icon("moon") ]) ]);
        const statusEl = h("div", {
            class: "pg-connection-status",
            id: "pg-connection-status",
            "data-state": "offline",
            role: "status",
            "aria-live": "polite",
            title: "Disconnected"
        }, [ h("span", {
            class: "pg-status-indicator",
            "aria-hidden": "true"
        }), h("span", {
            id: "pg-connection-status-text",
            text: "Disconnected"
        }) ]);
        const tierBadge = h("span", {
            class: "pg-connection-status pg-tier-badge",
            "data-tier": "unknown",
            role: "status",
            "aria-live": "polite",
            text: "Unknown"
        });
        const mobileTierSlot = h("span", {
            class: "pg-tier-mobile"
        });
        const collapseBtn = h("button", {
            class: "pg-icon-button",
            type: "button",
            "aria-label": "Collapse panel",
            title: "Collapse panel",
            "aria-expanded": "true",
            "aria-controls": "pg-executor-main"
        }, [ icon("chevron-down") ]);
        const updateVersion = h("span");
        const updateNotice = h("div", {
            class: "pg-update-notice",
            role: "status",
            "aria-live": "polite",
            hidden: true
        }, [ updateVersion, h("a", {
            href: SCRIPT_DOWNLOAD_URL,
            target: "_blank",
            rel: "noopener noreferrer",
            text: "Update script"
        }) ]);
        const header = h("header", {
            class: "pg-app-header"
        }, [ h("div", {
            class: "pg-app-header-inner"
        }, [ h("div", {
            class: "pg-brand-copy"
        }, [ h("strong", {
            text: "GG Public Relay - Playground",
            title: "GG Public Relay - Playground"
        }) ]), h("div", {
            class: "pg-header-actions"
        }, [ themeSegmented, tierBadge, statusEl, collapseBtn ]) ]), updateNotice ]);
        const keyInput = h("input", {
            id: "pg-user-api-key",
            type: "password",
            spellcheck: "false",
            autocapitalize: "off",
            autocomplete: "off",
            required: ""
        });
        keyInput.value = cfg.apiKey;
        const toggleKeyBtn = h("button", {
            id: "pg-toggle-key",
            class: "pg-input-action",
            type: "button",
            "aria-label": "Show API Key",
            title: "Show API Key",
            "aria-pressed": "false"
        }, [ icon("eye") ]);
        const connectBtn = h("button", {
            id: "pg-connect-button",
            class: "pg-primary-button",
            type: "submit",
            text: "Connect"
        });
        const disconnectBtn = h("button", {
            id: "pg-disconnect-button",
            class: "pg-outline-button",
            type: "button",
            disabled: true,
            text: "Disconnect"
        });
        const rememberCheckbox = h("input", {
            id: "pg-remember-key",
            type: "checkbox"
        });
        if (cfg.remember) rememberCheckbox.checked = true;
        const keepAliveSelect = h("select", {
            id: "pg-keepalive-mode"
        }, [ h("option", {
            value: "none",
            text: "Off"
        }), h("option", {
            value: "audio",
            text: "Audio"
        }), h("option", {
            value: "pip",
            text: "Picture-in-Picture"
        }) ]);
        keepAliveSelect.value = state.keepAliveMode;
        const keepAliveStart = h("button", {
            class: "pg-icon-button pg-keepalive-start",
            type: "button",
            hidden: true,
            title: "Start background keep-alive",
            "aria-label": "Start background keep-alive"
        }, [ icon("play") ]);
        const connectionForm = h("form", {
            id: "pg-connection-form",
            class: "pg-connection-form",
            autocomplete: "off"
        }, [ h("label", {
            class: "pg-key-field",
            for: "pg-user-api-key"
        }, [ h("span", {
            text: "Relay API Key"
        }), h("span", {
            class: "pg-key-entry"
        }, [ h("span", {
            class: "pg-key-input-wrap"
        }, [ keyInput, toggleKeyBtn ]), mobileTierSlot ]) ]), h("div", {
            class: "pg-connection-actions"
        }, [ connectBtn, disconnectBtn, createAccountSwitcher() ]), h("div", {
            class: "pg-connection-options"
        }, [ h("label", {
            class: "pg-toggle-control"
        }, [ rememberCheckbox, h("span", {
            class: "pg-toggle-track",
            "aria-hidden": "true"
        }), h("span", {
            text: "Remember API Key"
        }) ]), h("div", {
            class: "pg-keepalive-control"
        }, [ h("label", {
            for: "pg-keepalive-mode",
            text: "Background keep-alive"
        }), keepAliveSelect, keepAliveStart ]) ]) ]);
        const messageEl = h("div", {
            id: "pg-connection-message",
            class: "pg-connection-message",
            "aria-live": "polite"
        });
        const connectionPanel = h("section", {
            class: "pg-panel pg-connection-panel",
            "aria-label": "Connection settings"
        }, [ connectionForm, messageEl ]);
        const activeCount = h("strong", {
            id: "pg-active-count",
            class: "pg-metric-value",
            text: "0"
        });
        const successCount = h("strong", {
            id: "pg-success-count",
            class: "pg-metric-value",
            text: "0"
        });
        const failureCount = h("strong", {
            id: "pg-failure-count",
            class: "pg-metric-value",
            text: "0"
        });
        const durationEl = h("strong", {
            id: "pg-connection-duration",
            class: "pg-metric-value pg-metric-time",
            text: "00:00:00"
        });
        const metrics = h("section", {
            class: "pg-metrics-grid",
            "aria-label": "Run statistics"
        }, [ h("div", {
            class: "pg-metric-card pg-metric-active"
        }, [ h("span", {
            class: "pg-metric-label",
            text: "Active requests"
        }), activeCount ]), h("div", {
            class: "pg-metric-card pg-metric-success"
        }, [ h("span", {
            class: "pg-metric-label",
            text: "Completed"
        }), successCount ]), h("div", {
            class: "pg-metric-card pg-metric-failure"
        }, [ h("span", {
            class: "pg-metric-label",
            text: "Failed"
        }), failureCount ]), h("div", {
            class: "pg-metric-card pg-metric-duration"
        }, [ h("span", {
            class: "pg-metric-label",
            text: "This connection"
        }), durationEl ]) ]);
        const clearActivityBtn = h("button", {
            id: "pg-clear-activity",
            class: "pg-icon-button",
            type: "button",
            disabled: true,
            "aria-label": "Clear request log",
            title: "Clear request log"
        }, [ icon("trash-2") ]);
        const activityBody = h("tbody", {
            id: "pg-activity-body"
        });
        const activityTable = h("table", {}, [ h("thead", {}, [ h("tr", {}, [ h("th", {
            text: "Time"
        }), h("th", {
            text: "Model"
        }), h("th", {
            text: "Mode"
        }), h("th", {
            text: "Result"
        }), h("th", {
            class: "pg-numeric",
            text: "Token"
        }), h("th", {
            class: "pg-numeric",
            text: "Duration"
        }) ]) ]), activityBody ]);
        const activityPanel = h("section", {
            class: "pg-panel pg-activity-panel",
            "aria-labelledby": "pg-activity-heading"
        }, [ h("div", {
            class: "pg-panel-header pg-activity-heading"
        }, [ h("h2", {
            id: "pg-activity-heading",
            text: "Recent requests"
        }), h("div", {
            class: "pg-activity-actions"
        }, [ clearActivityBtn ]) ]), h("div", {
            class: "pg-activity-table-wrap"
        }, [ activityTable ]) ]);
        const video = h("video", {
            id: "pg-keepalive-video",
            class: "pg-keepalive-video",
            muted: true,
            playsinline: true,
            "aria-hidden": "true"
        });
        video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:-9999px";
        const root = h("div", {
            id: "pg-executor-panel",
            role: "region",
            "aria-label": "Playground Executor"
        });
        const shadow = root.attachShadow({
            mode: "open"
        });
        shadow.append(style, header, h("main", {
            id: "pg-executor-main",
            class: "pg-app-main"
        }, [ connectionPanel, metrics, activityPanel ]));
        document.documentElement.append(root, video);
        elements.root = root;
        elements.tier = tierBadge;
        installTierBadgePlacement(tierBadge, statusEl, mobileTierSlot);
        accountTier.updateLabel();
        void accountTier.refresh();
        elements.updateNotice = updateNotice;
        elements.updateVersion = updateVersion;
        elements.status = statusEl;
        elements.statusText = statusEl.querySelector("#pg-connection-status-text");
        elements.apiKey = keyInput;
        elements.toggleKey = toggleKeyBtn;
        elements.connect = connectBtn;
        elements.disconnect = disconnectBtn;
        elements.rememberKey = rememberCheckbox;
        elements.keepAliveMode = keepAliveSelect;
        elements.keepAliveStart = keepAliveStart;
        elements.keepAliveVideo = video;
        elements.message = messageEl;
        elements.activeCount = activeCount;
        elements.successCount = successCount;
        elements.failureCount = failureCount;
        elements.connectionDuration = durationEl;
        elements.activityBody = activityBody;
        elements.clearActivity = clearActivityBtn;
        elements.themeOptions = shadow.querySelectorAll("[data-theme-option]");
        elements.collapsed = false;
        installPanelDrag(root, header.querySelector(".pg-app-header-inner"));
        connectionForm.addEventListener("submit", event => {
            event.preventDefault();
            connect({
                allowNavigation: true
            });
        });
        disconnectBtn.addEventListener("click", disconnect);
        toggleKeyBtn.addEventListener("click", () => {
            const show = keyInput.type === "password";
            keyInput.type = show ? "text" : "password";
            toggleKeyBtn.replaceChildren(icon(show ? "eye-off" : "eye"));
            toggleKeyBtn.setAttribute("aria-pressed", String(show));
            toggleKeyBtn.setAttribute("aria-label", show ? "Hide API Key" : "Show API Key");
            toggleKeyBtn.title = show ? "Hide API Key" : "Show API Key";
        });
        rememberCheckbox.addEventListener("change", () => {
            cfg.apiKey = keyInput.value.trim();
            cfg.remember = rememberCheckbox.checked;
            persistCfg();
        });
        keyInput.addEventListener("change", () => {
            cfg.apiKey = keyInput.value.trim();
            persistCfg();
        });
        keepAliveSelect.addEventListener("change", () => {
            void changeKeepAliveMode(keepAliveSelect.value);
        });
        keepAliveStart.addEventListener("click", () => {
            void changeKeepAliveMode(keepAliveSelect.value);
        });
        for (const option of elements.themeOptions) {
            option.addEventListener("click", () => applyThemeMode(option.dataset.themeOption));
        }
        themeMediaQuery.addEventListener("change", handleSystemThemeChange);
        clearActivityBtn.addEventListener("click", () => {
            state.activities = [];
            renderActivity();
        });
        collapseBtn.addEventListener("click", () => {
            elements.accountSwitch.open = false;
            elements.collapsed = !elements.collapsed;
            root.dataset.collapsed = String(elements.collapsed);
            collapseBtn.setAttribute("aria-expanded", String(!elements.collapsed));
            collapseBtn.setAttribute("aria-label", elements.collapsed ? "Expand panel" : "Collapse panel");
            collapseBtn.title = elements.collapsed ? "Expand panel" : "Collapse panel";
            collapseBtn.replaceChildren(icon(elements.collapsed ? "chevron-up" : "chevron-down"));
            if (!elements.collapsed) void checkForUpdate();
        });
        video.addEventListener("leavepictureinpicture", handlePictureInPictureExit);
        video.addEventListener("webkitpresentationmodechanged", event => {
            try {
                if (!state.keepAliveTransitioning && event.target.webkitPresentationMode !== "picture-in-picture") {
                    handlePictureInPictureExit();
                }
            } catch (_) {}
        });
        renderActivity();
        updateControls();
        applyThemeMode((() => {
            try {
                const saved = localStorage.getItem(STORAGE.theme);
                return saved === "light" || saved === "dark" ? saved : "system";
            } catch (_) {
                return "system";
            }
        })(), false);
        if (!supportsPictureInPictureKeepAlive()) {
            const pipOption = keepAliveSelect.querySelector('option[value="pip"]');
            if (pipOption) pipOption.disabled = true;
            if (state.keepAliveMode === "pip") state.keepAliveMode = "none";
        }
        updateKeepAliveControls();
        void checkForUpdate();
    }
    async function main() {
        loadCfg();
        const handoffKey = takeConnectionHandoff();
        if (handoffKey) cfg.apiKey = handoffKey;
        try {
            state.keepAliveMode = normalizeKeepAliveMode(localStorage.getItem(STORAGE.keepAlive));
        } catch (_) {}
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", buildPanel, {
                once: true
            });
        } else {
            buildPanel();
        }
        installRouteHooks();
        if (typeof GM_registerMenuCommand === "function") {
            GM_registerMenuCommand("⚙ Set relay API Key", () => {
                if (!isPromptsPage()) return;
                const key = prompt("Relay API Key:", cfg.apiKey);
                if (key !== null) {
                    cfg.apiKey = key.trim();
                    persistCfg();
                    if (elements.apiKey) elements.apiKey.value = cfg.apiKey;
                    state.shouldReconnect = false;
                    disconnect();
                    state.shouldReconnect = true;
                    connect({
                        allowNavigation: true
                    });
                }
            });
            GM_registerMenuCommand("Toggle executor panel visibility", () => {
                if (!isPromptsPage()) return;
                const root = document.getElementById("pg-executor-panel");
                if (root) root.style.display = root.style.display === "none" ? "block" : "none";
            });
        }
        document.addEventListener("visibilitychange", () => {
            syncPageRoute();
            if (!isPromptsPage()) return;
            if (!document.hidden && state.keepAliveMode === "audio" && state.keepAliveAudio?.paused) {
                void changeKeepAliveMode("audio");
            }
            if (!document.hidden && isPictureInPictureActive() && elements.keepAliveVideo?.paused) {
                elements.keepAliveVideo.play().catch(() => {});
            }
        });
        W.addEventListener("beforeunload", () => {
            disconnect();
            stopMobileKeepAlive();
            stopPictureInPictureKeepAlive();
        });
        const dms = await waitFor(() => isPromptsPage() && W.default_MakerSuite || null, 12e4, 300);
        if (!isPromptsPage()) return;
        buildPanel();
        if (!dms) {
            setMessage("Signing module not loaded on the page; executor unavailable", "error");
            return;
        }
        installPageHooks();
        installFetchHooks();
        installXhrHooks();
        if (isTemporaryChatPage() && cfg.apiKey && (handoffKey || cfg.remember)) connect({
            allowNavigation: !handoffKey
        });
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            main().catch(() => setMessage("Executor failed to start. Please refresh the page and try again.", "error"));
        }, {
            once: true
        });
    } else {
        main().catch(() => setMessage("Executor failed to start. Please refresh the page and try again.", "error"));
    }
})();