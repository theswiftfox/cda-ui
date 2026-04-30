<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import type { ParamSchema } from '../types/sovd'
import ParameterForm from './ParameterForm.vue'

const props = defineProps<{
  execResult: Record<string, unknown>
  selectedOp: string
  outputSchema?: Record<string, ParamSchema>
  capabilities?: string[]
}>()

const emit = defineEmits<{
  poll: [execId: string]
  stop: [execId: string]
}>()

const status = typeof props.execResult.status === 'string' ? props.execResult.status : null
const execId = typeof props.execResult.id === 'string' ? props.execResult.id : null
const progress = typeof props.execResult.progress === 'number' ? props.execResult.progress : null
const outParams =
  props.execResult.parameters && typeof props.execResult.parameters === 'object'
    ? (props.execResult.parameters as Record<string, unknown>)
    : null

const hasOutputSchema =
  props.outputSchema !== undefined && Object.keys(props.outputSchema).length > 0

function hasCap(cap: string): boolean {
  // When no capabilities are provided (old behavior / fallback), allow everything
  if (!props.capabilities || props.capabilities.length === 0) return true
  return props.capabilities.includes(cap)
}
</script>

<template>
  <div class="read-result-panel">
    <div class="section-header">
      Execution Result: {{ selectedOp }}
      <span v-if="status === 'running' && execId" class="exec-actions">
        <button class="btn btn-small" @click="emit('poll', execId)">
          Poll Status
        </button>
        <button
          v-if="hasCap('stop')"
          class="btn btn-small btn-danger"
          @click="emit('stop', execId)"
        >
          Stop
        </button>
      </span>
    </div>

    <div v-if="status" class="exec-status-row">
      <span class="exec-status-label">Status:</span>
      <span :class="['exec-status-badge', `exec-status-${status}`]">{{ status }}</span>
      <span v-if="progress !== null" class="exec-progress">Progress: {{ progress }}%</span>
    </div>

    <div v-if="outParams && Object.keys(outParams).length > 0" class="op-param-section op-output-params">
      <div class="op-param-header">Output Parameters</div>
      <ParameterForm
        v-if="hasOutputSchema"
        :parameters="outputSchema!"
        :values="outParams"
        :read-only="true"
      />
      <pre v-else class="result-json">{{ JSON.stringify(outParams, null, 2) }}</pre>
    </div>

    <details class="raw-response-details">
      <summary class="raw-response-summary">Raw Response</summary>
      <pre class="result-json">{{ JSON.stringify(execResult, null, 2) }}</pre>
    </details>
  </div>
</template>
