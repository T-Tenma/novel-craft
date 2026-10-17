use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NovelRecord {
    pub id: String,
    pub title: String,
    pub file_name: String,
    pub total_words: usize,
    pub total_chapters: usize,
    pub analyzed_chapters: usize,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterDbRecord {
    pub id: usize,
    pub novel_id: String,
    pub title: String,
    pub word_count: usize,
    pub content: String,
    pub status: String, // 'pending' | 'analyzing' | 'completed' | 'failed'
    pub summary: Option<String>,
    pub tension_score: Option<usize>,
    pub narrative_hook: Option<String>,
    pub technique_notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CharacterRecord {
    pub id: usize,
    pub novel_id: String,
    pub name: String,
    pub role: Option<String>,
    pub appearance_count: usize,
    pub first_chapter_id: usize,
    pub profile_json: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorldElementRecord {
    pub id: usize,
    pub novel_id: String,
    pub term: String,
    pub category: Option<String>,
    pub description: Option<String>,
    pub first_chapter_id: usize,
}

pub struct DbState {
    pub conn: Mutex<Connection>,
}

impl DbState {
    pub fn new(db_path: PathBuf) -> std::result::Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建数据目录失败 {}: {}", parent.display(), e))?;
        }

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("打开 SQLite 数据库失败 {}: {}", db_path.display(), e))?;
        init_tables(&conn).map_err(|e| format!("初始化数据表失败: {}", e))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

fn init_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS novels (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            file_name TEXT NOT NULL,
            total_words INTEGER DEFAULT 0,
            total_chapters INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER NOT NULL,
            novel_id TEXT NOT NULL,
            title TEXT NOT NULL,
            word_count INTEGER DEFAULT 0,
            content TEXT,
            status TEXT DEFAULT 'pending',
            summary TEXT,
            tension_score INTEGER,
            narrative_hook TEXT,
            technique_notes TEXT,
            PRIMARY KEY (novel_id, id)
        );

        CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            novel_id TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT,
            appearance_count INTEGER DEFAULT 1,
            first_chapter_id INTEGER,
            profile_json TEXT,
            UNIQUE(novel_id, name)
        );

        CREATE TABLE IF NOT EXISTS world_elements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            novel_id TEXT NOT NULL,
            term TEXT NOT NULL,
            category TEXT,
            description TEXT,
            first_chapter_id INTEGER,
            UNIQUE(novel_id, term)
        );

        CREATE INDEX IF NOT EXISTS idx_chapters_novel_id ON chapters(novel_id);
        CREATE INDEX IF NOT EXISTS idx_characters_novel_id ON characters(novel_id);
        CREATE INDEX IF NOT EXISTS idx_world_elements_novel_id ON world_elements(novel_id);
        "
    )?;
    Ok(())
}

// 批量存储导入的小说与章节
pub fn insert_novel_with_chapters(
    conn: &Connection,
    novel_id: &str,
    title: &str,
    file_name: &str,
    total_words: usize,
    total_chapters: usize,
    chapters: &[crate::parser::Chapter],
) -> Result<()> {
    // 整体放在一个事务里：任一步失败时 tx 被 drop 自动回滚，不会在共享连接上残留未结束的事务
    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "INSERT OR REPLACE INTO novels (id, title, file_name, total_words, total_chapters) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![novel_id, title, file_name, total_words as i64, total_chapters as i64],
    )?;

    // 重新导入同名小说时清掉上一次的章节与聚合资产，避免残留章节和重复计数
    for table in ["chapters", "characters", "world_elements"] {
        tx.execute(&format!("DELETE FROM {} WHERE novel_id = ?1", table), params![novel_id])?;
    }

    {
        let mut stmt_ch = tx.prepare(
            "INSERT OR REPLACE INTO chapters (id, novel_id, title, word_count, content, status) VALUES (?1, ?2, ?3, ?4, ?5, 'pending')"
        )?;
        for ch in chapters {
            stmt_ch.execute(params![
                ch.id as i64,
                novel_id,
                ch.title,
                ch.word_count as i64,
                ch.content
            ])?;
        }
    }

    tx.commit()
}

// 从书库删除小说：小说、章节与聚合资产一并删除（同一事务，失败自动回滚）
pub fn delete_novel(conn: &Connection, novel_id: &str) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    for table in ["chapters", "characters", "world_elements"] {
        tx.execute(&format!("DELETE FROM {} WHERE novel_id = ?1", table), params![novel_id])?;
    }
    tx.execute("DELETE FROM novels WHERE id = ?1", params![novel_id])?;
    tx.commit()
}

