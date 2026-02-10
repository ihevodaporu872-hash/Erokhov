import {
  sections,
  ensureSectionsCount,
  updateSectionFloors as stateUpdateSectionFloors,
  toggleLockFloors as stateToggleLockFloors,
  setApt as stateSetApt,
  setRentEnabled as stateSetRentEnabled,
  setRentQty as stateSetRentQty,
  autofillApts as stateAutofillApts,
  clearApts as stateClearApts,
  addZone as stateAddZone,
  removeZone as stateRemoveZone,
  clearZones as stateClearZones,
  updateZone as stateUpdateZone,
  updateZoneDia as stateUpdateZoneDia,
  toggleZoneLock as stateToggleZoneLock,
  setOnStateChange,
  serializeCalculatorState,
  loadCalculatorState,
  applyStateToDOM,
  readParamsFromDOM,
  getDefaultCalculatorState,
  calculatorParams,
  setSectionsFromImport,
  setMopLength as stateSetMopLength,
  setMopPosition as stateSetMopPosition,
  setMopDiameter as stateSetMopDiameter
} from './state.js';

import { parseExcelFile, convertToSections } from './import.js';

import {
  computeFloorsData,
  computeZonesData,
  computeRisersByDiameter,
  computeMopPexLengthsForSection,
  sectionZoneForFloor
} from './calculations.js';

import { getSleeveDn } from './constants.js';

import {
  renderSectionsBlocks,
  buildWaterSupplyHead,
  renderFloorsTable,
  renderWarnings,
  renderZonesSummary,
  renderRiserTotals,
  renderRiserByD,
  renderAlbumSummary,
  renderAlbumDetails,
  renderPipelinesBlock,
  renderFittingsBlock,
  renderCollectorsSummary,
  renderSpecificationContent,
  renderProjectsList,
  updateCurrentProjectName,
  closeAllProjectMenus,
  toggleProjectMenu,
  showModal,
  showConfirmDialog
} from './render.js';

import { exportToExcel } from './export.js';

import {
  loadProjects,
  saveProjects,
  getActiveProjectId,
  setActiveProjectId,
  createProject,
  findProjectById,
  updateProjectInList,
  removeProjectFromList
} from './storage.js';

import {
  initTabs,
  renderTabs,
  renderTabContent,
  getActiveTabId,
  setActiveTabId,
  setOnTabChange,
  setSpecificationRenderer,
  setEstimateRenderer
} from './tabs.js';

import {
  aggregateEstimateData,
  renderEstimateBlock,
  exportEstimateToExcel
} from './estimate.js';

console.log('=== main.js ЗАГРУЖЕН (после импортов) ===');

// ===== Состояние приложения =====
let projects = [];
let activeProjectId = null;

// Кэш последнего расчёта для сметы
let lastCalculationCache = {
  zonesData: null,
  risersByDiameter: null,
  h1: 0,
  hn: 0,
  ivptEnabled: false
};

// ===== Функции работы с проектами =====

// Сохранение текущего проекта
function saveCurrentProject() {
  if (!activeProjectId) return;

  readParamsFromDOM();
  const state = serializeCalculatorState();

  // Добавляем activeTabId в состояние проекта
  state.activeTabId = getActiveTabId();

  const project = findProjectById(projects, activeProjectId);
  if (project) {
    project.data = state;
    project.updatedAt = new Date().toISOString();
    saveProjects(projects);
    renderProjectsList(projects, activeProjectId);
  }
}

// Автосохранение при изменении состояния
function onStateChange() {
  saveCurrentProject();
}

// Переключение на проект
function switchToProject(projectId) {
  // Сохраняем текущий проект перед переключением
  if (activeProjectId && activeProjectId !== projectId) {
    saveCurrentProject();
  }

  const project = findProjectById(projects, projectId);
  if (!project) return;

  activeProjectId = projectId;
  setActiveProjectId(projectId);

  // Загружаем состояние проекта
  loadCalculatorState(project.data);
  applyStateToDOM();

  // Инициализация вкладок (берём activeTabId из проекта, если есть)
  const savedTabId = project.data?.activeTabId || 'residential';
  initTabs(savedTabId);

  // Рендер
  renderSectionsBlocks();
  calculateWaterSupply();
  renderProjectsList(projects, activeProjectId);
  updateCurrentProjectName(project.name);
}

// Создание нового проекта
function createNewProject(name) {
  const defaultState = getDefaultCalculatorState();
  const project = createProject(name || 'Новый проект', defaultState);

  projects.push(project);
  saveProjects(projects);

  switchToProject(project.id);
}

// Переименование проекта
function renameProjectById(projectId) {
  const project = findProjectById(projects, projectId);
  if (!project) return;

  closeAllProjectMenus();

  showModal('Переименовать проект', project.name, (newName) => {
    if (newName && newName !== project.name) {
      project.name = newName;
      project.updatedAt = new Date().toISOString();
      saveProjects(projects);
      renderProjectsList(projects, activeProjectId);

      if (projectId === activeProjectId) {
        updateCurrentProjectName(newName);
      }
    }
  });
}

// Удаление проекта
function deleteProjectById(projectId) {
  const project = findProjectById(projects, projectId);
  if (!project) return;

  closeAllProjectMenus();

  showConfirmDialog(
    'Удалить проект?',
    `Проект "${project.name}" будет удалён безвозвратно.`,
    () => {
      projects = removeProjectFromList(projects, projectId);
      saveProjects(projects);

      if (projectId === activeProjectId) {
        // Переключаемся на другой проект или создаём новый
        if (projects.length > 0) {
          switchToProject(projects[0].id);
        } else {
          createNewProject('Новый проект 1');
        }
      } else {
        renderProjectsList(projects, activeProjectId);
      }
    }
  );
}

// ===== Функции калькулятора =====

// Получение высот этажей из DOM
function getHeights() {
  const h1 = +document.getElementById('h1').value || 0;
  const hn = +document.getElementById('hn').value || 0;
  return { h1, hn };
}

