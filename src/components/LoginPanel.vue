<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import sovdClient from '../api/client'

const emit = defineEmits<{
  login: []
}>()

const serverUrl = ref('http://localhost:20002')
const clientId = ref('test_client')
const clientSecret = ref('test_secret')
const error = ref<string | null>(null)
const loading = ref(false)
const healthOk = ref<boolean | null>(null)

const isTauri = !!window.__TAURI_INTERNALS__

let healthTimeout: ReturnType<typeof setTimeout> | null = null

async function checkHealth() {
  if (isTauri) sovdClient.setBaseUrl(serverUrl.value)
  sovdClient.setDisplayUrl(serverUrl.value)
  const ok = await sovdClient.checkHealth()
  healthOk.value = ok
}

function scheduleHealthCheck() {
  if (healthTimeout) clearTimeout(healthTimeout)
  healthTimeout = setTimeout(checkHealth, 500)
}

onMounted(() => {
  scheduleHealthCheck()
})

watch(serverUrl, () => {
  scheduleHealthCheck()
})

async function handleLogin() {
  loading.value = true
  error.value = null
  try {
    if (isTauri) sovdClient.setBaseUrl(serverUrl.value)
    sovdClient.setDisplayUrl(serverUrl.value)
    await sovdClient.login(clientId.value, clientSecret.value)
    emit('login')
  } catch (err_) {
    error.value = err_ instanceof Error ? err_.message : String(err_)
  } finally {
    loading.value = false
  }
}

function handleSkip() {
  if (isTauri) sovdClient.setBaseUrl(serverUrl.value)
  sovdClient.setDisplayUrl(serverUrl.value)
  sovdClient.clearToken()
  emit('login')
}

const healthClass = computed(() => {
  if (healthOk.value === true) return 'healthy'
  if (healthOk.value === false) return 'unhealthy'
  return 'unknown'
})

const healthTitle = computed(() => {
  if (healthOk.value === true) return 'CDA is reachable'
  if (healthOk.value === false) return 'CDA is not reachable'
  return 'Checking...'
})
</script>

<template>
  <div class="login-panel">
    <div class="login-box">
      <div class="login-header">
        <div class="login-logo">CDA</div>
        <h1>Classic Diagnostic Adapter</h1>
        <span class="login-subtitle">SOVD Interface</span>
      </div>

      <div class="login-form">
        <label>
          <span class="label-text">Server URL</span>
          <div class="input-with-status">
            <input
              type="text"
              v-model="serverUrl"
              placeholder="http://localhost:20002"
            />
            <span
              :class="['health-indicator', healthClass]"
              :title="healthTitle"
            />
          </div>
        </label>

        <label>
          <span class="label-text">Client ID</span>
          <input
            type="text"
            v-model="clientId"
            placeholder="Client ID"
          />
        </label>

        <label>
          <span class="label-text">Client Secret</span>
          <input
            type="password"
            v-model="clientSecret"
            placeholder="Client Secret"
          />
        </label>

        <div v-if="error" class="login-error">{{ error }}</div>

        <div class="login-actions">
          <button
            class="btn btn-primary"
            @click="handleLogin"
            :disabled="loading"
          >
            {{ loading ? 'Connecting...' : 'Connect & Authorize' }}
          </button>
          <button class="btn btn-secondary" @click="handleSkip">
            Connect without Auth
          </button>
        </div>
      </div>

      <div class="login-footer">
        Eclipse OpenSOVD - Classic Diagnostic Adapter
      </div>
    </div>
  </div>
</template>