// 获取小说列表
pub fn list_novels(conn: &Connection) -> Result<Vec<NovelRecord>> {
    let mut stmt = conn.prepare(
        "SELECT n.id, n.title, n.file_name, n.total_words, n.total_chapters, n.created_at,
                (SELECT COUNT(*) FROM chapters c WHERE c.novel_id = n.id AND c.status = 'completed') as analyzed_chapters
         FROM novels n ORDER BY n.created_at DESC"
    )?;

    let novel_iter = stmt.query_map([], |row| {
        Ok(NovelRecord {
            id: row.get(0)?,
            title: row.get(1)?,
            file_name: row.get(2)?,
            total_words: row.get::<_, i64>(3)? as usize,
            total_chapters: row.get::<_, i64>(4)? as usize,
            created_at: row.get(5)?,
            analyzed_chapters: row.get::<_, i64>(6)? as usize,
        })
    })?;

    let mut result = Vec::new();
    for n in novel_iter {
        result.push(n?);
    }
    Ok(result)
}

// 获取指定小说的全部章节数据
pub fn get_chapters(conn: &Connection, novel_id: &str) -> Result<Vec<ChapterDbRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, novel_id, title, word_count, content, status, summary, tension_score, narrative_hook, technique_notes
         FROM chapters WHERE novel_id = ?1 ORDER BY id ASC"
    )?;

    let rows = stmt.query_map(params![novel_id], |row| {
        Ok(ChapterDbRecord {
            id: row.get::<_, i64>(0)? as usize,
            novel_id: row.get(1)?,
            title: row.get(2)?,
            word_count: row.get::<_, i64>(3)? as usize,
            content: row.get(4)?,
            status: row.get(5)?,
            summary: row.get(6)?,
            tension_score: row.get::<_, Option<i64>>(7)?.map(|v| v as usize),
            narrative_hook: row.get(8)?,
            technique_notes: row.get(9)?,
        })
    })?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    Ok(result)
}

