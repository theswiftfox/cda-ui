<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import type { ParamSchema } from '../types/sovd'
import ParamField from './ParamField.vue'

const props = defineProps<{
  parameters: Record<string, ParamSchema>
  values: Record<string, unknown>
  readOnly?: boolean
}>()

const emit = defineEmits<{
  change: [values: Record<string, unknown>]
}>()

function setValue(name: string, val: unknown) {
  emit('change', { ...props.values, [name]: val })
}
</script>

<template>
  <div v-if="Object.keys(parameters).length === 0" class="param-empty">
    No parameters
  </div>
  <div v-else class="param-form">
    <ParamField
      v-for="[name, schema] in Object.entries(parameters)"
      :key="name"
      :name="name"
      :schema="schema"
      :value="values[name]"
      :read-only="readOnly ?? false"
      @change="(val: unknown) => setValue(name, val)"
    />
  </div>
</template>
