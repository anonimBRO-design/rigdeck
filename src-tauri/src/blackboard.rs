use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

static TASK_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub assigned_agent: Option<String>,
    pub parent_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    pub id: i64,
    pub agent_id: String,
    pub event_type: String,
    pub payload: String,
    pub timestamp: String,
}

#[derive(Clone)]
pub struct BlackboardState {
    conn: Arc<Mutex<Connection>>,
}

impl BlackboardState {
    /// Initialize SQLite in WAL mode with the task_dag and agent_events tables
    pub fn new<P: AsRef<Path>>(db_path: P) -> Result<Self, String> {
        let path = db_path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let conn = Connection::open(path)
            .map_err(|e| format!("Failed to open blackboard SQLite: {}", e))?;

        // Configure WAL mode & high-performance concurrency settings
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| format!("Failed to set journal_mode WAL: {}", e))?;
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(|e| format!("Failed to set synchronous NORMAL: {}", e))?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| format!("Failed to enable foreign_keys: {}", e))?;
        conn.pragma_update(None, "busy_timeout", 5000)
            .map_err(|e| format!("Failed to set busy_timeout: {}", e))?;

        // Initialize schema
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS task_dag (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'PENDING',
                assigned_agent TEXT,
                parent_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (parent_id) REFERENCES task_dag(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS agent_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_task_status ON task_dag(status);
            CREATE INDEX IF NOT EXISTS idx_task_assigned ON task_dag(assigned_agent);
            CREATE INDEX IF NOT EXISTS idx_events_agent ON agent_events(agent_id);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON agent_events(timestamp);
            "#,
        )
        .map_err(|e| format!("Failed to initialize blackboard schema: {}", e))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Helper for in-memory SQLite (useful for testing or ephemeral runs)
    pub fn in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("Failed to open in-memory SQLite: {}", e))?;

        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| format!("Failed to enable foreign_keys: {}", e))?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS task_dag (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'PENDING',
                assigned_agent TEXT,
                parent_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (parent_id) REFERENCES task_dag(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS agent_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
            "#,
        )
        .map_err(|e| format!("Failed to initialize in-memory schema: {}", e))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    fn now_iso() -> String {
        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        let secs = duration.as_secs();
        let millis = duration.subsec_millis();
        format!("{}.{:03}Z", secs, millis)
    }

    /// Create a new Task item in task_dag
    pub fn create_task(
        &self,
        title: &str,
        description: &str,
        assigned_agent: Option<&str>,
        parent_id: Option<&str>,
    ) -> Result<TaskItem, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let count = TASK_COUNTER.fetch_add(1, Ordering::Relaxed);
        let task_id = format!("task-{}-{:04}", &Self::now_iso().replace(['.', 'Z'], ""), count % 10000);
        let now = Self::now_iso();
        let status = "PENDING";

        conn.execute(
            "INSERT INTO task_dag (id, title, description, status, assigned_agent, parent_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                task_id,
                title,
                description,
                status,
                assigned_agent,
                parent_id,
                now,
                now
            ],
        )
        .map_err(|e| format!("Failed to insert task: {}", e))?;

        // Record creation event
        let payload = serde_json::json!({
            "task_id": task_id,
            "title": title,
            "assigned_agent": assigned_agent,
        })
        .to_string();

        let agent = assigned_agent.unwrap_or("system");
        conn.execute(
            "INSERT INTO agent_events (agent_id, event_type, payload, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![agent, "TASK_CREATED", payload, now],
        )
        .map_err(|e| format!("Failed to record event: {}", e))?;

        Ok(TaskItem {
            id: task_id,
            title: title.to_string(),
            description: description.to_string(),
            status: status.to_string(),
            assigned_agent: assigned_agent.map(String::from),
            parent_id: parent_id.map(String::from),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Retrieve a single task by ID
    pub fn get_task(&self, id: &str) -> Result<Option<TaskItem>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, title, description, status, assigned_agent, parent_id, created_at, updated_at
                 FROM task_dag WHERE id = ?1",
            )
            .map_err(|e| format!("Prepare failed: {}", e))?;

        let mut rows = stmt
            .query(params![id])
            .map_err(|e| format!("Query failed: {}", e))?;

        if let Some(row) = rows.next().map_err(|e| format!("Fetch failed: {}", e))? {
            Ok(Some(TaskItem {
                id: row.get(0).map_err(|e| e.to_string())?,
                title: row.get(1).map_err(|e| e.to_string())?,
                description: row.get(2).map_err(|e| e.to_string())?,
                status: row.get(3).map_err(|e| e.to_string())?,
                assigned_agent: row.get(4).map_err(|e| e.to_string())?,
                parent_id: row.get(5).map_err(|e| e.to_string())?,
                created_at: row.get(6).map_err(|e| e.to_string())?,
                updated_at: row.get(7).map_err(|e| e.to_string())?,
            }))
        } else {
            Ok(None)
        }
    }

    /// List all tasks ordered by creation time
    pub fn list_tasks(&self) -> Result<Vec<TaskItem>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, title, description, status, assigned_agent, parent_id, created_at, updated_at
                 FROM task_dag ORDER BY created_at ASC",
            )
            .map_err(|e| format!("Prepare failed: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(TaskItem {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    description: row.get(2)?,
                    status: row.get(3)?,
                    assigned_agent: row.get(4)?,
                    parent_id: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .map_err(|e| format!("Query map failed: {}", e))?;

        let mut tasks = Vec::new();
        for task in rows {
            tasks.push(task.map_err(|e| e.to_string())?);
        }
        Ok(tasks)
    }

    /// Update task state (PENDING -> IN_PROGRESS -> READY_FOR_TEST -> IN_REVIEW -> COMPLETED / FAILED)
    pub fn update_task_status(
        &self,
        id: &str,
        new_status: &str,
        agent_id: Option<&str>,
    ) -> Result<TaskItem, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let now = Self::now_iso();

        let rows_affected = conn
            .execute(
                "UPDATE task_dag SET status = ?1, updated_at = ?2 WHERE id = ?3",
                params![new_status, now, id],
            )
            .map_err(|e| format!("Update failed: {}", e))?;

        if rows_affected == 0 {
            return Err(format!("Task with id '{}' not found", id));
        }

        // Record audit event
        let payload = serde_json::json!({
            "task_id": id,
            "new_status": new_status,
            "actor": agent_id,
        })
        .to_string();

        let actor = agent_id.unwrap_or("system");
        conn.execute(
            "INSERT INTO agent_events (agent_id, event_type, payload, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![actor, "TASK_STATUS_CHANGED", payload, now],
        )
        .map_err(|e| format!("Failed to record status change event: {}", e))?;

        drop(conn);
        self.get_task(id)?
            .ok_or_else(|| "Failed to fetch updated task".to_string())
    }

    /// Assign or reassign a task to a specific agent
    pub fn assign_task(&self, id: &str, agent_id: &str) -> Result<TaskItem, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let now = Self::now_iso();

        let rows_affected = conn
            .execute(
                "UPDATE task_dag SET assigned_agent = ?1, updated_at = ?2 WHERE id = ?3",
                params![agent_id, now, id],
            )
            .map_err(|e| format!("Update failed: {}", e))?;

        if rows_affected == 0 {
            return Err(format!("Task with id '{}' not found", id));
        }

        let payload = serde_json::json!({
            "task_id": id,
            "assigned_agent": agent_id,
        })
        .to_string();

        conn.execute(
            "INSERT INTO agent_events (agent_id, event_type, payload, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![agent_id, "TASK_ASSIGNED", payload, now],
        )
        .map_err(|e| format!("Failed to record assignment event: {}", e))?;

        drop(conn);
        self.get_task(id)?
            .ok_or_else(|| "Failed to fetch assigned task".to_string())
    }

    /// Record a generic audit or lifecycle event
    pub fn record_event(
        &self,
        agent_id: &str,
        event_type: &str,
        payload: &str,
    ) -> Result<AgentEvent, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let now = Self::now_iso();

        conn.execute(
            "INSERT INTO agent_events (agent_id, event_type, payload, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![agent_id, event_type, payload, now],
        )
        .map_err(|e| format!("Failed to record event: {}", e))?;

        let id = conn.last_insert_rowid();

        Ok(AgentEvent {
            id,
            agent_id: agent_id.to_string(),
            event_type: event_type.to_string(),
            payload: payload.to_string(),
            timestamp: now,
        })
    }

    /// List recent agent events
    pub fn list_recent_events(&self, limit: usize) -> Result<Vec<AgentEvent>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, agent_id, event_type, payload, timestamp
                 FROM agent_events ORDER BY id DESC LIMIT ?1",
            )
            .map_err(|e| format!("Prepare failed: {}", e))?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(AgentEvent {
                    id: row.get(0)?,
                    agent_id: row.get(1)?,
                    event_type: row.get(2)?,
                    payload: row.get(3)?,
                    timestamp: row.get(4)?,
                })
            })
            .map_err(|e| format!("Query map failed: {}", e))?;

        let mut events = Vec::new();
        for event in rows {
            events.push(event.map_err(|e| e.to_string())?);
        }
        Ok(events)
    }

    /// Helper for agents polling next pending task (Hub-and-Spoke pattern)
    pub fn get_next_pending_task(&self, agent_id: Option<&str>) -> Result<Option<TaskItem>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;

        let query = if let Some(agent) = agent_id {
            let mut stmt = conn.prepare(
                "SELECT id, title, description, status, assigned_agent, parent_id, created_at, updated_at
                 FROM task_dag
                 WHERE status = 'PENDING' AND (assigned_agent = ?1 OR assigned_agent IS NULL)
                 ORDER BY created_at ASC LIMIT 1",
            ).map_err(|e| e.to_string())?;

            let mut rows = stmt.query(params![agent]).map_err(|e| e.to_string())?;
            if let Some(row) = rows.next().map_err(|e| e.to_string())? {
                Some(TaskItem {
                    id: row.get(0).map_err(|e| e.to_string())?,
                    title: row.get(1).map_err(|e| e.to_string())?,
                    description: row.get(2).map_err(|e| e.to_string())?,
                    status: row.get(3).map_err(|e| e.to_string())?,
                    assigned_agent: row.get(4).map_err(|e| e.to_string())?,
                    parent_id: row.get(5).map_err(|e| e.to_string())?,
                    created_at: row.get(6).map_err(|e| e.to_string())?,
                    updated_at: row.get(7).map_err(|e| e.to_string())?,
                })
            } else {
                None
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, title, description, status, assigned_agent, parent_id, created_at, updated_at
                 FROM task_dag
                 WHERE status = 'PENDING'
                 ORDER BY created_at ASC LIMIT 1",
            ).map_err(|e| e.to_string())?;

            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
            if let Some(row) = rows.next().map_err(|e| e.to_string())? {
                Some(TaskItem {
                    id: row.get(0).map_err(|e| e.to_string())?,
                    title: row.get(1).map_err(|e| e.to_string())?,
                    description: row.get(2).map_err(|e| e.to_string())?,
                    status: row.get(3).map_err(|e| e.to_string())?,
                    assigned_agent: row.get(4).map_err(|e| e.to_string())?,
                    parent_id: row.get(5).map_err(|e| e.to_string())?,
                    created_at: row.get(6).map_err(|e| e.to_string())?,
                    updated_at: row.get(7).map_err(|e| e.to_string())?,
                })
            } else {
                None
            }
        };

        Ok(query)
    }
}

