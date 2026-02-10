// Модуль сметы - агрегация данных из Трубопроводов и Арматуры

import { REAL_DN, STEEL_ZN_CLAMPS_RULES, PPR_FITTINGS_RULES } from './constants.js';
import { computeMopPexLengthsForSection } from './calculations.js';

// ============================================================================

/**
 * Округление количества хомутов
 * Стратегия: округление до целого вверх (Math.ceil)
 * @param {number} value - расчётное количество хомутов
 * @returns {number} - округлённое количество
 */
function roundClampQuantity(value) {
  if (value <= 0) return 0;
  return Math.ceil(value);
}

/**
 * Округление количества фитингов PP-R
 * Стратегия: округление до целого вверх (Math.ceil)
 * @param {number} value - расчётное количество фитингов
 * @returns {number} - округлённое количество
 */
function roundPprFittingsQuantity(value) {
  if (value <= 0) return 0;
  return Math.ceil(value);
}

// Маппинг кодов систем в сметные наименования
const SYSTEM_NAME_MAP = {
  'V1': 'Холодное водоснабжение',
  'T3': 'Горячее водоснабжение',
  'T4': 'Горячее водоснабжение', // Объединяем с Т3
};

// Обратный маппинг для группировки
const ESTIMATE_SYSTEM_KEY = {
  'V1': 'cold',    // ХВС
  'T3': 'hot',     // ГВС (объединённая)
  'T4': 'hot',     // Рециркуляция -> в ГВС
};

// Человекочитаемые названия для сметных систем
const ESTIMATE_SYSTEM_NAMES = {
  'cold': 'Система холодного водоснабжения В1',
  'hot': 'Система горячего водоснабжения Т3, Т4',
};

/**
 * Получает сметный ключ системы
 */
function getEstimateSystemKey(systemCode) {
  return ESTIMATE_SYSTEM_KEY[systemCode] || systemCode;
}

/**
 * Форматирует диаметр трубы
 */
function formatDiameter(dia, material = 'steel') {
  if (material === 'ppr') {
    return `Ø${dia}`;
  }
  return `Ду ${dia}`;
}

/**
 * Форматирует количество
 */
function formatQuantity(qty) {
  if (typeof qty !== 'number') return qty;
  return qty % 1 === 0 ? qty : qty.toFixed(1);
}

// ============================================================================
// СОРТИРОВКА СМЕТЫ
// ============================================================================

/**
 * Извлекает диаметр из наименования работы/материала.
 * Ищет паттерны: "Ду 15", "Ду15", "Ø20", "до 50мм", "до 100 мм"
 * @param {string} name - наименование
 * @returns {number|null} - диаметр в мм или null
 */
function extractDiameterFromName(name) {
  if (!name) return null;
  // Паттерны: "Ду 15", "Ду15", "Ø20", ": Ду 25"
  const m = name.match(/(?:Ду\s*|Ø|:\s*Ду\s*)(\d+)/i);
  if (m) return Number(m[1]);
  // Паттерн: "до 50мм", "до 100 мм"
  const m2 = name.match(/до\s*(\d+)\s*мм/i);
  if (m2) return Number(m2[1]);
  return null;
}

/**
 * Извлекает диаметр из sortKey (например 'steel-25' -> 25, 'pex-20' -> 20)
 * @param {string} sortKey - ключ сортировки
 * @returns {number|null} - диаметр в мм или null
 */
