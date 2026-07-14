// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

use crate::cda_manager::{CdaLaunchConfig, CdaManager, CdaStatus};
use tauri::State;

#[tauri::command]
pub async fn start_cda(
    config: CdaLaunchConfig,
    manager: State<'_, CdaManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    manager.start(config, app_handle).await
}

#[tauri::command]
pub async fn stop_cda(manager: State<'_, CdaManager>) -> Result<(), String> {
    manager.stop().await
}

#[tauri::command]
pub async fn get_cda_status(manager: State<'_, CdaManager>) -> Result<CdaStatus, String> {
    Ok(manager.get_status().await)
}

#[tauri::command]
pub async fn get_cda_logs(
    lines: Option<usize>,
    manager: State<'_, CdaManager>,
) -> Result<Vec<String>, String> {
    Ok(manager.get_logs(lines).await)
}

#[tauri::command]
pub async fn clear_cda_logs(manager: State<'_, CdaManager>) -> Result<(), String> {
    manager.clear_logs().await;
    Ok(())
}

/// Check whether a bundled CDA sidecar binary is available.
/// Only returns true when compiled with the `bundled-cda` feature and the
/// sidecar binary actually exists on disk.
#[tauri::command]
pub async fn is_bundled_cda_available(app_handle: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(feature = "bundled-cda")]
    {
        use tauri_plugin_shell::ShellExt;
        // Tauri resolves sidecar binaries by name from the bundle.
        // We check if the sidecar command can be created (the binary exists).
        match app_handle.shell().sidecar("opensovd-cda") {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    #[cfg(not(feature = "bundled-cda"))]
    {
        let _ = app_handle;
        Ok(false)
    }
}
