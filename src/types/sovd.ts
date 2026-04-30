// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

// SOVD API Types for Classic Diagnostic Adapter

export interface AuthRequest {
  client_id: string;
  client_secret: string;
}

export interface AuthResponse {
  access_token: string;
}

export interface ComponentListItem {
  href: string;
  id: string;
  name: string;
}

export interface ComponentList {
  items: ComponentListItem[];
}

export type EcuState =
  | "Online"
  | "Offline"
  | "NotTested"
  | "Duplicate"
  | "Disconnected"
  | "NoVariantDetected";

export interface EcuVariant {
  name: string;
  is_base_variant: boolean;
  state: EcuState;
  logical_address: string;
}

export interface EcuDetail {
  id: string;
  name: string;
  variant: EcuVariant;
  locks: string;
  operations: string;
  data: string;
  configurations: string;
  modes: string;
  faults: string;
}

export interface DataServiceItem {
  href: string;
  id: string;
  name: string;
}

export interface DataServiceList {
  items: DataServiceItem[];
}

export interface DataParameter {
  [key: string]: unknown;
}

export interface DataServiceResponse {
  data: DataParameter;
}

export interface OperationItem {
  href: string;
  id: string;
  name: string;
  proximity_proof_required: boolean;
  asynchronous_execution: boolean;
}

export interface OperationList {
  items: OperationItem[];
}

/**
 * JSON Schema property descriptor for a single operation parameter.
 * Generated from the diagnostic database (ODX compu methods).
 */
export interface ParamSchema {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  /** Allowed values for string enum parameters (TextTable compu method). */
  enum?: string[];
  /** Default value from the diagnostic database. */
  default?: unknown;
  /** Minimum for numeric parameters (physical constraint). */
  minimum?: number;
  /** Maximum for numeric parameters (physical constraint). */
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  /** Nested properties for object-typed parameters (Structure DOP). */
  properties?: Record<string, ParamSchema>;
  /** Item schema for array-typed parameters (EndOfPdu DOP). */
  items?: ParamSchema;
  /** Union variants for mux-typed parameters. */
  anyOf?: ParamSchema[];
}

/**
 * Response from GET /components/{ecu}/operations/{service}
 * Contains the parameter definitions for the operation.
 */
export interface OperationDetail {
  id: string;
  parameters: Record<string, ParamSchema>;
  /** Output parameter schema (from execution response). */
  outputParameters?: Record<string, ParamSchema>;
  /** Capabilities supported by this operation (e.g. execute, stop, freeze, reset). */
  capabilities?: string[];
  /** Whether the operation runs asynchronously. */
  asyncExecution?: boolean;
  /** Whether co-location proximity proof is required. */
  proximityProofRequired?: boolean;
  schema?: unknown;
}

export interface OperationExecution {
  id: string;
  status: "running" | "completed" | "failed" | "stopped";
  capability?: string;
  parameters?: Record<string, unknown>;
  progress?: number;
  error?: Array<{ message: string }>;
  schema?: unknown;
}

export interface OperationExecutionList {
  items: OperationExecution[];
}

export interface FaultStatus {
  test_failed?: boolean;
  test_failed_this_operation_cycle?: boolean;
  pending_dtc?: boolean;
  confirmed_dtc?: boolean;
  test_not_completed_since_last_clear?: boolean;
  test_failed_since_last_clear?: boolean;
  test_not_completed_this_operation_cycle?: boolean;
  warning_indicator_requested?: boolean;
  mask?: string;
}

export interface Fault {
  code: string;
  scope?: string;
  display_code?: string;
  fault_name: string;
  severity?: number;
  status: FaultStatus;
}

export interface FaultList {
  items: Fault[];
}

export interface ModeValue {
  name?: string;
  value?: string;
  translation_id?: string;
}

export interface ModeListItem {
  href: string;
  id: string;
  name: string;
}

export interface ModeList {
  items: ModeListItem[];
}

export interface Lock {
  id: string;
  owned?: boolean;
}

export interface LockDetail {
  lock_expiration: string;
}

export interface LockList {
  items: Lock[];
}

export interface ConfigurationItem {
  href: string;
  id: string;
  name: string;
}

export interface ConfigurationList {
  items: ConfigurationItem[];
}

export interface SovdError {
  message: string;
  error_code: string;
  vendor_code?: string;
  parameters?: Record<string, unknown>;
}

export interface GenericServiceRequest {
  service_data: string;
}

export interface GenericServiceResponse {
  service_data: string;
}
