// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

import type {
  AuthResponse,
  ComponentList,
  ConfigurationList,
  DataServiceList,
  DataServiceResponse,
  EcuDetail,
  Fault,
  FaultList,
  GenericServiceResponse,
  Lock,
  LockDetail,
  LockList,
  ModeList,
  ModeValue,
  OperationDetail,
  OperationExecution,
  OperationExecutionList,
  OperationList,
} from "../types/sovd";
import { parseOperationDocs } from "../lib/docsParser";

const API_PREFIX = "/vehicle/v15";

// ---------------------------------------------------------------------------
// Tauri-aware fetch: in a Tauri context, use @tauri-apps/plugin-http which
// makes requests from the Rust side (bypassing webview CORS restrictions).
// In a plain browser context, fall back to the native fetch() API.
// ---------------------------------------------------------------------------
const isTauri =
  typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

/**
 * Lazy-initialized Tauri fetch.  The promise resolves once the dynamic import
 * completes.  Every call to httpFetch() awaits this so there is no race
 * between component mount and plugin readiness.
 */
const tauriFetchReady: Promise<typeof globalThis.fetch | null> = isTauri
  ? import("@tauri-apps/plugin-http").then(
      (mod) => mod.fetch as typeof globalThis.fetch
    )
  : Promise.resolve(null);

/**
 * Fetch wrapper that delegates to the Tauri HTTP plugin when available,
 * otherwise falls back to the browser's native fetch().
 *
 * In browser dev mode, absolute URLs are rewritten through Vite's
 * `/__proxy/<encoded-url>` middleware so that requests to arbitrary remote
 * servers bypass CORS without needing Tauri.
 */
async function httpFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const tauriFetch = await tauriFetchReady;
  if (tauriFetch) return tauriFetch(input, init);

  // In browser dev mode, route absolute URLs through the Vite proxy plugin.
  if (typeof input === "string" && input.startsWith("http")) {
    input = `/__proxy/${encodeURIComponent(input)}`;
  } else if (input instanceof URL) {
    input = `/__proxy/${encodeURIComponent(input.toString())}`;
  }

  return fetch(input, init);
}

/**
 * The baseUrl is set to the user-supplied server URL in all contexts.
 *
 * - In Tauri: requests are made directly via the Rust HTTP plugin.
 * - In browser dev mode: httpFetch() rewrites absolute URLs through
 *   Vite's /__proxy/ middleware, bypassing CORS.
 * - In production (same-origin): baseUrl can be left empty for relative
 *   URLs, or set to the CDA origin.
 */
class SovdClient {
  /** URL prefix used in actual fetch() calls. Empty = relative / same-origin. */
  private baseUrl = "";

  /** Human-readable target URL shown in the UI. */
  private displayUrl = "http://localhost:20002";

  private token: string | null = null;

  // -- configuration -------------------------------------------------------

  /**
   * Set the fetch base URL.  Pass an empty string to use relative URLs
   * (Vite proxy / same-origin).
   */
  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  /** The URL that will be prefixed to every fetch path. */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Store a human-readable URL for display purposes only. */
  setDisplayUrl(url: string) {
    this.displayUrl = url;
  }

