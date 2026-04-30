// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

/**
 * Parses SOVD `/docs` responses (OpenAPI 3.1.0 specs) into domain types
 * the UI can consume directly.
 *
 * The `/docs` endpoint is defined by SOVD ISO 17978-3 section 7.5 as a
 * universal sub-resource (`GET /{any-path}/docs`) that returns a self-contained
 * OpenAPI spec describing the parent resource.
 */
import type { OperationDetail, ParamSchema } from "../types/sovd";

// ---- helpers ---------------------------------------------------------------

type JsonObj = Record<string, unknown>;

function isObj(v: unknown): v is JsonObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Safely walk a nested object by dot-free path segments. */
function dig(obj: unknown, ...keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) {
    if (!isObj(cur)) return undefined;
    cur = (cur as JsonObj)[k];
  }
  return cur;
}

/**
 * Convert an OpenAPI `schema.properties` map into the flat
 * `Record<string, ParamSchema>` the UI already uses.
 */
function extractParams(schema: unknown): Record<string, ParamSchema> {
  if (!isObj(schema)) return {};
  const props = schema["properties"];
  if (!isObj(props)) return {};

  const out: Record<string, ParamSchema> = {};
  for (const [name, raw] of Object.entries(props)) {
    if (!isObj(raw)) continue;
    const p: ParamSchema = {};
    if (typeof raw["type"] === "string") p.type = raw["type"] as ParamSchema["type"];
    if (Array.isArray(raw["enum"])) p.enum = raw["enum"] as string[];
    if (raw["default"] !== undefined) p.default = raw["default"];
    if (typeof raw["minimum"] === "number") p.minimum = raw["minimum"];
    if (typeof raw["maximum"] === "number") p.maximum = raw["maximum"];
    if (typeof raw["exclusiveMinimum"] === "number") p.exclusiveMinimum = raw["exclusiveMinimum"];
    if (typeof raw["exclusiveMaximum"] === "number") p.exclusiveMaximum = raw["exclusiveMaximum"];
    if (isObj(raw["properties"])) p.properties = extractParams(raw as JsonObj);
    if (isObj(raw["items"])) p.items = extractParams({ properties: { _: raw["items"] } })["_"];
    if (Array.isArray(raw["anyOf"])) {
      p.anyOf = (raw["anyOf"] as unknown[]).filter(isObj).map((v) => {
        const inner = extractParams({ properties: { _: v } });
        return inner["_"] ?? {};
      });
    }
    out[name] = p;
  }
  return out;
}

// ---- operations ------------------------------------------------------------

/**
 * Parse an OpenAPI spec returned by
 * `GET /components/{ecu}/operations/{op}/docs`
 * into an `OperationDetail` the UI can consume.
 */
export function parseOperationDocs(
  operationId: string,
  spec: unknown
): OperationDetail {
  if (!isObj(spec)) {
    return { id: operationId, parameters: {} };
  }

  const paths = spec["paths"];
  if (!isObj(paths)) {
    return { id: operationId, parameters: {} };
  }

  // The spec contains paths like:
  //   /components/{ecu}/operations/{op}/executions          (POST = start, GET = list)
  //   /components/{ecu}/operations/{op}/executions/{id}     (GET = status, PUT = capability, DELETE = terminate)
  // Path keys are lowercase in the CDA implementation.

  let executionsPath: JsonObj | undefined;
  let executionIdPath: JsonObj | undefined;

  for (const [pathKey, pathVal] of Object.entries(paths)) {
    if (!isObj(pathVal)) continue;
    // Match .../executions (no trailing segment)
    if (/\/executions\/?$/.test(pathKey)) {
      executionsPath = pathVal;
    }
    // Match .../executions/{...}
    if (/\/executions\/\{[^}]+\}\/?$/.test(pathKey)) {
      executionIdPath = pathVal;
    }
  }

  // --- Input parameters: POST .../executions → requestBody.schema.properties.parameters
  let inputParameters: Record<string, ParamSchema> = {};
  const postOp = executionsPath?.["post"];
  if (isObj(postOp)) {
    const bodySchema = dig(
      postOp,
      "requestBody",
      "content",
      "application/json",
      "schema"
    );
    if (isObj(bodySchema)) {
      const paramsSchema = dig(bodySchema, "properties", "parameters");
      if (isObj(paramsSchema)) {
        inputParameters = extractParams(paramsSchema);
      }
    }
  }

  // --- Output parameters: GET .../executions/{id} → 200 response.schema.properties.parameters
  let outputParameters: Record<string, ParamSchema> = {};
  const getExecOp = executionIdPath?.["get"];
  if (isObj(getExecOp)) {
    const respSchema = dig(
      getExecOp,
      "responses",
      "200",
      "content",
      "application/json",
      "schema"
    );
    if (isObj(respSchema)) {
      const paramsSchema = dig(respSchema, "properties", "parameters");
      if (isObj(paramsSchema)) {
        outputParameters = extractParams(paramsSchema);
      }
    }
  }

  // --- Capabilities: PUT .../executions/{id} → requestBody.schema.properties.capability.enum
  let capabilities: string[] = [];
  const putOp = executionIdPath?.["put"];
  if (isObj(putOp)) {
    const putSchema = dig(
      putOp,
      "requestBody",
      "content",
      "application/json",
      "schema"
    );
    const capEnum = dig(putSchema, "properties", "capability", "enum");
    if (Array.isArray(capEnum)) {
      capabilities = capEnum.filter((v): v is string => typeof v === "string");
    }
  }

  // --- Flags from SOVD extensions on the POST operation
  let asyncExecution = false;
  let proximityProofRequired = false;
  if (isObj(postOp)) {
    if (typeof postOp["x-sovd-asynchronous-execution"] === "boolean") {
      asyncExecution = postOp["x-sovd-asynchronous-execution"];
    }
    if (typeof postOp["x-sovd-proximity-proof-required"] === "boolean") {
      proximityProofRequired = postOp["x-sovd-proximity-proof-required"];
    }
  }

  return {
    id: operationId,
    parameters: inputParameters,
    outputParameters:
      Object.keys(outputParameters).length > 0 ? outputParameters : undefined,
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    asyncExecution,
    proximityProofRequired,
  };
}