// Основной расчёт и рендер
function calculateWaterSupply() {
  buildWaterSupplyHead();

  const { h1, hn } = getHeights();
  const ivptEnabled = document.getElementById('ivptEnabled')?.checked === true;

  // Расчёт данных по этажам
  const { floorsData, warnings } = computeFloorsData(sections, h1, hn);
  renderFloorsTable(floorsData);
  renderWarnings(warnings);

  // Расчёт данных по зонам
  const { zonesData, grandTotalRisersLen, byDiameter, byAlbum } = computeZonesData(sections, h1, hn, ivptEnabled);
  renderZonesSummary(zonesData);
  renderRiserTotals(grandTotalRisersLen);

  // Стояки по системам и диаметрам
  const risersByDiameter = computeRisersByDiameter(byDiameter);
  renderRiserByD(risersByDiameter);

  // Трубопроводы (блок в панели управления)
  renderPipelinesBlock(risersByDiameter, zonesData, h1, hn);

  // Подсчёт общего количества квартир и узлов учёта аренды
  let totalApartments = 0;
  let totalRentUnits = 0;
  sections.forEach(sec => {
    Object.keys(sec.apts).forEach(floor => {
      if (+floor > 1) { // квартиры только со 2-го этажа
        totalApartments += (sec.apts[floor] || 0);
      }
    });
    // Узлы учёта аренды (если аренда включена)
    if (sec.rent && sec.rent.enabled) {
      totalRentUnits += (sec.rent.qty || 0);
    }
  });

  // Арматура (блок в панели управления)
  renderFittingsBlock(totalApartments, ivptEnabled, zonesData, totalRentUnits, sections);

  // Альбомы КУУ
  renderAlbumSummary(byAlbum);
  renderAlbumDetails(zonesData);

  // Сводка по коллекторам
  renderCollectorsSummary(zonesData);

  // Сохраняем данные для сметы
  lastCalculationCache = {
    zonesData,
    risersByDiameter,
    h1,
    hn,
    ivptEnabled
  };
}

// Полный пересчёт (ререндер карточек + расчёт)
function recalcAll() {
  renderSectionsBlocks();
  calculateWaterSupply();
}

// Рендеринг вкладки "Спецификация"
function renderSpecification() {
  const { h1, hn } = getHeights();
  const ivptEnabled = document.getElementById('ivptEnabled')?.checked === true;
  const { zonesData } = computeZonesData(sections, h1, hn, ivptEnabled);
  renderSpecificationContent(zonesData, sections);
}

// Рендеринг вкладки "Смета"
function renderEstimate() {
  const { zonesData, risersByDiameter, h1, hn, ivptEnabled } = lastCalculationCache;

  // Если данных нет, показываем заглушку
  if (!zonesData || !risersByDiameter) {
    const container = document.getElementById('estimateContent');
    if (container) {
      container.innerHTML = `
        <div class="placeholder-block">
          <p class="note">Нажмите «Произвести расчёт» для формирования сметы.</p>
        </div>
      `;
    }
    return;
  }

  // Агрегируем данные для сметы
  // Получаем производителя коллектора из UI
    const collectorSelect = document.querySelector('select.manufacturer-select[data-section="collectors"]');
    const collectorVendor = collectorSelect ?
      (collectorSelect.options[collectorSelect.selectedIndex]?.text || 'РФ') : 'РФ';

    const estimateData = aggregateEstimateData({
      zonesData,
      risersByDiameter,
      sections,
      h1,
      hn,
      ivptEnabled,
      collectorVendor,
    });

  // Рендерим смету
  renderEstimateBlock(estimateData, sections.length);
}

// Обработчик изменения количества корпусов (если элемент существует)
function onSectionsCountChange() {
  const numSecEl = document.getElementById('numSections');
  if (!numSecEl) return;
  const n = Math.max(1, +numSecEl.value || 1);
  ensureSectionsCount(n);
  renderSectionsBlocks();
  calculateWaterSupply();
}

// ===== Импорт из Excel =====

// Показ статуса импорта
function showImportStatus(message, isError = false) {
  const statusEl = document.getElementById('importStatus');
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = `import-status ${isError ? 'error' : 'success'}`;
  statusEl.style.display = 'block';

  // Скрываем через 5 секунд
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 5000);
}

// Обработка импорта из Excel
async function handleExcelImport() {
  const fileInput = document.getElementById('excelFileInput');
  const file = fileInput?.files?.[0];

  if (!file) {
    showImportStatus('Файл не выбран.', true);
    return;
  }

  // Показываем индикатор загрузки
  const btnImport = document.getElementById('btnImportExcel');
  const originalText = btnImport.textContent;
  btnImport.textContent = 'Загрузка...';
  btnImport.disabled = true;

  try {
    const result = await parseExcelFile(file);

    if (!result.success) {
      showImportStatus(result.error, true);
      return;
    }

    // Конвертируем в формат секций калькулятора
    const newSections = convertToSections(result.data);

    // Применяем к состоянию
    setSectionsFromImport(newSections);

    // Обновляем поле количества корпусов
    const numSectionsEl = document.getElementById('numSections');
    if (numSectionsEl) {
      numSectionsEl.value = newSections.length;
    }

    // Обновляем DOM
    applyStateToDOM();

    // Перерендериваем и пересчитываем
    renderSectionsBlocks();
    calculateWaterSupply();

    // Сохраняем проект
    saveCurrentProject();

    // Показываем успешное сообщение
    const stats = result.stats;
    showImportStatus(
      `Импортировано: ${stats.buildingsCount} корп., макс. этаж ${stats.maxFloor}, всего ${stats.totalApts} кв.`,
      false
    );

    // Сбрасываем input файла
    fileInput.value = '';
    btnImport.disabled = true;

  } catch (e) {
    console.error('Ошибка импорта:', e);
    showImportStatus(`Ошибка импорта: ${e.message || e}`, true);
  } finally {
    btnImport.textContent = originalText;
  }
}

// Обработчик выбора файла — автоматически запускает импорт
function onExcelFileSelect() {
  const fileInput = document.getElementById('excelFileInput');

  if (fileInput?.files?.length > 0) {
    // Автоматически запускаем импорт после выбора файла
    handleExcelImport();
  }
}

// Открывает диалог выбора файла
function openExcelFileDialog() {
  const fileInput = document.getElementById('excelFileInput');
  if (fileInput) {
    fileInput.value = ''; // сбрасываем, чтобы можно было выбрать тот же файл повторно
    fileInput.click();
  }
}

