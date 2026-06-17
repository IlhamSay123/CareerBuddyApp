use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(Serialize)]
struct ImportedFile {
    stored_path: String,
    original_name: String,
}

/// Bring a file into the vault. If `copy` is true we duplicate it into the
/// app data dir (self-contained); otherwise we just record where it already lives.
#[tauri::command]
fn import_file(app: tauri::AppHandle, src: String, copy: bool) -> Result<ImportedFile, String> {
    let path = PathBuf::from(&src);
    let original_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();

    if !copy {
        return Ok(ImportedFile {
            stored_path: src,
            original_name,
        });
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("vault");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dest = dir.join(format!("{stamp}_{original_name}"));
    fs::copy(&path, &dest).map_err(|e| e.to_string())?;

    Ok(ImportedFile {
        stored_path: dest.to_string_lossy().to_string(),
        original_name,
    })
}

/// Delete a file we own (a copied vault file). Linked originals are never touched.
#[tauri::command]
fn remove_vault_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        let _ = fs::remove_file(&p);
    }
    Ok(())
}

/// Open a file with the OS default application.
#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    opener::open(&path).map_err(|e| e.to_string())
}

/// Export (copy) a vault file out to a destination the user picked.
#[tauri::command]
fn export_file(src: String, dest: String) -> Result<(), String> {
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

/// Write plain text to a path (used for cover-letter export).
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Save generated text into the vault folder; returns the stored path.
#[tauri::command]
fn save_to_vault(app: tauri::AppHandle, name: String, content: String) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("vault");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dest = dir.join(format!("{stamp}_{name}"));
    fs::write(&dest, content).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

/// Pull plain text out of a CV/document so the AI can read it.
#[tauri::command]
fn extract_text(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("File not found on disk.".into());
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let text = match ext.as_str() {
        "txt" | "md" | "csv" => fs::read_to_string(&p).map_err(|e| e.to_string())?,
        "pdf" => {
            let pth = path.clone();
            match std::panic::catch_unwind(move || pdf_extract::extract_text(&pth)) {
                Ok(Ok(t)) => t,
                Ok(Err(e)) => return Err(format!("PDF parse error: {e}")),
                Err(_) => {
                    return Err(
                        "Couldn't read this PDF (it may be scanned or protected). Paste the text instead.".into(),
                    )
                }
            }
        }
        "docx" => extract_docx(&p)?,
        other => return Err(format!("Unsupported file type: .{other}. Paste the text instead.")),
    };
    Ok(text.trim().to_string())
}

fn extract_docx(p: &PathBuf) -> Result<String, String> {
    use std::io::Read;
    let file = fs::File::open(p).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut xml = String::new();
    {
        let mut doc = zip
            .by_name("word/document.xml")
            .map_err(|_| "Not a valid .docx file.".to_string())?;
        doc.read_to_string(&mut xml).map_err(|e| e.to_string())?;
    }
    // Paragraph breaks become newlines; everything inside <...> is stripped.
    let xml = xml.replace("</w:p>", "\n");
    let mut out = String::with_capacity(xml.len());
    let mut in_tag = false;
    for c in xml.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    Ok(out)
}

/// All schema lives in versioned migrations so existing users' data survives
/// app updates. Add a NEW migration with the next version number — never edit
/// an old one once it has shipped.
fn migrations() -> Vec<Migration> {
    vec![
    Migration {
        version: 1,
        description: "create core tables",
        kind: MigrationKind::Up,
        sql: r#"
            CREATE TABLE IF NOT EXISTS jobs (
                id          INTEGER PRIMARY KEY,
                company     TEXT NOT NULL DEFAULT '',
                role        TEXT NOT NULL DEFAULT '',
                status      TEXT NOT NULL DEFAULT 'To Apply',
                link        TEXT NOT NULL DEFAULT '',
                notes       TEXT NOT NULL DEFAULT '',
                date_added  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reminders (
                id          INTEGER PRIMARY KEY,
                title       TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                date        TEXT NOT NULL,
                time        TEXT NOT NULL DEFAULT '',
                category    TEXT NOT NULL DEFAULT '',
                notified    INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS files (
                id            INTEGER PRIMARY KEY,
                filename      TEXT NOT NULL,
                original_name TEXT NOT NULL,
                category      TEXT NOT NULL DEFAULT 'Other',
                date_added    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notes (
                id      INTEGER PRIMARY KEY,
                content TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS ai_conversations (
                id         INTEGER PRIMARY KEY,
                title      TEXT NOT NULL DEFAULT 'New chat',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_messages (
                id              INTEGER PRIMARY KEY,
                conversation_id INTEGER NOT NULL,
                ts              TEXT NOT NULL,
                role            TEXT NOT NULL,
                content         TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
            );

            CREATE TABLE IF NOT EXISTS ai_memories (
                id         INTEGER PRIMARY KEY,
                ts         TEXT NOT NULL,
                type       TEXT NOT NULL,
                content    TEXT NOT NULL,
                importance INTEGER NOT NULL DEFAULT 5,
                pinned     INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS ai_summaries (
                id           INTEGER PRIMARY KEY,
                scope        TEXT NOT NULL,
                ts           TEXT NOT NULL,
                summary_text TEXT NOT NULL
            );
        "#,
    },
    Migration {
        version: 2,
        description: "add rich job fields",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE jobs ADD COLUMN location  TEXT    NOT NULL DEFAULT '';
            ALTER TABLE jobs ADD COLUMN work_mode TEXT    NOT NULL DEFAULT '';
            ALTER TABLE jobs ADD COLUMN salary    TEXT    NOT NULL DEFAULT '';
            ALTER TABLE jobs ADD COLUMN deadline  TEXT    NOT NULL DEFAULT '';
            ALTER TABLE jobs ADD COLUMN priority  INTEGER NOT NULL DEFAULT 0;
        "#,
    },
    Migration {
        version: 3,
        description: "add contact + tags + applied date",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE jobs ADD COLUMN date_applied TEXT NOT NULL DEFAULT '';
            ALTER TABLE jobs ADD COLUMN recruiter    TEXT NOT NULL DEFAULT '';
            ALTER TABLE jobs ADD COLUMN contact      TEXT NOT NULL DEFAULT '';
            ALTER TABLE jobs ADD COLUMN tags         TEXT NOT NULL DEFAULT '';
        "#,
    },
    Migration {
        version: 4,
        description: "job status-change timeline",
        kind: MigrationKind::Up,
        sql: r#"
            CREATE TABLE IF NOT EXISTS job_events (
                id          INTEGER PRIMARY KEY,
                job_id      INTEGER NOT NULL,
                ts          TEXT NOT NULL,
                kind        TEXT NOT NULL,
                from_status TEXT NOT NULL DEFAULT '',
                to_status   TEXT NOT NULL DEFAULT ''
            );
        "#,
    },
    Migration {
        version: 5,
        description: "vault file path + mode + job link",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE files ADD COLUMN path   TEXT    NOT NULL DEFAULT '';
            ALTER TABLE files ADD COLUMN mode   TEXT    NOT NULL DEFAULT 'copy';
            ALTER TABLE files ADD COLUMN job_id INTEGER NOT NULL DEFAULT 0;
        "#,
    },
    ]
}

// ===========================================================================
// Local AI runtime manager (Ollama, app-managed)
// ===========================================================================

struct OllamaProc(Mutex<Option<Child>>);

fn ai_subdir(app: &tauri::AppHandle, sub: &str) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join(sub))
}

fn ollama_exe_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .map(|d| d.join("ollama-runtime").join("ollama.exe"))
        .unwrap_or_default()
}

async fn ollama_is_up() -> bool {
    reqwest::Client::new()
        .get("http://127.0.0.1:11434/api/version")
        .timeout(Duration::from_secs(2))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

#[tauri::command]
fn ai_ram_gb() -> u64 {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    (sys.total_memory() / 1_073_741_824).max(1)
}

#[tauri::command]
async fn ollama_running() -> bool {
    ollama_is_up().await
}

#[tauri::command]
fn ollama_has_runtime(app: tauri::AppHandle) -> bool {
    ollama_exe_path(&app).exists()
}

fn start_serve(app: &tauri::AppHandle) -> Result<(), String> {
    let exe = ollama_exe_path(app);
    if !exe.exists() {
        return Err("Ollama runtime not installed yet.".into());
    }
    // Use Ollama's default model location so we share any models the user
    // already downloaded (don't override OLLAMA_MODELS).
    let mut cmd = Command::new(&exe);
    cmd.arg("serve").env("OLLAMA_HOST", "127.0.0.1:11434");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    if let Some(state) = app.try_state::<OllamaProc>() {
        *state.0.lock().unwrap() = Some(child);
    }
    Ok(())
}

async fn download_runtime(app: &tauri::AppHandle) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::io::Write;

    let dir = ai_subdir(app, "ollama-runtime")?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let zip_path = dir.join("ollama.zip");

    let url = "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip";
    let resp = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let total = resp.content_length().unwrap_or(0);

    let mut file = fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let pct = if total > 0 { downloaded * 100 / total } else { 0 };
        let _ = app.emit(
            "ollama-setup",
            serde_json::json!({"phase":"download","percent":pct,"message":"Downloading AI runtime"}),
        );
    }
    drop(file);

    let _ = app.emit(
        "ollama-setup",
        serde_json::json!({"phase":"extract","percent":0,"message":"Extracting runtime"}),
    );
    let f = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
    archive.extract(&dir).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&zip_path);
    Ok(())
}

async fn pull_model(app: &tauri::AppHandle, model: &str) -> Result<(), String> {
    use futures_util::StreamExt;
    let resp = reqwest::Client::new()
        .post("http://127.0.0.1:11434/api/pull")
        .json(&serde_json::json!({"name": model, "stream": true}))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(idx) = buf.find('\n') {
            let line: String = buf.drain(..=idx).collect();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                let status = v.get("status").and_then(|s| s.as_str()).unwrap_or("");
                let total = v.get("total").and_then(|t| t.as_u64()).unwrap_or(0);
                let completed = v.get("completed").and_then(|c| c.as_u64()).unwrap_or(0);
                let pct = if total > 0 { completed * 100 / total } else { 0 };
                let _ = app.emit(
                    "ollama-setup",
                    serde_json::json!({"phase":"pull","percent":pct,"message":status}),
                );
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn setup_ollama(app: tauri::AppHandle, model: String) -> Result<(), String> {
    // If Ollama is already running (the user has it installed), use it as-is —
    // no runtime download, no second server. Otherwise install + start ours.
    if !ollama_is_up().await {
        if !ollama_exe_path(&app).exists() {
            download_runtime(&app).await?;
        }
        start_serve(&app)?;
        let mut ok = false;
        for _ in 0..60 {
            if ollama_is_up().await {
                ok = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        if !ok {
            return Err("The local AI server didn't start in time.".into());
        }
    }
    let _ = app.emit(
        "ollama-setup",
        serde_json::json!({"phase":"pull","percent":0,"message":"Starting model download"}),
    );
    pull_model(&app, &model).await?;
    let _ = app.emit(
        "ollama-setup",
        serde_json::json!({"phase":"done","percent":100,"message":"Ready"}),
    );
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:careerbuddy.db", migrations())
                .build(),
        )
        .manage(OllamaProc(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            import_file,
            remove_vault_file,
            open_file,
            export_file,
            write_text_file,
            save_to_vault,
            extract_text,
            ai_ram_gb,
            ollama_running,
            ollama_has_runtime,
            setup_ollama
        ])
        .setup(|app| {
            // If the runtime is already installed, start the server in the background.
            let handle = app.handle().clone();
            if ollama_exe_path(&handle).exists() {
                let _ = start_serve(&handle);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building CareerBuddy")
        .run(|app_handle, event| {
            // Shut the managed AI server down when the app quits.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<OllamaProc>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