function extractDiameterFromSortKey(sortKey) {
  if (!sortKey) return null;
  const m = sortKey.match(/^(?:steel|pex)-(\d+)$/);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Возвращает приоритет сортировки для работы.
 * Чем меньше число, тем раньше в списке.
 *
 * ПОРЯДОК РАБОТ:
 * 1. Монтаж трубопроводов из стальных оцинкованных труб
 * 2. Монтаж разводящих трубопроводов из сшитого полиэтилена
 * 3. Теплоизоляция трубопровода цилиндрами из вспененного полиэтилена
 * 4. Монтаж гильз
 * 5. Монтаж узла концевого
 * 6. Установка счётчиков воды Ду 15
 * 7. Монтаж коллектора (распределительной гребенки)
 * 8. Монтаж водомерного узла (Аренда)
 * 9. Установка устройств внутриквартирного пожаротушения
 * 10. Установка кранов шаровых Ду 15 (ИВПТ)
 * 11. Монтаж компенсатора сильфонного диаметром до 50мм
 * 12. Монтаж компенсатора сильфонного диаметром до 100мм
 * 13. Монтаж неподвижных опор
 * 14. Пусконаладочные работы (всегда в самом низу)
 *
 * Чтобы добавить новый тип работы:
 * 1. Добавьте новый if-блок с нужным приоритетом
 * 2. Сдвиньте приоритеты последующих работ, если нужно вставить в середину
 *
 * @param {Object} row - строка сметы
 * @returns {number} - приоритет (1-999)
 */
function getWorkOrderPriority(row) {
  if (row.type !== 'работа') return 999; // материалы обрабатываются отдельно

  const name = row.name || '';

  // 1. Стальные оцинкованные трубы
  if (name.startsWith('Монтаж трубопроводов из стальных оцинкованных труб')) {
    return 1;
  }
  // 2. Сшитый полиэтилен
  if (name.startsWith('Монтаж разводящих трубопроводов из сшитого полиэтилена')) {
    return 2;
  }
  // 3. Теплоизоляция
  if (name.startsWith('Теплоизоляция трубопровода')) {
    return 3;
  }
  // 4. Гильзы
  if (name.startsWith('Монтаж гильз')) {
    return 4;
  }
  // 5. Узел концевой
  if (name.startsWith('Монтаж узла концевого')) {
    return 5;
  }
  // 6. Счётчики воды
  if (name.startsWith('Установка счётчиков воды')) {
    return 6;
  }
  // 7. Коллектор
  if (name.startsWith('Монтаж коллектора')) {
    return 7;
  }
  // 8. Водомерный узел (Аренда)
  if (name.startsWith('Монтаж водомерного узла')) {
    return 8;
  }
  // 9. ИВПТ - устройства
  if (name.startsWith('Установка устройств внутриквартирного пожаротушения')) {
    return 9;
  }
  // 10. ИВПТ - краны
  if (name.startsWith('Установка кранов шаровых') && name.includes('ИВПТ')) {
    return 10;
  }
  // 11. Компенсатор до 50мм
  if (name.startsWith('Монтаж компенсатора сильфонного диаметром до 50')) {
    return 11;
  }
  // 12. Компенсатор до 100мм
  if (name.startsWith('Монтаж компенсатора сильфонного диаметром до 100')) {
    return 12;
  }
  // 13. Неподвижные опоры
  if (name.startsWith('Монтаж неподвижных опор')) {
    return 13;
  }
  // 14. Пусконаладочные работы (всегда в самом низу)
  if (name.startsWith('Пусконаладочные работы')) {
    return 14;
  }

  return 900; // прочие работы
}

/**
 * Сортирует массив строк сметы в правильном порядке.
 *
 * Логика:
 * 1. Работы сортируются по приоритету (getWorkOrderPriority)
 * 2. Для стальных труб и сшитого полиэтилена — дополнительно по диаметру (от меньшего к большему)
 * 3. Материалы следуют сразу за своей работой (по sortKey + sortOrder)
 *
 * @param {Array} items - массив строк сметы
 * @returns {Array} - отсортированный массив
 */
function sortEstimateItems(items) {
  // Группируем items по sortKey, чтобы работа и её материалы шли вместе
  const groups = new Map();

  items.forEach(item => {
    const key = item.sortKey || 'zzz-unknown';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  });

  // Сортируем items внутри каждой группы по sortOrder
  groups.forEach(groupItems => {
    groupItems.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  });

  // Определяем приоритет и диаметр для каждой группы (по первой работе в группе)
  const groupInfos = [];
  groups.forEach((groupItems, key) => {
    const workItem = groupItems.find(i => i.type === 'работа') || groupItems[0];
    const priority = getWorkOrderPriority(workItem);
    // Диаметр из sortKey или из названия
    const diameter = extractDiameterFromSortKey(key) || extractDiameterFromName(workItem.name) || 0;

    groupInfos.push({
      key,
      priority,
      diameter,
      items: groupItems,
    });
  });

  // Сортируем группы
  groupInfos.sort((a, b) => {
    // Сначала по приоритету работы
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Для трубопроводов (приоритет 1 и 2) — по диаметру
    if (a.priority <= 2 && a.diameter !== b.diameter) {
      return a.diameter - b.diameter;
    }
    // Для теплоизоляции (приоритет 3) — материалы по диаметру
    if (a.priority === 3 && a.diameter !== b.diameter) {
      return a.diameter - b.diameter;
    }
    // Иначе — по ключу (для стабильности)
    return a.key.localeCompare(b.key);
  });

  // Собираем результат
  const result = [];
  groupInfos.forEach(info => {
    result.push(...info.items);
  });

  return result;
}

/**
 * Агрегирует данные для сметы из результатов расчёта
 * Новая структура: единый массив items с полем type
 */
export function aggregateEstimateData({ zonesData, risersByDiameter, sections, h1, hn, ivptEnabled, collectorVendor }) {
  console.log('[Смета] aggregateEstimateData вызван');
  console.log('[Смета] zonesData:', zonesData?.length || 0, 'зон');
  console.log('[Смета] sections:', sections?.length || 0, 'корпусов');
  console.log('[Смета] risersByDiameter:', risersByDiameter?.length || 0, 'записей');

  // Структура результата: { [sectionIndex]: { cold: { items: [] }, hot: { items: [] } } }
  const estimateData = {};

  // Инициализация структуры для каждого корпуса
  sections.forEach((_, sectionIndex) => {
    estimateData[sectionIndex] = {
      cold: { items: [] },
      hot: { items: [] },
    };
  });

  // === 1. Стальные трубы: работа + материал парами ===
  if (risersByDiameter && risersByDiameter.length > 0) {
    // Группируем по корпусу, системе и диаметру для консолидации
    const steelPipesMap = new Map();

    risersByDiameter.forEach(item => {
      const { sectionIndex, sys, dia, len } = item;
      const estimateKey = getEstimateSystemKey(sys);
      const mapKey = `${sectionIndex}-${estimateKey}-${dia}`;

      if (steelPipesMap.has(mapKey)) {
        steelPipesMap.get(mapKey).len += len;
      } else {
        steelPipesMap.set(mapKey, { sectionIndex, estimateKey, dia, len });
      }
    });

    // Добавляем пары работа + материал
    steelPipesMap.forEach(({ sectionIndex, estimateKey, dia, len }) => {
      if (estimateData[sectionIndex] && estimateData[sectionIndex][estimateKey]) {
        // Работа по монтажу
        estimateData[sectionIndex][estimateKey].items.push({
          type: 'работа',
          name: `Монтаж трубопроводов из стальных оцинкованных труб и запорно-регулировочной арматуры: ${formatDiameter(dia)}`,
          unit: 'м',
          quantity: len,
          sortKey: `steel-${dia}`,
          sortOrder: 1,
        });

        // Материал
        estimateData[sectionIndex][estimateKey].items.push({
          type: 'материал',
          name: `Труба стальная ВГП ${formatDiameter(dia)}`,
          unit: 'м',
          quantity: len,
          sortKey: `steel-${dia}`,
          sortOrder: 2,
        });

        // Хомут для стальной оцинкованной трубы
        const clampRule = STEEL_ZN_CLAMPS_RULES[dia];
        if (clampRule && len > 0) {
          const clampQty = roundClampQuantity(len * clampRule.norm);
          if (clampQty > 0) {
            estimateData[sectionIndex][estimateKey].items.push({
              type: 'материал',
              name: clampRule.name,
              unit: 'шт',
              quantity: clampQty,
              sortKey: `steel-${dia}`,
              sortOrder: 3,
            });
          }
        }
      }
    });
  }

  // === 2. Трубы PP-R (сшитый полиэтилен): работа + материал по системам ===
  // V1 -> ХВС (cold), T3 -> ГВС (hot)
  sections.forEach((section, sectionIndex) => {
    const mopResult = computeMopPexLengthsForSection(section);
    const dn = section.mop?.dn || 20;

    // ХВС (система В1)
    if (mopResult.lengthV1 > 0) {
      // Работа по монтажу PP-R для ХВС
      estimateData[sectionIndex].cold.items.push({
        type: 'работа',
        name: `Монтаж разводящих трубопроводов из сшитого полиэтилена Ду ${dn} мм (включая фитинги)`,
        unit: 'м',
        quantity: Math.round(mopResult.lengthV1 * 10) / 10,
        sortKey: `pex-${dn}`,
        sortOrder: 1,
        systemCode: 'V1',
        systemName: SYSTEM_NAME_MAP['V1'],
      });

      // Материал PP-R для ХВС
      estimateData[sectionIndex].cold.items.push({
        type: 'материал',
        name: `Труба из сшитого полиэтилена Ду ${dn} мм`,
        unit: 'м',
        quantity: Math.round(mopResult.lengthV1 * 10) / 10,
        sortKey: `pex-${dn}`,
        sortOrder: 2,
        systemCode: 'V1',
        systemName: SYSTEM_NAME_MAP['V1'],
      });

      // Фитинги PP-R для ХВС
      const fittingsV1 = PPR_FITTINGS_RULES[dn];
      if (fittingsV1 && mopResult.lengthV1 > 0) {
        let fittingSortOrder = 3;
        fittingsV1.forEach(f => {
          const rawQty = mopResult.lengthV1 * f.norm;
          const qty = roundPprFittingsQuantity(rawQty);
          if (qty > 0) {
            estimateData[sectionIndex].cold.items.push({
              type: 'материал',
              name: f.name,
              unit: f.unit,
              quantity: qty,
              sortKey: `pex-${dn}`,
              sortOrder: fittingSortOrder++,
              systemCode: 'V1',
              systemName: SYSTEM_NAME_MAP['V1'],
            });
          }
        });
      }
    }

    // ГВС (система Т3)
    if (mopResult.lengthT3 > 0) {
      // Работа по монтажу PP-R для ГВС
      estimateData[sectionIndex].hot.items.push({
        type: 'работа',
        name: `Монтаж разводящих трубопроводов из сшитого полиэтилена Ду ${dn} мм (включая фитинги)`,
        unit: 'м',
        quantity: Math.round(mopResult.lengthT3 * 10) / 10,
        sortKey: `pex-${dn}`,
        sortOrder: 1,
        systemCode: 'T3',
        systemName: SYSTEM_NAME_MAP['T3'],
      });

      // Материал PP-R для ГВС
      estimateData[sectionIndex].hot.items.push({
        type: 'материал',
        name: `Труба из сшитого полиэтилена Ду ${dn} мм`,
        unit: 'м',
        quantity: Math.round(mopResult.lengthT3 * 10) / 10,
        sortKey: `pex-${dn}`,
        sortOrder: 2,
        systemCode: 'T3',
        systemName: SYSTEM_NAME_MAP['T3'],
      });

      // Фитинги PP-R для ГВС
      const fittingsT3 = PPR_FITTINGS_RULES[dn];
      if (fittingsT3 && mopResult.lengthT3 > 0) {
        let fittingSortOrder = 3;
        fittingsT3.forEach(f => {
          const rawQty = mopResult.lengthT3 * f.norm;
          const qty = roundPprFittingsQuantity(rawQty);
          if (qty > 0) {
            estimateData[sectionIndex].hot.items.push({
              type: 'материал',
              name: f.name,
              unit: f.unit,
              quantity: qty,
              sortKey: `pex-${dn}`,
              sortOrder: fittingSortOrder++,
              systemCode: 'T3',
              systemName: SYSTEM_NAME_MAP['T3'],
            });
          }
        });
      }
    }
  });

  // === 3. Теплоизоляция трубопровода ===
  // Структура аналогична гильзам: одна работа + материалы по диаметрам
  // В1 → ХВС (cold), Т3+Т4 объединяются → ГВС (hot)
  // ВАЖНО: учитываем и стальные трубы (стояки), и PP-R (МОП)
  {
    // Собираем данные: по корпусу и системе — общая длина и детализация по диаметрам
    const insulationData = new Map(); // key: "sectionIndex-estimateKey" -> { total, byDia: { dia: len } }

    // Вспомогательная функция для добавления данных
    const addInsulationData = (sectionIndex, estimateKey, dia, len) => {
      const mapKey = `${sectionIndex}-${estimateKey}`;

      if (!insulationData.has(mapKey)) {
        insulationData.set(mapKey, {
          sectionIndex,
          estimateKey,
          total: 0,
          byDia: {},
        });
      }

      const data = insulationData.get(mapKey);
      data.total += len;

      if (!data.byDia[dia]) {
        data.byDia[dia] = 0;
      }
      data.byDia[dia] += len;
    };

    // 3.1. Стальные трубы (стояки) из risersByDiameter
    if (risersByDiameter && risersByDiameter.length > 0) {
      risersByDiameter.forEach(item => {
        const { sectionIndex, sys, dia, len } = item;
        const estimateKey = getEstimateSystemKey(sys);
        addInsulationData(sectionIndex, estimateKey, dia, len);
      });
    }

    // 3.2. Трубы PP-R (сшитый полиэтилен) из МОП
    // V1 → cold, T3 → hot
    sections.forEach((section, sectionIndex) => {
      const mopResult = computeMopPexLengthsForSection(section);
      const dn = section.mop?.dn || 20; // диаметр PP-R трубы

      // ХВС (В1)
      if (mopResult.lengthV1 > 0) {
        addInsulationData(sectionIndex, 'cold', dn, mopResult.lengthV1);
      }

      // ГВС (Т3)
      if (mopResult.lengthT3 > 0) {
        addInsulationData(sectionIndex, 'hot', dn, mopResult.lengthT3);
      }
    });

    // Формируем сметные записи
    insulationData.forEach(({ sectionIndex, estimateKey, total, byDia }) => {
      if (estimateData[sectionIndex] && estimateData[sectionIndex][estimateKey]) {
        const systemName = ESTIMATE_SYSTEM_NAMES[estimateKey];

        // Работа: одна строка «Теплоизоляция трубопровода...» с общей длиной
        estimateData[sectionIndex][estimateKey].items.push({
          type: 'работа',
          name: 'Теплоизоляция трубопровода цилиндрами из вспененного полиэтилена (каучука) до Дн 100 мм',
          unit: 'м',
          quantity: Math.round(total * 10) / 10,
          sortKey: 'insulation', // единый ключ для группировки
          sortOrder: 1,          // работа первая
          systemName,
        });

        // Материалы: отдельная строка для каждого диаметра
        const diameters = Object.keys(byDia).map(Number).sort((a, b) => a - b);
        diameters.forEach(dia => {
          estimateData[sectionIndex][estimateKey].items.push({
            type: 'материал',
            name: `Цилиндр из вспененного полиэтилена (каучука) Дн ${dia} мм`,
            unit: 'м',
            quantity: Math.round(byDia[dia] * 10) / 10,
            sortKey: 'insulation', // тот же ключ, что и у работы
            sortOrder: 100 + dia,  // материалы после работы, отсортированы по диаметру
            systemName,
          });
        });
      }
    });
  }

  // === 4. Монтаж гильз (данные из блока «Монтаж гильз») ===
  // В1 → ХВС (cold), Т3+Т4 объединяются → ГВС (hot)
  // Работа — одна строка «Монтаж гильз», материалы — отдельно по диаметрам
  if (zonesData && zonesData.length > 0) {
    // Собираем данные: по корпусу и системе — общее кол-во и детализация по диаметрам
    const sleevesData = new Map(); // key: "sectionIndex-estimateKey" -> { total, byDia: { dia: qty } }

    zonesData.forEach(zone => {
      const { sectionIndex, risersPerSection, from, to, d } = zone;
      const floorsInZone = to - from + 1;
      const sleevesPerZone = risersPerSection * floorsInZone;

      ['V1', 'T3', 'T4'].forEach(sys => {
        const pipeDia = d[sys];
        if (!pipeDia) return;

        const pipeIndex = REAL_DN.indexOf(pipeDia);
        const sleeveIndex = Math.min(pipeIndex + 2, REAL_DN.length - 1);
        const sleeveDia = REAL_DN[sleeveIndex];
        // Используем стандартный маппинг: V1→cold, T3/T4→hot
        const estimateKey = getEstimateSystemKey(sys);
        const mapKey = `${sectionIndex}-${estimateKey}`;

        if (!sleevesData.has(mapKey)) {
          sleevesData.set(mapKey, {
            sectionIndex,
            estimateKey,
            total: 0,
            byDia: {},
          });
        }

        const data = sleevesData.get(mapKey);
        data.total += sleevesPerZone;

        if (!data.byDia[sleeveDia]) {
          data.byDia[sleeveDia] = 0;
        }
        data.byDia[sleeveDia] += sleevesPerZone;
      });
    });

    // Формируем сметные записи
    sleevesData.forEach(({ sectionIndex, estimateKey, total, byDia }) => {
      if (estimateData[sectionIndex] && estimateData[sectionIndex][estimateKey]) {
        const systemName = ESTIMATE_SYSTEM_NAMES[estimateKey];

        // Работа: одна строка «Монтаж гильз» с общим количеством
        // sortKey единый для всей группы гильз, sortOrder=1 для работы
        estimateData[sectionIndex][estimateKey].items.push({
          type: 'работа',
          name: 'Монтаж гильз',
          unit: 'шт',
          quantity: total,
          sortKey: 'zz-sleeve', // zz- чтобы гильзы шли после труб (pex, steel)
          sortOrder: 1,         // работа первая
          systemName,
        });

        // Материалы: отдельная строка для каждого диаметра
        // sortOrder = 100 + dia, чтобы материалы шли после работы и были отсортированы по диаметру
        const diameters = Object.keys(byDia).map(Number).sort((a, b) => a - b);
        diameters.forEach(dia => {
          estimateData[sectionIndex][estimateKey].items.push({
            type: 'материал',
            name: `Гильза стальная ${formatDiameter(dia)}`,
            unit: 'шт',
            quantity: byDia[dia],
            sortKey: 'zz-sleeve', // тот же ключ, что и у работы
            sortOrder: 100 + dia, // материалы после работы, отсортированы по диаметру
            systemName,
          });
        });
      }
    });
  }

  // === 5. Компенсаторы (только ГВС) ===
  // Структура: 2 группы работ по диаметру (до 50мм и до 100мм) + материалы по диаметрам
  if (zonesData && zonesData.length > 0) {
    // Собираем данные по корпусам: { sectionIndex: { smallDn: { dia: qty }, bigDn: { dia: qty } } }
    const compensatorsData = new Map();

    zonesData.forEach(zone => {
      const { sectionIndex, risersPerSection, lenOneRiser, d } = zone;

      ['T3', 'T4'].forEach(sys => {
        const dia = d[sys];
        if (!dia) return;

        let step = 25;
        if (dia > 25 && dia <= 40) step = 30;
        if (dia > 40) step = 35;

        const compensatorsPerRiser = Math.floor(lenOneRiser / step);
        const totalCompensators = compensatorsPerRiser * risersPerSection;

        if (totalCompensators > 0) {
          if (!compensatorsData.has(sectionIndex)) {
            compensatorsData.set(sectionIndex, {
              smallDn: {},  // Ду ≤ 50
              bigDn: {},    // Ду > 50
            });
          }
          const data = compensatorsData.get(sectionIndex);

          // Разделяем по размеру диаметра
          const targetGroup = dia <= 50 ? data.smallDn : data.bigDn;
          if (!targetGroup[dia]) {
            targetGroup[dia] = 0;
          }
          targetGroup[dia] += totalCompensators;
        }
      });
    });

    // Формируем сметные записи
    compensatorsData.forEach(({ smallDn, bigDn }, sectionIndex) => {
      // === Группа 1: Компенсаторы Ду ≤ 50 ===
      const smallDiameters = Object.keys(smallDn).map(Number).sort((a, b) => a - b);
      if (smallDiameters.length > 0) {
        const totalSmall = smallDiameters.reduce((sum, dia) => sum + smallDn[dia], 0);

        // Работа: Монтаж компенсатора сильфонного диаметром до 50мм
        estimateData[sectionIndex].hot.items.push({
          type: 'работа',
          name: 'Монтаж компенсатора сильфонного диаметром до 50мм',
          unit: 'шт',
          quantity: totalSmall,
          sortKey: 'compensator-small',
          sortOrder: 1,
        });

        // Материалы по диаметрам
        smallDiameters.forEach(dia => {
          estimateData[sectionIndex].hot.items.push({
            type: 'материал',
            name: `Компенсатор сильфонный ${formatDiameter(dia)}`,
            unit: 'шт',
            quantity: smallDn[dia],
            sortKey: 'compensator-small',
            sortOrder: 100 + dia,
          });
        });
      }

      // === Группа 2: Компенсаторы Ду > 50 ===
      const bigDiameters = Object.keys(bigDn).map(Number).sort((a, b) => a - b);
      if (bigDiameters.length > 0) {
        const totalBig = bigDiameters.reduce((sum, dia) => sum + bigDn[dia], 0);

        // Работа: Монтаж компенсатора сильфонного диаметром до 100мм
        estimateData[sectionIndex].hot.items.push({
          type: 'работа',
          name: 'Монтаж компенсатора сильфонного диаметром до 100мм',
          unit: 'шт',
          quantity: totalBig,
          sortKey: 'compensator-big',
          sortOrder: 1,
        });

        // Материалы по диаметрам
        bigDiameters.forEach(dia => {
          estimateData[sectionIndex].hot.items.push({
            type: 'материал',
            name: `Компенсатор сильфонный ${formatDiameter(dia)}`,
            unit: 'шт',
            quantity: bigDn[dia],
            sortKey: 'compensator-big',
            sortOrder: 100 + dia,
          });
        });
      }
    });
  }

  // === 5.1. Неподвижные опоры (только ГВС) ===
  // Структура: 1 работа «Монтаж неподвижных опор» + материалы по диаметрам
  if (zonesData && zonesData.length > 0) {
    // Собираем данные по корпусам: { sectionIndex: { total: N, byDia: { dia: qty } } }
    const supportsData = new Map();

    zonesData.forEach(zone => {
      const { sectionIndex, risersPerSection, lenOneRiser, d } = zone;

      ['T3', 'T4'].forEach(sys => {
        const dia = d[sys];
        if (!dia) return;

        let step = 25;
        if (dia > 25 && dia <= 40) step = 30;
        if (dia > 40) step = 35;

        const compensatorsPerRiser = Math.floor(lenOneRiser / step);
        const supportsQty = compensatorsPerRiser * risersPerSection * 2; // 2 опоры на компенсатор

        if (supportsQty > 0) {
          if (!supportsData.has(sectionIndex)) {
            supportsData.set(sectionIndex, { total: 0, byDia: {} });
          }
          const data = supportsData.get(sectionIndex);
          data.total += supportsQty;

          if (!data.byDia[dia]) {
            data.byDia[dia] = 0;
          }
          data.byDia[dia] += supportsQty;
        }
      });
    });

    // Формируем сметные записи
    supportsData.forEach(({ total, byDia }, sectionIndex) => {
      // Работа: одна строка «Монтаж неподвижных опор» с общим количеством
      estimateData[sectionIndex].hot.items.push({
        type: 'работа',
        name: 'Монтаж неподвижных опор',
        unit: 'шт',
        quantity: total,
        sortKey: 'support', // единый ключ для группировки
        sortOrder: 1,
      });

      // Материалы: отдельная строка для каждого диаметра
      const diameters = Object.keys(byDia).map(Number).sort((a, b) => a - b);
      diameters.forEach(dia => {
        estimateData[sectionIndex].hot.items.push({
          type: 'материал',
          name: `Опора неподвижная ${formatDiameter(dia)}`,
          unit: 'шт',
          quantity: byDia[dia],
          sortKey: 'support', // тот же ключ, что и у работы
          sortOrder: 100 + dia, // материалы после работы, отсортированы по диаметру
        });
      });
    });
  }

  // === 6. Счётчики воды ===
  sections.forEach((section, sectionIndex) => {
    let apts = 0;
    for (let fl = 2; fl <= section.floors; fl++) {
      apts += section.apts[fl] || 0;
    }
    const rent = section.rent?.enabled ? (section.rent.qty || 0) : 0;
    const totalUnits = apts + rent;

    if (totalUnits > 0) {
      ['cold', 'hot'].forEach(estimateKey => {
        estimateData[sectionIndex][estimateKey].items.push({
          type: 'работа',
          name: 'Установка счётчиков воды Ду 15',
          unit: 'шт',
          quantity: totalUnits,
          sortKey: 'meter-15',
          sortOrder: 1,
        });
        estimateData[sectionIndex][estimateKey].items.push({
          type: 'материал',
          name: 'Счетчик воды Ду 15 универс. крыльчатый одноструйный с цифровым выходом RS485',
          unit: 'шт',
          quantity: totalUnits,
          sortKey: 'meter-15',
          sortOrder: 2,
        });
      });
    }
  });

  // === 6.1. Монтаж водомерного узла (Аренда) ===
  // Позиции арматуры для каждого узла учёта аренды:
  // - Кран шаровый Ду 15
  // - Клапан обратный Ду 15
  // - Фильтр сетчатый косой Ду 15
  // - Регулятор давления Ду 15
  const rentalWaterMeterItems = [
    { name: 'Кран шаровый Ду 15', unit: 'шт' },
    { name: 'Клапан обратный Ду 15', unit: 'шт' },
    { name: 'Фильтр сетчатый косой Ду 15', unit: 'шт' },
    { name: 'Регулятор давления Ду 15', unit: 'шт' },
  ];

  sections.forEach((section, sectionIndex) => {
    const rentQty = section.rent?.enabled ? (section.rent.qty || 0) : 0;

    if (rentQty > 0) {
      // ХВС (cold) — работа + материалы
      estimateData[sectionIndex].cold.items.push({
        type: 'работа',
        name: 'Монтаж водомерного узла (Аренда)',
        unit: 'шт',
        quantity: rentQty,
        sortKey: 'rental-water-meter',
        sortOrder: 1,
      });
      let coldMaterialOrder = 2;
      rentalWaterMeterItems.forEach(item => {
        estimateData[sectionIndex].cold.items.push({
          type: 'материал',
          name: item.name,
          unit: item.unit,
          quantity: rentQty,
          sortKey: 'rental-water-meter',
          sortOrder: coldMaterialOrder++,
        });
      });

      // ГВС (hot) — работа + материалы
      estimateData[sectionIndex].hot.items.push({
        type: 'работа',
        name: 'Монтаж водомерного узла (Аренда)',
        unit: 'шт',
        quantity: rentQty,
        sortKey: 'rental-water-meter',
        sortOrder: 1,
      });
      let hotMaterialOrder = 2;
      rentalWaterMeterItems.forEach(item => {
        estimateData[sectionIndex].hot.items.push({
          type: 'материал',
          name: item.name,
          unit: item.unit,
          quantity: rentQty,
          sortKey: 'rental-water-meter',
          sortOrder: hotMaterialOrder++,
        });
      });
    }
  });

  // === 7. Узлы концевые ===
  // Структура: 1 работа «Монтаж узла концевого» + 2 материала (воздухоотводчик + кран)
  if (zonesData && zonesData.length > 0) {
    const risersBySectionAndSys = {};
    zonesData.forEach(zone => {
      const { sectionIndex, risersPerSection } = zone;
      if (!risersBySectionAndSys[sectionIndex]) {
        risersBySectionAndSys[sectionIndex] = { V1: 0, T3: 0 };
      }
      risersBySectionAndSys[sectionIndex].V1 += risersPerSection;
      risersBySectionAndSys[sectionIndex].T3 += risersPerSection;
    });

    Object.entries(risersBySectionAndSys).forEach(([sectionIndex, counts]) => {
      const idx = parseInt(sectionIndex);

      // ХВС (В1)
      if (counts.V1 > 0) {
        // Работа: Монтаж узла концевого
        estimateData[idx].cold.items.push({
          type: 'работа',
          name: 'Монтаж узла концевого',
          unit: 'шт',
          quantity: counts.V1,
          sortKey: 'endnode',
          sortOrder: 1,
        });
        // Материал: Автоматический воздухоотводчик Ду 15
        estimateData[idx].cold.items.push({
          type: 'материал',
          name: 'Автоматический воздухоотводчик Ду 15',
          unit: 'шт',
          quantity: counts.V1,
          sortKey: 'endnode',
          sortOrder: 2,
        });
        // Материал: Кран шаровый Ду 15
        estimateData[idx].cold.items.push({
          type: 'материал',
          name: 'Кран шаровый Ду 15',
          unit: 'шт',
          quantity: counts.V1,
          sortKey: 'endnode',
          sortOrder: 3,
        });
      }

      // ГВС (Т3 + Т4)
      if (counts.T3 > 0) {
        // Работа: Монтаж узла концевого
        estimateData[idx].hot.items.push({
          type: 'работа',
          name: 'Монтаж узла концевого',
          unit: 'шт',
          quantity: counts.T3,
          sortKey: 'endnode',
          sortOrder: 1,
        });
        // Материал: Автоматический воздухоотводчик Ду 15
        estimateData[idx].hot.items.push({
          type: 'материал',
          name: 'Автоматический воздухоотводчик Ду 15',
          unit: 'шт',
          quantity: counts.T3,
          sortKey: 'endnode',
          sortOrder: 2,
        });
        // Материал: Кран шаровый Ду 15
        estimateData[idx].hot.items.push({
          type: 'материал',
          name: 'Кран шаровый Ду 15',
          unit: 'шт',
          quantity: counts.T3,
          sortKey: 'endnode',
          sortOrder: 3,
        });
      }
    });
  }

  // === 8. ИВПТ ===
  if (ivptEnabled) {
    sections.forEach((section, sectionIndex) => {
      let apts = 0;
      for (let fl = 2; fl <= section.floors; fl++) {
        apts += section.apts[fl] || 0;
      }

      if (apts > 0) {
        estimateData[sectionIndex].cold.items.push({
          type: 'работа',
          name: 'Установка устройств внутриквартирного пожаротушения',
          unit: 'шт',
          quantity: apts,
          sortKey: 'ivpt',
          sortOrder: 1,
        });
        estimateData[sectionIndex].cold.items.push({
          type: 'материал',
          name: 'Устройство внутриквартирного пожаротушения',
          unit: 'шт',
          quantity: apts,
          sortKey: 'ivpt',
          sortOrder: 2,
        });
        estimateData[sectionIndex].cold.items.push({
          type: 'работа',
          name: 'Установка кранов шаровых Ду 15 (ИВПТ)',
          unit: 'шт',
          quantity: apts,
          sortKey: 'ivpt-valve',
          sortOrder: 1,
        });
        estimateData[sectionIndex].cold.items.push({
          type: 'материал',
          name: 'Кран шаровой Ду 15 (ИВПТ)',
          unit: 'шт',
          quantity: apts,
          sortKey: 'ivpt-valve',
          sortOrder: 2,
        });
      }
    });
  }

  // === 9. Монтаж коллектора (распределительной гребенки) ===
  // Логика зависит от выбранного производителя:
  // - Ридан: только ХВС, название "Монтаж коллектора (распределительной гребенки) ХВС/ГВС"
  // - Giacomini: и ХВС, и ГВС (дублирование), название "Монтаж коллектора (распределительной гребенки)"
  if (sections && sections.length > 0) {
    // Считаем количество коллекторов по корпусам с разбивкой по выходам
    // collectorsBySection: Map(sectionIndex -> Map(outlets -> count))
    const collectorsBySection = new Map();

    // Вспомогательная функция для склонения "выход"
    const getOutletsSuffix = (n) => {
      const lastTwo = n % 100;
      if (lastTwo >= 11 && lastTwo <= 19) return 'ов';
      const last = n % 10;
      if (last === 1) return '';
      if (last >= 2 && last <= 4) return 'а';
      return 'ов';
    };

    sections.forEach((sec, si) => {
      if (!sec.zones || sec.zones.length === 0) return;

      const sectionCollectors = new Map(); // outlets -> count

      // Находим максимальный этаж с данными
      const aptsFloors = Object.keys(sec.apts).map(k => parseInt(k, 10)).filter(k => k > 0 && sec.apts[k] > 0);
      const maxFloor = Math.max(sec.floors || 0, ...aptsFloors);

      // Проходим по всем этажам корпуса (со 2-го)
      for (let floor = 2; floor <= maxFloor; floor++) {
        const aptsOnFloor = sec.apts[floor] || 0;
        if (aptsOnFloor <= 0) continue;

        // Находим зону, которая покрывает этот этаж
        let zone = null;
        let prevTo = 1;
        for (const z of sec.zones) {
          if (floor >= prevTo + 1 && floor <= z.to) {
            zone = z;
            break;
          }
          prevTo = z.to;
        }
        if (!zone) continue;

        const risers = Math.max(1, +zone.risers || 1);

        // Распределяем квартиры по стоякам (коллекторам)
        const base = Math.floor(aptsOnFloor / risers);
        const rem = aptsOnFloor % risers;

        for (let i = 0; i < risers; i++) {
          const outlets = i < rem ? base + 1 : base;
          if (outlets <= 0) continue;
          // Минимум 2 выхода на коллектор
          const actualOutlets = Math.max(2, outlets);
          sectionCollectors.set(actualOutlets, (sectionCollectors.get(actualOutlets) || 0) + 1);
        }
      }

      if (sectionCollectors.size > 0) {
        collectorsBySection.set(si, sectionCollectors);
      }
    });

    // Формируем сметные записи в зависимости от производителя
    collectorsBySection.forEach((sectionCollectors, sectionIndex) => {
      // Считаем общее количество коллекторов в корпусе
      let totalCollectors = 0;
      sectionCollectors.forEach(count => { totalCollectors += count; });

      // Сортируем выходы для единообразного порядка материалов
      const sortedOutlets = Array.from(sectionCollectors.keys()).sort((a, b) => a - b);

      // Позиции запорно-регулирующей арматуры обвязки коллекторов
      const collectorBindingItems = [
        { name: 'Кран шаровый Ду 32', unit: 'шт' },
        { name: 'Кран шаровый Ду 15', unit: 'шт' },
        { name: 'Фильтр сетчатый косой Ду 32', unit: 'шт' },
        { name: 'Регулятор давления Ду 32', unit: 'шт' },
        { name: 'Манометр', unit: 'шт' },
        { name: 'Кран сливной Ду 15', unit: 'шт' },
      ];

      if (collectorVendor === 'Ридан') {
        // Ридан: только ХВС с названием "ХВС/ГВС"
        // Работа
        estimateData[sectionIndex].cold.items.push({
          type: 'работа',
          name: 'Монтаж коллектора (распределительной гребенки) ХВС/ГВС',
          unit: 'шт',
          quantity: totalCollectors,
          sortKey: 'collector',
          sortOrder: 1,
        });
        // Материалы - коллекторы по количеству выходов
        // sortOrder = 100 + outlets для корректной сортировки по числу выходов при агрегации
        sortedOutlets.forEach(outlets => {
          const count = sectionCollectors.get(outlets);
          estimateData[sectionIndex].cold.items.push({
            type: 'материал',
            name: `Коллектор на ${outlets} выход${getOutletsSuffix(outlets)}`,
            unit: 'шт',
            quantity: count,
            sortKey: 'collector',
            sortOrder: 100 + outlets, // сортировка по числу выходов
          });
        });
        // Материалы обвязки коллекторов (только ХВС для Ридан)
        // sortOrder = 500+ для размещения после всех коллекторов
        let bindingOrder = 500;
        collectorBindingItems.forEach(item => {
          estimateData[sectionIndex].cold.items.push({
            type: 'материал',
            name: item.name,
            unit: item.unit,
            quantity: totalCollectors,
            sortKey: 'collector',
            sortOrder: bindingOrder++,
          });
        });
      } else {
        // Giacomini (или другой): и ХВС, и ГВС
        // ХВС - работа
        estimateData[sectionIndex].cold.items.push({
          type: 'работа',
          name: 'Монтаж коллектора (распределительной гребенки)',
          unit: 'шт',
          quantity: totalCollectors,
          sortKey: 'collector',
          sortOrder: 1,
        });
        // ХВС - материалы (коллекторы)
        // sortOrder = 100 + outlets для корректной сортировки по числу выходов при агрегации
        sortedOutlets.forEach(outlets => {
          const count = sectionCollectors.get(outlets);
          estimateData[sectionIndex].cold.items.push({
            type: 'материал',
            name: `Коллектор на ${outlets} выход${getOutletsSuffix(outlets)}`,
            unit: 'шт',
            quantity: count,
            sortKey: 'collector',
            sortOrder: 100 + outlets, // сортировка по числу выходов
          });
        });
        // ХВС - материалы обвязки коллекторов
        // sortOrder = 500+ для размещения после всех коллекторов
        let coldBindingOrder = 500;
        collectorBindingItems.forEach(item => {
          estimateData[sectionIndex].cold.items.push({
            type: 'материал',
            name: item.name,
            unit: item.unit,
            quantity: totalCollectors,
            sortKey: 'collector',
            sortOrder: coldBindingOrder++,
          });
        });

        // ГВС - работа (дублирование)
        estimateData[sectionIndex].hot.items.push({
          type: 'работа',
          name: 'Монтаж коллектора (распределительной гребенки)',
          unit: 'шт',
          quantity: totalCollectors,
          sortKey: 'collector',
          sortOrder: 1,
        });
        // ГВС - материалы (коллекторы)
        // sortOrder = 100 + outlets для корректной сортировки по числу выходов при агрегации
        sortedOutlets.forEach(outlets => {
          const count = sectionCollectors.get(outlets);
          estimateData[sectionIndex].hot.items.push({
            type: 'материал',
            name: `Коллектор на ${outlets} выход${getOutletsSuffix(outlets)}`,
            unit: 'шт',
            quantity: count,
            sortKey: 'collector',
            sortOrder: 100 + outlets, // сортировка по числу выходов
          });
        });
        // ГВС - материалы обвязки коллекторов (дублирование)
        // sortOrder = 500+ для размещения после всех коллекторов
        let hotBindingOrder = 500;
        collectorBindingItems.forEach(item => {
          estimateData[sectionIndex].hot.items.push({
            type: 'материал',
            name: item.name,
            unit: item.unit,
            quantity: totalCollectors,
            sortKey: 'collector',
            sortOrder: hotBindingOrder++,
          });
        });
      }
    });
  }

  // === 10. Пусконаладочные работы ===
  // Количество = длина из теплоизоляции (стальные трубы + PP-R)
  // Добавляется в конец списка работ для каждой системы
  Object.keys(estimateData).forEach(sectionIndex => {
    ['cold', 'hot'].forEach(systemKey => {
      const items = estimateData[sectionIndex][systemKey].items;

      // Находим работу "Теплоизоляция..." и берём её quantity
      const insulationWork = items.find(item =>
        item.type === 'работа' &&
        item.name.startsWith('Теплоизоляция трубопровода')
      );

      if (insulationWork && insulationWork.quantity > 0) {
        items.push({
          type: 'работа',
          name: 'Пусконаладочные работы',
          unit: 'м',
          quantity: insulationWork.quantity,
          sortKey: 'zzz-commissioning', // zzz- чтобы был в конце при сортировке по ключу
          sortOrder: 1,
          systemName: ESTIMATE_SYSTEM_NAMES[systemKey],
        });
      }
    });
  });

  // === 11. Сортировка по фиксированному порядку работ ===
  // См. функцию getWorkOrderPriority для порядка работ
  Object.keys(estimateData).forEach(sectionIndex => {
    ['cold', 'hot'].forEach(systemKey => {
      const items = estimateData[sectionIndex][systemKey].items;
      estimateData[sectionIndex][systemKey].items = sortEstimateItems(items);
    });
  });

  console.log('[Смета] aggregateEstimateData завершён');
  console.log('[Смета] Количество корпусов в данных:', Object.keys(estimateData).length);
  Object.keys(estimateData).forEach(si => {
    console.log(`[Смета] Корпус ${si}: cold=${estimateData[si].cold.items.length}, hot=${estimateData[si].hot.items.length}`);
  });

  return estimateData;
}

/**
 * Рассчитывает сводку по всему зданию
 */
export function calculateBuildingSummary(estimateData) {
  const summary = {
    cold: { items: [] },
    hot: { items: [] },
  };

  // Собираем все items по системам
  const itemsMap = {
    cold: new Map(),
    hot: new Map(),
  };

  Object.values(estimateData).forEach(sectionData => {
    ['cold', 'hot'].forEach(systemKey => {
      sectionData[systemKey].items.forEach(item => {
        const key = `${item.type}-${item.name}`;
        const map = itemsMap[systemKey];

        if (map.has(key)) {
          map.get(key).quantity += item.quantity;
        } else {
          map.set(key, { ...item });
        }
      });
    });
  });

  // Конвертируем в массивы и сортируем по фиксированному порядку работ
  ['cold', 'hot'].forEach(systemKey => {
    const items = Array.from(itemsMap[systemKey].values());
    summary[systemKey].items = sortEstimateItems(items);
  });

  return summary;
}

/**
 * Рендерит блок сметы в HTML
 */
export function renderEstimateBlock(estimateData, sectionsCount) {
  console.log('[Смета] renderEstimateBlock вызван, sectionsCount:', sectionsCount);
  console.log('[Смета] estimateData:', estimateData);

  const container = document.getElementById('estimateContent');
  if (!container) {
    console.error('[Смета] Контейнер #estimateContent не найден!');
    return;
  }

  // Проверка на пустые данные
  const hasData = Object.values(estimateData).some(section =>
    section.cold.items.length > 0 || section.hot.items.length > 0
  );

  if (!hasData) {
    container.innerHTML = `
      <div class="placeholder-block">
        <p class="note">Нажмите «Произвести расчёт» для формирования сметы.</p>
      </div>
    `;
    return;
  }

  let html = '';

  // === Блоки по корпусам ===
  for (let sectionIndex = 0; sectionIndex < sectionsCount; sectionIndex++) {
    const sectionData = estimateData[sectionIndex];
    if (!sectionData) continue;

    html += `
      <details class="estimate-section-details">
        <summary class="estimate-section-header">
          <span class="estimate-section-icon"></span>
          Корпус ${sectionIndex + 1}
        </summary>
        <div class="estimate-section-content">
    `;

    // Холодное водоснабжение
    if (sectionData.cold.items.length > 0) {
      html += renderSystemBlock('cold', sectionData.cold);
    }

    // Горячее водоснабжение
    if (sectionData.hot.items.length > 0) {
      html += renderSystemBlock('hot', sectionData.hot);
    }

    html += `
        </div>
      </details>
    `;
  }

  // === Сводка по зданию ===
  if (sectionsCount > 1) {
    const summary = calculateBuildingSummary(estimateData);

    html += `
      <details class="estimate-section-details estimate-summary-details">
        <summary class="estimate-section-header">
          <span class="estimate-section-icon icon-summary"></span>
          Сводка по зданию
        </summary>
        <div class="estimate-section-content">
    `;

    if (summary.cold.items.length > 0) {
      html += renderSystemBlock('cold', summary.cold, true);
    }

    if (summary.hot.items.length > 0) {
      html += renderSystemBlock('hot', summary.hot, true);
    }

    html += `
        </div>
      </details>
    `;
  }

  container.innerHTML = html;
}

/**
 * Рендерит блок системы (ХВС или ГВС) - единая таблица с колонкой "Тип"
 */
function renderSystemBlock(systemKey, data, isSummary = false) {
  const systemName = ESTIMATE_SYSTEM_NAMES[systemKey];
  const titlePrefix = isSummary ? 'Итого: ' : '';

  let html = `
    <details class="estimate-details">
      <summary class="estimate-details-header">
        <span class="estimate-system-icon ${systemKey === 'cold' ? 'icon-cold' : 'icon-hot'}"></span>
        ${titlePrefix}${systemName}
      </summary>
      <div class="estimate-details-content">
        <table class="estimate-table estimate-table-unified">
          <thead>
            <tr>
              <th class="col-type">Тип</th>
              <th class="col-name">Наименование</th>
              <th class="col-unit">Ед. изм.</th>
              <th class="col-qty">Количество</th>
            </tr>
          </thead>
          <tbody>
  `;

  data.items.forEach(item => {
    const qty = formatQuantity(item.quantity);
    const typeClass = item.type === 'работа' ? 'type-work' : 'type-material';

    html += `
      <tr class="${typeClass}">
        <td class="col-type">${item.type}</td>
        <td class="col-name">${item.name}</td>
        <td class="col-unit">${item.unit}</td>
        <td class="col-qty">${qty}</td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </div>
    </details>
  `;

  return html;
}

/**
 * Экспортирует смету в Excel
 */
export function exportEstimateToExcel(estimateData, sectionsCount) {
  if (typeof XLSX === 'undefined') {
    alert('Библиотека XLSX не загружена');
    return;
  }

  const wb = XLSX.utils.book_new();

  // Создаём листы для каждого корпуса
  for (let sectionIndex = 0; sectionIndex < sectionsCount; sectionIndex++) {
    const sectionData = estimateData[sectionIndex];
    if (!sectionData) continue;

    const rows = [];

    // ХВС
    if (sectionData.cold.items.length > 0) {
      rows.push(['СИСТЕМА ХОЛОДНОГО ВОДОСНАБЖЕНИЯ В1', '', '', '']);
      rows.push(['Тип', 'Наименование', 'Ед. изм.', 'Количество']);

      sectionData.cold.items.forEach(item => {
        rows.push([item.type, item.name, item.unit, item.quantity]);
      });

      rows.push(['', '', '', '']);
    }

    // ГВС
    if (sectionData.hot.items.length > 0) {
      rows.push(['СИСТЕМА ГОРЯЧЕГО ВОДОСНАБЖЕНИЯ Т3, Т4', '', '', '']);
      rows.push(['Тип', 'Наименование', 'Ед. изм.', 'Количество']);

      sectionData.hot.items.forEach(item => {
        rows.push([item.type, item.name, item.unit, item.quantity]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Устанавливаем ширину колонок
    ws['!cols'] = [
      { wch: 12 },
      { wch: 75 },
      { wch: 10 },
      { wch: 15 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, `Корпус ${sectionIndex + 1}`);
  }

  // Лист сводки
  if (sectionsCount > 1) {
    const summary = calculateBuildingSummary(estimateData);
    const rows = [['СВОДКА ПО ЗДАНИЮ', '', '', ''], ['', '', '', '']];

    ['cold', 'hot'].forEach(key => {
      const name = key === 'cold' ? 'СИСТЕМА ХОЛОДНОГО ВОДОСНАБЖЕНИЯ В1' : 'СИСТЕМА ГОРЯЧЕГО ВОДОСНАБЖЕНИЯ Т3, Т4';
      rows.push([name, '', '', '']);
      rows.push(['Тип', 'Наименование', 'Ед. изм.', 'Количество']);

      summary[key].items.forEach(item => {
        rows.push([item.type, item.name, item.unit, item.quantity]);
      });
      rows.push(['', '', '', '']);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 75 }, { wch: 10 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Сводка');
  }

  XLSX.writeFile(wb, 'Смета_водоснабжение.xlsx');
}