// ===== API для inline-обработчиков =====
window.app = {
  // Проекты
  switchProject(projectId) {
    switchToProject(projectId);
  },

  createProject() {
    const input = document.getElementById('newProjectName');
    const name = input?.value.trim() || '';
    createNewProject(name || 'Новый проект');
    if (input) input.value = '';
  },

  renameProject(projectId) {
    renameProjectById(projectId);
  },

  deleteProject(projectId) {
    deleteProjectById(projectId);
  },

  toggleProjectMenu(projectId) {
    toggleProjectMenu(projectId);
  },

  // Корпуса
  updateSectionFloors(si, val) {
    if (stateUpdateSectionFloors(si, val)) {
      recalcAll();
    }
  },

  toggleLockFloors(si, checked) {
    stateToggleLockFloors(si, checked);
    recalcAll();
  },

  // Квартиры
  setApt(si, f, val) {
    stateSetApt(si, f, val);
    calculateWaterSupply();
  },

  setRentEnabled(si, enabled) {
    stateSetRentEnabled(si, enabled);
    recalcAll();
  },

  setRentQty(si, qty) {
    stateSetRentQty(si, qty);
    calculateWaterSupply();
  },

  autofillApts(si) {
    const from = Math.max(2, +document.getElementById(`af_from_${si}`).value || 2);
    const to = Math.max(from, +document.getElementById(`af_to_${si}`).value || from);
    const qty = Math.max(0, +document.getElementById(`af_qty_${si}`).value || 0);

    const result = stateAutofillApts(si, from, to, qty);
    recalcAll();

    // Восстановить значения в полях после ререндера
    setTimeout(() => {
      const fromEl = document.getElementById(`af_from_${si}`);
      const toEl = document.getElementById(`af_to_${si}`);
      const qtyEl = document.getElementById(`af_qty_${si}`);
      if (fromEl) fromEl.value = result.from;
      if (toEl) toEl.value = result.to;
      if (qtyEl) qtyEl.value = result.qty;
    }, 0);
  },

  clearApts(si) {
    stateClearApts(si);
    recalcAll();
  },

  // Зоны
  addZone(si) {
    stateAddZone(si);
    recalcAll();
  },

  removeZone(si, zid) {
    stateRemoveZone(si, zid);
    recalcAll();
  },

  clearZones(si) {
    stateClearZones(si);
    recalcAll();
  },

  updateZone(si, zid, field, value) {
    stateUpdateZone(si, zid, field, value);
    recalcAll();
  },

  updateZoneDia(si, zid, sys, value) {
    stateUpdateZoneDia(si, zid, sys, value);
    // При изменении V1 меняются T3 и T4, при изменении T3 меняется T4
    if (sys === 'V1' || sys === 'T3') {
      recalcAll();
    } else {
      calculateWaterSupply();
    }
  },

  toggleZoneLock(si, zid, checked) {
    stateToggleZoneLock(si, zid, checked);
    recalcAll();
  },

  // МОП (сшитый полиэтилен)
  setMopLength(si, value) {
    stateSetMopLength(si, value);
    recalcAll();
  },

  setMopPosition(si, value) {
    stateSetMopPosition(si, value);
    recalcAll();
  },

  setMopDiameter(si, value) {
    stateSetMopDiameter(si, value);
    recalcAll();
  },

  // Обновление email производителя при выборе из выпадающего списка
  updateManufacturerEmail(selectElement) {
    const parent = selectElement.closest('.accordion-manufacturer');
    if (!parent) return;

    const emailLink = parent.querySelector('.manufacturer-email');
    if (!emailLink) return;

    const selectedEmail = selectElement.value;
    emailLink.href = `mailto:${selectedEmail}`;
    emailLink.textContent = selectedEmail;
  }
};

// Функция переключения email производителя насосов
window.updatePumpEmail = function(selectElement) {
  const parent = selectElement.parentElement;
  const emails = parent.querySelectorAll('.manufacturer-email');
  const selectedValue = selectElement.value;

  emails.forEach(function(email) {
    if (email.dataset.manufacturer === selectedValue) {
      email.style.display = 'inline';
    } else {
      email.style.display = 'none';
    }
  });
};

// ===== Функция запроса КП =====

/**
 * Собирает сводку расчёта для письма
 * @returns {object} объект с данными расчёта
 */
function collectCalculationSummary() {
  const { h1, hn } = getHeights();
  const ivptEnabled = document.getElementById('ivptEnabled')?.checked === true;

  // Получаем данные расчёта
  const { zonesData, grandTotalRisersLen, byDiameter, byAlbum } = computeZonesData(sections, h1, hn, ivptEnabled);
  const risersByDiameter = computeRisersByDiameter(byDiameter);

  // Считаем общее количество квартир
  let totalApartments = 0;
  let totalRentUnits = 0;
  sections.forEach(sec => {
    Object.keys(sec.apts).forEach(floor => {
      if (+floor > 1) {
        totalApartments += (sec.apts[floor] || 0);
      }
    });
    if (sec.rent && sec.rent.enabled) {
      totalRentUnits += (sec.rent.qty || 0);
    }
  });

  return {
    sectionsCount: sections.length,
    h1,
    hn,
    ivptEnabled,
    totalApartments,
    totalRentUnits,
    zonesData,
    grandTotalRisersLen,
    risersByDiameter,
    byAlbum
  };
}

/**
 * Вспомогательная функция для расчёта количества компенсаторов
 * @param {number} length - длина стояка, м
 * @param {number} dia - диаметр трубы, мм
 * @returns {number} количество компенсаторов
 */
function calcCompensators(length, dia) {
  if (length <= 0 || dia <= 0) return 0;
  // Максимальное расстояние между компенсаторами зависит от диаметра
  const maxDistance = dia <= 32 ? 12 : (dia <= 50 ? 10 : 8);
  return Math.max(0, Math.ceil(length / maxDistance) - 1);
}

/**
 * Собирает данные спецификации для формирования письма
 * Возвращает объект с данными по каждому разделу
 * @param {Array} zonesData - данные зон из computeZonesData
 * @returns {object} данные спецификации по разделам
 */
