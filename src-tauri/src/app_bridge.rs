use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Linux fallback: cari jendela lewat _NET_WM_PID, lalu fokuskan pakai wmctrl.
///
/// Padanan perbaikan Windows: jangan andalkan judul/WM_CLASS (judul Antigravity
/// berubah sesuai dokumen yang dibuka). Cari proses -> PID -> jendela yang
/// _NET_WM_PID-nya cocok. Butuh `pgrep` (procps) dan `xprop` (x11-utils);
/// kalau tak tersedia, kembalikan false supaya pemanggil lanjut ke fallback.
#[cfg(not(target_os = "windows"))]
fn focus_by_pid_linux(proc_hint: &str) -> bool {
    use std::collections::HashSet;

    let found = match Command::new("pgrep").args(["-f", proc_hint]).output() {
        Ok(o) if o.status.success() => o,
        _ => return false,
    };
    let pids: HashSet<String> = String::from_utf8_lossy(&found.stdout)
        .split_whitespace()
        .map(|s| s.to_string())
        .collect();
    if pids.is_empty() {
        return false;
    }

    let listed = match Command::new("wmctrl").arg("-lp").output() {
        Ok(o) if o.status.success() => o,
        _ => return false,
    };

    for line in String::from_utf8_lossy(&listed.stdout).lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }
        let (win_id, pid) = (parts[0], parts[2]);
        if !pids.contains(pid) {
            continue;
        }
        // Verifikasi via _NET_WM_PID supaya PID dari `pgrep -f` tak salah cocok.
        if let Some(wpid) = window_pid_linux(win_id) {
            if wpid != pid {
                continue;
            }
        }
        if let Ok(res) = Command::new("wmctrl").args(["-i", "-a", win_id]).output() {
            if res.status.success() {
                return true;
            }
        }
    }
    false
}

#[cfg(not(target_os = "windows"))]
fn window_pid_linux(win_id: &str) -> Option<String> {
    let res = Command::new("xprop")
        .args(["-id", win_id, "_NET_WM_PID"])
        .output()
        .ok()?;
    if !res.status.success() {
        return None;
    }
    String::from_utf8_lossy(&res.stdout)
        .split('=')
        .nth(1)
        .map(|s| s.trim().to_string())
}

#[cfg(target_os = "windows")]
mod win32_activator {
    use std::ffi::c_void;

    type HWND = *mut c_void;
    type BOOL = i32;
    type DWORD = u32;
    type LPARAM = isize;
    type HANDLE = *mut c_void;

    const TH32CS_SNAPPROCESS: DWORD = 0x00000002;
    const SW_RESTORE: i32 = 9;

    #[repr(C)]
    struct PROCESSENTRY32W {
        dw_size: DWORD,
        cnt_usage: DWORD,
        th32_process_id: DWORD,
        th32_default_heap_id: usize,
        th32_module_id: DWORD,
        cnt_threads: DWORD,
        th32_parent_process_id: DWORD,
        pc_pri_class_base: i32,
        dw_flags: DWORD,
        sz_exe_file: [u16; 260],
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreateToolhelp32Snapshot(dw_flags: DWORD, th32_process_id: DWORD) -> HANDLE;
        fn Process32FirstW(h_snapshot: HANDLE, lppe: *mut PROCESSENTRY32W) -> BOOL;
        fn Process32NextW(h_snapshot: HANDLE, lppe: *mut PROCESSENTRY32W) -> BOOL;
        fn CloseHandle(h_object: HANDLE) -> BOOL;
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn EnumWindows(lp_enum_func: unsafe extern "system" fn(HWND, LPARAM) -> BOOL, l_param: LPARAM) -> BOOL;
        fn GetWindowThreadProcessId(h_wnd: HWND, lpdw_process_id: *mut DWORD) -> DWORD;
        fn IsWindowVisible(h_wnd: HWND) -> BOOL;
        fn ShowWindow(h_wnd: HWND, n_cmd_show: i32) -> BOOL;
        fn SetForegroundWindow(h_wnd: HWND) -> BOOL;
        fn BringWindowToTop(h_wnd: HWND) -> BOOL;
        fn GetWindowTextLengthW(h_wnd: HWND) -> i32;
    }

