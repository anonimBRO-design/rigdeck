use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

static TASK_COUNTER: AtomicU64 = AtomicU64::new(1);
static CONVERSATION_COUNTER: AtomicU64 = AtomicU64::new(1);

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConductorMessage {
    pub id: String,
    #[serde(alias = "conversationId")]
    pub conversation_id: String,
    pub sender: String,
    pub text: String,
    #[serde(default, alias = "delegationsJson")]
    pub delegations_json: Option<String>,
    #[serde(default, alias = "tokensUsed")]
    pub tokens_used: i64,
    #[serde(default, alias = "timestamp")]
    pub created_at: String,
}

/// Hasil pencarian full-text lintas thread (FTS5).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub message_id: String,
    pub conversation_id: String,
    pub conversation_title: String,
    pub project_id: String,
    pub sender: String,
    pub snippet: String,
    pub created_at: String,
    /// Nama project (diisi saat pencarian lintas-project).
    #[serde(default)]
    pub project_name: Option<String>,
}

#[derive(Clone)]
pub struct BlackboardState {
    conn: Arc<Mutex<Connection>>,
}

impl BlackboardState {
    fn init_schema(conn: &Connection) -> Result<(), String> {
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

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                model TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversation_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                sender TEXT NOT NULL,
                text TEXT NOT NULL,
                delegations_json TEXT,
                tokens_used INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_task_status ON task_dag(status);
            CREATE INDEX IF NOT EXISTS idx_task_assigned ON task_dag(assigned_agent);
            CREATE INDEX IF NOT EXISTS idx_events_agent ON agent_events(agent_id);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON agent_events(timestamp);
            -- Key/value kecil untuk menandai apa yang sudah diproses (polling mission result, dll).
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_conv_project ON conversations(project_id);
            CREATE INDEX IF NOT EXISTS idx_msg_conv ON conversation_messages(conversation_id);

            -- Full-text search index for cross-thread message search (FTS5).
            CREATE VIRTUAL TABLE IF NOT EXISTS conversation_messages_fts USING fts5(
                message_id UNINDEXED,
                conversation_id UNINDEXED,
                sender UNINDEXED,
                text
            );

            CREATE TRIGGER IF NOT EXISTS trg_msg_fts_insert
            AFTER INSERT ON conversation_messages BEGIN
                INSERT INTO conversation_messages_fts (message_id, conversation_id, sender, text)
                VALUES (new.id, new.conversation_id, new.sender, new.text);
            END;

            CREATE TRIGGER IF NOT EXISTS trg_msg_fts_delete
            AFTER DELETE ON conversation_messages BEGIN
                DELETE FROM conversation_messages_fts WHERE message_id = old.id;
            END;
            "#,
        )
        .map_err(|e| format!("Failed to initialize blackboard schema: {}", e))?;

        // Backfill: index pesan lama yang belum masuk FTS (idempotent, aman dijalankan berkali-kali).
        conn.execute(
            "INSERT INTO conversation_messages_fts (message_id, conversation_id, sender, text)
             SELECT m.id, m.conversation_id, m.sender, m.text
             FROM conversation_messages m
             WHERE NOT EXISTS (
                 SELECT 1 FROM conversation_messages_fts f WHERE f.message_id = m.id
             )",
            [],
        )
        .map_err(|e| format!("Failed to backfill FTS index: {}", e))?;

