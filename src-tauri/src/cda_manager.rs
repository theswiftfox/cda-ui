// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Elena Gantner

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;
use tokio::sync::Mutex;

/// Maximum number of log lines kept in the ring buffer.
const LOG_BUFFER_SIZE: usize = 5000;

/// Maximum number of automatic restart attempts before giving up.
const MAX_RESTART_ATTEMPTS: u32 = 5;

/// Delay in seconds before attempting an automatic restart.
const RESTART_DELAY_SECS: u64 = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CdaLaunchConfig {
    pub executable_path: String,
    #[serde(default)]
    pub config_file: Option<String>,
    #[serde(default)]
    pub listen_address: Option<String>,
    #[serde(default)]
    pub listen_port: Option<u16>,
    #[serde(default)]
    pub databases_path: Option<String>,
    #[serde(default)]
    pub extra_args: Vec<String>,
    #[serde(default)]
    pub working_dir: Option<String>,
    #[serde(default = "default_true")]
    pub auto_restart: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum CdaStatus {
    Stopped,
    Starting,
    Running { pid: u32 },
    Crashed { exit_code: Option<i32>, message: String },
}

// ---------------------------------------------------------------------------
// Shared inner state (wrapped in Arc for Send + Sync across tasks)
// ---------------------------------------------------------------------------

struct Inner {
    child: Mutex<Option<Child>>,
    config: Mutex<Option<CdaLaunchConfig>>,
    status: Mutex<CdaStatus>,
    log_buffer: Mutex<VecDeque<String>>,
    restart_count: Mutex<u32>,
    stop_requested: Mutex<bool>,
}

impl Inner {
    fn new() -> Self {
        Self {
            child: Mutex::new(None),
            config: Mutex::new(None),
            status: Mutex::new(CdaStatus::Stopped),
            log_buffer: Mutex::new(VecDeque::with_capacity(LOG_BUFFER_SIZE)),
            restart_count: Mutex::new(0),
            stop_requested: Mutex::new(false),
        }
    }

    async fn push_log(&self, line: &str) {
        let mut buf = self.log_buffer.lock().await;
        if buf.len() >= LOG_BUFFER_SIZE {
            buf.pop_front();
        }
        buf.push_back(line.to_string());
    }
}

// ---------------------------------------------------------------------------
// CdaManager — public API
// ---------------------------------------------------------------------------

pub struct CdaManager {
    inner: Arc<Inner>,
}

impl CdaManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner::new()),
        }
    }

    /// Start the CDA process with the given configuration.
    pub async fn start(
        &self,
        config: CdaLaunchConfig,
        app_handle: tauri::AppHandle,
    ) -> Result<(), String> {
        // If already running, stop first.
        {
            let status = self.inner.status.lock().await;
            if matches!(*status, CdaStatus::Running { .. } | CdaStatus::Starting) {
                drop(status);
                self.stop().await?;
            }
        }

        *self.inner.stop_requested.lock().await = false;
        *self.inner.restart_count.lock().await = 0;
        *self.inner.config.lock().await = Some(config.clone());

        launch_and_monitor(Arc::clone(&self.inner), config, app_handle)
    }

    /// Stop the CDA process gracefully (SIGTERM, then SIGKILL after timeout).
    pub async fn stop(&self) -> Result<(), String> {
        *self.inner.stop_requested.lock().await = true;

        let mut child_lock = self.inner.child.lock().await;
        if let Some(ref mut child) = *child_lock {
            let pid = child.id();

            // Try graceful shutdown first (SIGTERM on Unix)
            #[cfg(unix)]
            #[allow(clippy::cast_possible_wrap)]
            if let Some(pid) = pid {
                let _ = nix::sys::signal::kill(
                    nix::unistd::Pid::from_raw(pid as i32),
                    nix::sys::signal::Signal::SIGTERM,
                );

                // Wait up to 5 seconds for graceful exit
                let graceful = tokio::time::timeout(
                    tokio::time::Duration::from_secs(5),
                    child.wait(),
                )
                .await;

                if graceful.is_ok() {
                    *child_lock = None;
                    *self.inner.status.lock().await = CdaStatus::Stopped;
                    return Ok(());
                }
            }

            // Force kill if graceful didn't work (or on Windows)
            let _ = child.kill().await;
            *child_lock = None;
        }

        *self.inner.status.lock().await = CdaStatus::Stopped;
        Ok(())
    }

    /// Get the current status.
    pub async fn get_status(&self) -> CdaStatus {
        self.inner.status.lock().await.clone()
    }

    /// Get recent log lines.
    pub async fn get_logs(&self, count: Option<usize>) -> Vec<String> {
        let buf = self.inner.log_buffer.lock().await;
        let n = count.unwrap_or(buf.len()).min(buf.len());
        buf.iter().rev().take(n).rev().cloned().collect()
    }

    /// Clear the log buffer.
    pub async fn clear_logs(&self) {
        self.inner.log_buffer.lock().await.clear();
    }
}

// ---------------------------------------------------------------------------
// Free functions — sync command spawning + async monitoring
// ---------------------------------------------------------------------------

