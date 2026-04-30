<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import sovdClient from '../api/client'

const props = defineProps<{
  ecuId: string
}>()

const modes = ref<Array<{ id: string; name: string }>>([])
const loading = ref(false)
const search = ref('')
const selectedMode = ref<string | null>(null)

const filteredModes = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return modes.value
  return modes.value.filter(
    (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
  )
})
const modeValue = ref<Record<string, unknown> | null>(null)
const modeError = ref<string | null>(null)
const setValueInput = ref('')
const setLoading = ref(false)

async function loadModes() {
  loading.value = true
  try {
    const result = await sovdClient.getModes(props.ecuId)
    modes.value = result.items ?? []
  } catch {
    modes.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadModes()
})

async function readMode(modeId: string) {
  modeError.value = null
  try {
    const result = await sovdClient.getMode(props.ecuId, modeId)
    modeValue.value = result as unknown as Record<string, unknown>
  } catch (err) {
    modeError.value = err instanceof Error ? err.message : String(err)
  }
}

function selectMode(modeId: string) {
  selectedMode.value = modeId
  modeValue.value = null
  modeError.value = null
}

async function writeMode() {
  if (!selectedMode.value || !setValueInput.value) return
  setLoading.value = true
  modeError.value = null
  try {
    const result = await sovdClient.setMode(props.ecuId, selectedMode.value, setValueInput.value)
    modeValue.value = result as unknown as Record<string, unknown>
  } catch (err) {
    modeError.value = err instanceof Error ? err.message : String(err)
  } finally {
    setLoading.value = false
  }
}
</script>

<template>
  <div class="modes-tab">
    <div class="section-header">
      Diagnostic Modes
      <span class="count-badge">{{ search ? `${filteredModes.length} / ${modes.length}` : modes.length }}</span>
    </div>
    <div v-if="loading" class="loading-text">Loading modes...</div>
    <input
      v-model="search"
      type="text"
      class="list-search"
      placeholder="Filter modes..."
    />
    <div class="mode-cards">
      <div
        v-for="mode in filteredModes"
        :key="mode.id"
        :class="['mode-card', selectedMode === mode.id ? 'selected' : '']"
        @click="selectMode(mode.id)"
      >
        <div class="mode-name">{{ mode.name || mode.id }}</div>
        <div class="mode-id mono">{{ mode.id }}</div>
      </div>
    </div>

    <div v-if="selectedMode" class="read-action-panel">
      <div class="read-action-bar">
        <span class="read-action-label mono">{{ selectedMode }}</span>
        <button
          class="btn btn-primary btn-small"
          @click="readMode(selectedMode!)"
        >
          Read
        </button>
      </div>
      <div v-if="modeError" class="error-text">{{ modeError }}</div>
      <pre v-if="modeValue" class="result-json">{{ JSON.stringify(modeValue, null, 2) }}</pre>
      <div class="mode-set-form">
        <input
          type="text"
          v-model="setValueInput"
          placeholder="Enter new value (e.g. extended, default)"
          class="mode-input"
        />
        <button
          class="btn btn-primary btn-small"
          @click="writeMode"
          :disabled="setLoading || !setValueInput"
        >
          {{ setLoading ? 'Setting...' : 'Set Mode' }}
        </button>
      </div>
    </div>
  </div>
</template>
