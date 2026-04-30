<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import sovdClient from '../api/client'
import StatusBit from './StatusBit.vue'

const props = defineProps<{
  ecuId: string
}>()

const faults = ref<Array<{
  code: string
  fault_name: string
  status: {
    test_failed?: boolean
    test_failed_this_operation_cycle?: boolean
    pending_dtc?: boolean
    confirmed_dtc?: boolean
    test_not_completed_since_last_clear?: boolean
    test_failed_since_last_clear?: boolean
    test_not_completed_this_operation_cycle?: boolean
    warning_indicator_requested?: boolean
    mask?: string
  }
  severity?: number
}>>([])
const loading = ref(false)
const error = ref<string | null>(null)
const search = ref('')
const selectedFault = ref<string | null>(null)
const faultDetail = ref<Record<string, unknown> | null>(null)

const filteredFaults = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return faults.value
  return faults.value.filter(
    (f) => f.code.toLowerCase().includes(q) || f.fault_name.toLowerCase().includes(q)
  )
})

async function loadFaults() {
  loading.value = true
  error.value = null
  try {
    const result = await sovdClient.getFaults(props.ecuId)
    faults.value = result.items ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadFaults()
})

async function viewFault(code: string) {
  selectedFault.value = code
  try {
    const result = await sovdClient.getFault(props.ecuId, code)
    faultDetail.value = result as unknown as Record<string, unknown>
  } catch {
    faultDetail.value = null
  }
}

async function clearAllFaults() {
  try {
    await sovdClient.clearFaults(props.ecuId)
    loadFaults()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function clearSingleFault(code: string) {
  try {
    await sovdClient.clearFault(props.ecuId, code)
    loadFaults()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div class="faults-tab">
    <div class="section-header">
      Fault Memory (DTCs)
      <span class="count-badge">{{ search ? `${filteredFaults.length} / ${faults.length}` : faults.length }}</span>
      <button
        v-if="faults.length > 0"
        class="btn btn-small btn-danger"
        @click="clearAllFaults"
        style="margin-left: auto"
      >
        Clear All DTCs
      </button>
      <button
        class="btn btn-small"
        @click="loadFaults"
        style="margin-left: 8px"
      >
        Refresh
      </button>
    </div>
    <div v-if="loading" class="loading-text">Reading fault memory...</div>
    <div v-if="error" class="error-text">{{ error }}</div>

    <input
      v-if="faults.length > 0"
      v-model="search"
      type="text"
      class="list-search"
      placeholder="Filter by DTC code or name..."
    />

    <div v-if="filteredFaults.length === 0 && !loading" class="empty-state">
      {{ search ? 'No matching DTCs' : 'No DTCs stored in fault memory' }}
    </div>

    <div class="fault-table-wrapper">
      <table v-if="filteredFaults.length > 0" class="data-table">
        <thead>
          <tr>
            <th>DTC Code</th>
            <th>Fault Name</th>
            <th>Status Mask</th>
            <th>Confirmed</th>
            <th>Pending</th>
            <th>Test Failed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="f in filteredFaults"
            :key="f.code"
            :class="selectedFault === f.code ? 'selected' : ''"
            @click="viewFault(f.code)"
          >
            <td class="mono">{{ f.code }}</td>
            <td>{{ f.fault_name }}</td>
            <td class="mono">{{ f.status.mask ?? 'N/A' }}</td>
            <td><StatusBit :value="f.status.confirmed_dtc" /></td>
            <td><StatusBit :value="f.status.pending_dtc" /></td>
            <td><StatusBit :value="f.status.test_failed" /></td>
            <td>
              <button
                class="btn btn-tiny btn-danger"
                @click.stop="clearSingleFault(f.code)"
              >
                Clear
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="faultDetail && selectedFault" class="read-result-panel">
      <div class="section-header">DTC Detail: {{ selectedFault }}</div>
      <pre class="result-json">{{ JSON.stringify(faultDetail, null, 2) }}</pre>
    </div>
  </div>
</template>
