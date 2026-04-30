<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import type { EcuDetail } from '../types/sovd'

const props = defineProps<{
  ecuId: string
  detail: EcuDetail | null
}>()

function stateClass(state: string | undefined): string {
  if (state === 'Online') return 'state-online'
  if (state === 'Offline') return 'state-offline'
  return 'state-unknown'
}

const resources = [
  'Data Services',
  'Operations',
  'Configurations',
  'Modes',
  'Faults',
  'Locks',
] as const

function resourceHref(label: string): string {
  if (!props.detail) return ''
  const map: Record<string, string> = {
    'Data Services': props.detail.data,
    'Operations': props.detail.operations,
    'Configurations': props.detail.configurations,
    'Modes': props.detail.modes,
    'Faults': props.detail.faults,
    'Locks': props.detail.locks,
  }
  return map[label] ?? ''
}
</script>

<template>
  <div v-if="!detail" class="tab-placeholder">
    Loading ECU details for {{ ecuId }}...
  </div>
  <div v-else class="overview-tab">
    <div class="info-grid">
      <div class="info-card">
        <div class="info-label">ECU Name</div>
        <div class="info-value">{{ detail.name }}</div>
      </div>
      <div class="info-card">
        <div class="info-label">ECU ID</div>
        <div class="info-value mono">{{ detail.id }}</div>
      </div>
      <div class="info-card">
        <div class="info-label">State</div>
        <div :class="['info-value', stateClass(detail.variant?.state)]">
          {{ detail.variant?.state || 'Unknown' }}
        </div>
      </div>
      <div class="info-card">
        <div class="info-label">Logical Address</div>
        <div class="info-value mono">
          {{ detail.variant?.logical_address || 'N/A' }}
        </div>
      </div>
      <div class="info-card">
        <div class="info-label">Variant</div>
        <div class="info-value">
          {{ detail.variant?.name || 'N/A' }}
        </div>
      </div>
      <div class="info-card">
        <div class="info-label">Base Variant</div>
        <div class="info-value">
          {{ detail.variant?.is_base_variant ? 'Yes' : 'No' }}
        </div>
      </div>
    </div>

    <div class="section-header">Available Resources</div>
    <div class="resource-links">
      <div v-for="label in resources" :key="label" class="resource-link">
        <span class="resource-name">{{ label }}</span>
        <span class="resource-href mono">{{ resourceHref(label) }}</span>
      </div>
    </div>
  </div>
</template>
