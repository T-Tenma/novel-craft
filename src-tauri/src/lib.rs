pub mod parser;
pub mod storage;

use parser::{parse_file_from_path, parse_novel_content, NovelMetadata};
use storage::{
    AnalysisPayload, ChapterDbRecord, DbState, NovelFullAnalysisReport, NovelRecord,
};
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn parse_novel_file(path: String) -> Result<NovelMetadata, String> {
    parse_file_from_path(&path)
}

#[tauri::command]
fn parse_novel_text(file_name: String, content: String) -> NovelMetadata {
    parse_novel_content(&file_name, &content)
}

// ---------------- SQLite 相关命令 ----------------

#[tauri::command]
fn db_save_novel(
    state: tauri::State<DbState>,
    novel_id: String,
    title: String,
    file_name: String,
    total_words: usize,
    total_chapters: usize,
    chapters: Vec<parser::Chapter>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    storage::insert_novel_with_chapters(
        &conn,
        &novel_id,
        &title,
        &file_name,
        total_words,
        total_chapters,
        &chapters,
    )
    .map_err(|e| format!("SQLite 保存小说失败: {}", e))
}

#[tauri::command]
fn db_list_novels(state: tauri::State<DbState>) -> Result<Vec<NovelRecord>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    storage::list_novels(&conn).map_err(|e| format!("获取小说列表失败: {}", e))
}

#[tauri::command]
fn db_get_chapters(
    state: tauri::State<DbState>,
    novel_id: String,
) -> Result<Vec<ChapterDbRecord>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    storage::get_chapters(&conn, &novel_id).map_err(|e| format!("获取章节数据失败: {}", e))
}

#[tauri::command]
fn db_update_chapter_analysis(
    state: tauri::State<DbState>,
    novel_id: String,
    chapter_id: usize,
    analysis: AnalysisPayload,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    storage::update_chapter_analysis_db(&conn, &novel_id, chapter_id, &analysis)
        .map_err(|e| format!("更新章节拆解失败: {}", e))
}

#[tauri::command]
fn db_get_novel_report(
    state: tauri::State<DbState>,
    novel_id: String,
) -> Result<NovelFullAnalysisReport, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    storage::get_novel_report(&conn, &novel_id).map_err(|e| format!("生成全景分析报告失败: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("./data"));
            let db_path = app_data_dir.join("novel_craft.db");
            app.manage(DbState::new(db_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            parse_novel_file,
            parse_novel_text,
            db_save_novel,
            db_list_novels,
            db_get_chapters,
            db_update_chapter_analysis,
            db_get_novel_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