function collectSpecificationData(zonesData) {
  const SLEEVE_LENGTH = 0.35; // длина одной гильзы в метрах

  // 1. Трубы стальные оцинкованные (стояки)
  const steelGalvanized = new Map(); // dia -> { len }
  let steelGalvanizedTotal = 0;

  // 2. Трубы стальные (гильзы)
  const steelSleeves = new Map(); // dia -> { len }
  let steelSleevesTotal = 0;

  // 4. Изоляция (стальные + PP-R)
  const insulation = new Map(); // dn -> { len }
  let insulationTotal = 0;

  // 6. Компенсаторы
  const compensators = new Map(); // dia -> count
  let compensatorsTotal = 0;

  // Обрабатываем данные зон
  zonesData.forEach(zd => {
    const d = zd.d || {};
    const risers = zd.risersPerSection || 1;
    const hZone = zd.hZone || 0;
    const floorsInZone = (zd.zoneTo || 0) - (zd.zoneFrom || 0) + 1;

    ['V1', 'T3', 'T4'].forEach(sys => {
      const dia = d[sys] || 0;
      if (dia > 0 && hZone > 0) {
        const totalLen = hZone * risers;

        // Стальные оцинкованные
        if (!steelGalvanized.has(dia)) {
          steelGalvanized.set(dia, { len: 0 });
        }
        steelGalvanized.get(dia).len += totalLen;
        steelGalvanizedTotal += totalLen;

        // Изоляция
        if (!insulation.has(dia)) {
          insulation.set(dia, { len: 0 });
        }
        insulation.get(dia).len += totalLen;
        insulationTotal += totalLen;

        // Гильзы
        if (floorsInZone > 0) {
          const sleeveDia = getSleeveDn(dia);
          const sleevesCount = risers * floorsInZone;
          const sleevesLen = sleevesCount * SLEEVE_LENGTH;

          if (!steelSleeves.has(sleeveDia)) {
            steelSleeves.set(sleeveDia, { len: 0 });
          }
          steelSleeves.get(sleeveDia).len += sleevesLen;
          steelSleevesTotal += sleevesLen;
        }
      }
    });

    // Компенсаторы (только для T3, T4)
    ['T3', 'T4'].forEach(sys => {
      const dia = d[sys] || 0;
      if (dia > 0 && hZone > 0) {
        const compPerRiser = calcCompensators(hZone, dia);
        const totalComp = compPerRiser * risers;
        if (totalComp > 0) {
          compensators.set(dia, (compensators.get(dia) || 0) + totalComp);
          compensatorsTotal += totalComp;
        }
      }
    });
  });

  // 3. Трубы PP-R (МОП)
  const pprPipes = new Map(); // dn -> { len }
  let pprTotal = 0;

  sections.forEach(sec => {
    const mopResult = computeMopPexLengthsForSection(sec);
    const totalLen = (mopResult.lengthV1 || 0) + (mopResult.lengthT3 || 0);
    if (totalLen > 0) {
      const dn = sec.mop?.dn || 20;
      if (!pprPipes.has(dn)) {
        pprPipes.set(dn, { len: 0 });
      }
      pprPipes.get(dn).len += totalLen;
      pprTotal += totalLen;

      // Добавляем к изоляции
      if (!insulation.has(dn)) {
        insulation.set(dn, { len: 0 });
      }
      insulation.get(dn).len += totalLen;
      insulationTotal += totalLen;
    }
  });

  // 5. Приборы учета воды
  let totalApartments = 0;
  let totalRentUnits = 0;
  sections.forEach(sec => {
    Object.keys(sec.apts).forEach(floor => {
      if (+floor > 1) {
        totalApartments += (sec.apts[floor] || 0);
      }
    });
    if (sec.rent && sec.rent.enabled) {
      totalRentUnits += (sec.rent.qty || 0);
    }
  });
  const waterMetersCount = (totalApartments + totalRentUnits) * 2;

  // 7. Узел коллекторный
  const collectors = new Map(); // outlets -> count
  let collectorsTotal = 0;

  sections.forEach(sec => {
    if (!sec.zones || sec.zones.length === 0) return;

    const aptsFloors = Object.keys(sec.apts).map(k => parseInt(k, 10)).filter(k => k > 0 && sec.apts[k] > 0);
    const maxFloor = Math.max(sec.floors || 0, ...aptsFloors);

    for (let floor = 2; floor <= maxFloor; floor++) {
      const aptsOnFloor = sec.apts[floor] || 0;
      if (aptsOnFloor <= 0) continue;

      const zone = sectionZoneForFloor(sec, floor);
      if (!zone) continue;

      const risers = Math.max(1, +zone.risers || 1);
      const base = Math.floor(aptsOnFloor / risers);
      const rem = aptsOnFloor % risers;

      for (let i = 0; i < risers; i++) {
        const outlets = i < rem ? base + 1 : base;
        if (outlets <= 0) continue;
        const actualOutlets = Math.max(2, outlets);
        collectors.set(actualOutlets, (collectors.get(actualOutlets) || 0) + 1);
        collectorsTotal += 1;
      }
    }
  });

  // 8. Запорная арматура
  const shutoffValves = new Map(); // name -> qty

  // Считаем стояки V1 и T3
  let totalRisersV1 = 0;
  let totalRisersT3 = 0;
  zonesData.forEach(zd => {
    const d = zd.d || {};
    const risers = zd.risersPerSection || 0;
    if (d.V1 && d.V1 > 0) totalRisersV1 += risers;
    if (d.T3 && d.T3 > 0) totalRisersT3 += risers;
  });

  // Позиции из "Монтаж узла концевого"
  if (totalRisersV1 > 0 || totalRisersT3 > 0) {
    const airVentCount = totalRisersV1 + totalRisersT3;
    shutoffValves.set('Автоматический воздухоотводчик Ду 15', airVentCount);
    shutoffValves.set('Кран шаровый Ду 15', airVentCount);
  }

  // Позиции из "Обвязка коллекторов"
  if (collectorsTotal > 0) {
    shutoffValves.set('Кран шаровый Ду 32', (shutoffValves.get('Кран шаровый Ду 32') || 0) + collectorsTotal);
    shutoffValves.set('Кран шаровый Ду 15', (shutoffValves.get('Кран шаровый Ду 15') || 0) + collectorsTotal);
    shutoffValves.set('Фильтр сетчатый косой Ду 32', collectorsTotal);
    shutoffValves.set('Регулятор давления Ду 32', collectorsTotal);
    shutoffValves.set('Манометр', collectorsTotal);
    shutoffValves.set('Кран сливной Ду 15', collectorsTotal);
  }

  let shutoffTotal = 0;
  shutoffValves.forEach(qty => { shutoffTotal += qty; });

  // Формируем результат
  return {
    'steel-galvanized': {
      items: mapToItems(steelGalvanized, 'dia', 'len'),
      total: steelGalvanizedTotal,
      unit: 'м'
    },
    'steel-sleeves': {
      items: mapToItems(steelSleeves, 'dia', 'len'),
      total: steelSleevesTotal,
      unit: 'м'
    },
    'ppr-pipes': {
      items: mapToItems(pprPipes, 'dia', 'len'),
      total: pprTotal,
      unit: 'м'
    },
    'insulation': {
      items: mapToItems(insulation, 'dia', 'len'),
      total: insulationTotal,
      unit: 'м'
    },
    'water-meters': {
      items: waterMetersCount > 0 ? [{ name: 'Счетчик воды Ду 15 универс. крыльчатый одноструйный с цифровым выходом RS485', qty: waterMetersCount }] : [],
      total: waterMetersCount,
      unit: 'шт'
    },
    'compensators': {
      items: compensatorsToItems(compensators),
      total: compensatorsTotal,
      totalSupports: compensatorsTotal * 2,
      unit: 'шт'
    },
    'collectors': {
      items: collectorsToItems(collectors),
      total: collectorsTotal,
      unit: 'шт'
    },
    'shutoff-valves': {
      items: shutoffValvesToItems(shutoffValves),
      total: shutoffTotal,
      unit: 'шт'
    },
    'pumps': {
      items: [], // Раздел в разработке
      total: 0,
      unit: 'шт'
    }
  };
}

/** Преобразует Map диаметр->данные в массив items */
function mapToItems(map, keyName, valueName) {
  const items = [];
  const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
  sortedKeys.forEach(key => {
    const data = map.get(key);
    items.push({ [keyName]: key, [valueName]: data.len });
  });
  return items;
}

/** Преобразует Map компенсаторов в массив items */
function compensatorsToItems(map) {
  const items = [];
  const sortedDias = Array.from(map.keys()).sort((a, b) => a - b);
  sortedDias.forEach(dia => {
    const count = map.get(dia);
    items.push({ name: 'Компенсатор', dia, qty: count });
    items.push({ name: 'Неподвижная опора', dia, qty: count * 2 });
  });
  return items;
}

