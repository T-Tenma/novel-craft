use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Chapter {
    pub id: usize,
    pub title: String,
    pub word_count: usize,
    pub preview: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NovelMetadata {
    pub file_name: String,
    pub total_words: usize,
    pub total_chapters: usize,
    pub chapters: Vec<Chapter>,
}

pub fn parse_novel_content(file_name: &str, text: &str) -> NovelMetadata {
    // 匹配如: "第123章 ...", "第一千二百章 ...", "卷一 ...", "序章", "尾声", "番外" 等经典网文/小说分章
    let chapter_regex = Regex::new(
        r"(?m)^[ \t]*(第[0-9一二三四五六七八九十百千万]+[章卷回节篇部][^\n\r]*|序章[^\n\r]*|尾声[^\n\r]*|番外[^\n\r]*)"
    ).unwrap();

    let mut matches: Vec<(usize, String)> = Vec::new();
    for mat in chapter_regex.find_iter(text) {
        matches.push((mat.start(), mat.as_str().trim().to_string()));
    }

    let mut chapters = Vec::new();

    if matches.is_empty() {
        // 如果没有匹配到正规章节，将全书作为一个整体或按段落切分
        let word_count = text.chars().filter(|c| !c.is_whitespace()).count();
        let preview = text.chars().take(200).collect::<String>();
        chapters.push(Chapter {
            id: 1,
            title: "正文 (未检测到章节标记)".to_string(),
            word_count,
            preview,
            content: text.to_string(),
        });
    } else {
        // 如果开头第一章前面有前言/引言，也收录为一个独立章节
        let first_start = matches[0].0;
        if first_start > 0 {
            let intro_content = text[..first_start].trim();
            if !intro_content.is_empty() {
                let word_count = intro_content.chars().filter(|c| !c.is_whitespace()).count();
                let preview = intro_content.chars().take(200).collect::<String>();
                chapters.push(Chapter {
                    id: 0,
                    title: "引子 / 前言".to_string(),
                    word_count,
                    preview,
                    content: intro_content.to_string(),
                });
            }
        }

        for (idx, (start, title)) in matches.iter().enumerate() {
            let content_start = *start;
            let content_end = if idx + 1 < matches.len() {
                matches[idx + 1].0
            } else {
                text.len()
            };

            let chapter_full_text = text[content_start..content_end].trim();
            let word_count = chapter_full_text.chars().filter(|c| !c.is_whitespace()).count();
            
            // 提取前200字符作为预览
            let preview = chapter_full_text
                .lines()
                .skip(1) // 跳过章节名那一行
                .collect::<Vec<&str>>()
                .join("\n")
                .trim()
                .chars()
                .take(200)
                .collect::<String>();

            chapters.push(Chapter {
                id: idx + 1,
                title: title.clone(),
                word_count,
                preview,
                content: chapter_full_text.to_string(),
            });
        }
    }

    let total_words = chapters.iter().map(|c| c.word_count).sum();
    let total_chapters = chapters.len();

    NovelMetadata {
        file_name: file_name.to_string(),
        total_words,
        total_chapters,
        chapters,
    }
}

pub fn parse_file_from_path(file_path: &str) -> Result<NovelMetadata, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("未命名小说")
        .to_string();

    let content = fs::read_to_string(path)
        .map_err(|e| format!("读取文件失败 (目前支持 UTF-8 编码): {}", e))?;

    Ok(parse_novel_content(&file_name, &content))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_novel_with_standard_chapters() {
        let text = "第一章 绯红之月\n月亮是绯红色的。\n第二章 宿命的交错\n他醒了过来。";
        let metadata = parse_novel_content("test.txt", text);
        assert_eq!(metadata.total_chapters, 2);
        assert_eq!(metadata.chapters[0].title, "第一章 绯红之月");
        assert_eq!(metadata.chapters[1].title, "第二章 宿命的交错");
        assert!(metadata.total_words > 0);
    }

    #[test]
    fn test_parse_novel_with_intro() {
        let text = "这是前言介绍。\n\n第1章 起源\n正文开始。";
        let metadata = parse_novel_content("test.txt", text);
        assert_eq!(metadata.total_chapters, 2);
        assert_eq!(metadata.chapters[0].id, 0);
        assert_eq!(metadata.chapters[0].title, "引子 / 前言");
        assert_eq!(metadata.chapters[1].id, 1);
        assert_eq!(metadata.chapters[1].title, "第1章 起源");
    }

    #[test]
    fn test_parse_novel_without_chapters() {
        let text = "这是一篇没有分章标题的短篇小说或散文。整篇直接阅读。";
        let metadata = parse_novel_content("short.txt", text);
        assert_eq!(metadata.total_chapters, 1);
        assert_eq!(metadata.chapters[0].title, "正文 (未检测到章节标记)");
    }
}

