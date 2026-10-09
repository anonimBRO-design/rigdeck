use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub last_opened_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRegistry {
    pub active_project_id: Option<String>,
    pub projects: Vec<ProjectItem>,
}

#[derive(Clone)]
pub struct ProjectState {
    current_root: Arc<RwLock<PathBuf>>,
    current_project_id: Arc<RwLock<String>>,
}

impl ProjectState {
    pub fn new(initial_id: String, initial_root: PathBuf) -> Self {
        Self {
            current_root: Arc::new(RwLock::new(initial_root)),
            current_project_id: Arc::new(RwLock::new(initial_id)),
        }
    }

    pub fn get_current_root(&self) -> PathBuf {
        self.current_root
            .read()
            .map(|r| r.clone())
            .unwrap_or_else(|_| PathBuf::from("."))
    }

    pub fn get_current_project_id(&self) -> String {
        self.current_project_id
            .read()
            .map(|id| id.clone())
            .unwrap_or_default()
    }

    pub fn set_current_project(&self, id: String, root: PathBuf) {
        if let Ok(mut r) = self.current_root.write() {
            *r = root;
        }
        if let Ok(mut i) = self.current_project_id.write() {
            *i = id;
        }
    }
}

pub fn get_config_dir() -> PathBuf {
    // Override untuk pengujian / portable mode.
    if let Ok(custom) = std::env::var("RIGDECK_CONFIG_DIR") {
        if !custom.trim().is_empty() {
            return PathBuf::from(custom);
        }
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("rigdeck")
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".config").join("rigdeck")
    } else if let Ok(profile) = std::env::var("USERPROFILE") {
        PathBuf::from(profile).join(".config").join("rigdeck")
    } else {
        PathBuf::from(".config").join("rigdeck")
    }
}

pub fn get_registry_file_path() -> PathBuf {
    get_config_dir().join("projects.json")
}

pub fn now_iso() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let millis = duration.subsec_millis();
    format!("{}.{:03}Z", secs, millis)
}

pub fn load_registry() -> ProjectRegistry {
    let path = get_registry_file_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(reg) = serde_json::from_str::<ProjectRegistry>(&content) {
            return reg;
        }
    }
    ProjectRegistry {
        active_project_id: None,
        projects: Vec::new(),
    }
}

pub fn list_projects() -> Vec<ProjectItem> {
    load_registry().projects
}

pub fn save_registry(registry: &ProjectRegistry) -> Result<(), String> {
    let dir = get_config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
    let path = get_registry_file_path();
    let json = serde_json::to_string_pretty(registry).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("Failed to write projects.json: {}", e))?;
    Ok(())
}

pub fn get_default_project_root() -> PathBuf {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let root = if current_dir.ends_with("src-tauri") {
        current_dir.parent().unwrap_or(&current_dir).to_path_buf()
    } else {
        current_dir
    };
    fs::canonicalize(&root).unwrap_or(root)
}

pub fn init_project_state(default_root: &Path) -> (ProjectState, ProjectItem) {
    let mut reg = load_registry();
    let now = now_iso();

    // Check if active_project_id is valid and exists on disk
    if let Some(ref active_id) = reg.active_project_id {
        if let Some(existing) = reg.projects.iter_mut().find(|p| &p.id == active_id) {
            let path_buf = PathBuf::from(&existing.path);
            if path_buf.exists() {
                existing.last_opened_at = now.clone();
                let item = existing.clone();
                let _ = save_registry(&reg);
                return (ProjectState::new(item.id.clone(), path_buf), item);
            }
        }
    }

    // If any project in list exists on disk, use the first one
    for p in &mut reg.projects {
        let p_buf = PathBuf::from(&p.path);
        if p_buf.exists() {
            p.last_opened_at = now.clone();
            reg.active_project_id = Some(p.id.clone());
            let item = p.clone();
            let _ = save_registry(&reg);
            return (ProjectState::new(item.id.clone(), p_buf), item);
        }
    }

    // Otherwise, create entry for default_root
    let canonical = fs::canonicalize(default_root).unwrap_or_else(|_| default_root.to_path_buf());
    let path_str = canonical.to_string_lossy().to_string();
    let name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "rigdeck".to_string());

    let default_item = ProjectItem {
        id: "proj-default".to_string(),
        name,
        path: path_str,
        last_opened_at: now,
    };

    reg.active_project_id = Some(default_item.id.clone());
    reg.projects.retain(|p| p.path != default_item.path);
    reg.projects.insert(0, default_item.clone());
    let _ = save_registry(&reg);

    (ProjectState::new(default_item.id.clone(), canonical), default_item)
}

