<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import type { ParamSchema } from '../types/sovd'
import JsonField from './JsonField.vue'
import ParameterForm from './ParameterForm.vue'

const props = defineProps<{
  name: string
  schema: ParamSchema
  value: unknown
  readOnly: boolean
}>()

const emit = defineEmits<{
  change: [value: unknown]
}>()

const hasEnum = props.schema.enum && props.schema.enum.length > 0

function onNestedChange(newObj: Record<string, unknown>) {
  emit('change', newObj)
}
</script>

<template>
  <!-- String with enum -> dropdown -->
  <div v-if="schema.type === 'string' && hasEnum" class="param-field">
    <label class="param-label">
      <span class="param-name">{{ name }}</span>
      <span class="param-type-badge">enum</span>
    </label>
    <select
      class="param-select"
      :value="String(value ?? schema.default ?? '')"
      @change="emit('change', ($event.target as HTMLSelectElement).value)"
      :disabled="readOnly"
    >
      <option value="" disabled>-- select --</option>
      <option v-for="opt in schema.enum" :key="opt" :value="opt">
        {{ opt }}
      </option>
    </select>
    <span v-if="schema.default !== undefined" class="param-default">
      default: {{ String(schema.default) }}
    </span>
  </div>

  <!-- Plain string -> text input -->
  <div v-else-if="schema.type === 'string'" class="param-field">
    <label class="param-label">
      <span class="param-name">{{ name }}</span>
      <span class="param-type-badge">string</span>
    </label>
    <input
      type="text"
      class="param-input"
      :value="String(value ?? schema.default ?? '')"
      @input="emit('change', ($event.target as HTMLInputElement).value)"
      :readonly="readOnly"
      :placeholder="schema.default !== undefined ? `default: ${schema.default}` : ''"
    />
  </div>

  <!-- Number / integer -> number input -->
  <div v-else-if="schema.type === 'number' || schema.type === 'integer'" class="param-field">
    <label class="param-label">
      <span class="param-name">{{ name }}</span>
      <span class="param-type-badge">{{ schema.type }}</span>
      <span
        v-if="(schema.minimum ?? schema.exclusiveMinimum) !== undefined || (schema.maximum ?? schema.exclusiveMaximum) !== undefined"
        class="param-range"
      >
        [{{ schema.minimum ?? schema.exclusiveMinimum ?? '...' }} .. {{ schema.maximum ?? schema.exclusiveMaximum ?? '...' }}]
      </span>
    </label>
    <input
      type="number"
      class="param-input"
      :value="value !== undefined && value !== null ? String(value) : (schema.default !== undefined ? String(schema.default) : '')"
      @input="(e) => {
        const raw = (e.target as HTMLInputElement).value
        if (raw === '') {
          emit('change', undefined)
        } else {
          emit('change', schema.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw))
        }
      }"
      :readonly="readOnly"
      :min="schema.minimum ?? schema.exclusiveMinimum"
      :max="schema.maximum ?? schema.exclusiveMaximum"
      :step="schema.type === 'integer' ? 1 : 'any'"
      :placeholder="schema.default !== undefined ? `default: ${schema.default}` : ''"
    />
  </div>

  <!-- Boolean -> checkbox -->
  <div v-else-if="schema.type === 'boolean'" class="param-field">
    <label class="param-label param-label-inline">
      <input
        type="checkbox"
        class="param-checkbox"
        :checked="value !== undefined ? Boolean(value) : Boolean(schema.default)"
        @change="emit('change', ($event.target as HTMLInputElement).checked)"
        :disabled="readOnly"
      />
      <span class="param-name">{{ name }}</span>
      <span class="param-type-badge">boolean</span>
    </label>
  </div>

  <!-- Object with properties -> nested form (recursive) -->
  <div v-else-if="schema.type === 'object' && schema.properties" class="param-field param-field-nested">
    <label class="param-label">
      <span class="param-name">{{ name }}</span>
      <span class="param-type-badge">object</span>
    </label>
    <div class="param-nested-body">
      <ParameterForm
        :parameters="schema.properties"
        :values="(typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>"
        :read-only="readOnly"
        @change="onNestedChange"
      />
    </div>
  </div>

  <!-- Fallback: JSON textarea -->
  <div v-else class="param-field">
    <label class="param-label">
      <span class="param-name">{{ name }}</span>
      <span class="param-type-badge">{{ schema.type ?? 'json' }}</span>
    </label>
    <JsonField
      :value="value ?? schema.default"
      :read-only="readOnly"
      @change="(v: unknown) => emit('change', v)"
    />
  </div>
</template>
