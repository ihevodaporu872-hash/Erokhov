const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Создаём директорию для БД если не существует
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'portal.db');
const db = new Database(DB_PATH);

// Оптимизация: WAL-режим для лучшей производительности
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    total_area REAL DEFAULT 0,
    above_ground_area REAL DEFAULT 0,
    underground_area REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS calculations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    system_type TEXT NOT NULL,
    data_json TEXT DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, system_type)
  );
`);

// Миграция: добавляем колонки площадей если их нет (для существующих БД)
const columns = db.prepare("PRAGMA table_info(projects)").all().map(c => c.name);
if (!columns.includes('total_area')) {
  db.exec("ALTER TABLE projects ADD COLUMN total_area REAL DEFAULT 0");
}
if (!columns.includes('above_ground_area')) {
  db.exec("ALTER TABLE projects ADD COLUMN above_ground_area REAL DEFAULT 0");
}
if (!columns.includes('underground_area')) {
  db.exec("ALTER TABLE projects ADD COLUMN underground_area REAL DEFAULT 0");
}

module.exports = db;
