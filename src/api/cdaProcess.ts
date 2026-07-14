// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'

// ---------------------------------------------------------------------------
// Types — mirror the Rust types
// ---------------------------------------------------------------------------

export interface CdaLaunchConfig {
  executable_path: string
  config_file?: string | null
  listen_address?: string | null
  listen_port?: number | null
  databases_path?: string | null
  extra_args?: string[]
  working_dir?: string | null
  auto_restart?: boolean
}

export type CdaStatus =
  | { type: 'Stopped' }
  | { type: 'Starting' }
  | { type: 'Running'; pid: number }
  | { type: 'Crashed'; exit_code: number | null; message: string }

// ---------------------------------------------------------------------------
// Commands — thin wrappers around Tauri invoke()
// ---------------------------------------------------------------------------

export async function startCda(config: CdaLaunchConfig): Promise<void> {
  return invoke('start_cda', { config })
}

export async function stopCda(): Promise<void> {
  return invoke('stop_cda')
}

export async function getCdaStatus(): Promise<CdaStatus> {
  return invoke<CdaStatus>('get_cda_status')
}

export async function getCdaLogs(lines?: number): Promise<string[]> {
  return invoke<string[]>('get_cda_logs', { lines: lines ?? null })
}

export async function clearCdaLogs(): Promise<void> {
  return invoke('clear_cda_logs')
}

export async function isBundledCdaAvailable(): Promise<boolean> {
  return invoke<boolean>('is_bundled_cda_available')
}

// ---------------------------------------------------------------------------
// File dialogs
// ---------------------------------------------------------------------------

/** Open a native file picker for the CDA executable. */
export async function selectExecutable(): Promise<string | null> {
  const result = await open({
    title: 'Select CDA Executable',
    multiple: false,
    directory: false,
  })
  return result ?? null
}

/** Open a native file picker for a TOML configuration file. */
export async function selectConfigFile(): Promise<string | null> {
  const result = await open({
    title: 'Select CDA Configuration File',
    multiple: false,
    directory: false,
    filters: [{ name: 'TOML', extensions: ['toml'] }],
  })
  return result ?? null
}

/** Open a native folder picker for the databases directory. */
export async function selectDatabasesDir(): Promise<string | null> {
  const result = await open({
    title: 'Select Databases Directory',
    multiple: false,
    directory: true,
  })
  return result ?? null
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

export function onStatusChanged(cb: (status: CdaStatus) => void): Promise<UnlistenFn> {
  return listen<CdaStatus>('cda-status-changed', (event) => {
    cb(event.payload)
  })
}

export function onLogLine(cb: (line: string) => void): Promise<UnlistenFn> {
  return listen<string>('cda-log-line', (event) => {
    cb(event.payload)
  })
}
