// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

/**
 * Script runner for executing user-provided JavaScript authentication scripts.
 *
 * Scripts run in the browser via AsyncFunction and receive a `cda` helper
 * object that wraps the SOVD client API. This allows vendor-specific
 * authentication flows to be written as plain JavaScript and stored in
 * the browser's localStorage -- they are never sent to the server or
 * embedded in the binary.
 *
 * ## API available inside scripts
 *
 * ```js
 * // Current ECU ID
 * cda.ecuId        // string
 *
 * // ---------- CDA data services ----------
 * await cda.readData(serviceId)               // -> parsed JSON object
 *
 * // ---------- CDA operations (JSON) ----------
 * await cda.executeOperation(opId, params?)   // -> parsed JSON object
 *
 * // ---------- CDA operations (raw binary) ----------
 * await cda.executeOperationRaw(opId, bytes)  // bytes: Uint8Array -> Uint8Array
 *
 * // ---------- CDA generic UDS ----------
 * await cda.genericService(hexString)         // -> parsed JSON object
 *
 * // ---------- External HTTP (for cert servers etc.) ----------
 * await cda.fetch(url, options?)              // thin wrapper around window.fetch
 *
 * // ---------- Byte utilities ----------
 * cda.hexToBytes("AABB00")       // -> Uint8Array
 * cda.bytesToHex(uint8array)     // -> "aabb00"
 * cda.base64Encode(uint8array)   // -> base64 string
 * cda.base64Decode(b64string)    // -> Uint8Array
 * cda.concatBytes(a, b, ...)     // -> Uint8Array
 *
 * // ---------- Logging (shown in the UI console) ----------
 * cda.log(...args)
 * cda.warn(...args)
 * cda.error(...args)
 *
 * // ---------- Sleep ----------
 * await cda.sleep(ms)
 * ```
 */

import sovdClient from "../api/client";

// ---------------------------------------------------------------------------
// Log entry type
// ---------------------------------------------------------------------------

export interface LogEntry {
  level: "log" | "warn" | "error";
  timestamp: Date;
  message: string;
}

// ---------------------------------------------------------------------------
// Script storage (localStorage)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "cda-auth-scripts";

export interface SavedScript {
  name: string;
  code: string;
  updatedAt: string;
}

export function loadScripts(): SavedScript[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedScript[];
  } catch {
    return [];
  }
}

