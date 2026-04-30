<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import sovdClient from '../api/client'
import type { ComponentListItem, EcuDetail } from '../types/sovd'

const props = defineProps<{
  selectedEcu: string | null
  ecuDetails: Map<string, EcuDetail>
}>()

const emit = defineEmits<{
  'select-ecu': [ecuId: string]
  refresh: []
  'switch-tab': [tab: string]
}>()

const components = ref<ComponentListItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const expandedEcus = ref(new Set<string>())

async function loadComponents() {
  loading.value = true
  error.value = null
  try {
    const result = await sovdClient.getComponents()
    components.value = result.items ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadComponents()
})

function toggleExpand(ecuId: string) {
  const next = new Set(expandedEcus.value)
  if (next.has(ecuId)) next.delete(ecuId)
  else next.add(ecuId)
  expandedEcus.value = next
}

function getStateClass(ecuId: string): string {
  const detail = props.ecuDetails.get(ecuId)
  if (!detail) return 'state-unknown'
  switch (detail.variant?.state) {
    case 'Online': return 'state-online'
    case 'Offline': return 'state-offline'
    case 'Disconnected': return 'state-disconnected'
    case 'Duplicate': return 'state-duplicate'
    case 'NoVariantDetected': return 'state-novariant'
    default: return 'state-unknown'
  }
}

const ecuSubItems = [
  { id: 'data', label: 'Data Services' },
  { id: 'operations', label: 'Operations' },
  { id: 'faults', label: 'Faults (DTCs)' },
  { id: 'modes', label: 'Modes' },
  { id: 'configurations', label: 'Configurations' },
  { id: 'locks', label: 'Locks' },
  { id: 'auth', label: 'Auth Scripts' },
  { id: 'generic', label: 'Generic Service' },
]
</script>

<template>
  <div class="ecu-tree">
    <div class="tree-header">
      <span class="tree-title">ECU Network</span>
      <button
        class="btn-icon"
        @click="loadComponents(); emit('refresh')"
        title="Refresh"
      >
        &#x21bb;
      </button>
    </div>

    <div v-if="loading" class="tree-loading">Scanning network...</div>
    <div v-if="error" class="tree-error">{{ error }}</div>

    <div class="tree-list">
      <div v-for="comp in components" :key="comp.id" class="tree-node">
        <div
          :class="['tree-item', 'ecu-item', selectedEcu === comp.id ? 'selected' : '', getStateClass(comp.id)]"
          @click="emit('select-ecu', comp.id); toggleExpand(comp.id)"
        >
          <span :class="['tree-arrow', expandedEcus.has(comp.id) ? 'expanded' : '']">
            &#9654;
          </span>
          <span class="ecu-icon">&#9645;</span>
          <span class="ecu-name">{{ comp.name || comp.id }}</span>
          <span
            v-if="ecuDetails.get(comp.id)?.variant"
            :class="['ecu-state-badge', getStateClass(comp.id)]"
          >
            {{ ecuDetails.get(comp.id)?.variant?.state }}
          </span>
        </div>
        <div v-if="expandedEcus.has(comp.id)" class="tree-children">
          <div
            v-for="sub in ecuSubItems"
            :key="sub.id"
            class="tree-item sub-item"
            @click.stop="emit('select-ecu', comp.id); emit('switch-tab', sub.id)"
          >
            <span class="sub-icon">&#8250;</span>
            <span>{{ sub.label }}</span>
          </div>
        </div>
      </div>
      <div v-if="!loading && components.length === 0" class="tree-empty">
        No ECUs found
      </div>
    </div>
  </div>
</template>