/// Build and spawn the CDA process synchronously (no `Command` held across awaits).
/// Returns the spawned `Child` and its PID.
fn spawn_child(config: &CdaLaunchConfig) -> Result<(Child, u32), String> {
    let mut cmd = tokio::process::Command::new(&config.executable_path);

    // Working directory: prefer explicit, else directory of config file.
    if let Some(ref wd) = config.working_dir {
        cmd.current_dir(wd);
    } else if let Some(ref cf) = config.config_file {
        if let Some(parent) = PathBuf::from(cf).parent() {
            if parent.exists() {
                cmd.current_dir(parent);
            }
        }
    }

    // Environment: CDA_CONFIG_FILE
    if let Some(ref cf) = config.config_file {
        cmd.env("CDA_CONFIG_FILE", cf);
    }

    // CLI arguments
    if let Some(ref addr) = config.listen_address {
        cmd.arg("--listen-address").arg(addr);
    }
    if let Some(port) = config.listen_port {
        cmd.arg("--listen-port").arg(port.to_string());
    }
    if let Some(ref db) = config.databases_path {
        cmd.arg("--databases-path").arg(db);
    }
    for arg in &config.extra_args {
        cmd.arg(arg);
    }

    // Capture stdout and stderr
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // On Windows, prevent a console window from appearing
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start CDA: {e}"))?;

    let pid = child.id().unwrap_or(0);
    Ok((child, pid))
}

/// Spawn the CDA process, wire up log capture, and start the monitor task.
/// This is a *synchronous* function (returns `Result`, not a future) to avoid
/// holding non-Send `Command` types across await points.
#[allow(clippy::needless_pass_by_value)]
fn launch_and_monitor(
    state: Arc<Inner>,
    config: CdaLaunchConfig,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Update status to Starting
    {
        let status = &state.status;
        tauri::async_runtime::block_on(async {
            *status.lock().await = CdaStatus::Starting;
        });
    }
    let _ = app_handle.emit("cda-status-changed", CdaStatus::Starting);

    // Spawn the child process (sync — no Command held across awaits)
    let (mut child, pid) = spawn_child(&config)?;

    // Wire up stdout capture
    if let Some(stdout) = child.stdout.take() {
        let app = app_handle.clone();
        let st = Arc::clone(&state);
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                st.push_log(&line).await;
                let _ = app.emit("cda-log-line", &line);
            }
        });
    }

    // Wire up stderr capture
    if let Some(stderr) = child.stderr.take() {
        let app = app_handle.clone();
        let st = Arc::clone(&state);
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let prefixed = format!("[stderr] {line}");
                st.push_log(&prefixed).await;
                let _ = app.emit("cda-log-line", &prefixed);
            }
        });
    }

    // Store the child and update status
    {
        let child_slot = &state.child;
        let status = &state.status;
        tauri::async_runtime::block_on(async {
            *child_slot.lock().await = Some(child);
            *status.lock().await = CdaStatus::Running { pid };
        });
    }
    let running = CdaStatus::Running { pid };
    let _ = app_handle.emit("cda-status-changed", &running);

    // Spawn the monitoring task
    let monitor_state = state;
    tokio::spawn(async move {
        monitor_process(monitor_state, app_handle).await;
    });

    Ok(())
}

/// Monitor the child process. On exit, update status and optionally restart.
async fn monitor_process(state: Arc<Inner>, app_handle: tauri::AppHandle) {
    // Wait for the child to exit
    let exit_status = {
        let mut child_lock = state.child.lock().await;
        if let Some(ref mut child) = *child_lock {
            child.wait().await.ok()
        } else {
            return;
        }
    };

    // Check if stop was requested
    let was_requested = *state.stop_requested.lock().await;

    if was_requested {
        *state.status.lock().await = CdaStatus::Stopped;
        let _ = app_handle.emit("cda-status-changed", CdaStatus::Stopped);
        *state.child.lock().await = None;
        return;
    }

    // Process exited unexpectedly
    let exit_code = exit_status.and_then(|s| s.code());
    let crashed = CdaStatus::Crashed {
        exit_code,
        message: format!("CDA exited unexpectedly with code {exit_code:?}"),
    };
    *state.status.lock().await = crashed.clone();
    let _ = app_handle.emit("cda-status-changed", &crashed);
    *state.child.lock().await = None;

    // Auto-restart if enabled
    let config = state.config.lock().await.clone();
    if let Some(config) = config {
        if config.auto_restart {
            let mut count = state.restart_count.lock().await;
            if *count < MAX_RESTART_ATTEMPTS {
                *count = count.saturating_add(1);
                let attempt = *count;
                drop(count);

                let msg = format!(
                    "Auto-restarting CDA (attempt {attempt}/{MAX_RESTART_ATTEMPTS})"
                );
                state.push_log(&msg).await;
                let _ = app_handle.emit("cda-log-line", &msg);

                tokio::time::sleep(tokio::time::Duration::from_secs(RESTART_DELAY_SECS)).await;

                // Check again that stop hasn't been requested during the delay
                if !*state.stop_requested.lock().await {
                    // launch_and_monitor is sync (non-async), so it's Send-safe
                    if let Err(e) =
                        launch_and_monitor(Arc::clone(&state), config, app_handle.clone())
                    {
                        let msg = format!("Auto-restart failed: {e}");
                        state.push_log(&msg).await;
                        let _ = app_handle.emit("cda-log-line", &msg);
                    }
                }
            } else {
                let msg = format!(
                    "CDA crashed {MAX_RESTART_ATTEMPTS} times, giving up on auto-restart"
                );
                state.push_log(&msg).await;
                let _ = app_handle.emit("cda-log-line", &msg);
            }
        }
    }
}
