import { ALBUMS, KUU_BOM_TEMPLATES } from './constants.js';

// === Константы для расчёта сшитого полиэтилена в МОП ===
// Эти значения можно вынести в настройки, но пока фиксированы
export const MOP_CONSTANTS = {
  h: 1.8,    // опуск + ввод на одну трубу, м
  gamma: 1.0 // коэффициент трассировки (1.0 = прямой коридор)
};

// Расчёт высоты зоны в метрах (от 1-го этажа до to)
export function zoneHeightMeters(h1, hn, to) {
  if (to <= 0) return 0;
  if (to === 1) return h1;
  return h1 + (to - 1) * hn;
}

// Расчёт высоты диапазона этажей (от from до to включительно)
export function floorRangeHeightMeters(h1, hn, from, to) {
  if (to < from || from <= 0) return 0;
  const floorsCount = to - from + 1;
  if (floorsCount <= 0) return 0;

  // Если диапазон включает 1-й этаж, используем h1 для него
  if (from === 1) {
    if (floorsCount === 1) return h1;
    return h1 + (floorsCount - 1) * hn;
  }
  // Все этажи типовые (hn)
  return floorsCount * hn;
}

// Получение реального диапазона этажей для зоны в секции
export function getZoneFloorRange(section, zone) {
  if (!section || !section.zones || !Array.isArray(section.zones) || !zone) {
    return null;
  }

  let currentFloor = 1;
  for (const z of section.zones) {
    const zoneTo = Math.min(parseInt(z.to, 10) || 0, section.floors || 0);
    const zoneFrom = currentFloor;

    if (zoneTo < zoneFrom) continue;

    if (z === zone) {
      return { from: zoneFrom, to: zoneTo };
    }

    currentFloor = zoneTo + 1;
  }

  return null;
}

// Поиск зоны корпуса, покрывающей этаж (с учётом последовательных диапазонов зон)
export function sectionZoneForFloor(section, floor) {
  if (!section || !section.zones || !Array.isArray(section.zones)) {
    return null;
  }
  if (floor < 1) return null;

  // Проходим по зонам последовательно, определяя их реальные диапазоны
  let currentFloor = 1;
  for (const z of section.zones) {
    const zoneTo = Math.min(parseInt(z.to, 10) || 0, section.floors || 0);
    const zoneFrom = currentFloor;

    if (zoneTo < zoneFrom) continue;

    // Проверяем, попадает ли этаж в диапазон этой зоны
    if (floor >= zoneFrom && floor <= zoneTo) {
      return z;
    }

    currentFloor = zoneTo + 1;
  }

  return null;
}

// Форматирование коллекторов (минимум 2 выхода на коллектор)
export function formatCollectors(unitsPerSection, risersPerSection) {
  if (risersPerSection <= 0 || unitsPerSection <= 0) return '—';
  const base = Math.floor(unitsPerSection / risersPerSection);
  const rem = unitsPerSection % risersPerSection;
  const map = {};
  for (let i = 0; i < risersPerSection; i++) {
    let n = i < rem ? base + 1 : base;
    // Пропускаем стояки без квартир (когда квартир меньше, чем стояков)
    if (n <= 0) continue;
    // Минимум 2 выхода на коллектор
    if (n < 2) n = 2;
    map[n] = (map[n] || 0) + 1;
  }
  // Если все стояки без квартир
  if (Object.keys(map).length === 0) return '—';
  return Object.keys(map)
    .map(k => ({ k: +k, c: map[k] }))
    .sort((a, b) => b.k - a.k)
    .map(x => `${x.c}×${x.k} вых.`)
    .join(' + ');
}

