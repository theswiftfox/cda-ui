<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  getCdaLogs,
  clearCdaLogs,
  stopCda,
  onLogLine,
  getCdaStatus,
  onStatusChanged,
  type CdaStatus,
} from '../../api/cdaProcess'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const logs = ref<string[]>([])
const autoScroll = ref(true)
const filter = ref('')
const status = ref<CdaStatus>({ type: 'Stopped' })

let unlistenLog: (() => void) | null = null
let unlistenStatus: (() => void) | null = null
const logContainer = ref<HTMLElement | null>(null)

onMounted(async () => {
  logs.value = await getCdaLogs()
  status.value = await getCdaStatus()

  unlistenLog = await onLogLine((line) => {
    logs.value.push(line)
    // Keep buffer capped on client side too
    if (logs.value.length > 5000) {
      logs.value = logs.value.slice(-4000)
    }
    if (autoScroll.value) {
      nextTick(() => scrollToBottom())
    }
  })

  unlistenStatus = await onStatusChanged((s) => {
    status.value = s
  })
})

onUnmounted(() => {
  unlistenLog?.()
  unlistenStatus?.()
})

watch(() => props.visible, (v) => {
  if (v && autoScroll.value) {
    nextTick(() => scrollToBottom())
  }
})

function scrollToBottom() {
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

function handleScroll() {
  if (!logContainer.value) return
  const el = logContainer.value
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
  autoScroll.value = atBottom
}

async function handleClear() {
  await clearCdaLogs()
  logs.value = []
}

async function handleStop() {
  await stopCda()
}

function copyLogs() {
  const text = filteredLogs.value.join('\n')
  navigator.clipboard.writeText(text)
}

import { computed } from 'vue'

const filteredLogs = computed(() => {
  if (!filter.value) return logs.value
  const f = filter.value.toLowerCase()
  return logs.value.filter((l) => l.toLowerCase().includes(f))
})

const statusLabel = computed(() => {
  const s = status.value
  switch (s.type) {
    case 'Running': return `Running (PID ${s.pid})`
    case 'Starting': return 'Starting...'
    case 'Crashed': return `Crashed (code ${s.exit_code ?? '?'})`
    default: return 'Stopped'
  }
})

const statusClass = computed(() => {
  switch (status.value.type) {
    case 'Running': return 'log-status-running'
    case 'Starting': return 'log-status-starting'
    case 'Crashed': return 'log-status-crashed'
    default: return 'log-status-stopped'
  }
})

function lineClass(line: string): string {
  if (line.startsWith('[stderr]')) return 'log-line-stderr'
  if (line.toLowerCase().includes('error')) return 'log-line-error'
  if (line.toLowerCase().includes('warn')) return 'log-line-warn'
  return 'log-line-normal'
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="log-viewer-overlay" @click.self="emit('close')">
      <div class="log-viewer-panel">
        <!-- Header -->
        <div class="log-viewer-header">
          <div class="log-viewer-title">
            <span>CDA Process Logs</span>
            <span :class="['log-status-pill', statusClass]">{{ statusLabel }}</span>
          </div>
          <div class="log-viewer-actions">
            <input
              type="text"
              v-model="filter"
              class="log-filter-input"
              placeholder="Filter logs..."
            />
            <button class="btn btn-tiny btn-secondary" @click="copyLogs" title="Copy to clipboard">
              Copy
            </button>
            <button class="btn btn-tiny btn-secondary" @click="handleClear" title="Clear logs">
              Clear
            </button>
            <button
              v-if="status.type === 'Running' || status.type === 'Starting'"
              class="btn btn-tiny btn-danger"
              @click="handleStop"
              title="Stop CDA"
            >
              Stop
            </button>
            <button class="btn btn-tiny btn-secondary" @click="emit('close')">
              Close
            </button>
          </div>
        </div>

        <!-- Log output -->
        <div
          ref="logContainer"
          class="log-viewer-output"
          @scroll="handleScroll"
        >
          <div v-if="filteredLogs.length === 0" class="log-viewer-empty">
            {{ filter ? 'No matching log lines' : 'No log output yet' }}
          </div>
          <div
            v-for="(line, i) in filteredLogs"
            :key="i"
            :class="['log-line', lineClass(line)]"
          >{{ line }}</div>
        </div>

        <!-- Footer -->
        <div class="log-viewer-footer">
          <span class="log-line-count">{{ filteredLogs.length }} lines</span>
          <label class="log-autoscroll">
            <input type="checkbox" v-model="autoScroll" />
            <span>Auto-scroll</span>
          </label>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.log-viewer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 40px;
}

.log-viewer-panel {
  width: 100%;
  max-width: 1000px;
  height: 60vh;
  background: var(--bg-panel);
  border: 1px solid var(--border-mid);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.log-viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-mid);
  border-bottom: 1px solid var(--border-dark);
  gap: 12px;
  flex-shrink: 0;
}

.log-viewer-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-bright);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.log-status-pill {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.log-status-running {
  background: var(--accent-green-dim);
  color: var(--accent-green);
}

.log-status-starting {
  background: var(--accent-yellow-dim);
  color: var(--accent-yellow);
}

.log-status-crashed {
  background: var(--accent-red-dim);
  color: var(--accent-red);
}

.log-status-stopped {
  background: var(--bg-card);
  color: var(--text-muted);
}

.log-viewer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.log-filter-input {
  padding: 3px 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-mid);
  border-radius: var(--radius-sm);
  color: var(--text-bright);
  font-size: 11px;
  font-family: var(--font-mono);
  width: 160px;
  outline: none;
}

.log-filter-input:focus {
  border-color: var(--accent-blue);
}

.log-viewer-output {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  background: var(--bg-darkest);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
}

.log-viewer-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-style: italic;
}

.log-line {
  padding: 0 16px;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line:hover {
  background: rgba(255, 255, 255, 0.02);
}

.log-line-normal {
  color: var(--text-primary);
}

.log-line-stderr {
  color: var(--accent-yellow);
}

.log-line-error {
  color: var(--accent-red);
}

.log-line-warn {
  color: var(--accent-yellow);
}

.log-viewer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: var(--bg-mid);
  border-top: 1px solid var(--border-dark);
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.log-line-count {
  font-family: var(--font-mono);
}

.log-autoscroll {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}

.log-autoscroll input {
  accent-color: var(--accent-blue);
}
</style>
