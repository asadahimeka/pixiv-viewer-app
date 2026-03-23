use std::collections::HashMap;
use std::path::Path;

use futures_util::StreamExt;
use tauri::Emitter;
use tokio::fs;
use tokio::io::AsyncWriteExt;

#[derive(Clone, serde::Serialize)]
pub struct DownloadProgress {
    current: u64,
    total: u64,
    id: String,
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
        |c: char| ['\\', '/', ':', '?', '*', '"', '<', '>', '|'].contains(&c),
        "_",
    );

    let file_path = Path::new(write_path).join(safe_name);

    // 确保目录存在
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|_| "目录创建失败")?;
    }

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
    let mut file = fs::File::create(&file_path)
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
