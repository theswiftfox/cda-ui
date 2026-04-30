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

const locks = ref<Array<{ id: string; owned?: boolean; lock_expiration?: string }>>([])
const loading = ref(false)
const error = ref<string | null>(null)
const search = ref('')
const expirationSecs = ref(120)

const filteredLocks = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return locks.value
  return locks.value.filter((l) => l.id.toLowerCase().includes(q))
})

async function loadLocks() {
  loading.value = true
  error.value = null
  try {
    const result = await sovdClient.getLocks(props.ecuId)
    const items = result.items ?? []

    // Fetch expiration for each lock in parallel
    const enriched = await Promise.all(
      items.map(async (lock) => {
        try {
          const detail = await sovdClient.getLock(props.ecuId, lock.id)
          return { ...lock, lock_expiration: detail.lock_expiration }
        } catch {
          return { ...lock, lock_expiration: undefined }
        }
      })
    )

    locks.value = enriched
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadLocks()
})

async function acquireLock() {
  error.value = null
  try {
    await sovdClient.createLock(props.ecuId, expirationSecs.value)
    loadLocks()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function releaseLock(lockId: string) {
  error.value = null
  try {
    await sovdClient.deleteLock(props.ecuId, lockId)
    loadLocks()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function formatExpiration(iso: string | undefined): string {
  if (!iso) return 'N/A'
  try {
    const date = new Date(iso)
    const now = new Date()
    const remainMs = date.getTime() - now.getTime()
    const localStr = date.toLocaleString()
    if (remainMs <= 0) {
      return `${localStr} (expired)`
    }
    const remainSecs = Math.round(remainMs / 1000)
    if (remainSecs < 60) {
      return `${localStr} (${remainSecs}s remaining)`
    }
    const mins = Math.floor(remainSecs / 60)
    const secs = remainSecs % 60
    return `${localStr} (${mins}m ${secs}s remaining)`
  } catch {
    return iso
  }
}

function updateExpiration(e: Event) {
  const target = e.target as HTMLInputElement
  expirationSecs.value = Math.max(1, Number(target.value))
}
</script>

<template>
  <div class="locks-tab">
    <div class="section-header">
      ECU Locks
      <span class="count-badge">{{ search ? `${filteredLocks.length} / ${locks.length}` : locks.length }}</span>
      <button
        class="btn-icon"
        @click="loadLocks"
        title="Refresh locks"
        style="margin-left: auto"
      >
        &#x21bb;
      </button>
    </div>

    <div class="lock-acquire-form">
      <label class="lock-expiration-label">
        <span>Lock Expiration (seconds):</span>
        <input
          type="number"
          :min="1"
          :value="expirationSecs"
          @input="updateExpiration"
          class="lock-expiration-input mono"
        />
      </label>
      <button class="btn btn-small btn-primary" @click="acquireLock">
        Acquire Lock
      </button>
    </div>

    <div v-if="loading" class="loading-text">Loading locks...</div>
    <div v-if="error" class="error-text">{{ error }}</div>

    <input
      v-if="locks.length > 0"
      v-model="search"
      type="text"
      class="list-search"
      placeholder="Filter locks..."
    />

    <div v-if="filteredLocks.length === 0 && !loading" class="empty-state">
      {{ search ? 'No matching locks' : 'No active locks on this ECU' }}
    </div>

    <table v-if="filteredLocks.length > 0" class="data-table">
      <thead>
        <tr>
          <th>Lock ID</th>
          <th>Owned</th>
          <th>Expiration</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="lock in filteredLocks" :key="lock.id">
          <td class="mono">{{ lock.id }}</td>
          <td>
            <span :class="['lock-owned', lock.owned ? 'yes' : 'no']">
              {{ lock.owned ? 'Yes' : 'No' }}
            </span>
          </td>
          <td class="lock-expiration-cell">
            {{ formatExpiration(lock.lock_expiration) }}
          </td>
          <td>
            <button
              v-if="lock.owned"
              class="btn btn-tiny btn-danger"
              @click="releaseLock(lock.id)"
            >
              Release
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