pub fn switch_project_internal(
    project_state: &ProjectState,
    blackboard_state: &crate::blackboard::BlackboardState,
    project_id: &str,
) -> Result<ProjectItem, String> {
    let mut reg = load_registry();
    let now = now_iso();

    let project_item = {
        let p = reg
            .projects
            .iter_mut()
            .find(|item| item.id == project_id)
            .ok_or_else(|| format!("Project ID '{}' not found", project_id))?;
        p.last_opened_at = now;
        p.clone()
    };

    let project_path = PathBuf::from(&project_item.path);
    if !project_path.exists() {
        return Err(format!("Project directory does not exist: {}", project_item.path));
    }

    // 1. Ensure memory vault in target project
    crate::memory::ensure_vault(&project_path)?;

    // 2. Switch blackboard SQLite to the project's .rig/blackboard.db
    let db_path = project_path.join(".rig").join("blackboard.db");
    blackboard_state.switch_database(&db_path)?;

    // 3. Update active pointer in memory
    project_state.set_current_project(project_item.id.clone(), project_path);

    // 4. Save active project in registry
    reg.active_project_id = Some(project_item.id.clone());
    let _ = save_registry(&reg);

    Ok(project_item)
}

pub fn add_or_open_project_internal(
    project_state: &ProjectState,
    blackboard_state: &crate::blackboard::BlackboardState,
    path: &str,
    name: Option<String>,
) -> Result<ProjectItem, String> {
    let raw_path = PathBuf::from(path);
    if !raw_path.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }
    let canonical = fs::canonicalize(&raw_path).unwrap_or(raw_path);
    let canonical_str = canonical.to_string_lossy().to_string();

    let mut reg = load_registry();
    let now = now_iso();

    let project_item = if let Some(existing) = reg.projects.iter_mut().find(|p| p.path == canonical_str) {
        if let Some(n) = name {
            existing.name = n;
        }
        existing.last_opened_at = now;
        existing.clone()
    } else {
        let proj_name = name.unwrap_or_else(|| {
            canonical
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "project".to_string())
        });
        let new_item = ProjectItem {
            id: format!("proj-{}", &now.replace(['.', 'Z', '-'], "")),
            name: proj_name,
            path: canonical_str,
            last_opened_at: now,
        };
        reg.projects.insert(0, new_item.clone());
        new_item
    };

    reg.active_project_id = Some(project_item.id.clone());
    save_registry(&reg)?;

    switch_project_internal(project_state, blackboard_state, &project_item.id)?;

    Ok(project_item)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_workspace(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rigdeck-proj-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Set RIGDECK_CONFIG_DIR agar registry test tidak menimpa config user asli.
    fn with_isolated_config<T>(tag: &str, f: impl FnOnce(&Path) -> T) -> T {
        let config_dir = std::env::temp_dir()
            .join(format!("rigdeck-cfg-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&config_dir);
        fs::create_dir_all(&config_dir).unwrap();
        // SAFETY: test dijalankan single-threaded untuk kunci env ini.
        unsafe { std::env::set_var("RIGDECK_CONFIG_DIR", &config_dir) };
        let out = f(&config_dir);
        unsafe { std::env::remove_var("RIGDECK_CONFIG_DIR") };
        let _ = fs::remove_dir_all(&config_dir);
        out
    }

    #[test]
    fn registry_init_and_switch_project() {
        let ws = temp_workspace("switch");
        let proj_a = ws.join("alpha");
        let proj_b = ws.join("beta");
        fs::create_dir_all(&proj_a).unwrap();
        fs::create_dir_all(&proj_b).unwrap();

        with_isolated_config("switch", |_cfg| {
            // 1. Init dengan default root
            let (state, initial) = init_project_state(&proj_a);
            assert_eq!(initial.name, "alpha");
            assert_eq!(state.get_current_project_id(), initial.id);

            let blackboard = crate::blackboard::BlackboardState::new(
                proj_a.join(".rig").join("blackboard.db"),
            )
            .expect("blackboard init");

            // 2. Buka project kedua → registry bertambah + vault dibuat
            let beta = add_or_open_project_internal(&state, &blackboard, proj_b.to_str().unwrap(), None)
                .expect("add_or_open_project");
            assert_eq!(beta.name, "beta");
            assert!(proj_b.join("rig-memory").join("00-INDEX.md").exists());

            let reg = load_registry();
            assert_eq!(reg.projects.len(), 2);
            assert_eq!(reg.active_project_id.as_deref(), Some(beta.id.as_str()));

            // 3. Switch balik ke alpha → blackboard ikut pindah database
            let alpha = switch_project_internal(&state, &blackboard, &initial.id)
                .expect("switch_project");
            assert_eq!(alpha.name, "alpha");
            assert_eq!(state.get_current_root(), fs::canonicalize(&proj_a).unwrap());

            // 4. Menulis conversation di alpha harus muncul di db alpha
            let conv = blackboard
                .create_conversation(&alpha.id, "Thread Alpha", "ag/gemini-3.8-flash-high")
                .expect("create conversation");
            assert_eq!(blackboard.list_conversations(&alpha.id).unwrap().len(), 1);
            assert!(conv.title == "Thread Alpha");

            // 5. DB beta tetap terpisah (belum ada conversation)
            let beta_db = proj_b.join(".rig").join("blackboard.db");
            assert!(beta_db.exists());
            let beta_bb = crate::blackboard::BlackboardState::new(&beta_db).unwrap();
            assert_eq!(beta_bb.list_conversations(&beta.id).unwrap().len(), 0);

            // 6. Project tidak dikenal → error, bukan panic
            assert!(switch_project_internal(&state, &blackboard, "proj-tidak-ada").is_err());
        });

        let _ = fs::remove_dir_all(&ws);
    }
}