pub fn default_blackboard_path() -> PathBuf {
    let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    current.join(".rig").join("blackboard.db")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blackboard_in_memory_flow() {
        let bb = BlackboardState::in_memory().expect("Failed to initialize in-memory DB");

        // 1. Create a Root Task
        let root = bb
            .create_task("Architect API Specs", "Design REST / WebSocket schema", Some("lead-architect"), None)
            .expect("Failed to create task");
        assert_eq!(root.status, "PENDING");
        assert_eq!(root.assigned_agent.as_deref(), Some("lead-architect"));

        // 2. Create a Sub Task
        let sub = bb
            .create_task("Implement Auth Endpoint", "Implement JWT in Rust", Some("coder-1"), Some(&root.id))
            .expect("Failed to create subtask");
        assert_eq!(sub.parent_id.as_deref(), Some(root.id.as_str()));

        // 3. List Tasks
        let tasks = bb.list_tasks().expect("Failed to list tasks");
        assert_eq!(tasks.len(), 2);

        // 4. Update Status & Verify Event
        let updated = bb
            .update_task_status(&sub.id, "IN_PROGRESS", Some("coder-1"))
            .expect("Failed to update status");
        assert_eq!(updated.status, "IN_PROGRESS");

        // 5. Get Next Pending Task for Architect
        let pending = bb
            .get_next_pending_task(Some("lead-architect"))
            .expect("Failed to get pending");
        assert!(pending.is_some());
        assert_eq!(pending.unwrap().id, root.id);

        // 6. Verify Event Audit Trail
        let events = bb.list_recent_events(10).expect("Failed to list events");
        assert!(events.len() >= 3); // 2 created + 1 status changed
    }
}

