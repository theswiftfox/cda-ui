<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
const props = defineProps<{
  executions: Array<{ id: string; status: string }>
  loading: boolean
  selectedOp: string
  capabilities?: string[]
}>()

const emit = defineEmits<{
  poll: [execId: string]
  stop: [execId: string]
  refresh: []
}>()

function hasCap(cap: string): boolean {
  if (!props.capabilities || props.capabilities.length === 0) return true
  return props.capabilities.includes(cap)
}
</script>

<template>
  <div v-if="loading" class="loading-text">Loading executions...</div>
  <div v-else class="exec-list-section">
    <div class="section-header">
      Executions
      <span class="count-badge">{{ executions.length }}</span>
      <button
        class="btn-icon"
        @click="emit('refresh')"
        title="Refresh executions"
        style="margin-left: auto"
      >
        &#x21bb;
      </button>
    </div>

    <div v-if="executions.length === 0" class="param-empty">
      No active executions for {{ selectedOp }}
    </div>
    <table v-else class="data-table exec-table">
      <thead>
        <tr>
          <th>Execution ID</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="ex in executions" :key="ex.id">
          <td class="mono exec-id-cell" :title="ex.id">{{ ex.id }}</td>
          <td>
            <span :class="['exec-status-badge', `exec-status-${ex.status}`]">
              {{ ex.status }}
            </span>
          </td>
          <td class="exec-actions-cell">
            <button
              class="btn btn-tiny"
              @click="emit('poll', ex.id)"
              title="Fetch latest status / request results"
            >
              Poll
            </button>
            <button
              v-if="hasCap('stop')"
              class="btn btn-tiny btn-danger"
              @click="emit('stop', ex.id)"
              title="Stop and remove this execution"
            >
              Stop / Delete
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
