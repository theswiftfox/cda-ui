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

const services = ref<Array<{ id: string; name: string }>>([])
const loading = ref(false)
const search = ref('')
const selectedService = ref<string | null>(null)

const filteredServices = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return services.value
  return services.value.filter(
    (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
  )
})
const readResult = ref<Record<string, unknown> | null>(null)
const readError = ref<string | null>(null)
const readLoading = ref(false)

async function loadServices() {
  loading.value = true
  try {
    const result = await sovdClient.getDataServices(props.ecuId)
    services.value = result.items ?? []
  } catch {
    services.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadServices()
})

async function readService(serviceId: string) {
  readLoading.value = true
  readError.value = null
  readResult.value = null
  try {
    const result = await sovdClient.readData(props.ecuId, serviceId)
    readResult.value = result as unknown as Record<string, unknown>
  } catch (err) {
    readError.value = err instanceof Error ? err.message : String(err)
  } finally {
    readLoading.value = false
  }
}

function selectService(serviceId: string) {
  selectedService.value = serviceId
  readResult.value = null
  readError.value = null
}
</script>

<template>
  <div class="data-tab">
    <div class="section-header">
      Data Services
      <span class="count-badge">{{ search ? `${filteredServices.length} / ${services.length}` : services.length }}</span>
    </div>
    <div v-if="loading" class="loading-text">Loading services...</div>
    <input
      v-model="search"
      type="text"
      class="list-search"
      placeholder="Filter services..."
    />
    <div class="service-list">
      <div
        v-for="svc in filteredServices"
        :key="svc.id"
        :class="['service-item', selectedService === svc.id ? 'selected' : '']"
        @click="selectService(svc.id)"
      >
        <span class="service-name">{{ svc.name || svc.id }}</span>
        <span class="service-id mono">{{ svc.id }}</span>
      </div>
    </div>
    <div v-if="selectedService" class="read-action-panel">
      <div class="read-action-bar">
        <span class="read-action-label mono">{{ selectedService }}</span>
        <button
          class="btn btn-primary btn-small"
          @click="readService(selectedService!)"
          :disabled="readLoading"
        >
          {{ readLoading ? 'Reading...' : 'Read' }}
        </button>
      </div>
      <div v-if="readError" class="error-text">{{ readError }}</div>
      <pre v-if="readResult" class="result-json">{{ JSON.stringify(readResult, null, 2) }}</pre>
    </div>
  </div>
</template>
