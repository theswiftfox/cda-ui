<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { EcuDetail } from '../types/sovd'
import OverviewTab from './OverviewTab.vue'
import DataTab from './DataTab.vue'
import OperationsTab from './OperationsTab.vue'
import FaultsTab from './FaultsTab.vue'
import ModesTab from './ModesTab.vue'
import ConfigurationsTab from './ConfigurationsTab.vue'
import LocksTab from './LocksTab.vue'
import AuthScriptsTab from './AuthScripts.vue'
import GenericServiceTab from './GenericServiceTab.vue'

type TabId =
  | 'overview'
  | 'data'
  | 'operations'
  | 'faults'
  | 'modes'
  | 'configurations'
  | 'locks'
  | 'auth'
  | 'generic'

const props = defineProps<{
  ecuId: string
  detail: EcuDetail | null
  requestedTab: string | null
}>()

const emit = defineEmits<{
  'refresh-detail': []
}>()

const activeTab = ref<TabId>('overview')

// When parent requests a tab switch (from EcuTree sub-item click)
watch(() => props.requestedTab, (tab) => {
  if (tab) {
    activeTab.value = tab as TabId
  }
})

// Reset tab when ECU changes
watch(() => props.ecuId, (_newId, oldId) => {
  if (oldId !== undefined && _newId !== oldId) {
    activeTab.value = 'overview'
  }
})

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'data', label: 'Data' },
  { id: 'operations', label: 'Operations' },
  { id: 'faults', label: 'Faults' },
  { id: 'modes', label: 'Modes' },
  { id: 'configurations', label: 'Config' },
  { id: 'locks', label: 'Locks' },
  { id: 'auth', label: 'Auth' },
  { id: 'generic', label: 'Generic' },
]
</script>

<template>
  <div class="ecu-detail-panel">
    <div class="detail-header">
      <h2>
        {{ detail?.name || ecuId }}
        <span v-if="detail?.variant" class="header-variant">
          [{{ detail.variant.logical_address }}]
        </span>
      </h2>
      <button class="btn-icon" @click="emit('refresh-detail')" title="Refresh">
        &#x21bb;
      </button>
    </div>

    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', activeTab === tab.id ? 'active' : '']"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="tab-content">
      <OverviewTab v-if="activeTab === 'overview'" :ecu-id="ecuId" :detail="detail" />
      <DataTab v-if="activeTab === 'data'" :ecu-id="ecuId" />
      <OperationsTab v-if="activeTab === 'operations'" :ecu-id="ecuId" />
      <FaultsTab v-if="activeTab === 'faults'" :ecu-id="ecuId" />
      <ModesTab v-if="activeTab === 'modes'" :ecu-id="ecuId" />
      <ConfigurationsTab v-if="activeTab === 'configurations'" :ecu-id="ecuId" />
      <LocksTab v-if="activeTab === 'locks'" :ecu-id="ecuId" />
      <AuthScriptsTab v-if="activeTab === 'auth'" :ecu-id="ecuId" />
      <GenericServiceTab v-if="activeTab === 'generic'" :ecu-id="ecuId" />
    </div>
  </div>
</template>
