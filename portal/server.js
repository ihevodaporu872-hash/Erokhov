require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== Конфигурация SMTP ====================
// ВАЖНО: Замените заглушки на реальные данные вашей почты
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.yandex.ru',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true, // true для 465, false для 587
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
};

// Адрес отправителя (From)
const SMTP_FROM = process.env.SMTP_FROM || SMTP_CONFIG.auth.user;

// ==================== API: Проекты ====================

// Получить все проекты
app.get('/api/projects', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  res.json(projects);
});

// Создать проект
app.post('/api/projects', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }
  const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name.trim());
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(project);
});

// Переименовать проект
app.put('/api/projects/:id', (req, res) => {
  const { name } = req.body;
  const { id } = req.params;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }
  const result = db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name.trim(), id);
  if (result.changes === 0) return res.status(404).json({ error: 'Проект не найден' });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.json(project);
});

// Удалить проект
app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Проект не найден' });
  res.json({ success: true });
});

// Получить один проект
app.get('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });
  res.json(project);
});

// Обновить площади проекта
app.patch('/api/projects/:id/areas', (req, res) => {
  const { id } = req.params;
  const { total_area, above_ground_area, underground_area } = req.body;

  const result = db.prepare(
    'UPDATE projects SET total_area = ?, above_ground_area = ?, underground_area = ? WHERE id = ?'
  ).run(
    total_area ?? 0,
    above_ground_area ?? 0,
    underground_area ?? 0,
    id
  );

  if (result.changes === 0) return res.status(404).json({ error: 'Проект не найден' });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.json(project);
});

// Обновить технические заметки проекта
app.patch('/api/projects/:id/notes', (req, res) => {
  const { id } = req.params;
  const { engineering_notes } = req.body;

  const result = db.prepare(
    'UPDATE projects SET engineering_notes = ? WHERE id = ?'
  ).run(engineering_notes ?? '', id);

  if (result.changes === 0) return res.status(404).json({ error: 'Проект не найден' });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.json(project);
});

// ==================== API: Расчёты ====================

// Получить расчёт для проекта + системы
app.get('/api/calculations/:projectId/:systemType', (req, res) => {
  const { projectId, systemType } = req.params;
  const calc = db.prepare(
    'SELECT * FROM calculations WHERE project_id = ? AND system_type = ?'
  ).get(projectId, systemType);
  res.json(calc || { project_id: +projectId, system_type: systemType, data_json: '{}' });
});

// Сохранить расчёт для проекта + системы (upsert)
app.put('/api/calculations/:projectId/:systemType', (req, res) => {
  const { projectId, systemType } = req.params;
  const { data_json } = req.body;
  const jsonStr = typeof data_json === 'string' ? data_json : JSON.stringify(data_json);

  db.prepare(`
    INSERT INTO calculations (project_id, system_type, data_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(project_id, system_type)
    DO UPDATE SET data_json = excluded.data_json, updated_at = datetime('now')
  `).run(projectId, systemType, jsonStr);

  res.json({ success: true });
});

// ==================== API: Отправка почты ====================

app.post('/send-mail', async (req, res) => {
  const { subject, text, recipients, copyTo } = req.body;

  console.log('[send-mail] Получен запрос на отправку');
  console.log('[send-mail] Тема:', subject);
  console.log('[send-mail] Получатели:', recipients);
  console.log('[send-mail] Копия:', copyTo || '(нет)');

  // Валидация
  if (!subject || !text) {
    console.error('[send-mail] Ошибка: отсутствует subject или text');
    return res.status(400).json({ ok: false, error: 'Не указаны тема или текст письма' });
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    console.error('[send-mail] Ошибка: нет получателей');
    return res.status(400).json({ ok: false, error: 'Не указаны получатели' });
  }

  // Проверяем SMTP-конфигурацию
  if (!SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
    console.error('[send-mail] SMTP не настроен! Укажите SMTP_USER и SMTP_PASS в переменных окружения или в server.js');
    return res.status(500).json({
      ok: false,
      error: 'SMTP не настроен. Обратитесь к администратору.'
    });
  }

  try {
    // Создаём транспорт
    const transporter = nodemailer.createTransport(SMTP_CONFIG);

    // Проверяем соединение
    console.log('[send-mail] Проверяем SMTP-соединение...');
    await transporter.verify();
    console.log('[send-mail] SMTP-соединение OK');

    // Формируем список получателей
    const toList = recipients.join(', ');
    const ccList = copyTo ? copyTo : '';

    const mailOptions = {
      from: `"Строительное управление - 10" <${SMTP_FROM}>`,
      to: toList,
      cc: ccList || undefined,
      subject: subject,
      text: text,
    };

    console.log('[send-mail] Отправляем письмо:', { to: toList, cc: ccList, subject });

    const info = await transporter.sendMail(mailOptions);
    console.log('[send-mail] Письмо отправлено! MessageId:', info.messageId);
    console.log('[send-mail] Ответ SMTP:', info.response);

    res.json({ ok: true, messageId: info.messageId });
  } catch (error) {
    console.error('[send-mail] ОШИБКА отправки:', error.message);
    console.error('[send-mail] Полная ошибка:', error);
    res.status(500).json({
      ok: false,
      error: `Ошибка отправки: ${error.message}`
    });
  }
});

// ==================== Основной маршрут ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`\u{1F680} Инженерный портал запущен на http://localhost:${PORT}`);
  console.log(`\u{1F4C2} Статические файлы обслуживаются из папки: ${path.join(__dirname, 'public')}`);
  if (SMTP_CONFIG.auth.user) {
    console.log(`\u{1F4E7} SMTP настроен: ${SMTP_CONFIG.host}:${SMTP_CONFIG.port}, user: ${SMTP_CONFIG.auth.user}`);
  } else {
    console.log(`\u26A0\uFE0F  SMTP НЕ настроен! Создайте файл .env (см. .env.example)`);
  }
  console.log(`\u23F9\uFE0F  Для остановки сервера нажмите Ctrl+C`);
});
