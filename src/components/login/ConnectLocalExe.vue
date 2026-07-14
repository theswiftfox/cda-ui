<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import sovdClient from '../../api/client'
import {
  startCda,
  stopCda,
  getCdaStatus,
  selectExecutable,
  selectConfigFile,
  selectDatabasesDir,
  onStatusChanged,
  type CdaStatus,
  type CdaLaunchConfig,
} from '../../api/cdaProcess'

const emit = defineEmits<{
  login: []
}>()

const executablePath = ref('')
const configFile = ref('')
const databasesPath = ref('')
const listenPort = ref(20002)
const extraArgs = ref('')
const autoRestart = ref(true)
const showAdvanced = ref(false)

const error = ref<string | null>(null)
const loading = ref(false)
const cdaStatus = ref<CdaStatus>({ type: 'Stopped' })

let unlistenStatus: (() => void) | null = null

onMounted(async () => {
  cdaStatus.value = await getCdaStatus()
  unlistenStatus = await onStatusChanged((status) => {
    cdaStatus.value = status
  })
})

onUnmounted(() => {
  unlistenStatus?.()
})

// When CDA becomes running, check health and auto-connect
watch(cdaStatus, async (status) => {
  if (status.type === 'Running') {
    // Give CDA a moment to bind the port
    await new Promise((r) => setTimeout(r, 1000))
    await tryConnect()
  }
})

async function tryConnect() {
  const url = `http://localhost:${listenPort.value}`
  sovdClient.setBaseUrl(url)
  sovdClient.setDisplayUrl(url)
  try {
    const ok = await sovdClient.checkHealth()
    if (ok) {
      sovdClient.clearToken()
      emit('login')
    }
  } catch {
    // CDA not ready yet, will retry on next status change
  }
}

async function pickExecutable() {
  const path = await selectExecutable()
  if (path) executablePath.value = path
}

async function pickConfigFile() {
  const path = await selectConfigFile()
  if (path) configFile.value = path
}

async function pickDatabasesDir() {
  const path = await selectDatabasesDir()
  if (path) databasesPath.value = path
}

async function handleStart() {
  if (!executablePath.value) {
    error.value = 'Please select a CDA executable'
    return
  }

  loading.value = true
  error.value = null

  const config: CdaLaunchConfig = {
    executable_path: executablePath.value,
    config_file: configFile.value || null,
    listen_port: listenPort.value,
    databases_path: databasesPath.value || null,
    extra_args: extraArgs.value
      ? extraArgs.value.split(/\s+/).filter(Boolean)
      : [],
    auto_restart: autoRestart.value,
  }

  try {
    await startCda(config)
  } catch (err_) {
    error.value = err_ instanceof Error ? err_.message : String(err_)
  } finally {
    loading.value = false
  }
}

async function handleStop() {
  try {
    await stopCda()
  } catch (err_) {
    error.value = err_ instanceof Error ? err_.message : String(err_)
  }
}

const isRunning = computed(() =>
  cdaStatus.value.type === 'Running' || cdaStatus.value.type === 'Starting'
)

const statusClass = computed(() => {
  switch (cdaStatus.value.type) {
    case 'Running': return 'status-running'
    case 'Starting': return 'status-starting'
    case 'Crashed': return 'status-crashed'
    default: return 'status-stopped'
  }
})

const statusLabel = computed(() => {
  const s = cdaStatus.value
  switch (s.type) {
    case 'Running': return `Running (PID ${s.pid})`
    case 'Starting': return 'Starting...'
    case 'Crashed': return `Crashed (code ${s.exit_code ?? '?'})`
    default: return 'Stopped'
  }
})
</script>

<template>
  <div class="connect-form">
    <!-- Executable -->
    <label>
      <span class="label-text">CDA Executable</span>
      <div class="file-picker">
        <input
          type="text"
          v-model="executablePath"
          placeholder="Path to opensovd-cda"
          readonly
        />
        <button class="btn btn-small btn-secondary" @click="pickExecutable">
          Browse
        </button>
      </div>
    </label>

    <!-- Config File -->
    <label>
      <span class="label-text">Config File (optional)</span>
      <div class="file-picker">
        <input
          type="text"
          v-model="configFile"
          placeholder="opensovd-cda.toml"
          readonly
        />
        <button class="btn btn-small btn-secondary" @click="pickConfigFile">
          Browse
        </button>
      </div>
    </label>

    <!-- Databases Path -->
    <label>
      <span class="label-text">Databases Path (optional)</span>
      <div class="file-picker">
        <input
          type="text"
          v-model="databasesPath"
          placeholder="Path to database files"
          readonly
        />
        <button class="btn btn-small btn-secondary" @click="pickDatabasesDir">
          Browse
        </button>
      </div>
    </label>

    <!-- Listen Port -->
    <label>
      <span class="label-text">Listen Port</span>
      <input
        type="number"
        v-model.number="listenPort"
        placeholder="20002"
        min="1"
        max="65535"
      />
    </label>

    <!-- Advanced Settings -->
    <div class="advanced-toggle" @click="showAdvanced = !showAdvanced">
      <span class="advanced-arrow" :class="{ expanded: showAdvanced }">&#9654;</span>
      <span>Advanced Settings</span>
    </div>

    <div v-if="showAdvanced" class="advanced-settings">
      <label>
        <span class="label-text">Extra CLI Arguments</span>
        <input
          type="text"
          v-model="extraArgs"
          placeholder="--flag1 value1 --flag2 value2"
        />
      </label>

      <label class="checkbox-label">
        <input type="checkbox" v-model="autoRestart" />
        <span>Auto-restart on crash</span>
      </label>
    </div>

    <!-- Status -->
    <div class="cda-status-row">
      <span class="cda-status-label">Status:</span>
      <span :class="['cda-status-badge', statusClass]">{{ statusLabel }}</span>
    </div>

    <!-- Error -->
    <div v-if="error" class="login-error">{{ error }}</div>

    <!-- Actions -->
    <div class="login-actions">
      <button
        v-if="!isRunning"
        class="btn btn-primary"
        @click="handleStart"
        :disabled="loading || !executablePath"
      >
        {{ loading ? 'Starting...' : 'Start CDA' }}
      </button>
      <button
        v-else
        class="btn btn-danger"
        @click="handleStop"
      >
        Stop CDA
      </button>
    </div>
  </div>
</template>
