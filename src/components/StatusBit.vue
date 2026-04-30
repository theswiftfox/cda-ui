<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
defineProps<{
  value: boolean | undefined
}>()
</script>

<template>
  <span
    v-if="value === undefined || value === null"
    class="status-bit unknown"
  >-</span>
  <span
    v-else
    :class="['status-bit', value ? 'set' : 'clear']"
  >{{ value ? '1' : '0' }}</span>
</template>