/** Преобразует Map коллекторов в массив items */
function collectorsToItems(map) {
  const items = [];
  const sortedOutlets = Array.from(map.keys()).sort((a, b) => a - b);
  sortedOutlets.forEach(outlets => {
    const count = map.get(outlets);
    const suffix = outlets === 1 ? '' : (outlets < 5 ? 'а' : 'ов');
    items.push({ name: `Коллектор на ${outlets} выход${suffix}`, qty: count });
  });
  return items;
}

/** Преобразует Map запорной арматуры в массив items */
function shutoffValvesToItems(map) {
  const items = [];
  map.forEach((qty, name) => {
    if (qty > 0) {
      items.push({ name, qty });
    }
  });
  return items;
}

/**
 * Формирует текст письма для сервера
 * @param {string} projectName - название проекта
 * @param {object} summary - данные расчёта
 * @returns {string} текст письма
 */
function formatQuoteRequestText(projectName, summary) {
  let text = `Добрый день!\n\n`;
  text += `Прошу предоставить коммерческое предложение по проекту.\n\n`;

  text += `=== ПАРАМЕТРЫ ПРОЕКТА ===\n`;
  text += `Количество корпусов: ${summary.sectionsCount}\n`;
  text += `Высота 1-го этажа: ${summary.h1} м\n`;
  text += `Высота типового этажа: ${summary.hn} м\n`;
  text += `Квартир всего: ${summary.totalApartments}\n`;
  if (summary.totalRentUnits > 0) {
    text += `Узлов учёта аренды: ${summary.totalRentUnits}\n`;
  }
  text += `ИВПТ: ${summary.ivptEnabled ? 'Да' : 'Нет'}\n\n`;

  // Стояки по диаметрам
  text += `=== СТОЯКИ ПО ДИАМЕТРАМ ===\n`;
  if (summary.risersByDiameter && summary.risersByDiameter.length > 0) {
    summary.risersByDiameter.forEach(item => {
      // item = { system, diameter, count, length }
      text += `${item.system} Ø${item.diameter}: ${item.count} шт., ${item.length} м\n`;
    });
  }
  text += `Общая длина стояков: ${summary.grandTotalRisersLen} м\n\n`;

  // КУУ (альбомы)
  text += `=== КУУ (УЗЛЫ УЧЁТА) ===\n`;
  if (summary.byAlbum) {
    Object.entries(summary.byAlbum).forEach(([albumType, count]) => {
      if (count > 0) {
        text += `${albumType}: ${count} шт.\n`;
      }
    });
  }
  text += `\n`;

  // Зоны (краткая сводка)
  text += `=== ЗОНЫ ===\n`;
  if (summary.zonesData && summary.zonesData.length > 0) {
    summary.zonesData.forEach((zone, idx) => {
      text += `Зона ${idx + 1} (Корпус ${zone.sectionIndex + 1}): `;
      text += `этажи ${zone.floorFrom}-${zone.floorTo}, `;
      text += `стояков: ${zone.risersCount}, `;
      text += `длина: ${zone.risersLen} м\n`;
    });
  }
  text += `\n`;

  text += `===\n\n`;
  text += `С уважением,\n`;
  text += `[Ваше имя]\n`;
  text += `[Контактный телефон]`;

  return text;
}

/**
 * Отправляет заявку на сервер через fetch
 * @param {string} subject - тема письма
 * @param {string} text - текст письма
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function sendQuoteToServer(subject, text) {
  const response = await fetch('http://localhost:3001/send-mail', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ subject, text })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Ошибка сервера: ${response.status}`);
  }

  return data;
}

/**
 * Собирает данные о разделах спецификации из DOM
 * @returns {Array<{sectionId: string, title: string, supplierName: string, supplierEmail: string}>}
 */
function collectSpecificationSections() {
  const sections = [];
  const container = document.getElementById('specificationContent');
  if (!container) {
    console.warn('collectSpecificationSections: контейнер specificationContent не найден');
    return sections;
  }

  // Находим все аккордеоны спецификации
  const accordions = container.querySelectorAll('details.accordion');

  accordions.forEach(accordion => {
    const header = accordion.querySelector('.accordion-header');
    if (!header) return;

    // Название раздела
    const titleEl = header.querySelector('.accordion-title');
    const title = titleEl ? titleEl.textContent.trim() : '';

    // Блок производителя
    const manufacturerBlock = header.querySelector('.accordion-manufacturer');
    if (!manufacturerBlock) return;

    // Получаем sectionId из data-section атрибута input или select
    const inputEl = manufacturerBlock.querySelector('.manufacturer-input[data-section]');
    const selectEl = manufacturerBlock.querySelector('.manufacturer-select[data-section]');

    let sectionId = '';
    let supplierName = '';

    if (selectEl) {
      sectionId = selectEl.dataset.section;
      // Получаем текст выбранной опции (название производителя)
      const selectedOption = selectEl.options[selectEl.selectedIndex];
      supplierName = selectedOption ? selectedOption.textContent.trim() : '';
    } else if (inputEl) {
      sectionId = inputEl.dataset.section;
      supplierName = inputEl.value;
    }

    if (!sectionId || !title) return;

    // Получаем email поставщика
    let supplierEmail = '';

    // Для select элемента email хранится в value выбранной опции
    if (selectEl) {
      supplierEmail = selectEl.value || '';
    } else {
      // Для input элемента берём email из ссылки
      const emailLink = manufacturerBlock.querySelector('.manufacturer-email');
      if (emailLink && emailLink.href && emailLink.href.startsWith('mailto:')) {
        supplierEmail = emailLink.href.replace('mailto:', '').trim();
      }
    }

    sections.push({
      sectionId,
      title,
      supplierName,
      supplierEmail
    });
  });

  console.log('collectSpecificationSections: собрано разделов:', sections.length, sections);
  return sections;
}

/**
 * Обработчик нажатия кнопки "Запросить КП"
 * Открывает диалог с разделами спецификации
 */
function handleRequestQuote() {
  console.log('handleRequestQuote: открываем диалог выбора разделов');
  openQuoteDialog();
}

/**
 * Открывает диалог выбора разделов КП
 */
function openQuoteDialog() {
  const dialog = document.getElementById('quoteRecipientDialog');
  if (!dialog) return;

  // Собираем данные о разделах спецификации
  const specSections = collectSpecificationSections();

  // Заполняем список разделов
  const listContainer = document.getElementById('quoteSectionsList');
  if (listContainer) {
    if (specSections.length === 0) {
      listContainer.innerHTML = '<p class="note">Нет данных спецификации. Сначала выполните расчёт.</p>';
    } else {
      listContainer.innerHTML = specSections.map((sec, idx) => `
        <label class="quote-section-item">
          <input type="checkbox" name="quoteSection" value="${sec.sectionId}"
                 data-email="${sec.supplierEmail}" data-supplier="${sec.supplierName}"
                 data-title="${sec.title}" checked>
          <div class="quote-section-info">
            <div class="quote-section-title">${sec.title}</div>
            <div class="quote-section-supplier">
              <span class="supplier-name">${sec.supplierName}</span>
              ${sec.supplierEmail ? `<span class="supplier-email">(${sec.supplierEmail})</span>` : '<span class="supplier-email">(email не указан)</span>'}
            </div>
          </div>
        </label>
      `).join('');
    }
  }

  dialog.style.display = 'flex';
}