// Расчёт распределения коллекторов по количеству выходов для зоны
// Возвращает объект: { 2: 10, 4: 1, 5: 89 } — 10 коллекторов на 2 выхода, и т.д.
// Логика: для каждого этажа n = max(квартир, стояков), минимум 2
export function computeCollectorsDistribution(section, zone, zoneFrom, zoneTo) {
  const risersPerSection = Math.max(1, +zone.risers || 1);
  const distribution = {}; // { n: count }

  // Считаем только этажи >= 2 в пределах диапазона зоны
  for (let f = Math.max(2, zoneFrom); f <= zoneTo; f++) {
    const aptsPerSec = section.apts[f] || 0;
    if (aptsPerSec <= 0) continue; // пропускаем этажи без квартир

    // Количество выходов = max(квартир, стояков), минимум 2
    let n = Math.max(aptsPerSec, risersPerSection);
    if (n < 2) n = 2;

    // Добавляем 1 коллектор с n выходами
    distribution[n] = (distribution[n] || 0) + 1;
  }

  return distribution;
}

// Форматирование распределения коллекторов в строку
// { 2: 10, 5: 89 } → "89×5 вых. + 10×2 вых."
export function formatCollectorsDistribution(distribution) {
  const entries = Object.entries(distribution)
    .map(([n, count]) => ({ n: +n, count }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.n - a.n); // сортировка по убыванию выходов

  if (entries.length === 0) return '—';

  return entries.map(x => `${x.count}×${x.n} вых.`).join(' + ');
}

// Автоподбор n для коллекторов зоны (максимальное количество выходов)
// Используется для BOM и других расчётов, где нужен один максимум
export function computeAutoNForZone(section, zone) {
  const to = Math.min(+zone.to || 0, section.floors);
  const risersPerSection = Math.max(1, +zone.risers || 1);
  let nMax = 2; // минимум 2 выхода
  for (let f = 2; f <= to; f++) {
    const aptsPerSec = section.apts[f] || 0;
    const nFloor = Math.max(aptsPerSec || 0, risersPerSection);
    if (nFloor > nMax) nMax = nFloor;
  }
  return nMax;
}

// Автоподбор n для коллекторов зоны с учётом диапазона этажей
export function computeAutoNForZoneRange(section, zone, zoneFrom, zoneTo) {
  const risersPerSection = Math.max(1, +zone.risers || 1);
  let nMax = 2; // минимум 2 выхода
  for (let f = Math.max(2, zoneFrom); f <= zoneTo; f++) {
    const aptsPerSec = section.apts[f] || 0;
    const nFloor = Math.max(aptsPerSec || 0, risersPerSection);
    if (nFloor > nMax) nMax = nFloor;
  }
  return nMax;
}

// Материализация BOM для КУУ
export function materializeKuuBom(albumKey, apartmentsCount, params) {
  const bom = (KUU_BOM_TEMPLATES[albumKey] || []).map(item => {
    const n = Math.max(1, +params?.n || 4);
    const name = (item.nameTpl || '').replace('{n}', n);
    return { name, unit: item.unit || 'шт', qty: (item.qtyPerApt || 0) * (apartmentsCount || 0) };
  });

  const ivpt = !!params?.ivptEnabled;
  if (ivpt && apartmentsCount > 0) {
    bom.push(
      { name: 'устройство внутриквартирного пожаротушения', unit: 'шт', qty: apartmentsCount },
      { name: 'кран шаровый Ду 15', unit: 'шт', qty: apartmentsCount }
    );
  }
  return bom;
}

// Расчёт данных по этажам
export function computeFloorsData(sections, h1, hn) {
  const maxFloors = sections.reduce((m, s) => Math.max(m, s.floors || 0), 0);
  const floorsData = [];
  const warnings = [];

  for (let f = 1; f <= maxFloors; f++) {
    let aptsTotal = 0;
    let rentTotal = 0;
    let risersTotalAtFloor = 0;

    const sectionsInfo = sections.map((sec, si) => {
      if (f === 1) {
        if (sec.rent.enabled) rentTotal += sec.rent.qty || 0;
      } else {
        aptsTotal += (sec.apts[f] || 0);
      }

      const z = sectionZoneForFloor(sec, f);
      let zoneCellText = '—';
      let dnCellText = '—';
      let collCellText = '—';

      if (z) {
        const zoneRange = getZoneFloorRange(sec, z);
        const rangeText = zoneRange ? `${zoneRange.from}–${zoneRange.to}` : `1–${z.to}`;
        zoneCellText = `${z.name} (${rangeText})`;
        const d = z.fixedD || { V1: 0, T3: 0, T4: 0 };
        const fmt = x => x ? `${x} мм` : '—';
        dnCellText = `В1 ${fmt(d.V1)}/Т3 ${fmt(d.T3)}/Т4 ${fmt(d.T4)}`;

        const risersPerSection = Math.max(1, +z.risers || 1);
        risersTotalAtFloor += risersPerSection;

        const unitsForCollectors = (f === 1 ? (sec.rent.enabled ? (sec.rent.qty || 0) : 0) : (sec.apts[f] || 0));
        collCellText = formatCollectors(unitsForCollectors, risersPerSection);
      }

      return { zoneCellText, dnCellText, collCellText };
    });

    const anyData = (aptsTotal > 0 || rentTotal > 0);
    const anyZoneCovers = sections.some(sec => sectionZoneForFloor(sec, f));
    if (anyData && !anyZoneCovers) {
      warnings.push(`Этаж ${f}: заданы квартиры/аренда, но ни одна зона корпуса не покрывает этот этаж.`);
    }

    floorsData.push({
      floor: f,
      sectionsInfo,
      aptsTotal,
      rentTotal,
      risersTotalAtFloor
    });
  }

  return { floorsData, warnings };
}

// Расчёт данных по зонам (с последовательным распределением этажей)
export function computeZonesData(sections, h1, hn, ivptEnabled) {
  const zonesData = [];
  let grandTotalRisersLen = 0;
  const byDiameter = {}; // `${si}:${sys}:${dia}` -> {len,count}
  const byAlbum = { collector: 0, collector_pre_apt: 0, pre_apt: 0 };

  sections.forEach((sec, si) => {
    // Для каждого корпуса начинаем с 1-го этажа
    let currentFloor = 1;

    sec.zones.forEach((z, zoneIdx) => {
      // Максимальный этаж зоны (ограничен этажностью корпуса)
      const zoneMaxFloor = Math.min(+z.to || 0, sec.floors || 0);

      // Диапазон этажей для этой зоны
      const zoneFrom = currentFloor;
      const zoneTo = zoneMaxFloor;

      // Если зона не имеет валидного диапазона — пропускаем
      if (zoneTo < zoneFrom) {
        return;
      }

      // Считаем квартиры и аренду только в диапазоне этой зоны
      let aptsInZone = 0, rentInZone = 0;
      for (let f = zoneFrom; f <= zoneTo; f++) {
        if (f === 1 && sec.rent.enabled) {
          // Аренда только на 1-м этаже
          rentInZone += (sec.rent.qty || 0);
        } else if (f >= 2) {
          aptsInZone += (sec.apts[f] || 0);
        }
      }

      const risersPerSection = Math.max(1, +z.risers || 1);
      const d = z.fixedD || { V1: 0, T3: 0, T4: 0 };

      // Высота зоны — от zoneFrom до zoneTo
      const hZone = floorRangeHeightMeters(h1, hn, zoneFrom, zoneTo);
      const lenOneRiser = hZone;
      const lenAllRisers = lenOneRiser * risersPerSection;

      grandTotalRisersLen += lenAllRisers;

      ['V1', 'T3', 'T4'].forEach(sys => {
        const dia = +d[sys] || 0;
        if (dia > 0) {
          const key = `${si}:${sys}:${dia}`;
          if (!byDiameter[key]) byDiameter[key] = { len: 0, count: 0 };
          byDiameter[key].len += lenAllRisers;
          byDiameter[key].count += risersPerSection;
        }
      });

      const aKey = z.albumType || 'collector';
      if (byAlbum[aKey] !== undefined) {
        byAlbum[aKey] += aptsInZone;
      }

      // Автоподбор n с учётом диапазона этажей зоны
      const nAuto = computeAutoNForZoneRange(sec, z, zoneFrom, zoneTo);
      const bom = materializeKuuBom(aKey, aptsInZone, { n: nAuto, ivptEnabled });

      // Распределение коллекторов по количеству выходов для зоны
      const collectorsDistribution = computeCollectorsDistribution(sec, z, zoneFrom, zoneTo);

      zonesData.push({
        sectionIndex: si,
        zone: z,
        from: zoneFrom,
        to: zoneTo,
        zoneFrom,     // дублирование для явности
        zoneTo,       // дублирование для явности
        aptsInZone,
        rentInZone,
        risersPerSection,
        d,
        hZone,
        lenOneRiser,
        lenAllRisers,
        albumKey: aKey,
        albumName: ALBUMS[aKey] || ALBUMS.collector,
        nAuto,
        bom,
        collectorsDistribution  // { 2: 10, 5: 89 } — распределение коллекторов
      });

      // Переход к следующей зоне: начиная с этажа после текущей
      currentFloor = zoneTo + 1;
    });
  });

  return { zonesData, grandTotalRisersLen, byDiameter, byAlbum };
}

// Агрегаты по стоякам (по системам и диаметрам)
export function computeRisersByDiameter(byDiameter) {
  const result = [];
  Object.keys(byDiameter)
    .sort((a, b) => {
      const [sia, sysa, da] = a.split(':');
      const [sib, sysb, db] = b.split(':');
      if (+sia !== +sib) return (+sia) - (+sib);
      const order = { V1: 0, T3: 1, T4: 2 };
      if (order[sysa] !== order[sysb]) return order[sysa] - order[sysb];
      return (+da) - (+db);
    })
    .forEach(key => {
      const [si, sys, dia] = key.split(':');
      result.push({
        sectionIndex: +si,
        sys,
        dia: +dia,
        count: byDiameter[key].count,
        len: byDiameter[key].len
      });
    });
  return result;
}

// Суммарные стояки по зданию (без разреза по корпусам) — с последовательным расчётом зон
export function computeRisersOverall(sections, h1, hn) {
  const overall = new Map();

  sections.forEach(sec => {
    let currentFloor = 1;

    sec.zones.forEach(z => {
      const zoneMaxFloor = Math.min(+z.to || 0, sec.floors || 0);
      const zoneFrom = currentFloor;
      const zoneTo = zoneMaxFloor;

      if (zoneTo < zoneFrom) return;

      const risers = Math.max(1, +z.risers || 1);
      const d = z.fixedD || {};
      const h = floorRangeHeightMeters(h1, hn, zoneFrom, zoneTo);
      const lenAll = h * risers;

      ['V1', 'T3', 'T4'].forEach(sys => {
        const dia = +d[sys] || 0;
        if (!dia) return;
        const key = `${sys}:${dia}`;
        const cur = overall.get(key) || { count: 0, len: 0 };
        cur.count += risers;
        cur.len += lenAll;
        overall.set(key, cur);
      });

      currentFloor = zoneTo + 1;
    });
  });

  const result = [];
  Array.from(overall.keys())
    .sort((a, b) => {
      const order = { V1: 0, T3: 1, T4: 2 };
      const [sa, da] = a.split(':'), [sb, db] = b.split(':');
      if (order[sa] !== order[sb]) return order[sa] - order[sb];
      return (+da) - (+db);
    })
    .forEach(key => {
      const [sys, dia] = key.split(':');
      const v = overall.get(key);
      result.push({ sys, dia: +dia, count: v.count, len: +v.len.toFixed(2) });
    });

  return result;
}

// Спецификации КУУ (по корпусам и общая) — с последовательным расчётом зон
export function computeSpecsAggregates(sections, ivptEnabled) {
  const perSectionMap = new Map();
  const overallMap = new Map();

  sections.forEach((sec, si) => {
    const secMap = new Map();
    let currentFloor = 1;

    sec.zones.forEach(z => {
      const zoneMaxFloor = Math.min(+z.to || 0, sec.floors || 0);
      const zoneFrom = currentFloor;
      const zoneTo = zoneMaxFloor;

      if (zoneTo < zoneFrom) return;

      let aptsInZone = 0;
      for (let f = zoneFrom; f <= zoneTo; f++) {
        if (f >= 2) aptsInZone += (sec.apts[f] || 0);
      }

      const aKey = z.albumType || 'collector';
      const nAuto = computeAutoNForZoneRange(sec, z, zoneFrom, zoneTo);
      const bom = materializeKuuBom(aKey, aptsInZone, { n: nAuto, ivptEnabled });
      bom.forEach(item => {
        const key = `${item.name}||${item.unit || 'шт'}`;
        secMap.set(key, (secMap.get(key) || 0) + (item.qty || 0));
        overallMap.set(key, (overallMap.get(key) || 0) + (item.qty || 0));
      });

      currentFloor = zoneTo + 1;
    });
    perSectionMap.set(si, secMap);
  });

  // Преобразование в массивы для экспорта
  const perSectionData = [];
  sections.forEach((_, si) => {
    const m = perSectionMap.get(si) || new Map();
    Array.from(m.keys()).sort().forEach(key => {
      const [name, unit] = key.split('||');
      perSectionData.push({ sectionIndex: si, name, unit, qty: m.get(key) });
    });
  });

  const overallData = [];
  Array.from(overallMap.keys()).sort().forEach(key => {
    const [name, unit] = key.split('||');
    overallData.push({ name, unit, qty: overallMap.get(key) });
  });

  return { perSectionData, overallData };
}

// BOM построчно для экспорта — с последовательным расчётом зон
export function computeBomData(sections, ivptEnabled) {
  const bomData = [];

  sections.forEach((sec, si) => {
    let currentFloor = 1;

    sec.zones.forEach(z => {
      const zoneMaxFloor = Math.min(+z.to || 0, sec.floors || 0);
      const zoneFrom = currentFloor;
      const zoneTo = zoneMaxFloor;

      if (zoneTo < zoneFrom) return;

      let aptsInZone = 0;
      for (let f = zoneFrom; f <= zoneTo; f++) {
        if (f >= 2) aptsInZone += (sec.apts[f] || 0);
      }

      const aKey = z.albumType || 'collector';
      const nAuto = computeAutoNForZoneRange(sec, z, zoneFrom, zoneTo);
      const bom = materializeKuuBom(aKey, aptsInZone, { n: nAuto, ivptEnabled });

      if (bom.length === 0) {
        bomData.push({
          sectionIndex: si,
          zoneName: z.name,
          albumName: ALBUMS[aKey] || '',
          nAuto,
          zoneFrom,
          zoneTo,
          name: '(состав не задан)',
          unit: '',
          qty: ''
        });
      } else {
        bom.forEach(item => {
          bomData.push({
            sectionIndex: si,
            zoneName: z.name,
            albumName: ALBUMS[aKey] || '',
            nAuto,
            zoneFrom,
            zoneTo,
            name: item.name,
            unit: item.unit || 'шт',
            qty: item.qty
          });
        });
      }

      currentFloor = zoneTo + 1;
    });
  });

  return bomData;
}

// === Функции для расчёта сшитого полиэтилена в МОП ===

/**
 * Подсчёт количества жилых квартир в секции (без 1-го этажа - аренда)
 * @param {Object} section - объект секции
 * @returns {number} количество квартир
 */
export function getSectionFlatsCount(section) {
  if (!section || !section.apts) return 0;
  let total = 0;
  Object.keys(section.apts).forEach(floor => {
    if (+floor >= 2) { // только жилые этажи (не 1-й)
      total += (section.apts[floor] || 0);
    }
  });
  return total;
}

/**
 * Расчёт средней горизонтальной длины до квартиры в зависимости от положения коллектора
 *
 * Логика (по аналогии с Excel-шаблоном):
 * - r = 0 (коллектор у торца): средняя длина ~ L/2
 * - r = 0.5 (коллектор в центре): средняя длина ~ L/4
 * - r = 1 (коллектор у другого торца): средняя длина ~ L/2
 *
 * Формула: d̄ = L * (0.25 + 0.25 * |2*r - 1|)
 *
 * @param {number} L - длина МОП (коридора), м
 * @param {number} n - количество квартир в секции
 * @param {number} r - положение коллектора (0, 0.5, 1)
 * @param {number} gamma - коэффициент трассировки (по умолчанию 1.0)
 * @returns {number} средняя горизонтальная длина до квартиры, м
 */
export function computeMopAverageLength(L, n, r, gamma = 1.0) {
  if (L <= 0 || n <= 0) return 0;

  // Формула средней длины в зависимости от положения коллектора
  // При r=0.5 (центр): d̄ = L/4
  // При r=0 или r=1 (край): d̄ = L/2
  const dAvg = L * (0.25 + 0.25 * Math.abs(2 * r - 1));

  return dAvg * gamma;
}

/**
 * Расчёт длины труб из сшитого полиэтилена для секции
 *
 * Формулы:
 * - Длина на одну квартиру для одной трубы: m_кв = d̄(r) * γ + h
 * - Длина на секцию для одной трубы: M_сек = m_кв * n_секция
 * - Для двух труб (В1 и Т3): длины одинаковые
 *
 * @param {Object} section - объект секции
 * @returns {Object} { n, L, r, mPerApt, lengthV1, lengthT3 }
 */
export function computeMopPexLengthsForSection(section) {
  const defaultResult = { n: 0, L: 0, r: 0.5, mPerApt: 0, lengthV1: 0, lengthT3: 0 };

  if (!section) return defaultResult;

  // Получаем параметры МОП
  const mop = section.mop || { L: 30, r: 0.5 };
  const L = mop.L || 0;
  const r = mop.r ?? 0.5;

  // Количество квартир в секции
  const n = getSectionFlatsCount(section);

  if (n <= 0 || L <= 0) {
    return { n, L, r, mPerApt: 0, lengthV1: 0, lengthT3: 0 };
  }

  // Константы
  const { h, gamma } = MOP_CONSTANTS;

  // Средняя горизонтальная длина до квартиры
  const dAvg = computeMopAverageLength(L, n, r, gamma);

  // Длина на одну квартиру для одной трубы
  const mPerApt = dAvg + h;

  // Длина на секцию для одной системы (В1 или Т3)
  const lengthPerSystem = mPerApt * n;

  return {
    n,
    L,
    r,
    mPerApt: Math.round(mPerApt * 100) / 100,
    lengthV1: Math.round(lengthPerSystem * 100) / 100,
    lengthT3: Math.round(lengthPerSystem * 100) / 100
  };
}

/**
 * Расчёт суммарной длины труб по всем секциям
 * @param {Array} sections - массив секций
 * @returns {Object} { totalV1, totalT3 }
 */
export function computeMopPexTotals(sections) {
  let totalV1 = 0;
  let totalT3 = 0;

  if (!sections || !Array.isArray(sections)) {
    return { totalV1, totalT3 };
  }

  sections.forEach(section => {
    const result = computeMopPexLengthsForSection(section);
    totalV1 += result.lengthV1;
    totalT3 += result.lengthT3;
  });

  return {
    totalV1: Math.round(totalV1 * 100) / 100,
    totalT3: Math.round(totalT3 * 100) / 100
  };
}

/**
 * Вычисляет данные пусконаладочных работ по всем корпусам и системам.
 * Эта функция является единым источником данных для:
 * - "Результаты расчёта → Трубопроводы → Пусконаладочные работы"
 * - "Смета → Пусконаладочные работы"
 *
 * @param {Array} zonesData - данные зон из computeZonesData
 * @param {Array} sections - массив корпусов
 * @returns {Object} объект с данными пусконаладки:
 *   - bySectionAndSystem: Map с ключом "sectionIndex:system" и значением длины
 *   - bySection: Map с итогами по корпусам
 *   - bySystem: Map с итогами по системам
 *   - grandTotal: общая длина
 *   - rows: массив строк для использования в смете
 */
export function computeCommissioningData(zonesData, sections) {
  const bySectionAndSystem = new Map(); // key: "sectionIndex:system" -> length
  const bySection = new Map(); // sectionIndex -> totalLength
  const bySystem = new Map(); // system -> totalLength
  let grandTotal = 0;

  // 1. Собираем данные из zonesData (стальные трубы стояков)
  if (zonesData && zonesData.length > 0) {
    zonesData.forEach(zd => {
      const si = zd.sectionIndex;
      const d = zd.d || {};

      ['V1', 'T3', 'T4'].forEach(sys => {
        const dia = d[sys] || 0;
        if (dia > 0) {
          const totalLen = zd.hZone * zd.risersPerSection;
          const key = `${si}:${sys}`;

          // По корпусу и системе
          bySectionAndSystem.set(key, (bySectionAndSystem.get(key) || 0) + totalLen);

          // По корпусу (итого)
          bySection.set(si, (bySection.get(si) || 0) + totalLen);

          // По системе (итого)
          bySystem.set(sys, (bySystem.get(sys) || 0) + totalLen);

          grandTotal += totalLen;
        }
      });
    });
  }

  // 2. Добавляем данные PP-R труб (МОП)
  if (sections && sections.length > 0) {
    sections.forEach((sec, si) => {
      const mopResult = computeMopPexLengthsForSection(sec);

      if (mopResult.lengthV1 > 0) {
        const keyV1 = `${si}:V1`;
        bySectionAndSystem.set(keyV1, (bySectionAndSystem.get(keyV1) || 0) + mopResult.lengthV1);
        bySection.set(si, (bySection.get(si) || 0) + mopResult.lengthV1);
        bySystem.set('V1', (bySystem.get('V1') || 0) + mopResult.lengthV1);
        grandTotal += mopResult.lengthV1;
      }

      if (mopResult.lengthT3 > 0) {
        const keyT3 = `${si}:T3`;
        bySectionAndSystem.set(keyT3, (bySectionAndSystem.get(keyT3) || 0) + mopResult.lengthT3);
        bySection.set(si, (bySection.get(si) || 0) + mopResult.lengthT3);
        bySystem.set('T3', (bySystem.get('T3') || 0) + mopResult.lengthT3);
        grandTotal += mopResult.lengthT3;
      }
    });
  }

  // 3. Формируем массив строк для использования в смете
  // ВАЖНО: Т4 (рециркуляция) исключена из сметы пусконаладки
  const COMMISSIONING_COEFF = 0.02; // усл. ед. на 1 метр трубопровода
  const rows = [];

  const sortedSections = Array.from(bySection.keys()).sort((a, b) => a - b);

  sortedSections.forEach(si => {
    // B1 (ХВС) - из V1
    const keyV1 = `${si}:V1`;
    const lenV1 = bySectionAndSystem.get(keyV1) || 0;
    if (lenV1 > 0) {
      rows.push({
        sectionIndex: si,
        building: `Корпус ${si + 1}`,
        systemCode: 'B1',
        systemName: 'ХВС',
        name: 'Пусконаладочные работы по системе ХВС',
        unit: 'усл. ед.',
        pipeLength: Math.round(lenV1 * 100) / 100,
        quantity: Math.round(lenV1 * COMMISSIONING_COEFF * 100) / 100,
        unitPrice: null,
        total: null,
      });
    }

    // T3 (ГВС)
    const keyT3 = `${si}:T3`;
    const lenT3 = bySectionAndSystem.get(keyT3) || 0;
    if (lenT3 > 0) {
      rows.push({
        sectionIndex: si,
        building: `Корпус ${si + 1}`,
        systemCode: 'T3',
        systemName: 'ГВС',
        name: 'Пусконаладочные работы по системе ГВС',
        unit: 'усл. ед.',
        pipeLength: Math.round(lenT3 * 100) / 100,
        quantity: Math.round(lenT3 * COMMISSIONING_COEFF * 100) / 100,
        unitPrice: null,
        total: null,
      });
    }

    // T4 (рециркуляция) - НЕ добавляется в rows для сметы
  });

  return {
    bySectionAndSystem,
    bySection,
    bySystem,
    grandTotal,
    rows, // готовые строки для сметы (только B1/ХВС и T3/ГВС)
  };
}