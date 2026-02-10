import { sections } from './state.js';
import {
  computeSpecsAggregates,
  computeRisersOverall,
  computeBomData
} from './calculations.js';

// Преобразование HTML таблицы в Array of Arrays
export function tableToAOA(tableEl) {
  const aoa = [];
  const thead = tableEl.querySelector('thead');

  if (thead) {
    const ths = Array.from(thead.querySelectorAll('tr')).map(tr =>
      Array.from(tr.children).map(td => td.textContent.trim())
    );
    aoa.push(...ths);
  }

  const tbody = tableEl.querySelector('tbody');
  if (tbody) {
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      aoa.push(Array.from(tr.children).map(td => td.textContent));
    });
  }

  return aoa;
}

// Построение AOA для BOM
export function buildBomAOA(ivptEnabled) {
  const aoa = [
    ['Корпус', 'Зона', 'Альбом КУУ', 'n (авто)', 'Позиция', 'Ед.', 'Количество']
  ];

  const bomData = computeBomData(sections, ivptEnabled);

  bomData.forEach(item => {
    aoa.push([
      `Корпус ${item.sectionIndex + 1}`,
      item.zoneName,
      item.albumName,
      item.nAuto,
      item.name,
      item.unit,
      item.qty
    ]);
  });

  return aoa;
}

// Построение AOA для спецификаций
export function buildSpecsAggregates(ivptEnabled) {
  const { perSectionData, overallData } = computeSpecsAggregates(sections, ivptEnabled);

  const perSectionAOA = [['Корпус', 'Позиция', 'Ед.', 'Количество']];
  perSectionData.forEach(item => {
    perSectionAOA.push([`Корпус ${item.sectionIndex + 1}`, item.name, item.unit, item.qty]);
  });

  const overallAOA = [['Позиция', 'Ед.', 'Количество']];
  overallData.forEach(item => {
    overallAOA.push([item.name, item.unit, item.qty]);
  });

  return { perSectionAOA, overallAOA };
}

// Построение AOA для суммарных стояков
export function buildRisersOverallAOA(h1, hn) {
  const risersOverall = computeRisersOverall(sections, h1, hn);

  const aoa = [['Система — Диаметр', 'Стояков, шт', 'Длина, м']];
  risersOverall.forEach(item => {
    aoa.push([`${item.sys} — ${item.dia} мм`, item.count, item.len]);
  });

  return aoa;
}

// Санитизация имени файла
function sanitizeFileName(name) {
  return (name || 'project')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

// Экспорт в Excel
export function exportToExcel(calculateFn, getHeights, projectName) {
  try {
    // Пересчёт перед экспортом
    calculateFn();

    const { h1, hn } = getHeights();
    const ivptEnabled = document.getElementById('ivptEnabled')?.checked === true;

    const wb = XLSX.utils.book_new();

    // Лист 1: Результаты по этажам
    const ws1 = XLSX.utils.aoa_to_sheet(tableToAOA(document.getElementById('waterSupplyTable')));
    XLSX.utils.book_append_sheet(wb, ws1, 'Результаты по этажам');

    // Лист 2: Сводка по зонам
    const ws2 = XLSX.utils.aoa_to_sheet(tableToAOA(document.getElementById('zonesSummary')));
    XLSX.utils.book_append_sheet(wb, ws2, 'Сводка по зонам');

    // Лист 3: Стояки по системам и DN
    const ws3 = XLSX.utils.aoa_to_sheet(tableToAOA(document.getElementById('riserByD')));
    XLSX.utils.book_append_sheet(wb, ws3, 'Стояки по системам и DN');

    // Лист 4: Итоги по альбомам КУУ
    const ws4 = XLSX.utils.aoa_to_sheet(tableToAOA(document.getElementById('albumSummary')));
    XLSX.utils.book_append_sheet(wb, ws4, 'Итоги по альбомам КУУ');

    // Лист 5: KUU (BOM) построчно
    const ws5 = XLSX.utils.aoa_to_sheet(buildBomAOA(ivptEnabled));
    XLSX.utils.book_append_sheet(wb, ws5, 'KUU (BOM) построчно');

    // Лист 6 и 7: Спецификации
    const { perSectionAOA, overallAOA } = buildSpecsAggregates(ivptEnabled);
    const ws6 = XLSX.utils.aoa_to_sheet(perSectionAOA);
    XLSX.utils.book_append_sheet(wb, ws6, 'Спецификация по корпусам');

    const ws7 = XLSX.utils.aoa_to_sheet(overallAOA);
    XLSX.utils.book_append_sheet(wb, ws7, 'Спецификация общая');

    // Лист 8: Стояки суммарно
    const ws8 = XLSX.utils.aoa_to_sheet(buildRisersOverallAOA(h1, hn));
    XLSX.utils.book_append_sheet(wb, ws8, 'Стояки суммарно');

    // Формируем имя файла с названием проекта
    const fileName = `vodosnab_${sanitizeFileName(projectName)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  } catch (e) {
    alert('Ошибка экспорта в Excel: ' + (e?.message || e));
    console.error(e);
  }
}