/**
 * Закрывает диалог выбора разделов КП
 */
function closeQuoteDialog() {
  const dialog = document.getElementById('quoteRecipientDialog');
  if (dialog) {
    dialog.style.display = 'none';
  }
}

/**
 * Получает выбранные разделы из диалога
 * @returns {Array<{sectionId: string, title: string, supplierName: string, supplierEmail: string}>}
 */
function getSelectedSections() {
  const checkboxes = document.querySelectorAll('input[name="quoteSection"]:checked');
  const selected = [];

  checkboxes.forEach(cb => {
    selected.push({
      sectionId: cb.value,
      title: cb.dataset.title || '',
      supplierName: cb.dataset.supplier || '',
      supplierEmail: cb.dataset.email || ''
    });
  });

  return selected;
}

/**
 * Форматирует данные раздела спецификации в текст для письма
 * @param {object} secData - данные раздела из collectSpecificationData
 * @param {string} sectionId - идентификатор раздела
 * @returns {string} отформатированные строки позиций
 */
function formatSectionItems(secData, sectionId) {
  if (!secData || !secData.items || secData.items.length === 0) {
    return '';
  }

  let result = '';
  const items = secData.items;

  switch (sectionId) {
    case 'steel-galvanized':
    case 'steel-sleeves':
    case 'ppr-pipes':
    case 'insulation':
      // Формат: Ду XX — YY.Y м
      items.forEach(item => {
        if (item.dia && item.len) {
          result += `   - Ду ${item.dia} — ${item.len.toFixed(1)} м\n`;
        }
      });
      break;

    case 'water-meters':
      // Формат: Наименование — XX шт
      items.forEach(item => {
        if (item.name && item.qty) {
          result += `   - ${item.name} — ${item.qty} шт\n`;
        }
      });
      break;

    case 'compensators':
      // Формат: Наименование Ду XX — YY шт
      items.forEach(item => {
        if (item.name && item.dia && item.qty) {
          result += `   - ${item.name} Ду ${item.dia} — ${item.qty} шт\n`;
        }
      });
      break;

    case 'collectors':
    case 'shutoff-valves':
      // Формат: Наименование — XX шт
      items.forEach(item => {
        if (item.name && item.qty) {
          result += `   - ${item.name} — ${item.qty} шт\n`;
        }
      });
      break;

    default:
      // Общий формат
      items.forEach(item => {
        if (item.name && item.qty) {
          result += `   - ${item.name} — ${item.qty} ${secData.unit || 'шт'}\n`;
        } else if (item.dia && item.len) {
          result += `   - Ду ${item.dia} — ${item.len.toFixed(1)} ${secData.unit || 'м'}\n`;
        }
      });
  }

  return result;
}

/**
 * Формирует текст письма с выбранными разделами
 * Фильтрует пустые разделы (без позиций)
 * @param {string} projectName - название проекта
 * @param {object} summary - данные расчёта
 * @param {Array} selectedSections - выбранные разделы из диалога
 * @param {object} specData - данные спецификации из collectSpecificationData
 * @returns {string} текст письма
 */
function formatQuoteRequestTextWithSections(projectName, summary, selectedSections, specData) {
  let text = `Добрый день!\n\n`;
  text += `Просим Вас предоставить коммерческое предложение по следующим позициям:\n\n`;

  // Фильтруем только разделы с реальными данными
  const sectionsWithData = [];
  const sectionsWithoutData = [];

  if (selectedSections && selectedSections.length > 0) {
    selectedSections.forEach(sec => {
      const secData = specData[sec.sectionId];
      const hasItems = secData && secData.items && secData.items.length > 0;

      if (hasItems) {
        sectionsWithData.push({ ...sec, specData: secData });
      } else {
        sectionsWithoutData.push(sec);
      }
    });
  }

  // Выводим разделы с данными
  if (sectionsWithData.length > 0) {
    sectionsWithData.forEach((sec, idx) => {
      text += `${idx + 1}. ${sec.title} (Производитель: ${sec.supplierName})\n`;

      const itemsText = formatSectionItems(sec.specData, sec.sectionId);
      if (itemsText) {
        text += itemsText;
      }

      text += `\n`;
    });
  }

  // Если есть разделы без данных, выводим их отдельно (опционально)
  // По желанию можно закомментировать этот блок, чтобы полностью скрыть пустые разделы
  /*
  if (sectionsWithoutData.length > 0) {
    text += `Разделы без детализации:\n`;
    sectionsWithoutData.forEach(sec => {
      text += `   - ${sec.title} (${sec.supplierName})\n`;
    });
    text += `\n`;
  }
  */

  // Если ни один раздел не содержит данных
  if (sectionsWithData.length === 0 && sectionsWithoutData.length > 0) {
    text += `(Разделы выбраны, но данные для детализации отсутствуют. `;
    text += `Выполните расчёт на вкладке "Жилая часть".)\n\n`;
  }

  // Реквизиты компании
  const companyRequisites = [
    'Наименование полное: Акционерное общество "СУ-10 фундамент строй"',
    'Наименование сокращенное: АО "СУ-10 фундамент строй"',
    'ИНН: 7729506782',
    'КПП: 502401001',
    'Свидетельство о постановке на налоговый учет: серия 77 N 007059419 выдано 05.05.2004 г. Постановка на учет 05.05.2004 г.',
    'Местонахождение (юр. адрес): 143405, Московская область, г. Красногорск, шоссе Ильинское, д. 1А, помещение 32, 2С',
    'Местонахождение (факт. адрес): 127018, г. Москва, ул. Полковая, д. 3, стр. 5',
    'Телефоны АО "СУ-10 фундамент строй": 8 (495) 616-23-22; 616-53-29; 615-82-00',
    'эл.почта: su10@su10.ru',
    'ОКПО: 72974742',
    'ОКВЭД: 45.11, 45.21.1',
    'БАНК: ООО КБ "АРЕСБАНК" г. Москва',
    'р/с: 40702810400000601334',
    'к/сч: 30101810845250000029',
    'БИК: 044525229'
  ];

  text += `─────────────────────────────────\n`;
  text += companyRequisites.join('\n');
  text += `\n─────────────────────────────────\n\n`;

  // Примечание
  text += `* при оформлении счетов-фактур в строках грузополучатель и его адрес, адрес покупателя - указывать юридический адрес 143405, Московская область, г. Красногорск, шоссе Ильинское, д. 1А, помещение 32, 2С\n\n`;

  text += `С уважением,\n`;
  text += `АО "СУ-10 фундамент строй"`;

  return text;
}