    struct EnumContext {
        target_pids: Vec<DWORD>,
        found_window: Option<HWND>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            let ctx = &mut *(lparam as *mut EnumContext);
            if IsWindowVisible(hwnd) == 0 {
                return 1;
            }
            let mut pid: DWORD = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if ctx.target_pids.contains(&pid) {
                if GetWindowTextLengthW(hwnd) > 0 {
                    ctx.found_window = Some(hwnd);
                    return 0; // berhenti, jendela ditemukan
                }
            }
            1
        }
    }

    pub fn focus_by_process_names(names: &[&str]) -> bool {
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap as isize == -1 {
                return false;
            }
            let mut entry = PROCESSENTRY32W {
                dw_size: std::mem::size_of::<PROCESSENTRY32W>() as DWORD,
                cnt_usage: 0,
                th32_process_id: 0,
                th32_default_heap_id: 0,
                th32_module_id: 0,
                cnt_threads: 0,
                th32_parent_process_id: 0,
                pc_pri_class_base: 0,
                dw_flags: 0,
                sz_exe_file: [0; 260],
            };

            let mut target_pids = Vec::new();
            if Process32FirstW(snap, &mut entry) != 0 {
                loop {
                    let len = entry.sz_exe_file.iter().position(|&c| c == 0).unwrap_or(260);
                    let exe_name = String::from_utf16_lossy(&entry.sz_exe_file[..len]).to_lowercase();
                    for name in names {
                        let name_low = name.to_lowercase();
                        if exe_name == name_low
                            || exe_name == format!("{}.exe", name_low)
                            || exe_name.starts_with(&format!("{}.", name_low))
                        {
                            target_pids.push(entry.th32_process_id);
                        }
                    }
                    if Process32NextW(snap, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snap);

            if target_pids.is_empty() {
                return false;
            }

            let mut ctx = EnumContext {
                target_pids,
                found_window: None,
            };

            EnumWindows(enum_proc, &mut ctx as *mut EnumContext as LPARAM);

            if let Some(hwnd) = ctx.found_window {
                ShowWindow(hwnd, SW_RESTORE);
                BringWindowToTop(hwnd);
                SetForegroundWindow(hwnd);
                true
            } else {
                false
            }
        }
    }
}

/// Fokuskan jendela aplikasi desktop.
///
/// Windows : Win32 native API (<1ms) -> fallback PowerShell WScript.Shell
/// Linux   : wmctrl / gtk-launch
pub fn focus_app_window(app_name: &str) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let nama_kecil = app_name.to_lowercase();
        let target_candidates: &[&str] = match nama_kecil.as_str() {
            "claude" => &["claude", "Claude"],
            "chatgpt" => &["ChatGPT", "chatgpt", "Codex", "codex"],
            "antigravity" => &["Antigravity", "antigravity"],
            "codex" => &["Codex", "codex", "ChatGPT"],
            "hermes" => &["hermes", "Hermes", "hermes-agent"],
            _ => &[app_name],
        };

        // 1. Coba Win32 native activator langsung (cepat, <1ms tanpa overhead PowerShell)
        if win32_activator::focus_by_process_names(target_candidates) {
            return Ok(true);
        }

        // 2. Fallback: PowerShell WScript.Shell
        let nama_proses = target_candidates[0];
        let script = format!(
            r#"
$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-Process -Name '{nama}' |
         Where-Object {{ $_.MainWindowHandle -ne 0 }}
if ($procs) {{
    $p = $procs | Select-Object -First 1
    $shell = New-Object -ComObject WScript.Shell
    $ok = $shell.AppActivate($p.Id)
    if ($ok) {{ Write-Output 'OK' }} else {{ Write-Output 'GAGAL' }}
}} else {{
    Write-Output 'NOTFOUND'
}}
"#,
            nama = nama_proses
        );

        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output();

        match output {
            Ok(out) => {
                let hasil = String::from_utf8_lossy(&out.stdout).trim().to_string();
                match hasil.as_str() {
                    "OK" => Ok(true),
                    "NOTFOUND" => Err(format!(
                        "Jendela '{}' tidak ditemukan. Pastikan aplikasinya sedang terbuka.",
                        nama_proses
                    )),
                    _ => Err(format!("Gagal fokuskan jendela '{}'", nama_proses)),
                }
            }
            Err(e) => Err(format!("Gagal menjalankan PowerShell: {}", e)),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
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

                // Fallback: cari lewat PID (padanan perbaikan Windows)
                if focus_by_pid_linux("claude") {
                    return Ok(true);
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

                // Fallback: cari lewat PID (padanan perbaikan Windows)
                if focus_by_pid_linux("chatgpt") {
                    return Ok(true);
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

                // Fallback: cari lewat PID (padanan perbaikan Windows)
                if focus_by_pid_linux("antigravity") {
                    return Ok(true);
                }

                let _ = Command::new("gtk-launch").arg("antigravity").spawn();
                Ok(true)
            }
            "hermes" => {
                let out_class = Command::new("wmctrl")
                    .args(["-x", "-a", "hermes"])
                    .output();

                if let Ok(res) = out_class {
                    if res.status.success() {
                        return Ok(true);
                    }
                }

                let out_title = Command::new("wmctrl")
                    .args(["-a", "Hermes"])
                    .output();

                if let Ok(res) = out_title {
                    if res.status.success() {
                        return Ok(true);
                    }
                }

                if focus_by_pid_linux("hermes") {
                    return Ok(true);
                }

                let _ = Command::new("gtk-launch").arg("hermes").spawn();
                Ok(true)
            }
            _ => Err(format!("Unknown desktop app target: {}", app_name)),
        }
    }
}

