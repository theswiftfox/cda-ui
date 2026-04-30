<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import sovdClient from '../api/client'
import type { OperationDetail, ParamSchema } from '../types/sovd'
import ParameterForm from './ParameterForm.vue'
import ExecutionList from './ExecutionList.vue'
import ExecResultPanel from './ExecResultPanel.vue'
import { defaultsFromSchema } from '../lib/paramUtils'

const props = defineProps<{
  ecuId: string
}>()

const operations = ref<Array<{ id: string; name: string; asynchronous_execution: boolean }>>([])
const loading = ref(false)
const search = ref('')
const selectedOp = ref<string | null>(null)

const filteredOperations = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return operations.value
  return operations.value.filter(
    (o) => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
  )
})

const paramSchema = ref<Record<string, ParamSchema>>({})
const outputSchema = ref<Record<string, ParamSchema>>({})
const capabilities = ref<string[]>([])
const paramValues = ref<Record<string, unknown>>({})
const schemaLoading = ref(false)
const schemaError = ref<string | null>(null)

const executions = ref<Array<{ id: string; status: string }>>([])
const execListLoading = ref(false)

const execResult = ref<Record<string, unknown> | null>(null)
const execError = ref<string | null>(null)
const execLoading = ref(false)

// ---- Load operation list ----
async function loadOperations() {
  loading.value = true
  try {
    const result = await sovdClient.getOperations(props.ecuId)
    operations.value = result.items ?? []
  } catch {
    operations.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadOperations()
})

// ---- Fetch existing executions for an operation ----
async function loadExecutions(opId: string) {
  execListLoading.value = true
  try {
    const result = await sovdClient.getOperationExecutions(props.ecuId, opId)
    const items = (result.items ?? []).map((e) => ({
      id: typeof e.id === 'string' ? e.id : String(e.id),
      status: typeof e.status === 'string' ? e.status : 'unknown',
    }))
    executions.value = items
  } catch {
    executions.value = []
  } finally {
    execListLoading.value = false
  }
}

// ---- Select an operation -> fetch schema + existing executions ----
async function selectOp(opId: string) {
  selectedOp.value = opId
  execResult.value = null
  execError.value = null
  schemaError.value = null
  schemaLoading.value = true
  paramSchema.value = {}
  outputSchema.value = {}
  capabilities.value = []
  paramValues.value = {}

  const schemaPromise = sovdClient
    .getOperationDetail(props.ecuId, opId)
    .then((detail: OperationDetail) => {
      paramSchema.value = detail.parameters ?? {}
      outputSchema.value = detail.outputParameters ?? {}
      capabilities.value = detail.capabilities ?? []
      paramValues.value = defaultsFromSchema(paramSchema.value)
    })
    .catch((err: unknown) => {
      schemaError.value = err instanceof Error ? err.message : String(err)
    })
    .finally(() => { schemaLoading.value = false })

  const execPromise = loadExecutions(opId)
  await Promise.all([schemaPromise, execPromise])
}

// ---- Execute with current parameter values ----
async function executeOp() {
  if (!selectedOp.value) return
  execLoading.value = true
  execError.value = null
  execResult.value = null

  const cleanedParams: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(paramValues.value)) {
    if (v !== undefined && v !== null && v !== '') {
      cleanedParams[k] = v
    }
  }
  const hasParams = Object.keys(cleanedParams).length > 0

  try {
    const result = await sovdClient.executeOperation(
      props.ecuId,
      selectedOp.value,
      hasParams ? cleanedParams : undefined
    )
    execResult.value = result as unknown as Record<string, unknown>
    loadExecutions(selectedOp.value)
  } catch (err) {
    execError.value = err instanceof Error ? err.message : String(err)
  } finally {
    execLoading.value = false
  }
}

// ---- Poll a single execution by id ----
async function pollExecution(execId: string) {
  if (!selectedOp.value) return
  execLoading.value = true
  execError.value = null
  try {
    const result = await sovdClient.getOperationExecution(props.ecuId, selectedOp.value, execId)
    execResult.value = result as unknown as Record<string, unknown>
    loadExecutions(selectedOp.value)
  } catch (err) {
    execError.value = err instanceof Error ? err.message : String(err)
  } finally {
    execLoading.value = false
  }
}