/**
 * Отправляет заявку с выбранными разделами
 */
async function sendQuoteWithSections() {
  // Получаем выбранные разделы
  const selectedSections = getSelectedSections();

  if (selectedSections.length === 0) {
    alert('Выберите хотя бы один раздел для отправки');
    return;
  }

  console.log('sendQuoteWithSections: выбрано разделов:', selectedSections.length);

  // Получаем название проекта
  const project = findProjectById(projects, activeProjectId);
  const projectName = project?.name || 'Проект';

  // Собираем данные расчёта
  const summary = collectCalculationSummary();

  // Собираем данные спецификации для каждого раздела
  const specData = collectSpecificationData(summary.zonesData);

  // Формируем subject и text
  const subject = `Запрос коммерческого предложения по объекту: ${projectName}`;
  const text = formatQuoteRequestTextWithSections(projectName, summary, selectedSections, specData);

  console.log('sendQuoteWithSections: subject =', subject);
  console.log('sendQuoteWithSections: text =', text);

  // Блокируем кнопку отправки
  const btnSend = document.getElementById('btnQuoteSend');
  const originalText = btnSend?.textContent;
  if (btnSend) {
    btnSend.disabled = true;
    btnSend.textContent = 'Отправка...';
  }

  try {
    const data = await sendQuoteToServer(subject, text);

    if (data.ok === true) {
      closeQuoteDialog();
      const sectionsInfo = selectedSections.map(s => s.title).join(', ');
      alert(`Заявка отправлена!\nРазделы: ${sectionsInfo}`);
      console.log('sendQuoteWithSections: успешно отправлено', data);
    } else {
      const errorMsg = data.error || 'Неизвестная ошибка сервера';
      console.error('sendQuoteWithSections: сервер вернул ошибку', data);
      alert(`Ошибка отправки: ${errorMsg}`);
    }
  } catch (error) {
    console.error('sendQuoteWithSections: ошибка при отправке', error);
    alert(`Не удалось отправить заявку: ${error.message || 'Проверьте подключение к серверу'}`);
  } finally {
    if (btnSend) {
      btnSend.disabled = false;
      btnSend.textContent = originalText;
    }
  }
}

/**
 * Инициализация диалога выбора разделов КП
 */
function initQuoteDialog() {
  const dialog = document.getElementById('quoteRecipientDialog');
  if (!dialog) {
    console.warn('[initQuoteDialog] Диалог quoteRecipientDialog не найден');
    return;
  }

  // Кнопка "Отмена"
  const btnCancel = document.getElementById('btnQuoteCancel');
  btnCancel?.addEventListener('click', closeQuoteDialog);

  // Кнопка "Отправить"
  const btnSend = document.getElementById('btnQuoteSend');
  btnSend?.addEventListener('click', sendQuoteWithSections);

  // Кнопка "Выбрать все"
  const btnSelectAll = document.getElementById('btnSelectAll');
  btnSelectAll?.addEventListener('click', () => {
    document.querySelectorAll('input[name="quoteSection"]').forEach(cb => {
      cb.checked = true;
    });
  });

  // Кнопка "Снять все"
  const btnDeselectAll = document.getElementById('btnDeselectAll');
  btnDeselectAll?.addEventListener('click', () => {
    document.querySelectorAll('input[name="quoteSection"]').forEach(cb => {
      cb.checked = false;
    });
  });

  // Закрытие по клику на оверлей
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeQuoteDialog();
    }
  });

  // Закрытие по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.style.display !== 'none') {
      closeQuoteDialog();
    }
  });

  console.log('[initQuoteDialog] Диалог инициализирован');
}

// ===== Расчет стоимости подземной части =====

// Ставки за м² (изменяемые)
let undergroundRates = {
  V1: {
    work: 679.03,      // стоимость работ В1, руб/м²
    material: 480.12   // стоимость материалов В1, руб/м²
  },
  T3T4: {
    work: 452.69,      // стоимость работ Т3,Т4, руб/м²
    material: 329.68   // стоимость материалов Т3,Т4, руб/м²
  }
};

// Ключ для хранения ставок в localStorage
const RATES_STORAGE_KEY = 'undergroundRates';

/**
 * Загружает ставки из localStorage
 */
function loadRatesFromStorage() {
  try {
    const saved = localStorage.getItem(RATES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      undergroundRates = { ...undergroundRates, ...parsed };
    }
  } catch (e) {
    console.warn('Не удалось загрузить ставки из localStorage:', e);
  }
}

/**
 * Сохраняет ставки в localStorage
 */
function saveRatesToStorage() {
  try {
    localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(undergroundRates));
  } catch (e) {
    console.warn('Не удалось сохранить ставки в localStorage:', e);
  }
}

/**
 * Открывает диалог редактирования ставок
 */
function openRatesEditDialog() {
  const dialog = document.getElementById('ratesEditDialog');
  if (!dialog) return;

  // Заполняем поля текущими значениями
  document.getElementById('rateWorkV1').value = undergroundRates.V1.work;
  document.getElementById('rateMaterialV1').value = undergroundRates.V1.material;
  document.getElementById('rateWorkT3T4').value = undergroundRates.T3T4.work;
  document.getElementById('rateMaterialT3T4').value = undergroundRates.T3T4.material;

  dialog.style.display = 'flex';
}

/**
 * Закрывает диалог редактирования ставок
 */
function closeRatesEditDialog() {
  const dialog = document.getElementById('ratesEditDialog');
  if (dialog) {
    dialog.style.display = 'none';
  }
}

/**
 * Сохраняет ставки из диалога
 */
function saveRatesFromDialog() {
  const workV1 = parseFloat(document.getElementById('rateWorkV1').value) || 0;
  const materialV1 = parseFloat(document.getElementById('rateMaterialV1').value) || 0;
  const workT3T4 = parseFloat(document.getElementById('rateWorkT3T4').value) || 0;
  const materialT3T4 = parseFloat(document.getElementById('rateMaterialT3T4').value) || 0;

  undergroundRates.V1.work = workV1;
  undergroundRates.V1.material = materialV1;
  undergroundRates.T3T4.work = workT3T4;
  undergroundRates.T3T4.material = materialT3T4;

  saveRatesToStorage();
  closeRatesEditDialog();

  // Пересчитываем стоимость с новыми ставками
  calculateUndergroundCost();
}

/**
 * Инициализация диалога редактирования ставок
 */
function initRatesEditDialog() {
  const dialog = document.getElementById('ratesEditDialog');
  if (!dialog) return;

  // Загружаем сохраненные ставки
  loadRatesFromStorage();

  // Кнопка "Отмена"
  document.getElementById('btnRatesCancel')?.addEventListener('click', closeRatesEditDialog);

  // Кнопка "Сохранить"
  document.getElementById('btnRatesSave')?.addEventListener('click', saveRatesFromDialog);

  // Закрытие по клику на оверлей
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeRatesEditDialog();
    }
  });

  // Закрытие по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.style.display !== 'none') {
      closeRatesEditDialog();
    }
  });

  // Кнопка открытия диалога
  document.getElementById('btnEditRates')?.addEventListener('click', openRatesEditDialog);
}

