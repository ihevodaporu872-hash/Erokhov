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

/**
 * Экранирует HTML-спецсимволы
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Формирует HTML-письмо с таблицами спецификации
 */
function buildQuoteHtml(projectName, sections) {
  const tableStyle = 'width:100%;border-collapse:collapse;margin-bottom:24px;font-family:Arial,sans-serif;font-size:14px;';
  const thStyle = 'background:#f0f0f0;border:1px solid #ccc;padding:8px 12px;text-align:left;font-weight:600;';
  const tdStyle = 'border:1px solid #ccc;padding:8px 12px;';
  const tdNumStyle = 'border:1px solid #ccc;padding:8px 12px;text-align:center;';
  const tdQtyStyle = 'border:1px solid #ccc;padding:8px 12px;text-align:right;font-weight:600;';

  let html = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.5;">
  <p>Добрый день!</p>
  <p>Просим предоставить коммерческое предложение на следующие позиции для объекта: <b>${escapeHtml(projectName)}</b></p>
`;

  sections.forEach((sec, secIdx) => {
    html += `
  <h3 style="margin:24px 0 8px;font-size:15px;color:#333;">${secIdx + 1}. ${escapeHtml(sec.title)}${sec.supplierName ? ` (${escapeHtml(sec.supplierName)})` : ''}</h3>
  <table style="${tableStyle}">
    <thead>
      <tr>
        <th style="${thStyle}width:40px;text-align:center;">&numero;</th>
        <th style="${thStyle}">Наименование</th>
        <th style="${thStyle}width:80px;text-align:center;">Ед. изм.</th>
        <th style="${thStyle}width:100px;text-align:right;">Количество</th>
      </tr>
    </thead>
    <tbody>`;

    sec.items.forEach((item, idx) => {
      html += `
      <tr>
        <td style="${tdNumStyle}">${idx + 1}</td>
        <td style="${tdStyle}">${escapeHtml(item.name)}</td>
        <td style="${tdNumStyle}">${escapeHtml(item.unit)}</td>
        <td style="${tdQtyStyle}">${item.quantity}</td>
      </tr>`;
    });

    html += `
    </tbody>
  </table>`;
  });

  // Реквизиты компании
  html += `
  <hr style="border:none;border-top:1px solid #ccc;margin:24px 0;">
  <div style="font-size:12px;color:#666;line-height:1.6;">
    <b>Наименование:</b> АО "СУ-10 фундамент строй"<br>
    <b>ИНН:</b> 7729506782 &nbsp; <b>КПП:</b> 502401001<br>
    <b>Юр. адрес:</b> 143405, Московская обл., г. Красногорск, ш. Ильинское, д. 1А, пом. 32, 2С<br>
    <b>Факт. адрес:</b> 127018, г. Москва, ул. Полковая, д. 3, стр. 5<br>
    <b>Тел.:</b> 8 (495) 616-23-22; 616-53-29; 615-82-00<br>
    <b>Email:</b> su10@su10.ru<br>
    <b>Банк:</b> ООО КБ "АРЕСБАНК" г. Москва<br>
    <b>Р/с:</b> 40702810400000601334 &nbsp; <b>К/с:</b> 30101810845250000029 &nbsp; <b>БИК:</b> 044525229
  </div>
  <p style="font-size:11px;color:#999;margin-top:16px;">* при оформлении счетов-фактур в строках грузополучатель и его адрес, адрес покупателя — указывать юридический адрес: 143405, Московская обл., г. Красногорск, ш. Ильинское, д. 1А, пом. 32, 2С</p>
  <p style="margin-top:20px;">С уважением,<br><b>АО "СУ-10 фундамент строй"</b></p>
</div>`;

  return html;
}

app.post('/send-mail', async (req, res) => {
  const { subject, projectName, sections, recipients, copyTo } = req.body;

  console.log('[send-mail] Получен запрос на отправку');
  console.log('[send-mail] Тема:', subject);
  console.log('[send-mail] Проект:', projectName);
  console.log('[send-mail] Разделов:', sections?.length || 0);
  console.log('[send-mail] Получатели:', recipients);
  console.log('[send-mail] Копия:', copyTo || '(нет)');

  // Валидация
  if (!subject) {
    return res.status(400).json({ ok: false, error: 'Не указана тема письма' });
  }

  if (!sections || !Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ ok: false, error: 'Нет разделов спецификации' });
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ ok: false, error: 'Не указаны получатели' });
  }

  // Проверяем SMTP-конфигурацию
  if (!SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
    console.error('[send-mail] SMTP не настроен!');
    return res.status(500).json({
      ok: false,
      error: 'SMTP не настроен. Обратитесь к администратору.'
    });
  }

  try {
    const transporter = nodemailer.createTransport(SMTP_CONFIG);

    console.log('[send-mail] Проверяем SMTP-соединение...');
    await transporter.verify();
    console.log('[send-mail] SMTP-соединение OK');

    // Формируем HTML-письмо
    const html = buildQuoteHtml(projectName || 'Проект', sections);

    const toList = recipients.join(', ');
    const ccList = copyTo ? copyTo : '';

    const mailOptions = {
      from: `"Строительное управление - 10" <${SMTP_FROM}>`,
      to: toList,
      cc: ccList || undefined,
      subject: subject,
      html: html,
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
