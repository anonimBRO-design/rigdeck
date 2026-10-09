use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize, Deserialize)]
pub struct PtyOutputPayload {
    pub agent_id: String,
    pub data: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PtyExitPayload {
    pub agent_id: String,
    pub exit_code: Option<u32>,
}

struct ActiveSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send>,
}

#[derive(Clone, Default)]
pub struct PtyState {
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn(
        &self,
        app: AppHandle,
        agent_id: String,
        cmd: String,
        args: Vec<String>,
        cwd: Option<PathBuf>,
        rows: u16,
        cols: u16,
    ) -> Result<(), String> {
        // Kill existing session with the same agent_id if present
        self.kill(&agent_id).ok();

        let pty_system = native_pty_system();
        let size = PtySize {
            rows: if rows > 0 { rows } else { 24 },
            cols: if cols > 0 { cols } else { 80 },
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY pair: {}", e))?;

        #[cfg(target_os = "windows")]
        let (shell_cmd, shell_args) = {
            if cmd == "bash" || cmd.is_empty() {
                // Hindari C:\Windows\System32\bash.exe karena itu launcher WSL yang error jika belum ada distro.
                // Cari Git Bash nyata terlebih dahulu:
                let git_bash_candidates = [
                    "D:\\Git\\bin\\bash.exe",
                    "C:\\Program Files\\Git\\bin\\bash.exe",
                    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                ];
                let mut found_bash = None;
                for path in &git_bash_candidates {
                    if std::path::Path::new(path).exists() {
                        found_bash = Some(path.to_string());
                        break;
                    }
                }

                // Cek lokasi git.exe jika belum ketemu di lokasi standar
                if found_bash.is_none() {
                    if let Ok(out) = std::process::Command::new("where").arg("git.exe").output() {
                        if out.status.success() {
                            if let Ok(paths) = String::from_utf8(out.stdout) {
                                for line in paths.lines() {
                                    let p = std::path::Path::new(line.trim());
                                    if let Some(parent) = p.parent() {
                                        let candidate = parent.parent().unwrap_or(parent).join("bin").join("bash.exe");
                                        if candidate.exists() {
                                            found_bash = Some(candidate.to_string_lossy().to_string());
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if let Some(bash_path) = found_bash {
                    let mut b_args = args;
                    if b_args.is_empty() {
                        b_args.push("-i".to_string());
                    }
                    (bash_path, b_args)
                } else {
                    ("powershell.exe".to_string(), vec!["-NoLogo".to_string()])
                }
            } else {
                (cmd, args)
            }
        };

        #[cfg(not(target_os = "windows"))]
        let (shell_cmd, shell_args) = (cmd, args);

        let mut cmd_builder = CommandBuilder::new(&shell_cmd);
        cmd_builder.args(shell_args);

        if let Some(ref dir) = cwd {
            cmd_builder.cwd(dir);
        }

        // Set default environment variables for ANSI terminal compatibility
        cmd_builder.env("TERM", "xterm-256color");
        cmd_builder.env("COLORTERM", "truecolor");

        let child = pair
            .slave
            .spawn_command(cmd_builder)
            .map_err(|e| format!("Failed to spawn command '{}': {}", shell_cmd, e))?;

        // Drop slave so reader gets EOF when child terminates
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

        let master = pair.master;

        // Store active session
        {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|e| format!("Lock poisoned: {}", e))?;
            sessions.insert(
                agent_id.clone(),
                ActiveSession {
                    master,
                    writer,
                    child,
                },
            );
        }

        // Background reader thread: streams output to frontend
        let agent_id_clone = agent_id.clone();
        let sessions_clone = self.sessions.clone();

        thread::Builder::new()
            .name(format!("pty-reader-{}", agent_id))
            .spawn(move || {
                let mut buffer = [0u8; 4096];
                loop {
                    match reader.read(&mut buffer) {
                        Ok(0) => {
                            // EOF: Child closed output
                            break;
                        }
                        Ok(n) => {
                            let text = String::from_utf8_lossy(&buffer[..n]).to_string();
                            let payload = PtyOutputPayload {
                                agent_id: agent_id_clone.clone(),
                                data: text,
                            };
                            let _ = app.emit("pty-output", payload);
                        }
                        Err(e) => {
                            log::debug!("PTY reader ended for {}: {}", agent_id_clone, e);
                            break;
                        }
                    }
                }

                // Check exit status and clean up session
                let mut exit_code = None;
                if let Ok(mut sessions) = sessions_clone.lock() {
                    if let Some(mut session) = sessions.remove(&agent_id_clone) {
                        if let Ok(status) = session.child.wait() {
                            exit_code = Some(status.exit_code());
                        }
                    }
                }

                let exit_payload = PtyExitPayload {
                    agent_id: agent_id_clone,
                    exit_code,
                };
                let _ = app.emit("pty-exit", exit_payload);
            })
            .map_err(|e| format!("Failed to spawn reader thread: {}", e))?;

        Ok(())
    }

    pub fn write(&self, agent_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Lock poisoned: {}", e))?;
        let session = sessions
            .get_mut(agent_id)
            .ok_or_else(|| format!("No active PTY session for agent: {}", agent_id))?;

        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY writer: {}", e))?;

        Ok(())
    }

    pub fn resize(&self, agent_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Lock poisoned: {}", e))?;
        let session = sessions
            .get(agent_id)
            .ok_or_else(|| format!("No active PTY session for agent: {}", agent_id))?;

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        session
            .master
            .resize(size)
            .map_err(|e| format!("Failed to resize PTY: {}", e))
    }

    pub fn kill(&self, agent_id: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Lock poisoned: {}", e))?;
        if let Some(mut session) = sessions.remove(agent_id) {
            let _ = session.child.kill();
        }
        Ok(())
    }

    pub fn is_running(&self, agent_id: &str) -> bool {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.get_mut(agent_id) {
                match session.child.try_wait() {
                    Ok(Some(_)) => false,
                    Ok(None) => true,
                    Err(_) => false,
                }
            } else {
                false
            }
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pty_state_initialization() {
        let state = PtyState::new();
        assert!(!state.is_running("agent-nonexistent"));
        assert!(state.write("agent-nonexistent", "hello\n").is_err());
        assert!(state.resize("agent-nonexistent", 24, 80).is_err());
        assert!(state.kill("agent-nonexistent").is_ok());
    }
}

