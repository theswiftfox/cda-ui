<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  value: unknown
  readOnly: boolean
}>()

const emit = defineEmits<{
  change: [value: unknown]
}>()

const text = ref(props.value !== undefined ? JSON.stringify(props.value, null, 2) : '')
const parseError = ref<string | null>(null)

// Sync external value changes into the textarea
watch(() => props.value, (newVal) => {
  text.value = newVal !== undefined ? JSON.stringify(newVal, null, 2) : ''
  parseError.value = null
})

function handleChange(raw: string) {
  text.value = raw
  if (raw.trim() === '') {
    parseError.value = null
    emit('change', undefined)
    return
  }
  try {
    const parsed = JSON.parse(raw)
    parseError.value = null
    emit('change', parsed)
  } catch {
    parseError.value = 'Invalid JSON'
  }
}
</script>

<template>
  <div class="param-json-wrapper">
    <textarea
      :class="['param-json', parseError ? 'param-json-error' : '']"
      :value="text"
      @input="handleChange(($event.target as HTMLTextAreaElement).value)"
      :readonly="readOnly"
      :rows="3"
    />
    <span v-if="parseError" class="param-parse-error">{{ parseError }}</span>
  </div>
</template>