// ---- Stop / delete an execution ----
async function stopExecution(execId: string) {
  if (!selectedOp.value) return
  try {
    await sovdClient.deleteOperationExecution(props.ecuId, selectedOp.value, execId)
    await loadExecutions(selectedOp.value)
    if (execResult.value && String(execResult.value.id) === execId) {
      execResult.value = { ...execResult.value, status: 'stopped' }
    }
  } catch (err) {
    execError.value = err instanceof Error ? err.message : String(err)
  }
}

function paramEntries() {
  return Object.entries(paramSchema.value)
}

function isAsync(): boolean {
  return operations.value.find((o) => o.id === selectedOp.value)?.asynchronous_execution ?? false
}

function updateParamValues(newValues: Record<string, unknown>) {
  paramValues.value = newValues
}
</script>

<template>
  <div class="operations-tab">
    <div class="section-header">
      Operations (Routines)
      <span class="count-badge">{{ search ? `${filteredOperations.length} / ${operations.length}` : operations.length }}</span>
    </div>
    <div v-if="loading" class="loading-text">Loading operations...</div>

    <input
      v-model="search"
      type="text"
      class="list-search"
      placeholder="Filter operations..."
    />

    <!-- Operation list -->
    <div class="service-list">
      <div
        v-for="op in filteredOperations"
        :key="op.id"
        :class="['service-item', selectedOp === op.id ? 'selected' : '']"
        @click="selectOp(op.id)"
      >
        <div class="op-info">
          <span class="service-name">{{ op.name || op.id }}</span>
          <span :class="['op-type-badge', op.asynchronous_execution ? 'async' : 'sync']">
            {{ op.asynchronous_execution ? 'ASYNC' : 'SYNC' }}
          </span>
        </div>
        <span class="service-id mono">{{ op.id }}</span>
      </div>
    </div>

    <!-- Selected operation detail -->
    <div v-if="selectedOp" class="op-detail-panel">
      <div class="section-header">
        {{ selectedOp }}
        <span :class="['op-type-badge', isAsync() ? 'async' : 'sync']">
          {{ isAsync() ? 'ASYNC' : 'SYNC' }}
        </span>
      </div>

      <div v-if="schemaLoading" class="loading-text">Loading parameters...</div>
      <div v-if="schemaError" class="error-text">{{ schemaError }}</div>

      <!-- Parameter form -->
      <div v-if="!schemaLoading && paramEntries().length > 0" class="op-param-section">
        <div class="op-param-header">Input Parameters</div>
        <ParameterForm
          :parameters="paramSchema"
          :values="paramValues"
          @change="updateParamValues"
        />
      </div>
      <div v-if="!schemaLoading && paramEntries().length === 0 && !schemaError" class="op-param-section">
        <div class="op-param-header">Input Parameters</div>
        <div class="param-empty">No input parameters required</div>
      </div>

      <!-- Execute button -->
      <div class="op-execute-bar">
        <button
          class="btn btn-primary btn-execute"
          @click="executeOp"
          :disabled="execLoading || schemaLoading"
        >
          {{ execLoading ? 'Executing...' : 'Execute' }}
        </button>
        <button
          v-if="paramEntries().length > 0"
          class="btn btn-secondary btn-small"
          @click="paramValues = defaultsFromSchema(paramSchema)"
          title="Reset parameters to default values"
        >
          Reset Defaults
        </button>
      </div>

      <!-- Active Executions table -->
      <ExecutionList
        :executions="executions"
        :loading="execListLoading"
        :selected-op="selectedOp"
        :capabilities="capabilities"
        @poll="pollExecution"
        @stop="stopExecution"
        @refresh="loadExecutions(selectedOp!)"
      />

      <!-- Execution error -->
      <div v-if="execError" class="error-text">{{ execError }}</div>

      <!-- Last execution detail -->
      <ExecResultPanel
        v-if="execResult"
        :exec-result="execResult"
        :selected-op="selectedOp"
        :output-schema="outputSchema"
        :capabilities="capabilities"
        @poll="pollExecution"
        @stop="stopExecution"
      />
    </div>
  </div>
</template>
