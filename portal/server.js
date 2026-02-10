const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Основной маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Инженерный портал запущен на http://localhost:${PORT}`);
    console.log(`📂 Статические файлы обслуживаются из папки: ${path.join(__dirname, 'public')}`);
    console.log(`⏹️  Для остановки сервера нажмите Ctrl+C`);
});