export function saveScripts(scripts: SavedScript[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

export function deleteScript(name: string): void {
  const scripts = loadScripts().filter((s) => s.name !== name);
  saveScripts(scripts);
}

export function upsertScript(name: string, code: string): void {
  const scripts = loadScripts();
  const idx = scripts.findIndex((s) => s.name === name);
  const entry: SavedScript = {
    name,
    code,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) {
    scripts[idx] = entry;
  } else {
    scripts.push(entry);
  }
  saveScripts(scripts);
}

// ---------------------------------------------------------------------------
// Byte utilities (exposed to scripts as cda.*)
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  // Remove "0x" prefixes first (as a unit), then strip whitespace and commas
  const clean = hex.replace(/0x/gi, "").replace(/[\s,]/g, "");
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${clean.length}`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64Encode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBytes(...arrays: (Uint8Array | ArrayBuffer)[]): Uint8Array {
  const parts = arrays.map((a) =>
    a instanceof Uint8Array ? a : new Uint8Array(a)
  );
  const totalLength = parts.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Script execution
// ---------------------------------------------------------------------------

export interface RunResult {
  success: boolean;
  result: unknown;
  logs: LogEntry[];
  durationMs: number;
}

/**
 * Execute a user-provided JavaScript string with the `cda` helper object
 * in scope. The script is wrapped in an async function so `await` works
 * at the top level.
 */
export async function runScript(
  ecuId: string,
  code: string,
  abortSignal?: AbortSignal
): Promise<RunResult> {
  const logs: LogEntry[] = [];
  const start = performance.now();

  const pushLog = (level: LogEntry["level"], args: unknown[]) => {
    const message = args
      .map((a) =>
        typeof a === "string" ? a : JSON.stringify(a, null, 2) ?? String(a)
      )
      .join(" ");
    logs.push({ level, timestamp: new Date(), message });
  };

  // Build the `cda` context object exposed to the script
  const cda = {
    ecuId,

    // -- CDA data services --------------------------------------------------
    async readData(serviceId: string) {
      pushLog("log", [`> readData("${serviceId}")`]);
      const result = await sovdClient.readData(ecuId, serviceId);
      pushLog("log", ["< readData:", result]);
      return result;
    },

    // -- CDA operations (JSON) ----------------------------------------------
    async executeOperation(opId: string, params?: Record<string, unknown>) {
      pushLog("log", [`> executeOperation("${opId}", ${JSON.stringify(params)})`]);
      const result = await sovdClient.executeOperation(ecuId, opId, params);
      pushLog("log", ["< executeOperation:", result]);
      return result;
    },

    // -- CDA operations (raw binary) ----------------------------------------
    async executeOperationRaw(
      opId: string,
      data: Uint8Array | ArrayBuffer
    ): Promise<Uint8Array> {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      pushLog("log", [
        `> executeOperationRaw("${opId}", ${bytes.length} bytes: ${bytesToHex(bytes).substring(0, 40)}...)`,
      ]);
      const result = await sovdClient.requestRaw(
        "POST",
        `/components/${ecuId}/operations/${opId}/executions`,
        bytes
      );
      const resultBytes = new Uint8Array(result);
      pushLog("log", [
        `< executeOperationRaw: ${resultBytes.length} bytes: ${bytesToHex(resultBytes).substring(0, 40)}...`,
      ]);
      return resultBytes;
    },

    // -- Generic UDS --------------------------------------------------------
    async genericService(hexData: string) {
      pushLog("log", [`> genericService("${hexData}")`]);
      const result = await sovdClient.executeGenericService(ecuId, hexData);
      pushLog("log", ["< genericService:", result]);
      return result;
    },

    // -- External HTTP (for cert servers etc.) ------------------------------
    async fetch(
      url: string,
      options?: RequestInit
    ): Promise<{ status: number; headers: Record<string, string>; body: unknown; arrayBuffer: () => Promise<ArrayBuffer> }> {
      // In dev mode, route absolute URLs through the Vite forward proxy
      // to bypass CORS and TLS certificate restrictions.
      const isExternal = url.startsWith("http://") || url.startsWith("https://");
      const fetchUrl =
        import.meta.env.DEV && isExternal
          ? `/__proxy/${encodeURIComponent(url)}`
          : url;

      pushLog("log", [
        `> fetch("${url}", ${options?.method ?? "GET"})${isExternal && import.meta.env.DEV ? " [via proxy]" : ""}`,
      ]);
      const resp = await window.fetch(fetchUrl, {
        ...options,
        signal: abortSignal,
      });
      const contentType = resp.headers.get("content-type") ?? "";
      const headersObj: Record<string, string> = {};
      resp.headers.forEach((v, k) => {
        headersObj[k] = v;
      });

      // Clone response so both .body and .arrayBuffer() work
      const cloned = resp.clone();
      let body: unknown;
      if (contentType.includes("application/json")) {
        body = await resp.json();
      } else if (contentType.includes("text/")) {
        body = await resp.text();
      } else {
        body = `[binary ${resp.headers.get("content-length") ?? "?"} bytes]`;
      }

      pushLog("log", [`< fetch: ${resp.status} ${resp.statusText}`]);
      return {
        status: resp.status,
        headers: headersObj,
        body,
        arrayBuffer: () => cloned.arrayBuffer(),
      };
    },

    // -- Byte utilities -----------------------------------------------------
    hexToBytes,
    bytesToHex,
    base64Encode,
    base64Decode,
    concatBytes,

    // -- Logging ------------------------------------------------------------
    log: (...args: unknown[]) => pushLog("log", args),
    warn: (...args: unknown[]) => pushLog("warn", args),
    error: (...args: unknown[]) => pushLog("error", args),

    // -- Misc ---------------------------------------------------------------
    sleep: (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        abortSignal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Script aborted", "AbortError"));
        });
      }),
  };

  try {
    // Wrap the user code in an async function that receives `cda` as argument.
    // eslint-disable-next-line no-new-func
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction("cda", code);
    const result = await fn(cda);
    return {
      success: true,
      result,
      logs,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushLog("error", [`Script error: ${message}`]);
    return {
      success: false,
      result: message,
      logs,
      durationMs: performance.now() - start,
    };
  }
}
