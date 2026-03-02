require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== Supabase ====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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

// ==================== Helpers ====================

// Преобразует строку Supabase в формат, ожидаемый фронтендом
function toApiProject(row) {
  const pd = row.project_data || {};
  return {
    id: row.id,
    name: row.name,
    total_area: pd.total_area || 0,
    above_ground_area: pd.above_ground_area || 0,
    underground_area: pd.underground_area || 0,
    engineering_notes: pd.engineering_notes || '',
    created_at: row.created_at || new Date().toISOString()
  };
}

// ==================== API: Проекты ====================

// Получить все проекты
app.get('/api/projects', async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(toApiProject));
});

// Создать проект
app.post('/api/projects', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }
  const { data, error } = await supabase
    .from('projects')
    .insert({ name: name.trim(), project_data: {} })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(toApiProject(data));
});

// Переименовать проект
app.put('/api/projects/:id', async (req, res) => {
  const { name } = req.body;
  const { id } = req.params;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }
  const { data, error } = await supabase
    .from('projects')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(404).json({ error: 'Проект не найден' });
  res.json(toApiProject(data));
});

// Удалить проект
app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);
  if (error) return res.status(404).json({ error: 'Проект не найден' });
  res.json({ success: true });
});

// Получить один проект
app.get('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return res.status(404).json({ error: 'Проект не найден' });
  res.json(toApiProject(data));
});

// Обновить площади проекта (хранятся внутри project_data)
app.patch('/api/projects/:id/areas', async (req, res) => {
  const { id } = req.params;
  const { total_area, above_ground_area, underground_area } = req.body;

  // Читаем текущий project_data
  const { data: current, error: readErr } = await supabase
    .from('projects')
    .select('project_data')
    .eq('id', id)
    .single();
  if (readErr) return res.status(404).json({ error: 'Проект не найден' });

  const pd = current.project_data || {};
  pd.total_area = total_area ?? 0;
  pd.above_ground_area = above_ground_area ?? 0;
  pd.underground_area = underground_area ?? 0;

  const { data, error } = await supabase
    .from('projects')
    .update({ project_data: pd })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toApiProject(data));
});

// Обновить технические заметки проекта
app.patch('/api/projects/:id/notes', async (req, res) => {
  const { id } = req.params;
  const { engineering_notes } = req.body;

  const { data: current, error: readErr } = await supabase
    .from('projects')
    .select('project_data')
    .eq('id', id)
    .single();
  if (readErr) return res.status(404).json({ error: 'Проект не найден' });

  const pd = current.project_data || {};
  pd.engineering_notes = engineering_notes ?? '';

  const { data, error } = await supabase
    .from('projects')
    .update({ project_data: pd })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toApiProject(data));
});

// ==================== API: Расчёты ====================
// Расчёты хранятся внутри project_data.calculations[systemType]

// Получить расчёт для проекта + системы
app.get('/api/calculations/:projectId/:systemType', async (req, res) => {
  const { projectId, systemType } = req.params;
  const { data, error } = await supabase
    .from('projects')
    .select('project_data')
    .eq('id', projectId)
    .single();

  if (error) {
    return res.json({ project_id: +projectId, system_type: systemType, data_json: '{}' });
  }

  const pd = data.project_data || {};
  const calculations = pd.calculations || {};
  const calcData = calculations[systemType] || {};

  res.json({
    project_id: +projectId,
    system_type: systemType,
    data_json: JSON.stringify(calcData)
  });
});

// Сохранить расчёт для проекта + системы (upsert в project_data)
app.put('/api/calculations/:projectId/:systemType', async (req, res) => {
  const { projectId, systemType } = req.params;
  const { data_json } = req.body;
  const calcObj = typeof data_json === 'string' ? JSON.parse(data_json) : data_json;

  // Читаем текущий project_data
  const { data: current, error: readErr } = await supabase
    .from('projects')
    .select('project_data')
    .eq('id', projectId)
    .single();
  if (readErr) return res.status(404).json({ error: 'Проект не найден' });

  const pd = current.project_data || {};
  if (!pd.calculations) pd.calculations = {};
  pd.calculations[systemType] = calcObj;

  const { error } = await supabase
    .from('projects')
    .update({ project_data: pd })
    .eq('id', projectId);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});

// ==================== API: Сохранение в облако ====================

// POST /save — сохранить название ЖК + данные расчёта в Supabase
app.post('/save', async (req, res) => {
  const { name, project_data } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ ok: false, error: 'Не указано название проекта' });
  }

  try {
    // Ищем существующий проект по имени
    const { data: existing } = await supabase
      .from('projects')
      .select('id, project_data')
      .eq('name', name.trim())
      .maybeSingle();

    if (existing) {
      // Обновляем: сливаем с имеющимися данными (чтобы не потерять areas/notes)
      const merged = { ...(existing.project_data || {}), ...(project_data || {}) };
      const { error } = await supabase
        .from('projects')
        .update({ project_data: merged })
        .eq('id', existing.id);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, id: existing.id, message: 'Проект обновлён в Supabase' });
    } else {
      // Создаём новый
      const { data, error } = await supabase
        .from('projects')
        .insert({ name: name.trim(), project_data: project_data || {} })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, id: data.id, message: 'Проект создан в Supabase' });
    }
  } catch (err) {
    console.error('[save] Ошибка:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
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
    <b>Наименование:</b> ООО &laquo;Строительное Управление-10&raquo; (ООО &laquo;СУ-10&raquo;)<br>
    <b>ИНН:</b> 7736255508 &nbsp; <b>КПП:</b> 774550001<br>
    <b>Юр. адрес:</b> 117335, г. Москва, ул. Вавилова, д. 69/75, ПОМ І, КОМ. 7, оф. 806<br>
    <b>Тел.:</b> +7 (495) 616-23-22<br>
    <b>Email:</b> su10@su10.ru<br>
    <b>Банк:</b> ПАО &laquo;СБЕРБАНК&raquo; г. Москва<br>
    <b>Р/с:</b> 40702810238000081762 &nbsp; <b>К/с:</b> 30101810400000000225 &nbsp; <b>БИК:</b> 044525225
  </div>
  <p style="font-size:11px;color:#999;margin-top:16px;">* при оформлении счетов-фактур в строках грузополучатель и его адрес, адрес покупателя &mdash; указывать юридический адрес: 117335, г. Москва, ул. Вавилова, д. 69/75, ПОМ І, КОМ. 7, оф. 806</p>
  <p style="margin-top:20px;">С уважением,<br><b>ООО &laquo;СУ-10&raquo;</b></p>
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
  console.log(`\u{2601}\u{FE0F}  Supabase: ${process.env.SUPABASE_URL ? 'подключён' : 'НЕ настроен!'}`);
  if (SMTP_CONFIG.auth.user) {
    console.log(`\u{1F4E7} SMTP настроен: ${SMTP_CONFIG.host}:${SMTP_CONFIG.port}, user: ${SMTP_CONFIG.auth.user}`);
  } else {
    console.log(`\u26A0\uFE0F  SMTP НЕ настроен! Создайте файл .env (см. .env.example)`);
  }
  console.log(`\u23F9\uFE0F  Для остановки сервера нажмите Ctrl+C`);
});
