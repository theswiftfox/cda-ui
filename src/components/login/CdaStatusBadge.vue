<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  getCdaStatus,
  onStatusChanged,
  type CdaStatus,
} from '../../api/cdaProcess'

const emit = defineEmits<{
  click: []
}>()

const status = ref<CdaStatus>({ type: 'Stopped' })
let unlistenStatus: (() => void) | null = null

onMounted(async () => {
  status.value = await getCdaStatus()
  unlistenStatus = await onStatusChanged((s) => {
    status.value = s
  })
})

onUnmounted(() => {
  unlistenStatus?.()
})

function dotClass(): string {
  switch (status.value.type) {
    case 'Running': return 'dot-running'
    case 'Starting': return 'dot-starting'
    case 'Crashed': return 'dot-crashed'
    default: return 'dot-stopped'
  }
}

function label(): string {
  const s = status.value
  switch (s.type) {
    case 'Running': return `CDA: PID ${s.pid}`
    case 'Starting': return 'CDA: Starting'
    case 'Crashed': return 'CDA: Crashed'
    default: return 'CDA: Stopped'
  }
}
</script>

<template>
  <div
    class="cda-status-badge-widget"
    @click="emit('click')"
    :title="'Click to view CDA logs'"
  >
    <span :class="['cda-dot', dotClass()]" />
    <span class="cda-badge-label">{{ label() }}</span>
  </div>
</template>

<style scoped>
.cda-status-badge-widget {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  transition: background-color 0.15s;
  user-select: none;
}

.cda-status-badge-widget:hover {
  background: var(--bg-hover);
}

.cda-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-running {
  background: var(--accent-green);
  box-shadow: 0 0 6px var(--accent-green);
}

.dot-starting {
  background: var(--accent-yellow);
  box-shadow: 0 0 6px var(--accent-yellow);
  animation: pulse 1.2s ease-in-out infinite;
}

.dot-crashed {
  background: var(--accent-red);
  box-shadow: 0 0 6px var(--accent-red);
}

.dot-stopped {
  background: var(--text-muted);
}

.cda-badge-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-secondary);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
