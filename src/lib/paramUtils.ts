// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

import type { ParamSchema } from "../types/sovd";

/**
 * Initialise parameter values from schema defaults.
 * Returns a map of { paramName: defaultValue } for every param that has a default.
 */
export function defaultsFromSchema(
  parameters: Record<string, ParamSchema>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(parameters)) {
    if (schema.default !== undefined) {
      out[name] = schema.default;
    } else if (schema.enum && schema.enum.length > 0) {
      out[name] = schema.enum[0];
    }
  }
  return out;
}