// 增量更新单章拆解结果，并写入角色与世界观
#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisPayload {
    pub summary: String,
    pub tension_score: usize,
    pub narrative_hook: String,
    pub technique_notes: String,
    pub characters: Vec<CharPayload>,
    pub world_elements: Vec<WorldPayload>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CharPayload {
    pub name: String,
    pub role: String,
    pub key_action: String,
    pub inner_motivation: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorldPayload {
    pub term: String,
    pub category: String,
    pub description: String,
}

pub fn update_chapter_analysis_db(
    conn: &Connection,
    novel_id: &str,
    chapter_id: usize,
    analysis: &AnalysisPayload,
) -> Result<()> {
    // 1. 更新章节表
    conn.execute(
        "UPDATE chapters SET status = 'completed', summary = ?1, tension_score = ?2, narrative_hook = ?3, technique_notes = ?4 
         WHERE novel_id = ?5 AND id = ?6",
        params![
            analysis.summary,
            analysis.tension_score as i64,
            analysis.narrative_hook,
            analysis.technique_notes,
            novel_id,
            chapter_id as i64
        ]
    )?;

    // 2. 增量更新角色表 (已存在则出场数 + 1)
    for c in &analysis.characters {
        let profile_str = serde_json::to_string(c).unwrap_or_default();
        conn.execute(
            "INSERT INTO characters (novel_id, name, role, appearance_count, first_chapter_id, profile_json)
             VALUES (?1, ?2, ?3, 1, ?4, ?5)
             ON CONFLICT(novel_id, name) DO UPDATE SET 
                appearance_count = appearance_count + 1,
                role = excluded.role,
                profile_json = excluded.profile_json",
            params![novel_id, c.name, c.role, chapter_id as i64, profile_str]
        )?;
    }

    // 3. 增量更新世界观法则表
    for w in &analysis.world_elements {
        conn.execute(
            "INSERT INTO world_elements (novel_id, term, category, description, first_chapter_id)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(novel_id, term) DO UPDATE SET
                category = excluded.category,
                description = excluded.description",
            params![novel_id, w.term, w.category, w.description, chapter_id as i64]
        )?;
    }

    Ok(())
}

// 获取小说的全量聚合分析 (大纲、张力点、角色集、世界观)
#[derive(Debug, Serialize, Deserialize)]
pub struct NovelFullAnalysisReport {
    pub novel_id: String,
    pub tension_curve: Vec<TensionPoint>,
    pub characters: Vec<CharacterRecord>,
    pub world_elements: Vec<WorldElementRecord>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TensionPoint {
    pub chapter_id: usize,
    pub title: String,
    pub tension_score: usize,
    pub hook: String,
}

pub fn get_novel_report(conn: &Connection, novel_id: &str) -> Result<NovelFullAnalysisReport> {
    // 1. 张力曲线
    let mut stmt_t = conn.prepare(
        "SELECT id, title, tension_score, narrative_hook FROM chapters 
         WHERE novel_id = ?1 AND status = 'completed' ORDER BY id ASC"
    )?;
    let tension_iter = stmt_t.query_map(params![novel_id], |row| {
        Ok(TensionPoint {
            chapter_id: row.get::<_, i64>(0)? as usize,
            title: row.get(1)?,
            tension_score: row.get::<_, i64>(2)? as usize,
            hook: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        })
    })?;
    let mut tension_curve = Vec::new();
    for t in tension_iter {
        tension_curve.push(t?);
    }

    // 2. 角色列表 (按出场频次降序)
    let mut stmt_c = conn.prepare(
        "SELECT id, novel_id, name, role, appearance_count, first_chapter_id, profile_json 
         FROM characters WHERE novel_id = ?1 ORDER BY appearance_count DESC"
    )?;
    let char_iter = stmt_c.query_map(params![novel_id], |row| {
        Ok(CharacterRecord {
            id: row.get::<_, i64>(0)? as usize,
            novel_id: row.get(1)?,
            name: row.get(2)?,
            role: row.get(3)?,
            appearance_count: row.get::<_, i64>(4)? as usize,
            first_chapter_id: row.get::<_, i64>(5)? as usize,
            profile_json: row.get(6)?,
        })
    })?;
    let mut characters = Vec::new();
    for c in char_iter {
        characters.push(c?);
    }

    // 3. 世界观设定
    let mut stmt_w = conn.prepare(
        "SELECT id, novel_id, term, category, description, first_chapter_id 
         FROM world_elements WHERE novel_id = ?1 ORDER BY id ASC"
    )?;
    let world_iter = stmt_w.query_map(params![novel_id], |row| {
        Ok(WorldElementRecord {
            id: row.get::<_, i64>(0)? as usize,
            novel_id: row.get(1)?,
            term: row.get(2)?,
            category: row.get(3)?,
            description: row.get(4)?,
            first_chapter_id: row.get::<_, i64>(5)? as usize,
        })
    })?;
    let mut world_elements = Vec::new();
    for w in world_iter {
        world_elements.push(w?);
    }

    Ok(NovelFullAnalysisReport {
        novel_id: novel_id.to_string(),
        tension_curve,
        characters,
        world_elements,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_storage_lifecycle() {
        let conn = Connection::open_in_memory().unwrap();
        init_tables(&conn).unwrap();

        // 1. 插入小说与章节
        let chaps = vec![
            crate::parser::Chapter {
                id: 1,
                title: "第一章".to_string(),
                word_count: 2000,
                preview: "开篇测试".to_string(),
                content: "开篇正文内容...".to_string(),
            },
            crate::parser::Chapter {
                id: 2,
                title: "第二章".to_string(),
                word_count: 2500,
                preview: "第二章预览".to_string(),
                content: "第二章正文内容...".to_string(),
            },
        ];

        insert_novel_with_chapters(&conn, "novel_1", "测试书名", "test.txt", 4500, 2, &chaps).unwrap();

        // 2. 检查列表
        let list = list_novels(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "novel_1");
        assert_eq!(list[0].total_chapters, 2);

        // 3. 获取章节
        let chapters = get_chapters(&conn, "novel_1").unwrap();
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title, "第一章");

        // 4. 更新单章拆解结果
        let analysis = AnalysisPayload {
            summary: "主角遭遇危机，展现反抗动机".to_string(),
            tension_score: 9,
            narrative_hook: "神秘符文闪烁".to_string(),
            technique_notes: "冷开场与动作特写".to_string(),
            characters: vec![CharPayload {
                name: "克莱恩".to_string(),
                role: "男主".to_string(),
                key_action: "开枪自救".to_string(),
                inner_motivation: "活下去并回家".to_string(),
            }],
            world_elements: vec![WorldPayload {
                term: "非凡魔药".to_string(),
                category: "力量体系".to_string(),
                description: "服用后可获得超凡序列能力，但伴随失控风险".to_string(),
            }],
        };

        update_chapter_analysis_db(&conn, "novel_1", 1, &analysis).unwrap();

        // 5. 生成全景报告
        let report = get_novel_report(&conn, "novel_1").unwrap();
        assert_eq!(report.novel_id, "novel_1");
        assert_eq!(report.tension_curve.len(), 1);
        assert_eq!(report.tension_curve[0].tension_score, 9);
        assert_eq!(report.characters.len(), 1);
        assert_eq!(report.characters[0].name, "克莱恩");
        assert_eq!(report.world_elements.len(), 1);
        assert_eq!(report.world_elements[0].term, "非凡魔药");
    }

    fn chapter(id: usize, title: &str) -> crate::parser::Chapter {
        crate::parser::Chapter {
            id,
            title: title.to_string(),
            word_count: 10,
            preview: String::new(),
            content: format!("{}正文", title),
        }
    }

    #[test]
    fn test_failed_insert_rolls_back_and_later_saves_still_work() {
        let conn = Connection::open_in_memory().unwrap();
        init_tables(&conn).unwrap();

        conn.execute("ALTER TABLE chapters RENAME TO chapters_broken", []).unwrap();
        let first = insert_novel_with_chapters(&conn, "n1", "书", "a.txt", 10, 1, &[chapter(1, "第一章")]);
        assert!(first.is_err());
        assert!(conn.is_autocommit(), "a failed save must not leave a transaction open");
        assert_eq!(list_novels_count(&conn), 0, "novel row must roll back with its chapters");

        conn.execute("ALTER TABLE chapters_broken RENAME TO chapters", []).unwrap();
        insert_novel_with_chapters(&conn, "n1", "书", "a.txt", 10, 1, &[chapter(1, "第一章")]).unwrap();
        assert_eq!(get_chapters(&conn, "n1").unwrap().len(), 1);
    }

    fn list_novels_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM novels", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn test_reimport_replaces_old_chapters_and_aggregated_assets() {
        let conn = Connection::open_in_memory().unwrap();
        init_tables(&conn).unwrap();
        insert_novel_with_chapters(&conn, "n1", "书", "a.txt", 20, 2, &[chapter(1, "第一章"), chapter(2, "第二章")]).unwrap();
        let analysis = AnalysisPayload {
            summary: "s".into(),
            tension_score: 5,
            narrative_hook: "h".into(),
            technique_notes: "t".into(),
            characters: vec![CharPayload { name: "甲".into(), role: "r".into(), key_action: "k".into(), inner_motivation: "m".into() }],
            world_elements: vec![WorldPayload { term: "术".into(), category: "其他".into(), description: "d".into() }],
        };
        update_chapter_analysis_db(&conn, "n1", 2, &analysis).unwrap();

        insert_novel_with_chapters(&conn, "n1", "书", "a.txt", 10, 1, &[chapter(1, "新第一章")]).unwrap();

        let chapters = get_chapters(&conn, "n1").unwrap();
        assert_eq!(chapters.len(), 1, "chapters from the previous import must not linger");
        assert_eq!(chapters[0].title, "新第一章");
        let report = get_novel_report(&conn, "n1").unwrap();
        assert!(report.characters.is_empty());
        assert!(report.world_elements.is_empty());
    }

    #[test]
    fn test_delete_novel_removes_novel_chapters_and_assets() {
        let conn = Connection::open_in_memory().unwrap();
        init_tables(&conn).unwrap();
        insert_novel_with_chapters(&conn, "n1", "书", "a.txt", 10, 1, &[chapter(1, "第一章")]).unwrap();
        insert_novel_with_chapters(&conn, "n2", "另一本", "b.txt", 10, 1, &[chapter(1, "第一章")]).unwrap();
        let analysis = AnalysisPayload {
            summary: "s".into(),
            tension_score: 5,
            narrative_hook: "h".into(),
            technique_notes: "t".into(),
            characters: vec![CharPayload { name: "甲".into(), role: "r".into(), key_action: "k".into(), inner_motivation: "m".into() }],
            world_elements: vec![WorldPayload { term: "术".into(), category: "其他".into(), description: "d".into() }],
        };
        update_chapter_analysis_db(&conn, "n1", 1, &analysis).unwrap();

        delete_novel(&conn, "n1").unwrap();

        let ids: Vec<String> = list_novels(&conn).unwrap().into_iter().map(|n| n.id).collect();
        assert_eq!(ids, vec!["n2".to_string()], "only the other novel remains");
        assert!(get_chapters(&conn, "n1").unwrap().is_empty());
        let report = get_novel_report(&conn, "n1").unwrap();
        assert!(report.characters.is_empty());
        assert!(report.world_elements.is_empty());
        assert_eq!(get_chapters(&conn, "n2").unwrap().len(), 1, "other novels are untouched");
    }

    #[test]
    fn test_db_state_new_reports_error_instead_of_panicking() {
        let result = DbState::new(PathBuf::from("/dev/null/not-a-dir/novel_craft.db"));
        assert!(result.is_err());
    }
}