        Ok(())
    }

    /// Initialize SQLite in WAL mode with the task_dag, agent_events, conversations, and conversation_messages tables
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

        Self::init_schema(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Switch SQLite connection to target database file (used when switching projects)
    pub fn switch_database<P: AsRef<Path>>(&self, db_path: P) -> Result<(), String> {
        let path = db_path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let conn = Connection::open(path)
            .map_err(|e| format!("Failed to open blackboard SQLite: {}", e))?;

        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| format!("Failed to set journal_mode WAL: {}", e))?;
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(|e| format!("Failed to set synchronous NORMAL: {}", e))?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| format!("Failed to enable foreign_keys: {}", e))?;
        conn.pragma_update(None, "busy_timeout", 5000)
            .map_err(|e| format!("Failed to set busy_timeout: {}", e))?;

        Self::init_schema(&conn)?;

        let mut guard = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        *guard = conn;
        Ok(())
    }

    /// Helper for in-memory SQLite (useful for testing or ephemeral runs)
    pub fn in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("Failed to open in-memory SQLite: {}", e))?;

        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| format!("Failed to enable foreign_keys: {}", e))?;

        Self::init_schema(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn now_iso() -> String {
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

    /// List all tasks in DAG
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

    /// Update status of a task and log state transition to agent_events
    pub fn update_task_status(
        &self,
        task_id: &str,
        new_status: &str,
        agent_id: Option<&str>,
    ) -> Result<TaskItem, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let now = Self::now_iso();

        let affected = conn
            .execute(
                "UPDATE task_dag SET status = ?1, updated_at = ?2 WHERE id = ?3",
                params![new_status, now, task_id],
            )
            .map_err(|e| format!("Update failed: {}", e))?;

        if affected == 0 {
            return Err(format!("Task with ID {} not found", task_id));
        }

        // Record audit event
        let payload = serde_json::json!({
            "task_id": task_id,
            "status": new_status,
        })
        .to_string();

        let agent = agent_id.unwrap_or("system");
        conn.execute(
            "INSERT INTO agent_events (agent_id, event_type, payload, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![agent, "TASK_STATUS_UPDATED", payload, now],
        )
        .map_err(|e| format!("Failed to record event: {}", e))?;

        // Return updated task
        let mut stmt = conn
            .prepare(
                "SELECT id, title, description, status, assigned_agent, parent_id, created_at, updated_at
                 FROM task_dag WHERE id = ?1",
            )
            .map_err(|e| format!("Prepare failed: {}", e))?;

        let row = stmt
            .query_row(params![task_id], |r| {
                Ok(TaskItem {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    description: r.get(2)?,
                    status: r.get(3)?,
                    assigned_agent: r.get(4)?,
                    parent_id: r.get(5)?,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                })
            })
            .map_err(|e| format!("Fetch updated task failed: {}", e))?;

        Ok(row)
    }

    /// Re-assign a task to another agent
    pub fn assign_task(
        &self,
        task_id: &str,
        agent_id: &str,
    ) -> Result<TaskItem, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let now = Self::now_iso();

        conn.execute(
            "UPDATE task_dag SET assigned_agent = ?1, updated_at = ?2 WHERE id = ?3",
            params![agent_id, now, task_id],
        )
        .map_err(|e| format!("Assign failed: {}", e))?;

        // Log event
        let payload = serde_json::json!({
            "task_id": task_id,
            "assigned_agent": agent_id,
        })
        .to_string();

        conn.execute(
            "INSERT INTO agent_events (agent_id, event_type, payload, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params!["conductor", "TASK_REASSIGNED", payload, now],
        )
        .map_err(|e| format!("Failed to record assign event: {}", e))?;

        // Return task
        let mut stmt = conn
            .prepare(
                "SELECT id, title, description, status, assigned_agent, parent_id, created_at, updated_at
                 FROM task_dag WHERE id = ?1",
            )
            .map_err(|e| format!("Prepare failed: {}", e))?;

        let row = stmt
            .query_row(params![task_id], |r| {
                Ok(TaskItem {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    description: r.get(2)?,
                    status: r.get(3)?,
                    assigned_agent: r.get(4)?,
                    parent_id: r.get(5)?,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                })
            })
            .map_err(|e| format!("Fetch assigned task failed: {}", e))?;

        Ok(row)
    }

    /// Record a generic audit event into agent_events
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
        .map_err(|e| format!("Insert event failed: {}", e))?;

        let id = conn.last_insert_rowid();

        Ok(AgentEvent {
            id,
            agent_id: agent_id.to_string(),
            event_type: event_type.to_string(),
            payload: payload.to_string(),
            timestamp: now,
        })
    }

    /// List recent agent events for audit trail
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

    // ------------------------------------------------------------------------
    // Conversation & Multi-Session Chat
    // ------------------------------------------------------------------------

    pub fn create_conversation(
        &self,
        project_id: &str,
        title: &str,
        model: &str,
    ) -> Result<Conversation, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let now = Self::now_iso();
        // Counter menjamin ID unik walau dua conversation dibuat di milidetik yang sama.
        let seq = CONVERSATION_COUNTER.fetch_add(1, Ordering::Relaxed);
        let id = format!("conv-{}-{:04}", &now.replace(['.', 'Z'], ""), seq % 10000);

        conn.execute(
            "INSERT INTO conversations (id, project_id, title, model, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, project_id, title, model, now, now],
        )
        .map_err(|e| format!("Failed to create conversation: {}", e))?;

        Ok(Conversation {
            id,
            project_id: project_id.to_string(),
            title: title.to_string(),
            model: model.to_string(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn list_conversations(&self, project_id: &str) -> Result<Vec<Conversation>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, title, model, created_at, updated_at
                 FROM conversations
                 WHERE project_id = ?1
                 ORDER BY updated_at DESC",
            )
            .map_err(|e| format!("Prepare failed: {}", e))?;

        let rows = stmt
            .query_map(params![project_id], |row| {
                Ok(Conversation {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    model: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| format!("Query map failed: {}", e))?;

        let mut conversations = Vec::new();
        for item in rows {
            conversations.push(item.map_err(|e| e.to_string())?);
        }
        Ok(conversations)
    }

    pub fn get_conversation_messages(
        &self,
        conversation_id: &str,
    ) -> Result<Vec<ConductorMessage>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, conversation_id, sender, text, delegations_json, tokens_used, created_at
                 FROM conversation_messages
                 WHERE conversation_id = ?1
                 ORDER BY created_at ASC",
            )
            .map_err(|e| format!("Prepare failed: {}", e))?;

        let rows = stmt
            .query_map(params![conversation_id], |row| {
                Ok(ConductorMessage {
                    id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    sender: row.get(2)?,
                    text: row.get(3)?,
                    delegations_json: row.get(4)?,
                    tokens_used: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Query map failed: {}", e))?;

        let mut messages = Vec::new();
        for item in rows {
            messages.push(item.map_err(|e| e.to_string())?);
        }
        Ok(messages)
    }

    pub fn save_message(&self, msg: ConductorMessage) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let now = if msg.created_at.is_empty() {
            Self::now_iso()
        } else {
            msg.created_at.clone()
        };
        let id = if msg.id.is_empty() {
            format!("msg-{}", &Self::now_iso().replace(['.', 'Z'], ""))
        } else {
            msg.id.clone()
        };

        conn.execute(
            "INSERT OR REPLACE INTO conversation_messages (id, conversation_id, sender, text, delegations_json, tokens_used, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                msg.conversation_id,
                msg.sender,
                msg.text,
                msg.delegations_json,
                msg.tokens_used,
                now
            ],
        )
        .map_err(|e| format!("Failed to save message: {}", e))?;

        // Update conversation updated_at
        let _ = conn.execute(
            "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
            params![now, msg.conversation_id],
        );

        // When delegations exist, automatically persist to agent_events table
        if let Some(ref d) = msg.delegations_json {
            let trimmed = d.trim();
            if !trimmed.is_empty() && trimmed != "{}" && trimmed != "null" {
                let _ = conn.execute(
                    "INSERT INTO agent_events (agent_id, event_type, payload, timestamp)
                     VALUES (?1, ?2, ?3, ?4)",
                    params!["conductor", "MISSION_DELEGATED", trimmed, now],
                );
            }
        }

        Ok(())
    }

    pub fn delete_conversation(&self, conversation_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        conn.execute(
            "DELETE FROM conversation_messages WHERE conversation_id = ?1",
            params![conversation_id],
        )
        .map_err(|e| format!("Failed to delete messages: {}", e))?;

        conn.execute(
            "DELETE FROM conversations WHERE id = ?1",
            params![conversation_id],
        )
        .map_err(|e| format!("Failed to delete conversation: {}", e))?;

        Ok(())
    }

    pub fn rename_conversation(
        &self,
        conversation_id: &str,
        new_title: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let now = Self::now_iso();
        conn.execute(
            "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_title, now, conversation_id],
        )
        .map_err(|e| format!("Failed to rename conversation: {}", e))?;

        Ok(())
    }

    /// Baca nilai app_state (None bila belum pernah diset).
    pub fn get_state(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let mut stmt = conn
            .prepare("SELECT value FROM app_state WHERE key = ?1")
            .map_err(|e| format!("Prepare failed: {}", e))?;
        let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
        match rows.next().map_err(|e| e.to_string())? {
            Some(row) => Ok(Some(row.get(0).map_err(|e| e.to_string())?)),
            None => Ok(None),
        }
    }

    /// Tulis nilai app_state (upsert).
    pub fn set_state(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        conn.execute(
            "INSERT INTO app_state (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, Self::now_iso()],
        )
        .map_err(|e| format!("Failed to set state: {}", e))?;
        Ok(())
    }

    /// Cari pesan lintas thread memakai FTS5 (prefix-match, aman dari input user mentah).
    pub fn search_messages(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        let fts_query = build_fts_query(query);
        if fts_query.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT f.message_id,
                        f.conversation_id,
                        c.title,
                        c.project_id,
                        f.sender,
                        snippet(conversation_messages_fts, 3, '<<', '>>', '…', 14),
                        m.created_at
                 FROM conversation_messages_fts f
                 JOIN conversation_messages m ON m.id = f.message_id
                 JOIN conversations c ON c.id = f.conversation_id
                 WHERE conversation_messages_fts MATCH ?1
                 ORDER BY rank
                 LIMIT ?2",
            )
            .map_err(|e| format!("Prepare failed: {}", e))?;

        let rows = stmt
            .query_map(params![fts_query, limit as i64], |row| {
                Ok(SearchHit {
                    message_id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    conversation_title: row.get(2)?,
                    project_id: row.get(3)?,
                    sender: row.get(4)?,
                    snippet: row.get(5)?,
                    created_at: row.get(6)?,
                    project_name: None,
                })
            })
            .map_err(|e| format!("Search failed: {}", e))?;

        let mut hits = Vec::new();
        for hit in rows {
            hits.push(hit.map_err(|e| e.to_string())?);
        }
        Ok(hits)
    }

    /// Jumlah pesan yang terindeks FTS (untuk indikator UI).
    pub fn indexed_message_count(&self) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        conn.query_row("SELECT COUNT(*) FROM conversation_messages_fts", [], |r| r.get(0))
            .map_err(|e| format!("Count failed: {}", e))
    }
}

/// Bangun query FTS5 yang aman dari input user.
///
/// Setiap term di-escape (tanda kutip digandakan) lalu digabung dengan AND;
/// term terakhir memakai prefix-match (`*`) supaya terasa seperti "search as you type".
/// Karakter operator FTS5 dibuang agar tidak memicu syntax error.
pub fn build_fts_query(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| match c {
            '"' | '\'' | '(' | ')' | '*' | '^' | ':' | '-' | '+' => ' ',
            other => other,
        })
        .collect();

    let terms: Vec<String> = cleaned
        .split_whitespace()
        .filter(|t| !t.is_empty())
        .map(|t| t.to_lowercase())
        .collect();

    if terms.is_empty() {
        return String::new();
    }

    // Kutip ganda sudah dibuang di tahap cleaning, jadi term aman dibungkus quote FTS5.
    let last = terms.len() - 1;
    terms
        .iter()
        .enumerate()
        .map(|(i, t)| {
            if i == last {
                format!("\"{}\"*", t)
            } else {
                format!("\"{}\"", t)
            }
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

pub fn default_blackboard_path() -> PathBuf {
    let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let root = if current.ends_with("src-tauri") {
        current.parent().unwrap_or(&current).to_path_buf()
    } else {
        current
    };
    root.join(".rig").join("blackboard.db")
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

    #[test]
    fn test_conversation_flow() {
        let bb = BlackboardState::in_memory().expect("Failed to initialize in-memory DB");

        // 1. Create Conversation
        let conv = bb
            .create_conversation("proj-1", "Build Auth Feature", "ag/gemini-3.8-flash-high")
            .expect("Failed to create conversation");
        assert_eq!(conv.project_id, "proj-1");
        assert_eq!(conv.title, "Build Auth Feature");

        // 2. Save Messages
        let user_msg = ConductorMessage {
            id: "msg-101".to_string(),
            conversation_id: conv.id.clone(),
            sender: "user".to_string(),
            text: "Tolong buatkan endpoint login".to_string(),
            delegations_json: None,
            tokens_used: 12,
            created_at: "2026-10-06T15:00:00Z".to_string(),
        };
        bb.save_message(user_msg).expect("Failed to save user message");

        let conductor_msg = ConductorMessage {
            id: "msg-102".to_string(),
            conversation_id: conv.id.clone(),
            sender: "conductor".to_string(),
            text: "Saya delegasikan tugas auth ke Claude dan Antigravity".to_string(),
            delegations_json: Some(r#"{"claudeTask":"RFC spec auth","antigravityTask":"scaffold routes"}"#.to_string()),
            tokens_used: 280,
            created_at: "2026-10-06T15:00:02Z".to_string(),
        };
        bb.save_message(conductor_msg).expect("Failed to save conductor message");

        // 3. List Conversations
        let convs = bb.list_conversations("proj-1").expect("Failed to list conversations");
        assert_eq!(convs.len(), 1);

        // 4. Get Messages
        let msgs = bb.get_conversation_messages(&conv.id).expect("Failed to get messages");
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].sender, "user");
        assert_eq!(msgs[1].sender, "conductor");
        assert!(msgs[1].delegations_json.is_some());

        // 5. Verify MISSION_DELEGATED in agent_events
        let events = bb.list_recent_events(10).expect("Failed to list events");
        let delegation_event = events.iter().find(|e| e.event_type == "MISSION_DELEGATED");
        assert!(delegation_event.is_some());
        assert_eq!(delegation_event.unwrap().agent_id, "conductor");

        // 6. Rename Conversation
        bb.rename_conversation(&conv.id, "Auth JWT Feature").expect("Failed to rename");
        let convs_updated = bb.list_conversations("proj-1").expect("Failed to list");
        assert_eq!(convs_updated[0].title, "Auth JWT Feature");

        // 7. Delete Conversation
        bb.delete_conversation(&conv.id).expect("Failed to delete conversation");
        let convs_after = bb.list_conversations("proj-1").expect("Failed to list");
        assert_eq!(convs_after.len(), 0);
        let msgs_after = bb.get_conversation_messages(&conv.id).expect("Failed to get messages");
        assert_eq!(msgs_after.len(), 0);
    }

    #[test]
    fn test_fts_search_across_threads() {
        let bb = BlackboardState::in_memory().expect("Failed to initialize in-memory DB");

        let conv_a = bb.create_conversation("proj-1", "Auth Feature", "m1").unwrap();
        let conv_b = bb.create_conversation("proj-1", "Payment Feature", "m1").unwrap();

        bb.save_message(ConductorMessage {
            id: "m-a1".into(),
            conversation_id: conv_a.id.clone(),
            sender: "user".into(),
            text: "Tolong implementasikan JWT session validation untuk endpoint login".into(),
            delegations_json: None,
            tokens_used: 10,
            created_at: "2026-10-06T15:00:00Z".into(),
        })
        .unwrap();

        bb.save_message(ConductorMessage {
            id: "m-b1".into(),
            conversation_id: conv_b.id.clone(),
            sender: "conductor".into(),
            text: "Midtrans webhook signature perlu diverifikasi".into(),
            delegations_json: None,
            tokens_used: 20,
            created_at: "2026-10-06T15:01:00Z".into(),
        })
        .unwrap();

        // FTS index terisi via trigger
        assert_eq!(bb.indexed_message_count().unwrap(), 2);

        // 1. Cari lintas thread
        let hits = bb.search_messages("JWT", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].conversation_id, conv_a.id);
        assert_eq!(hits[0].conversation_title, "Auth Feature");
        assert!(hits[0].snippet.contains("<<JWT>>") || hits[0].snippet.contains("JWT"));

        // 2. Prefix match (search-as-you-type)
        let prefix_hits = bb.search_messages("valid", 10).unwrap();
        assert_eq!(prefix_hits.len(), 1, "prefix 'valid' harus menemukan 'validation'");

        // 3. Multi-term AND
        let multi = bb.search_messages("midtrans signature", 10).unwrap();
        assert_eq!(multi.len(), 1);
        assert_eq!(multi[0].conversation_id, conv_b.id);

        // 4. Query kosong / operator-only tidak error & tidak mengembalikan apa pun
        assert!(bb.search_messages("", 10).unwrap().is_empty());
        assert!(bb.search_messages("   ", 10).unwrap().is_empty());
        assert!(bb.search_messages("((((", 10).unwrap().is_empty());
        // Tanda kutip mentah dari user tidak boleh memicu FTS syntax error
        assert!(bb.search_messages("\"jwt", 10).unwrap().len() == 1);

        // 5. Delete conversation → FTS ikut bersih via trigger
        bb.delete_conversation(&conv_a.id).unwrap();
        assert_eq!(bb.indexed_message_count().unwrap(), 1);
        assert!(bb.search_messages("JWT", 10).unwrap().is_empty());
    }

    #[test]
    fn test_build_fts_query_sanitizes_input() {
        assert_eq!(build_fts_query("hello world"), "\"hello\" AND \"world\"*");
        assert_eq!(build_fts_query("  JWT  "), "\"jwt\"*");
        // Operator FTS5 dibuang, bukan diteruskan mentah
        assert_eq!(build_fts_query("a AND b"), "\"a\" AND \"and\" AND \"b\"*");
        assert_eq!(build_fts_query("NEAR(a b)"), "\"near\" AND \"a\" AND \"b\"*");
        assert_eq!(build_fts_query("x^2 - y"), "\"x\" AND \"2\" AND \"y\"*");
        assert_eq!(build_fts_query(""), "");
        assert_eq!(build_fts_query("***"), "");
    }
}
