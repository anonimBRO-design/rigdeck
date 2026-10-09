use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub object: String,
    pub owned_by: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelsListResponse {
    pub data: Vec<ModelInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RouterHealth {
    pub online: bool,
    pub active_models_count: usize,
    pub latency_ms: u64,
}

pub async fn check_router_health(base_url: &str) -> RouterHealth {
    let start = std::time::Instant::now();
    let client = reqwest_lite_ping(base_url).await;
    let latency = start.elapsed().as_millis() as u64;

    match client {
        Ok(count) => RouterHealth {
            online: true,
            active_models_count: count,
            latency_ms: latency,
        },
        Err(_) => RouterHealth {
            online: false,
            active_models_count: 0,
            latency_ms: latency,
        },
    }
}

async fn reqwest_lite_ping(base_url: &str) -> Result<usize, String> {
    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let output = std::process::Command::new("curl")
        .args(["-s", "-m", "8", &url])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("Curl failed".to_string());
    }

    let body = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    
    if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
        Ok(arr.len())
    } else {
        Ok(0)
    }
}
