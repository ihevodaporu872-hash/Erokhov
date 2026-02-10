import { uid, REAL_DN, ALBUMS } from './constants.js';

// Структура данных корпусов
// Корпус: { floors, floorsLocked, apts: { [floor]: number }, rent:{enabled,qty}, zones:[{id,name,to,risers,fixedD:{V1,T3,T4},albumType,locked}] }
export let sections = [];

// Глобальные параметры калькулятора
export let calculatorParams = {
  h1: 4.0,
  hn: 3.3,
  ivptEnabled: false,
  numSections: 2
};

// Callback для автосохранения (устанавливается из main.js)
let onStateChangeCallback = null;

export function setOnStateChange(callback) {
  onStateChangeCallback = callback;
}

// Уведомление об изменении состояния
function notifyStateChange() {
  if (onStateChangeCallback) {
    onStateChangeCallback();
  }
}

// Создание корпуса по умолчанию
export function makeDefaultSection() {
  return {
    floors: 12,
    floorsLocked: false,
    apts: {},
    rent: { enabled: false, qty: 1 },
    zones: [
      { id: uid(), name: 'Зона 1', to: 6, risers: 2, fixedD: { V1: 32, T3: 32, T4: 32 }, albumType: 'collector', locked: false },
      { id: uid(), name: 'Зона 2', to: 12, risers: 3, fixedD: { V1: 40, T3: 40, T4: 40 }, albumType: 'collector_pre_apt', locked: false },
    ],
    // Параметры расчёта сшитого полиэтилена в МОП
    mop: {
      L: 30,  // длина МОП в метрах
      r: 0.5, // положение коллектора: 0 - у торца, 0.5 - в центре, 1 - у другого торца
      dn: 20  // диаметр трубы: 16, 20, 25, 32, 40
    }
  };
}

// Получение дефолтного состояния калькулятора
export function getDefaultCalculatorState() {
  return {
    sections: [makeDefaultSection(), makeDefaultSection()],
    params: {
      h1: 4.0,
      hn: 3.3,
      ivptEnabled: false,
      numSections: 2
    }
  };
}

// Сериализация текущего состояния калькулятора
export function serializeCalculatorState() {
  return {
    sections: JSON.parse(JSON.stringify(sections)),
    params: { ...calculatorParams }
  };
}

// Загрузка состояния калькулятора
export function loadCalculatorState(data) {
  if (!data) {
    const defaultState = getDefaultCalculatorState();
    sections = defaultState.sections;
    calculatorParams = defaultState.params;
    return;
  }

  // Загрузка корпусов
  if (data.sections && Array.isArray(data.sections)) {
    sections = JSON.parse(JSON.stringify(data.sections));
    // Миграция: добавляем поля mop если отсутствуют
    sections.forEach(sec => {
      if (!sec.mop) {
        sec.mop = { L: 30, r: 0.5, dn: 20 };
      } else if (sec.mop.dn === undefined) {
        sec.mop.dn = 20;
      }
    });
  } else {
    sections = [makeDefaultSection(), makeDefaultSection()];
  }

  // Загрузка параметров
  if (data.params) {
    calculatorParams = {
      h1: data.params.h1 ?? 4.0,
      hn: data.params.hn ?? 3.3,
      ivptEnabled: data.params.ivptEnabled ?? false,
      numSections: data.params.numSections ?? sections.length
    };
  } else {
    calculatorParams = {
      h1: 4.0,
      hn: 3.3,
      ivptEnabled: false,
      numSections: sections.length
    };
  }
}

// Применение состояния к DOM
export function applyStateToDOM() {
  const h1El = document.getElementById('h1');
  const hnEl = document.getElementById('hn');
  const ivptEl = document.getElementById('ivptEnabled');
  const numSecEl = document.getElementById('numSections');

  if (h1El) h1El.value = calculatorParams.h1;
  if (hnEl) hnEl.value = calculatorParams.hn;
  if (ivptEl) ivptEl.checked = calculatorParams.ivptEnabled;
  if (numSecEl) numSecEl.value = calculatorParams.numSections;
}

