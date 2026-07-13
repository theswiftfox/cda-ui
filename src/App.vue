<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 Elena Gantner
-->
<script setup lang="ts">
import { ref, watch } from 'vue'
import LoginPanel from './components/LoginPanel.vue'
import EcuTree from './components/EcuTree.vue'
import EcuDetailPanel from './components/EcuDetailPanel.vue'
import CdaStatusBadge from './components/login/CdaStatusBadge.vue'
import CdaLogViewer from './components/login/CdaLogViewer.vue'
import sovdClient from './api/client'
import type { EcuDetail } from './types/sovd'
import './App.css'

const authenticated = ref(false)
const selectedEcu = ref<string | null>(null)
const ecuDetails = ref(new Map<string, EcuDetail>())
const statusMessage = ref('')
const connectionInfo = ref('')
const requestedTab = ref<string | null>(null)
const logViewerOpen = ref(false)

const isTauri = !!window.__TAURI_INTERNALS__

function handleLogin() {
  authenticated.value = true
  connectionInfo.value = `Connected to ${sovdClient.getDisplayUrl()}${sovdClient.isAuthenticated() ? ' (Authorized)' : ' (No Auth)'}`
}

async function handleLogout() {
  // If a managed CDA process is running, ask before stopping
  if (isTauri) {
    try {
      const { getCdaStatus, stopCda } = await import('./api/cdaProcess')
      const status = await getCdaStatus()
      if (status.type === 'Running' || status.type === 'Starting') {
        const stop = confirm('A managed CDA process is running. Stop it on disconnect?')
        if (stop) {
          await stopCda()
        }
      }
    } catch {
      // ignore — may not be in managed mode
    }
  }

  sovdClient.clearToken()
  authenticated.value = false
  selectedEcu.value = null
  ecuDetails.value = new Map()
  connectionInfo.value = ''
}

async function loadEcuDetail(ecuId: string) {
  statusMessage.value = `Loading ${ecuId}...`
  try {
    const detail = await sovdClient.getComponent(ecuId)
    const next = new Map(ecuDetails.value)
    next.set(ecuId, detail)
    ecuDetails.value = next
    statusMessage.value = `${ecuId}: ${detail.variant?.state ?? 'Unknown'}`
  } catch (err) {
    statusMessage.value = `Error loading ${ecuId}: ${err instanceof Error ? err.message : String(err)}`
  }
}

watch(selectedEcu, (ecuId) => {
  if (ecuId) {
    loadEcuDetail(ecuId)
  }
})

function handleSelectEcu(ecuId: string) {
  selectedEcu.value = ecuId
}

function handleSwitchTab(tab: string) {
  requestedTab.value = tab
}

async function handleTriggerVariantDetection() {
  if (!selectedEcu.value) return
  const ecuId = selectedEcu.value
  statusMessage.value = `Triggering variant detection on ${ecuId}...`
  try {
    await sovdClient.triggerVariantDetection(ecuId)
    await loadEcuDetail(ecuId)
  } catch (err) {
    statusMessage.value = `Variant detection failed for ${ecuId}: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function handleRefreshAll() {
  statusMessage.value = 'Refreshing all ECU details...'
  try {
    const components = await sovdClient.getComponents()
    const items = components.items ?? []
    for (const comp of items) {
      try {
        const detail = await sovdClient.getComponent(comp.id)
        const next = new Map(ecuDetails.value)
        next.set(comp.id, detail)
        ecuDetails.value = next
      } catch {
        // skip individual failures
      }
    }
    statusMessage.value = `Refreshed ${items.length} ECUs`
  } catch (err) {
    statusMessage.value = `Refresh error: ${err instanceof Error ? err.message : String(err)}`
  }
}
</script>

<template>
  <LoginPanel v-if="!authenticated" @login="handleLogin" />
  <div v-else class="app-layout">
    <!-- Title Bar -->
    <header class="app-titlebar">
      <div class="titlebar-left">
        <span class="app-logo">CDA</span>
        <span class="app-title">Classic Diagnostic Adapter</span>
        <span class="app-version">SOVD v15</span>
      </div>
      <div class="titlebar-right">
        <span class="connection-info">{{ connectionInfo }}</span>
        <button class="btn btn-small btn-secondary" @click="handleLogout">
          Disconnect
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <div class="app-main">
      <!-- Sidebar -->
      <aside class="app-sidebar">
        <EcuTree
          :selected-ecu="selectedEcu"
          :ecu-details="ecuDetails"
          @select-ecu="handleSelectEcu"
          @refresh="handleRefreshAll"
          @switch-tab="handleSwitchTab"
        />
      </aside>

      <!-- Detail Area -->
      <main class="app-content">
        <EcuDetailPanel
          v-if="selectedEcu"
          :ecu-id="selectedEcu"
          :detail="ecuDetails.get(selectedEcu) ?? null"
          :requested-tab="requestedTab"
          @refresh-detail="loadEcuDetail(selectedEcu!)"
          @trigger-variant-detection="handleTriggerVariantDetection"
        />
        <div v-else class="welcome-panel">
          <div class="welcome-content">
            <div class="welcome-logo">CDA</div>
            <h2>Classic Diagnostic Adapter</h2>
            <p>Select an ECU from the network tree to begin diagnostics.</p>
            <div class="welcome-hints">
              <div class="hint-item">
                <span class="hint-icon">&#9645;</span>
                <span>Click an ECU in the sidebar to view its details</span>
              </div>
              <div class="hint-item">
                <span class="hint-icon">&#9654;</span>
                <span>Expand an ECU to access specific diagnostic functions</span>
              </div>
              <div class="hint-item">
                <span class="hint-icon">&#x21bb;</span>
                <span>Use the refresh button to rescan the network</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Status Bar -->
    <footer class="app-statusbar">
      <span class="status-text">{{ statusMessage || 'Ready' }}</span>
      <div class="status-right">
        <!-- CDA Process Status Badge (Tauri only) -->
        <CdaStatusBadge
          v-if="isTauri"
          @click="logViewerOpen = true"
        />
        <span class="status-server">{{ sovdClient.getDisplayUrl() }}</span>
      </div>
    </footer>

    <!-- Log viewer overlay -->
    <CdaLogViewer
      v-if="isTauri"
      :visible="logViewerOpen"
      @close="logViewerOpen = false"
    />
  </div>
</template>