  getDisplayUrl(): string {
    return this.displayUrl;
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  getToken(): string | null {
    return this.token;
  }

  clearToken() {
    this.token = null;
  }

  // -- internal helpers -----------------------------------------------------

  private url(path: string): string {
    return `${this.baseUrl}${API_PREFIX}${path}`;
  }

  private healthUrl(): string {
    return `${this.baseUrl}/health/ready`;
  }

  private headers(): HeadersInit {
    const h: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const resp = await httpFetch(this.url(path), {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      let errorBody: string;
      try {
        errorBody = await resp.text();
      } catch {
        errorBody = resp.statusText;
      }
      throw new Error(
        `${method} ${path} failed (${resp.status}): ${errorBody}`
      );
    }

    if (resp.status === 204) {
      return undefined as T;
    }

    return resp.json() as Promise<T>;
  }

  /**
   * Send a raw binary request (application/octet-stream) and receive
   * either binary or JSON back depending on the Accept header.
   */
  async requestRaw(
    method: string,
    path: string,
    body?: ArrayBuffer | Uint8Array,
    accept: string = "application/octet-stream"
  ): Promise<ArrayBuffer> {
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      Accept: accept,
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    // Convert body to ArrayBuffer for fetch compatibility
    let fetchBody: ArrayBuffer | undefined;
    if (body) {
      if (body instanceof Uint8Array) {
        fetchBody = body.buffer.slice(
          body.byteOffset,
          body.byteOffset + body.byteLength
        ) as ArrayBuffer;
      } else {
        fetchBody = body;
      }
    }

    const resp = await httpFetch(this.url(path), {
      method,
      headers,
      body: fetchBody,
    });

    if (!resp.ok) {
      let errorBody: string;
      try {
        errorBody = await resp.text();
      } catch {
        errorBody = resp.statusText;
      }
      throw new Error(
        `${method} ${path} failed (${resp.status}): ${errorBody}`
      );
    }

    return resp.arrayBuffer();
  }

  // -- public API -----------------------------------------------------------

  async login(clientId: string, clientSecret: string): Promise<string> {
    const resp = await httpFetch(this.url("/authorize"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!resp.ok) {
      throw new Error(`Login failed (${resp.status}): ${resp.statusText}`);
    }
    const data = (await resp.json()) as AuthResponse;
    this.token = data.access_token;
    return this.token;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const resp = await httpFetch(this.healthUrl());
      return resp.status === 204;
    } catch {
      return false;
    }
  }

  // Components
  async getComponents(): Promise<ComponentList> {
    return this.request<ComponentList>("GET", "/components");
  }

  async getComponent(ecuId: string): Promise<EcuDetail> {
    return this.request<EcuDetail>("GET", `/components/${ecuId}`);
  }

  async triggerVariantDetection(ecuId: string): Promise<void> {
    // Server returns 200 with empty body — skip JSON parsing
    const resp = await httpFetch(this.url(`/components/${ecuId}`), {
      method: "PUT",
      headers: this.headers(),
    });
    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => resp.statusText);
      throw new Error(
        `PUT /components/${ecuId} failed (${resp.status}): ${errorBody}`
      );
    }
  }

  // Data
  async getDataServices(ecuId: string): Promise<DataServiceList> {
    return this.request<DataServiceList>("GET", `/components/${ecuId}/data`);
  }

  async readData(ecuId: string, serviceId: string): Promise<DataServiceResponse> {
    return this.request<DataServiceResponse>(
      "GET",
      `/components/${ecuId}/data/${serviceId}`
    );
  }

  async writeData(
    ecuId: string,
    serviceId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    return this.request<void>(
      "PUT",
      `/components/${ecuId}/data/${serviceId}`,
      { data }
    );
  }

  // Configurations
  async getConfigurations(ecuId: string): Promise<ConfigurationList> {
    return this.request<ConfigurationList>(
      "GET",
      `/components/${ecuId}/configurations`
    );
  }

  async readConfiguration(
    ecuId: string,
    serviceId: string
  ): Promise<DataServiceResponse> {
    return this.request<DataServiceResponse>(
      "GET",
      `/components/${ecuId}/configurations/${serviceId}`
    );
  }

  // Operations
  async getOperations(ecuId: string): Promise<OperationList> {
    return this.request<OperationList>(
      "GET",
      `/components/${ecuId}/operations`
    );
  }

  /**
   * Fetch the SOVD online capability description (OpenAPI spec) for any
   * resource.  `resourcePath` is relative to `/components/{ecuId}/`.
   *
   * Example: getResourceDocs("ecu1", "operations/MyOp")
   *       -> GET /components/ecu1/operations/MyOp/docs
   */
  async getResourceDocs(
    ecuId: string,
    resourcePath: string
  ): Promise<unknown> {
    return this.request<unknown>(
      "GET",
      `/components/${ecuId}/${resourcePath}/docs`
    );
  }

  async getOperationDetail(
    ecuId: string,
    operationId: string
  ): Promise<OperationDetail> {
    const spec = await this.getResourceDocs(ecuId, `operations/${operationId}`);
    return parseOperationDocs(operationId, spec);
  }

  async executeOperation(
    ecuId: string,
    operationId: string,
    params?: Record<string, unknown>
  ): Promise<OperationExecution> {
    // CDA always expects a JSON body; send {} when there are no parameters.
    const body = params && Object.keys(params).length > 0
      ? { parameters: params }
      : {};
    return this.request<OperationExecution>(
      "POST",
      `/components/${ecuId}/operations/${operationId}/executions`,
      body
    );
  }