/// Dispatches any URL scheme via Linux xdg-open or Windows cmd start
pub fn dispatch_url_scheme(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("Failed to dispatch URL via cmd start: {}", e))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to dispatch URL via xdg-open: {}", e))?;
        Ok(())
    }
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

/// Injects a prompt into a GUI app window by copying to OS clipboard, focusing window, and simulating paste
pub fn inject_prompt_to_gui(
    project_root: &Path,
    app_name: &str,
    prompt: &str,
    auto_submit: bool,
) -> Result<bool, String> {
    let script_candidates = [
        project_root.join("src-tauri").join("scripts").join("gui_inject.py"),
        project_root.join("scripts").join("gui_inject.py"),
        PathBuf::from("scripts").join("gui_inject.py"),
    ];

    let script = script_candidates
        .iter()
        .find(|p| p.exists())
        .ok_or_else(|| "gui_inject.py script not found".to_string())?;

    let python_bins = if cfg!(target_os = "windows") {
        vec!["python", "py", "python3"]
    } else {
        vec!["python3", "python"]
    };

    let mut last_err = None;
    for py in python_bins {
        let mut cmd = Command::new(py);
        cmd.arg(script).arg(app_name).arg(prompt);

        if auto_submit {
            cmd.arg("--submit");
        }

        match cmd.output() {
            Ok(output) => {
                if !output.status.success() {
                    let err = String::from_utf8_lossy(&output.stderr);
                    eprintln!("[app_bridge] gui_inject warning: {}", err);
                }
                return Ok(output.status.success());
            }
            Err(e) => {
                last_err = Some(e);
            }
        }
    }

    if let Some(e) = last_err {
        Err(format!("Failed to execute Python script: {}", e))
    } else {
        Err("Python interpreter not found".to_string())
    }
}

/// Writes pointer file, opens claude://code/continue to focus active Code session, and injects prompt into composer
pub fn dispatch_claude_pointer_task(
    project_root: &Path,
    task_payload_json: &str,
    custom_prompt: Option<String>,
    auto_submit: Option<bool>,
) -> Result<String, String> {
    let file_path = write_pointer_task_file(project_root, task_payload_json)?;

    let prompt = custom_prompt.unwrap_or_else(|| {
        "RigDeck Mission Control: rancang arsitektur sesuai file .rig/context/current_task.json. Sebelum mulai, baca AGENTS.md dan rig-memory/ (00-INDEX, 02-Decisions, journal terbaru). Setelah selesai, tulis ringkasan satu baris ke rig-memory/journal/ sesuai format di AGENTS.md.".to_string()
    });

    // 1. Dispatch URL to ensure Claude Desktop Code tab is active
    let deep_link = "claude://code/continue?session=last&source=rigdeck";
    let _ = dispatch_url_scheme(deep_link);

    // 2. Use OS-level injection to focus window, set clipboard, and auto-paste into chat composer
    let should_submit = auto_submit.unwrap_or(true);
    let _ = inject_prompt_to_gui(project_root, "claude", &prompt, should_submit);

    Ok(format!(
        "Pointer task written to {} and injected directly into Claude Desktop Code chat",
        file_path.display()
    ))
}

#[allow(dead_code)]
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