// Чтение параметров из DOM
export function readParamsFromDOM() {
  const h1El = document.getElementById('h1');
  const hnEl = document.getElementById('hn');
  const ivptEl = document.getElementById('ivptEnabled');
  const numSecEl = document.getElementById('numSections');

  calculatorParams.h1 = h1El ? +h1El.value || 4.0 : 4.0;
  calculatorParams.hn = hnEl ? +hnEl.value || 3.3 : 3.3;
  calculatorParams.ivptEnabled = ivptEl ? ivptEl.checked : false;
  calculatorParams.numSections = numSecEl ? +numSecEl.value || 2 : 2;
}

// Обновление параметров
export function updateParams(params) {
  Object.assign(calculatorParams, params);
  notifyStateChange();
}

// Установка нужного количества корпусов
export function ensureSectionsCount(n) {
  const old = sections.slice(0);
  sections = Array.from({ length: n }, (_, i) => old[i] ? old[i] : makeDefaultSection());
  calculatorParams.numSections = n;
  notifyStateChange();
}

// Обновление количества этажей в корпусе
export function updateSectionFloors(si, val) {
  if (sections[si].floorsLocked) return false;
  sections[si].floors = Math.max(1, +val || 1);

  // Удаляем квартиры для этажей выше нового значения
  Object.keys(sections[si].apts).forEach(k => {
    if (+k > sections[si].floors) delete sections[si].apts[k];
  });

  // Корректируем зоны
  sections[si].zones.forEach(z => {
    if (z.to > sections[si].floors) z.to = sections[si].floors;
  });

  notifyStateChange();
  return true;
}

// Блокировка/разблокировка этажности корпуса
export function toggleLockFloors(si, checked) {
  sections[si].floorsLocked = !!checked;
  notifyStateChange();
}

// Установка количества квартир на этаже
export function setApt(si, f, val) {
  sections[si].apts[f] = Math.max(0, +val || 0);
  notifyStateChange();
}

// Включение/выключение аренды
export function setRentEnabled(si, enabled) {
  sections[si].rent.enabled = !!enabled;
  notifyStateChange();
}

// Установка количества узлов учета аренды
export function setRentQty(si, qty) {
  sections[si].rent.qty = Math.max(0, +qty || 0);
  notifyStateChange();
}

// Автозаполнение квартир по диапазону
export function autofillApts(si, from, to, qty) {
  const sec = sections[si];
  from = Math.max(2, from);
  to = Math.max(from, to);
  if (from > sec.floors) from = sec.floors;
  if (to > sec.floors) to = sec.floors;

  for (let f = from; f <= to; f++) {
    sec.apts[f] = qty;
  }

  notifyStateChange();
  return { from, to, qty };
}

// Очистка квартир корпуса
export function clearApts(si) {
  sections[si].apts = {};
  notifyStateChange();
}

// Добавление зоны в корпус
export function addZone(si) {
  const sec = sections[si];
  const lastTo = sec.zones.length ? sec.zones[sec.zones.length - 1].to : 0;
  const toDefault = Math.min(sec.floors, Math.max(1, lastTo + 3));

  sec.zones.push({
    id: uid(),
    name: `Зона ${sec.zones.length + 1}`,
    to: toDefault,
    risers: 2,
    fixedD: { V1: 32, T3: 32, T4: 32 },
    albumType: 'collector',
    locked: false
  });
  notifyStateChange();
}

// Удаление зоны из корпуса
export function removeZone(si, zid) {
  sections[si].zones = sections[si].zones.filter(z => z.id !== zid);
  notifyStateChange();
}

// Очистка всех зон корпуса
export function clearZones(si) {
  sections[si].zones = [];
  notifyStateChange();
}

