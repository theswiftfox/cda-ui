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

const configs = ref<Array<{ id: string; name: string }>>([])
const loading = ref(false)
const search = ref('')
const selectedConfig = ref<string | null>(null)

const filteredConfigs = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return configs.value
  return configs.value.filter(
    (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
  )
})
const configResult = ref<Record<string, unknown> | null>(null)
const configError = ref<string | null>(null)

async function loadConfigs() {
  loading.value = true
  try {
    const result = await sovdClient.getConfigurations(props.ecuId)
    configs.value = result.items ?? []
  } catch {
    configs.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadConfigs()
})

async function readConfig(configId: string) {
  configError.value = null
  configResult.value = null
  try {
    const result = await sovdClient.readConfiguration(props.ecuId, configId)
    configResult.value = result as unknown as Record<string, unknown>
  } catch (err) {
    configError.value = err instanceof Error ? err.message : String(err)
  }
}

function selectConfig(configId: string) {
  selectedConfig.value = configId
  configResult.value = null
  configError.value = null
}
</script>

<template>
  <div class="configurations-tab">
    <div class="section-header">
      Configurations
      <span class="count-badge">{{ search ? `${filteredConfigs.length} / ${configs.length}` : configs.length }}</span>
    </div>
    <div v-if="loading" class="loading-text">Loading configurations...</div>
    <input
      v-model="search"
      type="text"
      class="list-search"
      placeholder="Filter configurations..."
    />
    <div class="service-list">
      <div
        v-for="cfg in filteredConfigs"
        :key="cfg.id"
        :class="['service-item', selectedConfig === cfg.id ? 'selected' : '']"
        @click="selectConfig(cfg.id)"
      >
        <span class="service-name">{{ cfg.name || cfg.id }}</span>
        <span class="service-id mono">{{ cfg.id }}</span>
      </div>
    </div>
    <div v-if="selectedConfig" class="read-action-panel">
      <div class="read-action-bar">
        <span class="read-action-label mono">{{ selectedConfig }}</span>
        <button
          class="btn btn-primary btn-small"
          @click="readConfig(selectedConfig!)"
        >
          Read
        </button>
      </div>
      <div v-if="configError" class="error-text">{{ configError }}</div>
      <pre v-if="configResult" class="result-json">{{ JSON.stringify(configResult, null, 2) }}</pre>
    </div>
  </div>
</template>