  async getOperationExecutions(
    ecuId: string,
    operationId: string
  ): Promise<OperationExecutionList> {
    return this.request<OperationExecutionList>(
      "GET",
      `/components/${ecuId}/operations/${operationId}/executions`
    );
  }

  async getOperationExecution(
    ecuId: string,
    operationId: string,
    executionId: string
  ): Promise<OperationExecution> {
    return this.request<OperationExecution>(
      "GET",
      `/components/${ecuId}/operations/${operationId}/executions/${executionId}`
    );
  }

  async deleteOperationExecution(
    ecuId: string,
    operationId: string,
    executionId: string
  ): Promise<OperationExecution | undefined> {
    return this.request<OperationExecution | undefined>(
      "DELETE",
      `/components/${ecuId}/operations/${operationId}/executions/${executionId}`
    );
  }

  // Faults (DTCs)
  async getFaults(ecuId: string): Promise<FaultList> {
    return this.request<FaultList>("GET", `/components/${ecuId}/faults`);
  }

  async getFault(ecuId: string, faultId: string): Promise<Fault> {
    return this.request<Fault>(
      "GET",
      `/components/${ecuId}/faults/${faultId}`
    );
  }

  async clearFaults(ecuId: string): Promise<void> {
    return this.request<void>("DELETE", `/components/${ecuId}/faults`);
  }

  async clearFault(ecuId: string, faultId: string): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/components/${ecuId}/faults/${faultId}`
    );
  }

  // Modes
  async getModes(ecuId: string): Promise<ModeList> {
    return this.request<ModeList>("GET", `/components/${ecuId}/modes`);
  }

  async getMode(ecuId: string, modeId: string): Promise<ModeValue> {
    return this.request<ModeValue>(
      "GET",
      `/components/${ecuId}/modes/${modeId}`
    );
  }

  async setMode(
    ecuId: string,
    modeId: string,
    value: string,
    params?: Record<string, unknown>
  ): Promise<ModeValue> {
    return this.request<ModeValue>(
      "PUT",
      `/components/${ecuId}/modes/${modeId}`,
      { value, ...params }
    );
  }

  // Locks
  async getLocks(ecuId: string): Promise<LockList> {
    return this.request<LockList>("GET", `/components/${ecuId}/locks`);
  }

  async getLock(ecuId: string, lockId: string): Promise<LockDetail> {
    return this.request<LockDetail>(
      "GET",
      `/components/${ecuId}/locks/${lockId}`
    );
  }

  async createLock(ecuId: string, timeout?: number): Promise<Lock> {
    const body = timeout ? { lock_expiration: timeout } : undefined;
    return this.request<Lock>("POST", `/components/${ecuId}/locks`, body);
  }

  async deleteLock(ecuId: string, lockId: string): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/components/${ecuId}/locks/${lockId}`
    );
  }

  // Generic Service
  async executeGenericService(
    ecuId: string,
    serviceData: string
  ): Promise<GenericServiceResponse> {
    // Convert hex string like "22 F1 90" to raw bytes
    const hexClean = serviceData.replace(/\s+/g, "");
    if (hexClean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hexClean)) {
      throw new Error("Invalid hex string — use pairs of hex digits (e.g. 22 F1 90)");
    }
    const bytes = new Uint8Array(hexClean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hexClean.substring(i * 2, i * 2 + 2), 16);
    }

    const h: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      Accept: "application/octet-stream",
    };
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }

    const resp = await httpFetch(this.url(`/components/${ecuId}/genericservice`), {
      method: "PUT",
      headers: h,
      body: bytes,
    });

    if (!resp.ok) {
      let errorBody: string;
      try {
        errorBody = await resp.text();
      } catch {
        errorBody = resp.statusText;
      }
      throw new Error(
        `PUT /components/${ecuId}/genericservice failed (${resp.status}): ${errorBody}`
      );
    }

    // Response is raw bytes — convert back to hex string
    const buf = await resp.arrayBuffer();
    const respBytes = new Uint8Array(buf);
    const hex = Array.from(respBytes)
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");

    return { service_data: hex };
  }
}

export const sovdClient = new SovdClient();
export default sovdClient;
