use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Focus desktop app window using wmctrl with WM_CLASS matching (Wayland/XWayland on Linux)
pub fn focus_app_window(app_name: &str) -> Result<bool, String> {
    match app_name.to_lowercase().as_str() {
        "claude" => {
            // First priority: Match official StartupWMClass 'com.anthropic.Claude'
            let out_class = Command::new("wmctrl")
                .args(["-x", "-a", "com.anthropic.Claude"])
                .output();

            if let Ok(res) = out_class {
                if res.status.success() {
                    return Ok(true);
                }
            }

            // Fallback: Match window title 'Claude'
            let out_title = Command::new("wmctrl")
                .args(["-a", "Claude"])
                .output();

            if let Ok(res) = out_title {
                if res.status.success() {
                    return Ok(true);
                }
            }

            // Fallback: Launch or trigger via gtk-launch
            let _ = Command::new("gtk-launch")
                .arg("com.anthropic.Claude")
                .spawn();
            Ok(true)
        }
        "chatgpt" => {
            // Match title 'ChatGPT' or WM_CLASS 'chatgpt'
            let out_title = Command::new("wmctrl")
                .args(["-a", "ChatGPT"])
                .output();

            if let Ok(res) = out_title {
                if res.status.success() {
                    return Ok(true);
                }
            }

            let out_class = Command::new("wmctrl")
                .args(["-x", "-a", "chatgpt"])
                .output();

            if let Ok(res) = out_class {
                if res.status.success() {
                    return Ok(true);
                }
            }

            // Fallback launch
            let _ = Command::new("gtk-launch").arg("chatgpt").spawn();
            Ok(true)
        }
        "antigravity" => {
            // Match title or WM_CLASS 'Antigravity'
            let out_class = Command::new("wmctrl")
                .args(["-x", "-a", "Antigravity"])
                .output();

            if let Ok(res) = out_class {
                if res.status.success() {
                    return Ok(true);
                }
            }

            let out_title = Command::new("wmctrl")
                .args(["-a", "Antigravity"])
                .output();

            if let Ok(res) = out_title {
                if res.status.success() {
                    return Ok(true);
                }
            }

            let _ = Command::new("gtk-launch").arg("antigravity").spawn();
            Ok(true)
        }
        _ => Err(format!("Unknown desktop app target: {}", app_name)),
    }
}

/// Dispatches any URL scheme via Linux xdg-open
pub fn dispatch_url_scheme(url: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map_err(|e| format!("Failed to dispatch URL via xdg-open: {}", e))?;

    Ok(())
}

/// Writes the standard Conductor Task Schema to .rig/context/current_task.json
pub fn write_pointer_task_file(
    project_root: &Path,
    task_payload_json: &str,
) -> Result<PathBuf, String> {
    let context_dir = project_root.join(".rig").join("context");
    fs::create_dir_all(&context_dir)
        .map_err(|e| format!("Failed to create .rig/context directory: {}", e))?;

    let file_path = context_dir.join("current_task.json");
    fs::write(&file_path, task_payload_json)
        .map_err(|e| format!("Failed to write {}: {}", file_path.display(), e))?;

    Ok(file_path)
}

/// Writes pointer file, opens claude:// with Pointer Context File pattern, and focuses window
pub fn dispatch_claude_pointer_task(
    project_root: &Path,
    task_payload_json: &str,
) -> Result<String, String> {
    let file_path = write_pointer_task_file(project_root, task_payload_json)?;

    let prompt = "RigDeck Mission Control: Baca rig-memory/00-INDEX.md (shared memory), lalu rancang arsitektur sesuai file .rig/context/current_task.json. Catat hasilmu di rig-memory/journal/.";
    let encoded_prompt = urlencoding_encode(prompt);
    let deep_link = format!(
        "claude://claude.ai/new?q={}&source=rigdeck",
        encoded_prompt
    );

    // 1. Dispatch URL to Claude Desktop
    let _ = dispatch_url_scheme(&deep_link);

    // 2. Focus Claude Desktop window
    let _ = focus_app_window("claude");

    Ok(format!(
        "Pointer task written to {} and dispatched to Claude Desktop via deep-link",
        file_path.display()
    ))
}

fn urlencoding_encode(input: &str) -> String {
    let mut encoded = String::new();
    for byte in input.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            b' ' => encoded.push_str("%20"),
            b':' => encoded.push_str("%3A"),
            b'/' => encoded.push_str("%2F"),
            b'?' => encoded.push_str("%3F"),
            b'=' => encoded.push_str("%3D"),
            b'&' => encoded.push_str("%26"),
            _ => encoded.push_str(&format!("%{:02X}", byte)),
        }
    }
    encoded
}