// Обновление параметра зоны
export function updateZone(si, zid, field, value) {
  const z = sections[si].zones.find(x => x.id === zid);
  if (!z) return false;
  if (z.locked) return false;

  if (field === 'to') {
    z.to = Math.max(1, Math.min(sections[si].floors, +value || 1));
  } else if (field === 'albumType') {
    z.albumType = ALBUMS[value] ? value : 'collector';
  } else if (field === 'risers') {
    z.risers = Math.max(1, +value || 1);
  } else if (field === 'name') {
    z.name = String(value || '').trim() || z.name;
  }

  notifyStateChange();
  return true;
}

// Обновление диаметра системы в зоне
export function updateZoneDia(si, zid, sys, value, autoUpdate = true) {
  const z = sections[si].zones.find(x => x.id === zid);
  if (!z) return false;
  if (z.locked) return false;

  if (!z.fixedD) z.fixedD = { V1: 32, T3: 32, T4: 32 };
  const dn = REAL_DN.includes(+value) ? +value : 32;
  z.fixedD[sys] = dn;

  if (autoUpdate) {
    // Если меняется V1, автоматически обновляем T3 (дублируем диаметр)
    if (sys === 'V1') {
      z.fixedD.T3 = dn;
      // А T4 становится на диаметр ниже чем T3
      const currentIndex = REAL_DN.indexOf(dn);
      if (currentIndex > 0) {
        z.fixedD.T4 = REAL_DN[currentIndex - 1];
      } else {
        z.fixedD.T4 = REAL_DN[0];
      }
    }
    // Если меняется T3, автоматически обновляем T4 на диаметр ниже
    else if (sys === 'T3') {
      const currentIndex = REAL_DN.indexOf(dn);
      if (currentIndex > 0) {
        z.fixedD.T4 = REAL_DN[currentIndex - 1];
      } else {
        z.fixedD.T4 = REAL_DN[0];
      }
    }
  }

  notifyStateChange();
  return true;
}

// Блокировка/разблокировка зоны
export function toggleZoneLock(si, zid, checked) {
  const z = sections[si].zones.find(x => x.id === zid);
  if (!z) return false;
  z.locked = !!checked;
  notifyStateChange();
  return true;
}

// Получение текущего состояния корпусов (для расчётов)
export function getSections() {
  return sections;
}

// Установка секций из импортированных данных (например, из Excel)
export function setSectionsFromImport(importedSections) {
  sections.length = 0;
  importedSections.forEach(sec => sections.push(sec));
  calculatorParams.numSections = sections.length;
  notifyStateChange();
}

// Получение параметров калькулятора
export function getCalculatorParams() {
  return calculatorParams;
}

// === Функции для работы с МОП (сшитый полиэтилен) ===

// Установка длины МОП для корпуса
export function setMopLength(si, value) {
  if (!sections[si]) return false;
  if (!sections[si].mop) {
    sections[si].mop = { L: 30, r: 0.5, dn: 20 };
  }
  sections[si].mop.L = Math.max(0, +value || 0);
  notifyStateChange();
  return true;
}

// Установка положения коллектора для корпуса
export function setMopPosition(si, value) {
  if (!sections[si]) return false;
  if (!sections[si].mop) {
    sections[si].mop = { L: 30, r: 0.5, dn: 20 };
  }
  // Допустимые значения: 0, 0.5, 1
  const r = +value;
  if (r === 0 || r === 0.5 || r === 1) {
    sections[si].mop.r = r;
  }
  notifyStateChange();
  return true;
}

// Миграция секции - добавление mop если отсутствует
export function ensureMopFields(section) {
  if (!section.mop) {
    section.mop = { L: 30, r: 0.5, dn: 20 };
  } else if (section.mop.dn === undefined) {
    section.mop.dn = 20;
  }
  return section;
}

// Установка диаметра трубы для МОП
export function setMopDiameter(si, value) {
  if (!sections[si]) return false;
  if (!sections[si].mop) {
    sections[si].mop = { L: 30, r: 0.5, dn: 20 };
  }
  // Допустимые значения: 16, 20, 25, 32, 40
  const dn = +value;
  if ([16, 20, 25, 32, 40].includes(dn)) {
    sections[si].mop.dn = dn;
  }
  notifyStateChange();
  return true;
}