/**
 * Форматирует число как денежную сумму (с разделителями тысяч и 2 знаками после запятой)
 * @param {number} value - число для форматирования
 * @returns {string} отформатированная строка
 */
function formatMoney(value) {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Расчет и отображение стоимости подземной части
 */
function calculateUndergroundCost() {
  const areaInput = document.getElementById('undergroundArea');
  const resultsBlock = document.getElementById('undergroundCostResults');

  if (!areaInput || !resultsBlock) return;

  const area = parseFloat(areaInput.value) || 0;

  // Если площадь = 0, скрываем результаты
  if (area <= 0) {
    resultsBlock.style.display = 'none';
    return;
  }

  // Расчет стоимостей
  const workV1 = area * undergroundRates.V1.work;
  const materialV1 = area * undergroundRates.V1.material;
  const workT3T4 = area * undergroundRates.T3T4.work;
  const materialT3T4 = area * undergroundRates.T3T4.material;
  const total = workV1 + materialV1 + workT3T4 + materialT3T4;

  // Отображение результатов
  document.getElementById('costWorkV1').textContent = formatMoney(workV1);
  document.getElementById('costMaterialV1').textContent = formatMoney(materialV1);
  document.getElementById('costWorkT3T4').textContent = formatMoney(workT3T4);
  document.getElementById('costMaterialT3T4').textContent = formatMoney(materialT3T4);
  document.getElementById('costTotalUnderground').innerHTML = `<strong>${formatMoney(total)}</strong>`;

  // Показываем блок результатов
  resultsBlock.style.display = 'block';
}

// ===== Инициализация =====
window.onload = () => {
  // Устанавливаем callback для автосохранения
  setOnStateChange(onStateChange);

  // Устанавливаем callback для смены вкладки
  setOnTabChange((tabId) => {
    saveCurrentProject();
  });

  // Устанавливаем renderer для вкладки "Спецификация"
  setSpecificationRenderer(renderSpecification);

  // Устанавливаем renderer для вкладки "Смета"
  setEstimateRenderer(renderEstimate);

  // Загружаем проекты из localStorage
  projects = loadProjects();
  activeProjectId = getActiveProjectId();

  // Если нет проектов — создаём дефолтный
  if (projects.length === 0) {
    createNewProject('Новый проект 1');
  } else {
    // Проверяем, существует ли активный проект
    const activeProject = findProjectById(projects, activeProjectId);
    if (!activeProject) {
      // Берём последний изменённый
      projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      activeProjectId = projects[0].id;
    }
    switchToProject(activeProjectId);
  }

  // Навешивание обработчиков на элементы калькулятора
  document.getElementById('numSections')?.addEventListener('change', onSectionsCountChange);

  document.getElementById('h1')?.addEventListener('change', () => {
    recalcAll();
    saveCurrentProject();
  });

  document.getElementById('hn')?.addEventListener('change', () => {
    recalcAll();
    saveCurrentProject();
  });

  document.getElementById('ivptEnabled')?.addEventListener('change', () => {
    calculateWaterSupply();
    saveCurrentProject();
  });

  // Обработчик расчета стоимости подземной части
  document.getElementById('undergroundArea')?.addEventListener('input', calculateUndergroundCost);

  document.getElementById('btnCalculate')?.addEventListener('click', calculateWaterSupply);

  document.getElementById('btnExport')?.addEventListener('click', () => {
    const project = findProjectById(projects, activeProjectId);
    exportToExcel(calculateWaterSupply, getHeights, project?.name);
  });

  // Обработчик экспорта сметы
  document.getElementById('btnExportEstimate')?.addEventListener('click', () => {
    const { zonesData, risersByDiameter, h1, hn, ivptEnabled } = lastCalculationCache;

    if (!zonesData || !risersByDiameter) {
      alert('Сначала произведите расчёт на вкладке «Жилая часть»');
      return;
    }

    // Получаем производителя коллектора из UI
    const collectorSelect = document.querySelector('select.manufacturer-select[data-section="collectors"]');
    const collectorVendor = collectorSelect ?
      (collectorSelect.options[collectorSelect.selectedIndex]?.text || 'РФ') : 'РФ';

    const estimateData = aggregateEstimateData({
      zonesData,
      risersByDiameter,
      sections,
      h1,
      hn,
      ivptEnabled,
      collectorVendor,
    });

    exportEstimateToExcel(estimateData, sections.length);
  });

  // Обработчик создания проекта
  document.getElementById('btnCreateProject')?.addEventListener('click', () => {
    window.app.createProject();
  });

  // Enter в поле имени проекта
  document.getElementById('newProjectName')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      window.app.createProject();
    }
  });

  // Закрытие меню при клике вне
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.project-menu') && !e.target.closest('.project-menu-btn')) {
      closeAllProjectMenus();
    }
  });

  // Обработчики импорта из Excel
  // Клик по кнопке открывает диалог выбора файла
  document.getElementById('btnImportExcel')?.addEventListener('click', openExcelFileDialog);
  // После выбора файла автоматически запускается импорт
  document.getElementById('excelFileInput')?.addEventListener('change', onExcelFileSelect);

  // Обработчик кнопки "Запросить КП" (резервная привязка в window.onload)
  initRequestQuoteButton();

  // Инициализация диалога выбора получателя КП
  initQuoteDialog();

  // Инициализация диалога редактирования ставок стоимости
  initRatesEditDialog();
};

// ===== Отдельная инициализация кнопки "Запросить КП" =====
function initRequestQuoteButton() {
  const btn = document.getElementById('btnRequestQuote');
  if (!btn) {
    console.error('[initRequestQuoteButton] Кнопка btnRequestQuote НЕ найдена');
    return;
  }

  // Проверяем, не был ли обработчик уже добавлен
  if (btn.dataset.listenerAdded === 'true') {
    console.log('[initRequestQuoteButton] Обработчик уже был добавлен ранее');
    return;
  }

  console.log('[initRequestQuoteButton] Привязываем обработчик клика');
  btn.dataset.listenerAdded = 'true';

  btn.addEventListener('click', (event) => {
    event.preventDefault();
    console.log('[btnRequestQuote] Клик по кнопке "Запросить КП"');
    handleRequestQuote();
  });
}

// ===== Гарантированная инициализация через DOMContentLoaded =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('[DOMContentLoaded] Событие сработало');
  initRequestQuoteButton();
});

// ===== Fallback: если DOMContentLoaded уже прошёл =====
if (document.readyState === 'loading') {
  console.log('[main.js] DOM ещё загружается, ждём DOMContentLoaded');
} else {
  console.log('[main.js] DOM уже загружен, инициализируем сразу');
  initRequestQuoteButton();
}
