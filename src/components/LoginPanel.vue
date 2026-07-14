<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ConnectRemote from './login/ConnectRemote.vue'
import ConnectLocalExe from './login/ConnectLocalExe.vue'
import ConnectBundled from './login/ConnectBundled.vue'
import CdaLogViewer from './login/CdaLogViewer.vue'

const emit = defineEmits<{
  login: []
}>()

const isTauri = !!window.__TAURI_INTERNALS__

type ConnectionMode = 'remote' | 'local' | 'bundled'
const mode = ref<ConnectionMode>('remote')
const bundledAvailable = ref(false)
const bundledPath = ref('')
const logViewerOpen = ref(false)

onMounted(async () => {
  if (isTauri) {
    try {
      const { isBundledCdaAvailable } = await import('../api/cdaProcess')
      bundledAvailable.value = await isBundledCdaAvailable()
      // If bundled is available, we could resolve the sidecar path here.
      // For now the backend handles path resolution.
      if (bundledAvailable.value) {
        bundledPath.value = 'opensovd-cda' // Tauri sidecar name
      }
    } catch {
      // Not in Tauri context or plugin not available
    }
  }
})

function handleLogin() {
  emit('login')
}

/** Available tabs depend on context */
const modes: { key: ConnectionMode; label: string; tauriOnly: boolean; bundledOnly: boolean }[] = [
  { key: 'remote', label: 'Connect to Server', tauriOnly: false, bundledOnly: false },
  { key: 'local', label: 'Start Executable', tauriOnly: true, bundledOnly: false },
  { key: 'bundled', label: 'Bundled CDA', tauriOnly: true, bundledOnly: true },
]

function isTabVisible(tab: typeof modes[number]): boolean {
  if (tab.tauriOnly && !isTauri) return false
  if (tab.bundledOnly && !bundledAvailable.value) return false
  return true
}
</script>

<template>
  <div class="login-panel">
    <div class="login-box">
      <div class="login-header">
        <div class="login-logo">CDA</div>
        <h1>Classic Diagnostic Adapter</h1>
        <span class="login-subtitle">SOVD Interface</span>
      </div>

      <!-- Mode tabs (only show multiple if in Tauri) -->
      <div v-if="isTauri" class="login-mode-tabs">
        <button
          v-for="tab in modes"
          :key="tab.key"
          v-show="isTabVisible(tab)"
          :class="['login-mode-tab', { active: mode === tab.key }]"
          @click="mode = tab.key"
        >
          {{ tab.label }}
        </button>

        <!-- Log viewer toggle (only for local/bundled modes) -->
        <button
          v-if="mode === 'local' || mode === 'bundled'"
          class="login-mode-tab log-tab"
          @click="logViewerOpen = true"
          title="View CDA logs"
        >
          Logs
        </button>
      </div>

      <div class="login-form">
        <!-- Remote connection (default / browser) -->
        <ConnectRemote
          v-if="mode === 'remote'"
          @login="handleLogin"
        />

        <!-- Start local executable (Tauri only) -->
        <ConnectLocalExe
          v-else-if="mode === 'local'"
          @login="handleLogin"
        />

        <!-- Bundled CDA (Tauri + feature flag) -->
        <ConnectBundled
          v-else-if="mode === 'bundled'"
          :sidecar-path="bundledPath"
          @login="handleLogin"
        />
      </div>

      <div class="login-footer">
        Eclipse OpenSOVD - Classic Diagnostic Adapter
      </div>
    </div>

    <!-- Log viewer overlay -->
    <CdaLogViewer
      v-if="isTauri"
      :visible="logViewerOpen"
      @close="logViewerOpen = false"
    />
  </div>
</template>
