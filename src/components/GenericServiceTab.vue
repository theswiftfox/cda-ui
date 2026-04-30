<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref } from 'vue'
import sovdClient from '../api/client'

const props = defineProps<{
  ecuId: string
}>()

const serviceData = ref('')
const result = ref<Record<string, unknown> | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const history = ref<Array<{ request: string; response: string; timestamp: string }>>([])

async function execute() {
  if (!serviceData.value.trim()) return
  loading.value = true
  error.value = null
  result.value = null
  try {
    const resp = await sovdClient.executeGenericService(props.ecuId, serviceData.value)
    result.value = resp as unknown as Record<string, unknown>
    history.value = [
      {
        request: serviceData.value,
        response: resp.service_data,
        timestamp: new Date().toISOString(),
      },
      ...history.value,
    ]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    error.value = msg
    history.value = [
      {
        request: serviceData.value,
        response: `ERROR: ${msg}`,
        timestamp: new Date().toISOString(),
      },
      ...history.value,
    ]
  } finally {
    loading.value = false
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') execute()
}
</script>

<template>
  <div class="generic-tab">
    <div class="section-header">Generic UDS Service</div>
    <p class="help-text">
      Send raw UDS service data as hex bytes (e.g., "22 F1 90" for
      ReadDataByIdentifier).
    </p>
    <div class="generic-form">
      <input
        type="text"
        v-model="serviceData"
        placeholder="e.g. 22 F1 90"
        class="generic-input mono"
        @keydown="onKeyDown"
      />
      <button
        class="btn btn-primary"
        @click="execute"
        :disabled="loading || !serviceData.trim()"
      >
        {{ loading ? 'Sending...' : 'Send' }}
      </button>
    </div>

    <div v-if="error" class="error-text">{{ error }}</div>
    <div v-if="result" class="read-result-panel">
      <div class="section-header">Response</div>
      <pre class="result-json mono">{{ result.service_data }}</pre>
    </div>

    <div v-if="history.length > 0" class="history-panel">
      <div class="section-header">Command History</div>
      <div v-for="(h, i) in history" :key="i" class="history-entry">
        <div class="history-time">{{ h.timestamp }}</div>
        <div class="history-req mono">&gt; {{ h.request }}</div>
        <pre class="history-resp mono">{{ h.response }}</pre>
      </div>
    </div>
  </div>
</template>
