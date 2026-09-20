use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

use futures_util::StreamExt;
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Notify;

#[derive(Clone, serde::Serialize)]
pub struct DownloadProgress {
    current: u64,
    total: u64,
    id: String,
}

// taskId → 取消信号。下载任务注册,取消命令移除并唤醒;
// Notify 只通知一次,任务结束后条目即被移除,不会累积
fn cancel_registry() -> &'static Mutex<HashMap<String, Arc<Notify>>> {
    static REG: OnceLock<Mutex<HashMap<String, Arc<Notify>>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

// 用系统默认程序打开文件/目录。shell 插件的 JS 桥对 open 参数有
// mailto/tel/http 正则白名单,本地路径过不去,故从 Rust 侧调用
#[tauri::command]
#[allow(deprecated)]
pub async fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    // TODO: shell::open 已弃用,官方指向 tauri-plugin-opener;被移除时迁移
    app.shell()
        .open(path, None)
        .map_err(|e| e.to_string())
}

// 把当前下载目录(可能被用户自定义)注册进 asset 协议 scope,
// 让 convertFileSrc 生成的 asset URL 可以读到本地图片。scope 为会话内存态,
// JS 侧每次启动/目录变更时重新调用
#[tauri::command]
pub async fn register_asset_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri::Manager;
    app.asset_protocol_scope()
        .allow_directory(path, true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_download(id: String) -> Result<(), String> {
    let notify = cancel_registry()
        .lock()
        .ok()
        .and_then(|mut map| map.remove(&id));
    if let Some(n) = notify {
        n.notify_one();
    }
    Ok(())
}

#[tauri::command]
pub async fn download_file(
    url: &str,
    write_path: &str,
    file_name: &str,
    id: &str,
    headers: Option<HashMap<String, String>>,
    window: tauri::Window,
) -> Result<String, String> {
    // 文件名清理
    let safe_name = file_name.replace(
        |c: char| ['\\', '/', ':', '?', '*', '"', '<', '>','|'].contains(&c),
        "_",
    );

    let file_path = Path::new(write_path).join(&safe_name);

    // 确保目录存在(在注册取消信号前完成,保证取消清理时父目录已就绪)
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|_| "目录创建失败")?;
    }

    let notify = {
        let mut reg = cancel_registry().lock().map_err(|_| "注册取消信号失败")?;
        reg.entry(id.to_string()).or_insert_with(|| Arc::new(Notify::new())).clone()
    };

    tokio::select! {
        _ = notify.notified() => {
            // 用户取消:清理半成品文件
            let _ = fs::remove_file(&file_path).await;
            let result: Result<String, String> = Err("DOWNLOAD_CANCELLED".into());
            cleanup_cancel(&id);
            result
        }
        result = run_download(url, headers, &file_path, id, &window) => {
            cleanup_cancel(&id);
            result
        }
    }
}

// 任务终态后移除取消登记,避免注册表无限增长
fn cleanup_cancel(id: &str) {
    if let Ok(mut reg) = cancel_registry().lock() {
        reg.remove(id);
    }
}

async fn run_download(
    url: &str,
    headers: Option<HashMap<String, String>>,
    file_path: &Path,
    id: &str,
    window: &tauri::Window,
) -> Result<String, String> {
    // 构建请求
    let client = reqwest::Client::new();
    let mut request = client
        .get(url)
        .header(
            "user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        );

    if let Some(custom_headers) = headers {
        for (k, v) in custom_headers {
            request = request.header(k, v);
        }
    }

    let res = request.send().await.map_err(|_| "网络错误")?;

    // 检查 HTTP 状态码
    if !res.status().is_success() {
        return Err(format!("HTTP 错误: {}", res.status()));
    }

    // 注意：可能是 None（chunked）
    let total = res.content_length().unwrap_or(0);

    let mut stream = res.bytes_stream();
    let mut file = fs::File::create(file_path)
        .await
        .map_err(|_| "文件创建失败")?;

    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "网络错误")?;

        file.write_all(&chunk)
            .await
            .map_err(|_| "文件写入失败")?;

        downloaded += chunk.len() as u64;

        let _ = window.emit(
            "download_file_progress",
            DownloadProgress {
                current: downloaded,
                total,
                id: id.to_string(),
            },
        );
    }

    if downloaded == 0 {
        return Err("下载内容为空".into());
    }

    Ok(file_path
        .to_string_lossy()
        .into_owned())
}
