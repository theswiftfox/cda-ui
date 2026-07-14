// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

mod cda_manager;
mod commands;

use cda_manager::CdaManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::missing_panics_doc)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .manage(CdaManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_cda,
            commands::stop_cda,
            commands::get_cda_status,
            commands::get_cda_logs,
            commands::clear_cda_logs,
            commands::is_bundled_cda_available,
        ])
        .on_window_event(|_window, event| {
            // Graceful shutdown of managed CDA when the app closes.
            // The actual cleanup is handled via the RunEvent below.
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Window close is handled — the process cleanup happens
                // in the app exit event to ensure it runs.
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Stop the CDA process on app exit.
                let manager = app_handle.state::<CdaManager>();
                // Use a blocking approach since we're in the exit handler.
                tauri::async_runtime::block_on(async {
                    let _ = manager.stop().await;
                });
            }
        });
}
