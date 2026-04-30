<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import {
  type LogEntry,
  type SavedScript,
  loadScripts,
  upsertScript,
  deleteScript,
  runScript,
} from '../lib/scriptRunner'

const props = defineProps<{
  ecuId: string
}>()

const EXAMPLE_SCRIPT = `// Authentication script for ECU: \${cda.ecuId}
//
// The "cda" object is available with these helpers:
//
//   await cda.readData(serviceId)                  -> JSON
//   await cda.executeOperation(opId, params?)       -> JSON
//   await cda.executeOperationRaw(opId, bytes)      -> Uint8Array
//   await cda.genericService(hexString)             -> JSON
//   await cda.fetch(url, options?)                   -> {status, headers, body, arrayBuffer()}
//
//   cda.hexToBytes("AA BB 00")     -> Uint8Array
//   cda.bytesToHex(bytes)          -> "aabb00"
//   cda.base64Encode(bytes)        -> base64 string
//   cda.base64Decode(b64)          -> Uint8Array
//   cda.concatBytes(a, b, ...)     -> Uint8Array
//
//   cda.log(...), cda.warn(...), cda.error(...)
//   await cda.sleep(ms)

cda.log("Starting authentication for", cda.ecuId);

// Example: read VIN
// const vin = await cda.readData("vindataidentifier");
// cda.log("VIN:", vin);

cda.log("Done — replace this with your vendor-specific auth flow.");
`

const scripts = ref<SavedScript[]>([])
const selectedName = ref<string | null>(null)
const code = ref(EXAMPLE_SCRIPT)
const dirty = ref(false)
const logs = ref<LogEntry[]>([])
const running = ref(false)
const lastResult = ref<{ success: boolean; durationMs: number } | null>(null)

let abortController: AbortController | null = null
const logEnd = ref<HTMLDivElement | null>(null)

// Load saved scripts from localStorage
onMounted(() => {
  scripts.value = loadScripts()
})

// Auto-scroll log console
watch(logs, async () => {
  await nextTick()
  logEnd.value?.scrollIntoView({ behavior: 'smooth' })
}, { deep: true })

// Select a saved script
function selectScript(name: string) {
  const found = scripts.value.find((s) => s.name === name)
  if (found) {
    selectedName.value = name
    code.value = found.code
    dirty.value = false
  }
}

// New blank script
function newScript() {
  selectedName.value = null
  code.value = EXAMPLE_SCRIPT
  dirty.value = false
  logs.value = []
  lastResult.value = null
}

// Save current script
function save() {
  const name = selectedName.value ?? prompt('Script name:')?.trim()
  if (!name) return
  upsertScript(name, code.value)
  selectedName.value = name
  scripts.value = loadScripts()
  dirty.value = false
}

// Delete selected script
function remove() {
  if (!selectedName.value) return
  if (!confirm(`Delete script "${selectedName.value}"?`)) return
  deleteScript(selectedName.value)
  scripts.value = loadScripts()
  newScript()
}

// Import script from file
function importScript() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.js,.mjs,.txt'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    const name = file.name.replace(/\.(js|mjs|txt)$/, '')
    selectedName.value = null
    code.value = text
    dirty.value = true
    // Auto-save with filename
    upsertScript(name, text)
    selectedName.value = name
    scripts.value = loadScripts()
    dirty.value = false
  }
  input.click()
}

// Export current script to file
function exportScript() {
  const name = selectedName.value ?? 'auth-script'
  const blob = new Blob([code.value], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.js`
  a.click()
  URL.revokeObjectURL(url)
}

// Run the script
async function run() {
  running.value = true
  logs.value = []
  lastResult.value = null

  const ctrl = new AbortController()
  abortController = ctrl

  try {
    const result = await runScript(props.ecuId, code.value, ctrl.signal)
    logs.value = result.logs
    lastResult.value = {
      success: result.success,
      durationMs: result.durationMs,
    }
  } finally {
    running.value = false
    abortController = null
  }
}

// Abort running script
function abort() {
  abortController?.abort()
}

function onSelectChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value
  if (val) selectScript(val)
  else newScript()
}

function onCodeInput(e: Event) {
  code.value = (e.target as HTMLTextAreaElement).value
  dirty.value = true
}
</script>

<template>
  <div class="auth-scripts-tab">
    <!-- Script selector bar -->
    <div class="script-toolbar">
      <div class="script-selector">
        <select :value="selectedName ?? ''" @change="onSelectChange">
          <option value="">-- New Script --</option>
          <option v-for="s in scripts" :key="s.name" :value="s.name">
            {{ s.name }}
          </option>
        </select>
      </div>

      <div class="script-actions">
        <button class="btn btn-small" @click="newScript" title="New">
          New
        </button>
        <button
          class="btn btn-small btn-primary"
          @click="save"
          title="Save to browser"
        >
          {{ dirty ? 'Save *' : 'Save' }}
        </button>
        <button
          v-if="selectedName"
          class="btn btn-small btn-danger"
          @click="remove"
          title="Delete"
        >
          Delete
        </button>
        <span class="script-separator" />
        <button class="btn btn-small" @click="importScript" title="Import .js file">
          Import
        </button>
        <button class="btn btn-small" @click="exportScript" title="Export to .js file">
          Export
        </button>
      </div>
    </div>

    <!-- Code editor -->
    <div class="script-editor-wrapper">
      <div class="script-editor-label">
        Script{{ selectedName ? `: ${selectedName}` : '' }}
        <span class="script-ecu-badge">ECU: {{ ecuId }}</span>
      </div>
      <textarea
        class="script-editor mono"
        :value="code"
        @input="onCodeInput"
        :spellcheck="false"
        placeholder="Write your authentication script here..."
      />
    </div>

    <!-- Run bar -->
    <div class="script-run-bar">
      <button v-if="!running" class="btn btn-primary btn-execute" @click="run">
        Run Script
      </button>
      <button v-else class="btn btn-danger btn-execute" @click="abort">
        Abort
      </button>

      <span
        v-if="lastResult"
        :class="['script-result-badge', lastResult.success ? 'success' : 'failure']"
      >
        {{ lastResult.success ? 'Completed' : 'Failed' }} in
        {{ lastResult.durationMs.toFixed(0) }}ms
      </span>
    </div>

    <!-- Console output -->
    <div class="script-console">
      <div class="script-console-header">
        Console
        <span class="count-badge">{{ logs.length }}</span>
        <button
          v-if="logs.length > 0"
          class="btn-icon"
          @click="logs = []"
          title="Clear console"
          style="margin-left: auto"
        >
          &#x2715;
        </button>
      </div>
      <div class="script-console-output mono">
        <div v-if="logs.length === 0 && !running" class="script-console-empty">
          Script output will appear here...
        </div>
        <div
          v-for="(entry, i) in logs"
          :key="i"
          :class="['console-line', `console-${entry.level}`]"
        >
          <span class="console-time">{{ entry.timestamp.toLocaleTimeString() }}</span>
          <span class="console-msg">{{ entry.message }}</span>
        </div>
        <div v-if="running" class="console-line console-log">
          <span class="console-running">Running...</span>
        </div>
        <div ref="logEnd" />
      </div>
    </div>
  </div>
</template>
