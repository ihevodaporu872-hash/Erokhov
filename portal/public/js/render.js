import { REAL_DN, ALBUMS, albumKeys, getSleeveDn, STEEL_ZN_CLAMPS_RULES } from './constants.js';
import { sections } from './state.js';
import { formatDate, getProjectStats } from './storage.js';
import { sectionZoneForFloor, computeMopPexLengthsForSection, computeCommissioningData } from './calculations.js';

// ===== Вспомогательные функции для стилизации систем =====

/**
 * Возвращает CSS-класс модификатора для системы
 * @param {string} sys - код системы (V1, T3, T4 или В1, Т3, Т4)
 * @returns {string} класс модификатора (sys-cell--V1, sys-cell--T3, sys-cell--T4)
 */
function getSysCellClass(sys) {
  const sysCode = sys.toUpperCase().replace('В', 'V').replace('Т', 'T');
  if (sysCode === 'V1') return 'sys-cell--V1';
  if (sysCode === 'T3') return 'sys-cell--T3';
  if (sysCode === 'T4') return 'sys-cell--T4';
  return '';
}

/**
 * Генерирует HTML для ячейки системы с правильным классом цвета
 * @param {string} sysName - отображаемое название системы (В1, Т3, Т4)
 * @param {string} sysCode - код системы для CSS (V1, T3, T4)
 * @returns {string} HTML-строка <td class="sys-cell sys-cell--XX">...</td>
 */
function sysCellHtml(sysName, sysCode) {
  const modClass = getSysCellClass(sysCode || sysName);
  return `<td class="sys-cell ${modClass}">${sysName}</td>`;
}

// ===== Рендер панели проектов =====

// Рендер списка проектов
export function renderProjectsList(projects, activeProjectId) {
  const container = document.getElementById('projectsList');
  if (!container) return;

  if (!projects.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Нет проектов</p>
        <p>Создайте первый проект выше</p>
      </div>
    `;
    return;
  }

  const html = projects
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(project => {
      const stats = getProjectStats(project);
      const isActive = project.id === activeProjectId;

      return `
        <div class="project-card ${isActive ? 'active' : ''}" data-project-id="${project.id}">
          <div class="project-card-header">
            <div class="project-name">${escapeHtml(project.name)}</div>
            <button class="project-menu-btn" onclick="event.stopPropagation(); window.app.toggleProjectMenu('${project.id}')">⋮</button>
          </div>
          <div class="project-stats">
            ${stats.sectionsCount} корп. / ${stats.totalFloors} эт. / ${stats.totalApts} кв.
          </div>
          <div class="project-dates">
            Изменён: ${formatDate(project.updatedAt)}
          </div>
          <div class="project-menu" id="menu-${project.id}">
            <button onclick="event.stopPropagation(); window.app.renameProject('${project.id}')">Переименовать</button>
            <button class="danger" onclick="event.stopPropagation(); window.app.deleteProject('${project.id}')">Удалить</button>
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="projects-list-title">Мои проекты</div>
    ${html}
  `;

  // Навешиваем обработчики клика на карточки
  container.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.project-menu-btn') || e.target.closest('.project-menu')) return;
      const projectId = card.dataset.projectId;
      window.app.switchProject(projectId);
    });
  });
}

// Обновление имени проекта в шапке
export function updateCurrentProjectName(name) {
  const el = document.getElementById('currentProjectName');
  if (el) {
    el.textContent = name || 'Без названия';
  }
}

// Закрытие всех меню проектов
export function closeAllProjectMenus() {
  document.querySelectorAll('.project-menu').forEach(menu => {
    menu.classList.remove('show');
  });
}

// Переключение меню проекта
export function toggleProjectMenu(projectId) {
  const menu = document.getElementById(`menu-${projectId}`);
  if (!menu) return;

  const wasOpen = menu.classList.contains('show');
  closeAllProjectMenus();

  if (!wasOpen) {
    menu.classList.add('show');
  }
}

// Показ модального окна
export function showModal(title, inputValue, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${escapeHtml(title)}</h3>
      <input type="text" id="modalInput" value="${escapeHtml(inputValue || '')}" placeholder="Введите название...">
      <div class="modal-buttons">
        <button class="btn-danger" id="modalCancel">Отмена</button>
        <button class="btn-secondary" id="modalConfirm">Подтвердить</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector('#modalInput');
  input.focus();
  input.select();

  const close = () => {
    overlay.remove();
  };

  overlay.querySelector('#modalCancel').addEventListener('click', () => {
    close();
    if (onCancel) onCancel();
  });

  overlay.querySelector('#modalConfirm').addEventListener('click', () => {
    const value = input.value.trim();
    close();
    if (onConfirm) onConfirm(value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const value = input.value.trim();
      close();
      if (onConfirm) onConfirm(value);
    } else if (e.key === 'Escape') {
      close();
      if (onCancel) onCancel();
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
      if (onCancel) onCancel();
    }
  });
}

// Показ диалога подтверждения
export function showConfirmDialog(title, message, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${escapeHtml(title)}</h3>
      <p style="margin-bottom: 16px; color: #666;">${escapeHtml(message)}</p>
      <div class="modal-buttons">
        <button class="btn-secondary" id="modalCancel">Отмена</button>
        <button class="btn-danger" id="modalConfirm">Удалить</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
  };

  overlay.querySelector('#modalCancel').addEventListener('click', () => {
    close();
    if (onCancel) onCancel();
  });

  overlay.querySelector('#modalConfirm').addEventListener('click', () => {
    close();
    if (onConfirm) onConfirm();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
      if (onCancel) onCancel();
    }
  });
}

// Экранирование HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Рендер калькулятора =====

// Рендер select для диаметра
function renderDnSelect(currentValue, onChangeJs, disabled) {
  const options = REAL_DN.map(d => `<option value="${d}" ${+currentValue === d ? 'selected' : ''}>${d}</option>`).join('');
  return `<select ${disabled ? 'disabled' : ''} onchange="${onChangeJs}">${options}</select>`;
}

// Рендер таблицы квартир корпуса
function renderFloorsTableForSection(si) {
  const sec = sections[si];
  const numFloors = sec.floors;
  let rows = '';

  for (let f = 1; f <= numFloors; f++) {
    const isFirst = f === 1;
    const aptVal = isFirst ? 0 : (sec.apts[f] ?? 0);
    const aptCell = isFirst
      ? `<input type="number" value="0" disabled/>`
      : `<input type="number" min="0" max="200" value="${aptVal}" oninput="window.app.setApt(${si}, ${f}, +this.value)">`;

    const rentCells = isFirst
      ? `
        <td>
          <select onchange="window.app.setRentEnabled(${si}, this.value==='yes');">
            <option value="no" ${!sec.rent.enabled ? 'selected' : ''}>Нет</option>
            <option value="yes" ${sec.rent.enabled ? 'selected' : ''}>Да</option>
          </select>
        </td>
        <td>
          <input type="number" min="0" step="1" value="${sec.rent.qty}"
            ${sec.rent.enabled ? '' : 'disabled'}
            oninput="window.app.setRentQty(${si}, +this.value)">
        </td>`
      : `<td></td><td></td>`;

    rows += `
      <tr>
        <td>Этаж ${f}</td>
        <td>${aptCell}</td>
        ${rentCells}
      </tr>
    `;
  }

  return `
    <div class="floors-table">
      <table>
        <thead>
          <tr>
            <th>Этаж</th>
            <th>Квартир, шт (на корпус)</th>
            <th>Аренда (1-й этаж)</th>
            <th>Количество узлов учета арендных помещений</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// Рендер таблицы зон корпуса
function renderZonesTableForSection(si) {
  const sec = sections[si];
  if (!sec.zones.length) return `<div class="note">Зон пока нет. Добавьте зону корпуса.</div>`;

  const rows = sec.zones.map(z => {
    const d = z.fixedD || { V1: 32, T3: 32, T4: 32 };
    const dis = z.locked ? 'disabled' : '';

    return `
    <tr>
      <td>
        <input type="text" value="${z.name}" ${dis}
          oninput="window.app.updateZone(${si}, ${z.id}, 'name', this.value)"/>
        <div class="inline" style="margin-top:6px;">
          <label class="inline" style="gap:6px;">
            <input type="checkbox" ${z.locked ? 'checked' : ''} onchange="window.app.toggleZoneLock(${si}, ${z.id}, this.checked)">
            Закрепить зону
          </label>
        </div>
      </td>
      <td style="text-align:center;">1</td>
      <td><input type="number" min="1" value="${z.to}" ${dis}
             oninput="window.app.updateZone(${si}, ${z.id}, 'to', +this.value)"/></td>
      <td><input type="number" min="1" value="${z.risers}" ${dis}
             oninput="window.app.updateZone(${si}, ${z.id}, 'risers', +this.value)"/></td>
      <td>${renderDnSelect(d.V1 ?? 32, `window.app.updateZoneDia(${si}, ${z.id}, 'V1', +this.value)`, z.locked)}</td>
      <td>${renderDnSelect(d.T3 ?? 32, `window.app.updateZoneDia(${si}, ${z.id}, 'T3', +this.value)`, z.locked)}</td>
      <td>${renderDnSelect(d.T4 ?? 32, `window.app.updateZoneDia(${si}, ${z.id}, 'T4', +this.value)`, z.locked)}</td>
      <td>
        <select ${dis} onchange="window.app.updateZone(${si}, ${z.id}, 'albumType', this.value)">
          ${albumKeys.map(k => `<option value="${k}" ${z.albumType === k ? 'selected' : ''}>${ALBUMS[k]}</option>`).join('')}
        </select>
      </td>
      <td style="text-align:right;"><button class="btn-danger" onclick="window.app.removeZone(${si}, ${z.id})" ${z.locked ? 'disabled' : ''}>Удалить</button></td>
    </tr>`;
  }).join('');

  return `
    <div class="zone-table">
      <table>
        <thead>
          <tr>
            <th>Название зоны</th>
            <th>Этаж от</th>
            <th>Этаж до</th>
            <th>Стояков, шт (на корпус)</th>
            <th>DN В1</th>
            <th>DN Т3</th>
            <th>DN Т4</th>
            <th>Альбом КУУ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// Подсчёт количества квартир в корпусе
function getTotalAptsForSection(sec) {
  let total = 0;
  Object.keys(sec.apts).forEach(floor => {
    if (+floor > 1) {
      total += (sec.apts[floor] || 0);
    }
  });
  return total;
}

// Рендер блока расчёта сшитого полиэтилена в МОП для секции
function renderMopBlockForSection(si) {
  const sec = sections[si];
  const mop = sec.mop || { L: 30, r: 0.5, dn: 20 };
  const dn = mop.dn || 20; // диаметр по умолчанию DN20
  const result = computeMopPexLengthsForSection(sec);

  // Названия положений коллектора
  const positionLabels = {
    0: 'У торца (r = 0)',
    0.5: 'В центре (r = 0.5)',
    1: 'У другого торца (r = 1)'
  };

  // Доступные диаметры
  const diameters = [16, 20, 25, 32, 40];

  return `
    <div class="mop-block">
      <div class="row-3">
        <div class="input-group">
          <label>Длина МОП, L (м):</label>
          <input type="number" min="0" step="0.1" value="${mop.L}"
                 oninput="window.app.setMopLength(${si}, +this.value)">
        </div>
        <div class="input-group">
          <label>Положение коллектора, r:</label>
          <select onchange="window.app.setMopPosition(${si}, +this.value)">
            <option value="0" ${mop.r === 0 ? 'selected' : ''}>У торца (r = 0)</option>
            <option value="0.5" ${mop.r === 0.5 ? 'selected' : ''}>В центре (r = 0.5)</option>
            <option value="1" ${mop.r === 1 ? 'selected' : ''}>У другого торца (r = 1)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Диаметр трубы:</label>
          <select onchange="window.app.setMopDiameter(${si}, +this.value)">
            ${diameters.map(d => `<option value="${d}" ${dn === d ? 'selected' : ''}>DN${d}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="mop-results">
        <div class="mop-info">
          <span class="mop-label">Квартир в секции:</span>
          <span class="mop-value">${result.n} шт</span>
        </div>
        <div class="mop-result-row">
          <span class="mop-label">Длина труб В1 (DN${dn}):</span>
          <span class="mop-value">${result.lengthV1.toFixed(2)} м</span>
        </div>
        <div class="mop-result-row">
          <span class="mop-label">Длина труб Т3 (DN${dn}):</span>
          <span class="mop-value">${result.lengthT3.toFixed(2)} м</span>
        </div>
      </div>

      <div class="note" style="margin-top: 8px;">
        Расчёт по формуле: m = (d̄ + h) × n, где d̄ — средняя длина до квартиры, h = 1.8 м (опуск), n — кол-во квартир.
      </div>
    </div>
  `;
}

// Рендер карточек корпусов
export function renderSectionsBlocks() {
  const wrap = document.getElementById('sectionsBlocks');
  if (!wrap) return;

  // Сохраняем состояние открытости всех <details> перед ререндером
  const openDetails = new Set();
  wrap.querySelectorAll('details').forEach((det, idx) => {
    if (det.open) {
      openDetails.add(idx);
    }
  });

  const blocks = sections.map((sec, si) => {
    const totalApts = getTotalAptsForSection(sec);
    const aptsLabel = totalApts > 0 ? ` (итого: ${totalApts} кв.)` : '';
    const mopResult = computeMopPexLengthsForSection(sec);
    const mopLabel = mopResult.lengthV1 > 0 ? ` (В1: ${mopResult.lengthV1.toFixed(1)} м, Т3: ${mopResult.lengthT3.toFixed(1)} м)` : '';

    return `
    <div class="sec-card">
      <div class="sec-title">Корпус ${si + 1}</div>

      <div class="row-2">
        <div class="input-group">
          <label>Количество этажей в корпусе:</label>
          <div class="inline">
            <input type="number" min="1" max="200" value="${sec.floors}" ${sec.floorsLocked ? 'disabled' : ''}
                   oninput="window.app.updateSectionFloors(${si}, +this.value)">
            <label class="inline" style="gap:6px;">
              <input type="checkbox" ${sec.floorsLocked ? 'checked' : ''}
                     onchange="window.app.toggleLockFloors(${si}, this.checked)">
              Закрепить
            </label>
          </div>
          <div class="lock-hint">При закреплении поле этажности блокируется и не позволит случайно изменить значение.</div>
        </div>
      </div>

      <details>
        <summary><b>Квартиры по этажам и аренда (только 1-й этаж)${aptsLabel}</b></summary>
        ${renderFloorsTableForSection(si)}
      </details>

      <details>
        <summary><b>Зоны корпуса (начинаются с 1-го этажа)</b></summary>
        ${renderZonesTableForSection(si)}
        <div class="btn-row">
          <button class="btn-secondary" onclick="window.app.addZone(${si})">Добавить зону корпуса</button>
          <button class="btn-danger" onclick="window.app.clearZones(${si})">Очистить зоны корпуса</button>
        </div>
      </details>

      <details>
        <summary><b>Расчёт сшитого полиэтилена в МОП${mopLabel}</b></summary>
        ${renderMopBlockForSection(si)}
      </details>
    </div>
  `;
  }).join('');

  wrap.innerHTML = blocks || `<div class="note">Добавьте хотя бы один корпус.</div>`;

  // Восстанавливаем состояние открытости <details> после ререндера
  wrap.querySelectorAll('details').forEach((det, idx) => {
    if (openDetails.has(idx)) {
      det.open = true;
    }
  });
}

// Рендер шапки таблицы результатов по этажам
export function buildWaterSupplyHead() {
  const thead = document.querySelector('#waterSupplyTable thead');
  if (!thead) return;

  const secCols = sections.map((_, si) => `
    <th>Корпус ${si + 1}: зона (1–to)</th>
    <th>Корпус ${si + 1}: DN (В1/Т3/Т4)</th>
    <th>Корпус ${si + 1}: коллекторы</th>
  `).join('');

  thead.innerHTML = `
    <tr>
      <th>Этаж</th>
      ${secCols}
      <th>Квартир (по зданию)</th>
      <th>Аренда (по зданию)</th>
      <th>Стояков (по зданию)</th>
    </tr>
  `;
}

// Рендер таблицы по этажам
export function renderFloorsTable(floorsData) {
  const tbody = document.querySelector('#waterSupplyTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  floorsData.forEach(row => {
    const tr = tbody.insertRow();
    tr.insertCell(-1).textContent = `Этаж ${row.floor}`;

    row.sectionsInfo.forEach(info => {
      tr.insertCell(-1).textContent = info.zoneCellText;
      tr.insertCell(-1).textContent = info.dnCellText;
      tr.insertCell(-1).textContent = info.collCellText;
    });

    tr.insertCell(-1).textContent = row.aptsTotal;
    tr.insertCell(-1).textContent = row.rentTotal;
    tr.insertCell(-1).textContent = row.risersTotalAtFloor ? row.risersTotalAtFloor : '—';
  });
}

// Рендер предупреждений
export function renderWarnings(warnings) {
  const warnBox = document.getElementById('warnings');
  if (!warnBox) return;

  if (warnings.length) {
    warnBox.style.display = 'block';
    warnBox.innerHTML = `<strong>Предупреждения:</strong><ul>${warnings.map(w => `<li>${w}</li>`).join('')}</ul>`;
  } else {
    warnBox.style.display = 'none';
    warnBox.innerHTML = '';
  }
}

// Рендер сводки по зонам
export function renderZonesSummary(zonesData) {
  const zTbody = document.querySelector('#zonesSummary tbody');
  if (!zTbody) return;
  zTbody.innerHTML = '';

  zonesData.forEach(zd => {
    const tr = zTbody.insertRow();
    tr.insertCell(-1).textContent = `Корпус ${zd.sectionIndex + 1}`;
    tr.insertCell(-1).textContent = zd.zone.name;
    tr.insertCell(-1).textContent = `${zd.from}–${zd.to}`;
    tr.insertCell(-1).textContent = zd.aptsInZone;
    tr.insertCell(-1).textContent = zd.rentInZone;
    tr.insertCell(-1).textContent = zd.risersPerSection;
    tr.insertCell(-1).textContent = zd.d.V1 ? `${zd.d.V1} мм` : '—';
    tr.insertCell(-1).textContent = zd.d.T3 ? `${zd.d.T3} мм` : '—';
    tr.insertCell(-1).textContent = zd.d.T4 ? `${zd.d.T4} мм` : '—';
    tr.insertCell(-1).textContent = zd.hZone.toFixed(2);
    tr.insertCell(-1).textContent = zd.lenOneRiser.toFixed(2);
    tr.insertCell(-1).textContent = zd.lenAllRisers.toFixed(2);
    tr.insertCell(-1).textContent = zd.albumName;
  });
}

// Рендер итогов по стоякам
export function renderRiserTotals(grandTotalRisersLen) {
  const el = document.getElementById('riserTotals');
  if (el) {
    el.textContent = `Итоговая длина стояков по зданию: ${grandTotalRisersLen.toFixed(2)} м`;
  }
}

// Рендер таблицы по системам и диаметрам
export function renderRiserByD(risersByDiameter) {
  const byDTbody = document.querySelector('#riserByD tbody');
  if (!byDTbody) return;
  byDTbody.innerHTML = '';

  risersByDiameter.forEach(item => {
    const row = byDTbody.insertRow();
    row.insertCell(-1).textContent = `Корпус ${item.sectionIndex + 1}`;
    row.insertCell(-1).textContent = `${item.sys} — ${item.dia} мм`;
    row.insertCell(-1).textContent = item.count;
    row.insertCell(-1).textContent = item.len.toFixed(2);
  });
}

// Рендер таблицы альбомов КУУ
export function renderAlbumSummary(byAlbum) {
  const albumBody = document.querySelector('#albumSummary tbody');
  if (!albumBody) return;
  albumBody.innerHTML = '';

  albumKeys.forEach(k => {
    const row = albumBody.insertRow();
    row.insertCell(0).textContent = ALBUMS[k];
    row.insertCell(1).textContent = (byAlbum[k] || 0);
  });
}

// Рендер блока albumDetails с details и таблицами BOM
export function renderAlbumDetails(zonesData) {
  const albumDetailsWrap = document.getElementById('albumDetails');
  if (!albumDetailsWrap) return;

  // Сохраняем состояние открытости всех <details> перед ререндером
  const openDetails = new Set();
  albumDetailsWrap.querySelectorAll('details').forEach((det, idx) => {
    if (det.open) {
      openDetails.add(idx);
    }
  });

  albumDetailsWrap.innerHTML = '';

  zonesData.forEach((zd, idx) => {
    const details = document.createElement('details');
    // Восстанавливаем состояние открытости
    if (openDetails.has(idx)) {
      details.open = true;
    }
    const summary = document.createElement('summary');
    summary.textContent = `Корпус ${zd.sectionIndex + 1} — ${zd.zone.name} — ${zd.albumName} (квартир: ${zd.aptsInZone}; аренда: ${zd.rentInZone}; n=${zd.nAuto})`;
    details.appendChild(summary);

    const holder = document.createElement('div');
    holder.style.marginTop = '8px';

    if (zd.bom.length) {
      const tbl = document.createElement('table');
      tbl.innerHTML = `
        <thead>
          <tr>
            <th>Позиция</th>
            <th>Ед.</th>
            <th>Количество</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tb = tbl.querySelector('tbody');
      zd.bom.forEach(row => {
        const trb = tb.insertRow();
        trb.insertCell(0).textContent = row.name;
        trb.insertCell(1).textContent = row.unit || 'шт';
        trb.insertCell(2).textContent = row.qty.toLocaleString('ru-RU');
      });
      holder.appendChild(tbl);
    } else {
      const p = document.createElement('div');
      p.className = 'note';
      p.textContent = 'Состав для выбранного альбома пока не задан.';
      holder.appendChild(p);
    }

    details.appendChild(holder);
    albumDetailsWrap.appendChild(details);
  });
}

// Рендер блока "Трубопроводы" — сводка по корпусам, системам, диаметрам
export function renderPipelinesBlock(risersByDiameter, zonesData, h1, hn) {
  const container = document.getElementById('pipelinesContent');
  if (!container) return;

  if ((!zonesData || zonesData.length === 0) && (!risersByDiameter || risersByDiameter.length === 0)) {
    container.innerHTML = `
      <div class="placeholder-block">
        <p class="note">Нет данных для отображения. Добавьте зоны в корпусах и выполните расчёт.</p>
      </div>
    `;
    return;
  }

  // Названия систем для отображения
  const sysNames = { V1: 'В1', T3: 'Т3', T4: 'Т4' };

  let html = '';

  // =============================================
  // ПОДРАЗДЕЛ "ТРУБОПРОВОДЫ СТАЛЬНЫЕ"
  // =============================================
  let steelPipesContent = '';

  // Детализация по зонам с разбивкой по системам
  if (zonesData && zonesData.length > 0) {
    // Группируем по корпусам
    const zonesBySection = new Map();
    zonesData.forEach(zd => {
      if (!zonesBySection.has(zd.sectionIndex)) {
        zonesBySection.set(zd.sectionIndex, []);
      }
      zonesBySection.get(zd.sectionIndex).push(zd);
    });

    zonesBySection.forEach((zones, si) => {
      let sectionTotalLen = 0;

      let tableRows = '';
      zones.forEach(zd => {
        const to = zd.to;

        const systems = ['V1', 'T3', 'T4'];
        const d = zd.d || {};

        systems.forEach((sys, idx) => {
          const dia = d[sys] || 0;
          if (dia > 0) {
            const totalLen = zd.hZone * zd.risersPerSection;
            sectionTotalLen += totalLen;

            // Первая строка системы для зоны - с rowspan для зоны
            const zoneCell = idx === 0
              ? `<td rowspan="3" class="name-col">${zd.zone.name}</td>
                 <td rowspan="3">${zd.from}–${to}</td>`
              : '';

            tableRows += `
              <tr>
                <td class="sys-cell ${getSysCellClass(sys)}">${sysNames[sys]}</td>
                ${zoneCell}
                <td class="num-col">${dia}</td>
                <td class="num-col">${zd.hZone.toFixed(2)}</td>
                <td class="num-col">${zd.risersPerSection}</td>
                <td class="col-length num-col">${totalLen.toFixed(2)}</td>
              </tr>
            `;
          }
        });
      });

      steelPipesContent += `
        <div class="pipeline-subsection">
          <details class="pipeline-details">
            <summary>Корпус ${si + 1} — детализация по зонам (итого: ${sectionTotalLen.toFixed(2)} м.п.)</summary>
            <table class="results-table">
              <thead>
                <tr>
                  <th>Система</th>
                  <th class="name-col">Зона</th>
                  <th>Этажи</th>
                  <th class="num-col">Диаметр, мм</th>
                  <th class="num-col">Длина, м.п.</th>
                  <th class="num-col">Стояков, шт</th>
                  <th class="num-col">Всего, м.п.</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="6"><strong>Итого по корпусу ${si + 1}</strong></td>
                  <td class="qty-col"><strong>${sectionTotalLen.toFixed(2)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </details>
        </div>
      `;
    });
  }

  // Сводная таблица по всему зданию (суммарно по системам и диаметрам)
  const sysNames2 = { V1: 'В1', T3: 'Т3', T4: 'Т4' };
  const overall = new Map();
  let grandTotal = 0;

  if (zonesData && zonesData.length > 0) {
    zonesData.forEach(zd => {
      const d = zd.d || {};
      ['V1', 'T3', 'T4'].forEach(sys => {
        const dia = d[sys] || 0;
        if (dia > 0) {
          const key = `${sys}:${dia}`;
          const totalLen = zd.hZone * zd.risersPerSection;
          if (!overall.has(key)) {
            overall.set(key, { sys, dia, len: 0, pipeLen: zd.hZone, count: 0 });
          }
          const item = overall.get(key);
          item.len += totalLen;
          item.count += zd.risersPerSection;
          grandTotal += totalLen;
        }
      });
    });
  }

  const overallItems = Array.from(overall.values()).sort((a, b) => {
    const order = { V1: 0, T3: 1, T4: 2 };
    if (order[a.sys] !== order[b.sys]) return order[a.sys] - order[b.sys];
    return a.dia - b.dia;
  });

  // Группируем сводку по системам
  const overallBySys = { V1: [], T3: [], T4: [] };
  overallItems.forEach(item => {
    if (overallBySys[item.sys]) {
      overallBySys[item.sys].push(item);
    }
  });

  let summaryRows = '';
  let totalCount = 0;
  ['V1', 'T3', 'T4'].forEach(sys => {
    const sysItems = overallBySys[sys];
    if (sysItems.length === 0) return;

    sysItems.forEach((item, idx) => {
      totalCount += item.count;
      const sysCell = idx === 0
        ? `<td rowspan="${sysItems.length}" class="sys-cell ${getSysCellClass(sys)}">${sysNames2[sys]}</td>`
        : '';
      summaryRows += `
        <tr>
          ${sysCell}
          <td class="num-col">${item.dia}</td>
          <td class="col-count num-col">${item.count}</td>
          <td class="col-length num-col">${item.len.toFixed(2)}</td>
        </tr>
      `;
    });
  });

  steelPipesContent += `
    <div class="pipeline-subsection pipeline-summary">
      <h4>Сводка по зданию</h4>
      <table class="results-table summary-table">
        <thead>
          <tr>
            <th>Система</th>
            <th class="num-col">Диаметр, мм</th>
            <th class="num-col">Стояков, шт</th>
            <th class="num-col">Всего, м.п.</th>
          </tr>
        </thead>
        <tbody>
          ${summaryRows}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="2"><strong>Итого по зданию</strong></td>
            <td class="qty-col"><strong>${totalCount}</strong></td>
            <td class="qty-col"><strong>${grandTotal.toFixed(2)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  // Оборачиваем в details "Трубопроводы стальные"
  html += `
    <div class="pipeline-section">
      <details class="pipeline-details">
        <summary>Трубопроводы стальные (итого: ${grandTotal.toFixed(2)} м.п.)</summary>
        <div class="pipeline-subsections">
          ${steelPipesContent}
        </div>
      </details>
    </div>
  `;

  // =============================================
  // ПОДРАЗДЕЛ "ТРУБЫ PP-R" (сшитый полиэтилен в МОП)
  // =============================================
  let pprPipesContent = '';
  // Группировка по диаметрам: { dn: { V1: total, T3: total } }
  const pprByDiameter = {};

  // Детализация по корпусам
  sections.forEach((sec, si) => {
    const mopResult = computeMopPexLengthsForSection(sec);

    if (mopResult.lengthV1 > 0 || mopResult.lengthT3 > 0) {
      const dn = sec.mop?.dn || 20;
      if (!pprByDiameter[dn]) {
        pprByDiameter[dn] = { V1: 0, T3: 0 };
      }
      pprByDiameter[dn].V1 += mopResult.lengthV1;
      pprByDiameter[dn].T3 += mopResult.lengthT3;

      const sectionTotal = mopResult.lengthV1 + mopResult.lengthT3;

      pprPipesContent += `
        <div class="pipeline-subsection">
          <details class="pipeline-details">
            <summary>Корпус ${si + 1} — разводка МОП, DN${dn} (итого: ${sectionTotal.toFixed(2)} м.п.)</summary>
            <table class="results-table">
              <thead>
                <tr>
                  <th>Система</th>
                  <th class="num-col">Диаметр</th>
                  <th class="num-col">Квартир, шт</th>
                  <th class="num-col">Длина МОП, м</th>
                  <th>Положение колл.</th>
                  <th class="num-col">Всего, м.п.</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="sys-cell sys-cell--V1">В1</td>
                  <td rowspan="2" class="num-col">DN${dn}</td>
                  <td rowspan="2" class="num-col">${mopResult.n}</td>
                  <td rowspan="2" class="num-col">${mopResult.L}</td>
                  <td rowspan="2">r = ${mopResult.r}</td>
                  <td class="col-length num-col">${mopResult.lengthV1.toFixed(2)}</td>
                </tr>
                <tr>
                  <td class="sys-cell sys-cell--T3">Т3</td>
                  <td class="col-length num-col">${mopResult.lengthT3.toFixed(2)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="5"><strong>Итого по корпусу ${si + 1}</strong></td>
                  <td class="qty-col"><strong>${sectionTotal.toFixed(2)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </details>
        </div>
      `;
    }
  });

  // Сводка по зданию для PP-R (группировка по диаметрам)
  const diameters = Object.keys(pprByDiameter).map(Number).sort((a, b) => a - b);
  let pprGrandTotal = 0;
  diameters.forEach(dn => {
    pprGrandTotal += pprByDiameter[dn].V1 + pprByDiameter[dn].T3;
  });

  if (pprGrandTotal > 0) {
    let summaryRows = '';
    diameters.forEach(dn => {
      const dnTotal = pprByDiameter[dn].V1 + pprByDiameter[dn].T3;
      summaryRows += `
        <tr>
          <td class="sys-cell sys-cell--V1">В1</td>
          <td class="num-col">DN${dn}</td>
          <td class="col-length num-col">${pprByDiameter[dn].V1.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="sys-cell sys-cell--T3">Т3</td>
          <td class="num-col"></td>
          <td class="col-length num-col">${pprByDiameter[dn].T3.toFixed(2)}</td>
        </tr>
        <tr class="subtotal-row">
          <td colspan="2"><em>Итого DN${dn}</em></td>
          <td class="num-col"><em>${dnTotal.toFixed(2)}</em></td>
        </tr>
      `;
    });

    pprPipesContent += `
      <div class="pipeline-subsection pipeline-summary">
        <h4>Сводка по зданию</h4>
        <table class="results-table summary-table">
          <thead>
            <tr>
              <th>Система</th>
              <th class="num-col">Диаметр</th>
              <th class="num-col">Всего, м.п.</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="2"><strong>Итого по зданию</strong></td>
              <td class="qty-col"><strong>${pprGrandTotal.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // Оборачиваем в details "Трубы PP-R"
  const pprSummaryText = pprGrandTotal > 0
    ? `Трубы PP-R (итого: ${pprGrandTotal.toFixed(2)} м.п.)`
    : 'Трубы PP-R';

  html += `
    <div class="pipeline-section">
      <details class="pipeline-details">
        <summary>${pprSummaryText}</summary>
        <div class="pipeline-subsections">
          ${pprPipesContent || '<div class="placeholder-block"><p class="note">Нет данных. Настройте параметры МОП в карточках корпусов.</p></div>'}
        </div>
      </details>
    </div>
  `;

  // =============================================
  // ПОДРАЗДЕЛ "ИЗОЛЯЦИЯ ТРУБОПРОВОДОВ"
  // =============================================
  let insulationContent = '';
  // Сбор данных изоляции по корпусам и системам: { sectionIndex: { V1: {...}, T3: {...}, T4: {...} } }
  const insulationBySection = new Map();

  // Маппинг систем для отображения
  const systemDisplayName = {
    'V1': 'В1 (ХВС)',
    'T3': 'Т3 (ГВС)',
    'T4': 'Т4 (Рецирк.)'
  };

  // Вспомогательная функция для создания пустой структуры секции
  const createEmptySectionData = () => ({
    V1: { steel: {}, ppr: {} },
    T3: { steel: {}, ppr: {} },
    T4: { steel: {}, ppr: {} }
  });

  // Собираем данные стальных труб из zonesData
  if (zonesData && zonesData.length > 0) {
    zonesData.forEach(zd => {
      const si = zd.sectionIndex;
      if (!insulationBySection.has(si)) {
        insulationBySection.set(si, createEmptySectionData());
      }
      const secData = insulationBySection.get(si);

      const d = zd.d || {};
      // Каждая система (V1, T3, T4) агрегируется отдельно
      ['V1', 'T3', 'T4'].forEach(sys => {
        const dia = d[sys] || 0;
        if (dia > 0) {
          const totalLen = zd.hZone * zd.risersPerSection;
          if (!secData[sys].steel[dia]) {
            secData[sys].steel[dia] = 0;
          }
          secData[sys].steel[dia] += totalLen;
        }
      });
    });
  }

  // Собираем данные PP-R труб
  sections.forEach((sec, si) => {
    const mopResult = computeMopPexLengthsForSection(sec);
    if (mopResult.lengthV1 > 0 || mopResult.lengthT3 > 0) {
      if (!insulationBySection.has(si)) {
        insulationBySection.set(si, createEmptySectionData());
      }
      const secData = insulationBySection.get(si);
      const dn = sec.mop?.dn || 20;

      // V1 -> ХВС
      if (mopResult.lengthV1 > 0) {
        if (!secData.V1.ppr[dn]) secData.V1.ppr[dn] = 0;
        secData.V1.ppr[dn] += mopResult.lengthV1;
      }
      // T3 -> ГВС
      if (mopResult.lengthT3 > 0) {
        if (!secData.T3.ppr[dn]) secData.T3.ppr[dn] = 0;
        secData.T3.ppr[dn] += mopResult.lengthT3;
      }
    }
  });

  // Генерируем контент для каждого корпуса
  const sortedSections = Array.from(insulationBySection.keys()).sort((a, b) => a - b);
  let insulationGrandTotal = 0;
  const insulationTotalBySystem = {
    V1: { steel: {}, ppr: {} },
    T3: { steel: {}, ppr: {} },
    T4: { steel: {}, ppr: {} }
  };

  sortedSections.forEach(si => {
    const secData = insulationBySection.get(si);
    let sectionTotal = 0;

    // Собираем все строки таблицы для корпуса
    let tableRows = '';

    // Для каждой системы (В1, Т3, Т4) — каждая отдельно
    ['V1', 'T3', 'T4'].forEach(sys => {
      const sysData = secData[sys];

      // Стальные трубы
      const steelDiameters = Object.keys(sysData.steel).map(Number).sort((a, b) => a - b);
      steelDiameters.forEach(dn => {
        const len = sysData.steel[dn];
        sectionTotal += len;
        if (!insulationTotalBySystem[sys].steel[dn]) insulationTotalBySystem[sys].steel[dn] = 0;
        insulationTotalBySystem[sys].steel[dn] += len;

        // Отображаем систему как есть (В1, Т3 или Т4)
        const steelSysLabel = systemDisplayName[sys].split(' ')[0];

        tableRows += `
          <tr>
            <td class="sys-cell ${getSysCellClass(sys)}">${steelSysLabel}</td>
            <td class="name-col">Стальные</td>
            <td class="num-col">Ду ${dn}</td>
            <td class="col-length num-col">${len.toFixed(2)}</td>
          </tr>
        `;
      });

      // PP-R трубы
      const pprDiameters = Object.keys(sysData.ppr).map(Number).sort((a, b) => a - b);
      pprDiameters.forEach(dn => {
        const len = sysData.ppr[dn];
        sectionTotal += len;
        if (!insulationTotalBySystem[sys].ppr[dn]) insulationTotalBySystem[sys].ppr[dn] = 0;
        insulationTotalBySystem[sys].ppr[dn] += len;

        tableRows += `
          <tr>
            <td class="sys-cell ${getSysCellClass(sys)}">${systemDisplayName[sys].split(' ')[0]}</td>
            <td class="name-col">PP-R</td>
            <td class="num-col">Ду ${dn}</td>
            <td class="col-length num-col">${len.toFixed(2)}</td>
          </tr>
        `;
      });
    });

    insulationGrandTotal += sectionTotal;

    if (tableRows) {
      insulationContent += `
        <div class="pipeline-subsection">
          <details class="pipeline-details">
            <summary>Корпус ${si + 1} — изоляция труб (итого: ${sectionTotal.toFixed(2)} м.п.)</summary>
            <table class="results-table">
              <thead>
                <tr>
                  <th>Система</th>
                  <th class="name-col">Тип трубы</th>
                  <th class="num-col">Диаметр</th>
                  <th class="num-col">Длина, м.п.</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="3"><strong>Итого по корпусу ${si + 1}</strong></td>
                  <td class="qty-col"><strong>${sectionTotal.toFixed(2)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </details>
        </div>
      `;
    }
  });

  // Сводка по зданию для изоляции
  if (insulationGrandTotal > 0) {
    let summaryRows = '';

    // Для каждой системы (В1, Т3, Т4) — каждая отдельно
    ['V1', 'T3', 'T4'].forEach(sys => {
      const sysData = insulationTotalBySystem[sys];

      // Стальные трубы
      const steelDns = Object.keys(sysData.steel).map(Number).sort((a, b) => a - b);
      steelDns.forEach(dn => {
        const len = sysData.steel[dn];

        // Отображаем систему как есть (В1, Т3 или Т4)
        const steelSysLabel = systemDisplayName[sys].split(' ')[0];

        summaryRows += `
          <tr>
            <td class="sys-cell ${getSysCellClass(sys)}">${steelSysLabel}</td>
            <td class="name-col">Стальные</td>
            <td class="num-col">Ду ${dn}</td>
            <td class="col-length num-col">${len.toFixed(2)}</td>
          </tr>
        `;
      });

      // PP-R трубы
      const pprDns = Object.keys(sysData.ppr).map(Number).sort((a, b) => a - b);
      pprDns.forEach(dn => {
        const len = sysData.ppr[dn];
        summaryRows += `
          <tr>
            <td class="sys-cell ${getSysCellClass(sys)}">${systemDisplayName[sys].split(' ')[0]}</td>
            <td class="name-col">PP-R</td>
            <td class="num-col">Ду ${dn}</td>
            <td class="col-length num-col">${len.toFixed(2)}</td>
          </tr>
        `;
      });
    });

    insulationContent += `
      <div class="pipeline-subsection pipeline-summary">
        <h4>Сводка по зданию</h4>
        <table class="results-table summary-table">
          <thead>
            <tr>
              <th>Система</th>
              <th class="name-col">Тип трубы</th>
              <th class="num-col">Диаметр</th>
              <th class="num-col">Всего, м.п.</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="3"><strong>Итого по зданию</strong></td>
              <td class="qty-col"><strong>${insulationGrandTotal.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // Оборачиваем в details "Изоляция трубопроводов"
  const insulationSummaryText = insulationGrandTotal > 0
    ? `Изоляция трубопроводов (итого: ${insulationGrandTotal.toFixed(2)} м.п.)`
    : 'Изоляция трубопроводов';

  html += `
    <div class="pipeline-section">
      <details class="pipeline-details">
        <summary>${insulationSummaryText}</summary>
        <div class="pipeline-subsections">
          ${insulationContent || '<div class="placeholder-block"><p class="note">Нет данных для изоляции.</p></div>'}
        </div>
      </details>
    </div>
  `;

  // =============================================
  // ПОДРАЗДЕЛ "МОНТАЖ ГИЛЬЗ" (с разбивкой по системам В1, Т3, Т4)
  // =============================================
  let sleevesContent = '';
  // Сбор данных по гильзам: { sectionIndex: { sys: { dn: count } } }
  const sleevesBySection = new Map();
  const sleevesTotalBySysAndDia = {}; // общая сводка по системам и диаметрам: { sys: { dn: count } }

  // Маппинг системных кодов в русские названия
  const sleeveSysNames = {
    'V1': 'В1',
    'T3': 'Т3',
    'T4': 'Т4',
  };

  // Гильзы устанавливаются в местах прохода труб через перекрытия
  // Для каждого стояка: количество гильз = количество этажей в зоне
  if (zonesData && zonesData.length > 0) {
    zonesData.forEach(zd => {
      const si = zd.sectionIndex;
      if (!sleevesBySection.has(si)) {
        sleevesBySection.set(si, { V1: {}, T3: {}, T4: {} });
      }
      const secData = sleevesBySection.get(si);

      const d = zd.d || {};
      const risers = zd.risersPerSection || 1;
      // Количество перекрытий = количество этажей в зоне
      const floorsInZone = zd.zoneTo - zd.zoneFrom + 1;

      ['V1', 'T3', 'T4'].forEach(sys => {
        const pipeDia = d[sys] || 0;
        if (pipeDia > 0 && floorsInZone > 0) {
          // Диаметр гильзы на один типоразмер больше диаметра трубы
          const sleeveDia = getSleeveDn(pipeDia);
          // Гильз на систему = стояков × этажей
          const sleevesCount = risers * floorsInZone;

          // По корпусу и системе
          if (!secData[sys][sleeveDia]) {
            secData[sys][sleeveDia] = 0;
          }
          secData[sys][sleeveDia] += sleevesCount;

          // Общая сводка по системам и диаметрам
          if (!sleevesTotalBySysAndDia[sys]) {
            sleevesTotalBySysAndDia[sys] = {};
          }
          if (!sleevesTotalBySysAndDia[sys][sleeveDia]) {
            sleevesTotalBySysAndDia[sys][sleeveDia] = 0;
          }
          sleevesTotalBySysAndDia[sys][sleeveDia] += sleevesCount;
        }
      });
    });
  }

  // Генерируем контент для каждого корпуса
  const sortedSleeveSections = Array.from(sleevesBySection.keys()).sort((a, b) => a - b);
  let sleevesGrandTotal = 0;
  let sleevesGrandTotalMeters = 0;
  const SLEEVE_LENGTH = 0.35; // длина одной гильзы в метрах

  sortedSleeveSections.forEach(si => {
    const secData = sleevesBySection.get(si);

    let sectionTotal = 0;
    let sectionTotalMeters = 0;
    let tableRows = '';

    // Проходим по системам в порядке В1, Т3, Т4
    ['V1', 'T3', 'T4'].forEach(sys => {
      const sysData = secData[sys];
      const diameters = Object.keys(sysData).map(Number).sort((a, b) => a - b);

      if (diameters.length === 0) return;

      diameters.forEach((dn, idx) => {
        const count = sysData[dn];
        const meters = count * SLEEVE_LENGTH;
        sectionTotal += count;
        sectionTotalMeters += meters;

        // Первая строка системы с rowspan
        const sysCell = idx === 0
          ? `<td rowspan="${diameters.length}" class="sys-cell ${getSysCellClass(sys)}">${sleeveSysNames[sys]}</td>`
          : '';

        tableRows += `
          <tr>
            ${sysCell}
            <td class="name-col">Гильза Ду ${dn}</td>
            <td class="unit-col">шт</td>
            <td class="num-col">${count}</td>
            <td class="num-col">${meters.toFixed(2)}</td>
          </tr>
        `;
      });
    });

    if (sectionTotal === 0) return;

    sleevesGrandTotal += sectionTotal;
    sleevesGrandTotalMeters += sectionTotalMeters;

    sleevesContent += `
      <div class="pipeline-subsection">
        <details class="pipeline-details">
          <summary>Корпус ${si + 1} — монтаж гильз (итого: ${sectionTotal} шт / ${sectionTotalMeters.toFixed(2)} м.п.)</summary>
          <table class="results-table">
            <thead>
              <tr>
                <th>Система</th>
                <th class="name-col">Наименование</th>
                <th class="unit-col">Ед. изм.</th>
                <th class="qty-col">Количество</th>
                <th class="num-col">м.п.</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="3"><strong>Итого по корпусу ${si + 1}</strong></td>
                <td class="qty-col"><strong>${sectionTotal}</strong></td>
                <td class="qty-col"><strong>${sectionTotalMeters.toFixed(2)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </details>
      </div>
    `;
  });

  // Сводка по зданию для гильз (с разбивкой по системам)
  if (sleevesGrandTotal > 0) {
    let summaryRows = '';

    ['V1', 'T3', 'T4'].forEach(sys => {
      const sysData = sleevesTotalBySysAndDia[sys];
      if (!sysData) return;

      const diameters = Object.keys(sysData).map(Number).sort((a, b) => a - b);
      if (diameters.length === 0) return;

      diameters.forEach((dn, idx) => {
        const count = sysData[dn];
        const meters = count * SLEEVE_LENGTH;

        const sysCell = idx === 0
          ? `<td rowspan="${diameters.length}" class="sys-cell ${getSysCellClass(sys)}">${sleeveSysNames[sys]}</td>`
          : '';

        summaryRows += `
          <tr>
            ${sysCell}
            <td class="name-col">Гильза Ду ${dn}</td>
            <td class="unit-col">шт</td>
            <td class="num-col">${count}</td>
            <td class="num-col">${meters.toFixed(2)}</td>
          </tr>
        `;
      });
    });

    sleevesContent += `
      <div class="pipeline-subsection pipeline-summary">
        <h4>Сводка по зданию</h4>
        <table class="results-table summary-table">
          <thead>
            <tr>
              <th>Система</th>
              <th class="name-col">Наименование</th>
              <th class="unit-col">Ед. изм.</th>
              <th class="qty-col">Количество</th>
              <th class="num-col">м.п.</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="3"><strong>Итого по зданию</strong></td>
              <td class="qty-col"><strong>${sleevesGrandTotal}</strong></td>
              <td class="qty-col"><strong>${sleevesGrandTotalMeters.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // Оборачиваем в details "Монтаж гильз"
  const sleevesSummaryText = sleevesGrandTotal > 0
    ? `Монтаж гильз (итого: ${sleevesGrandTotal} шт / ${sleevesGrandTotalMeters.toFixed(2)} м.п.)`
    : 'Монтаж гильз';

  html += `
    <div class="pipeline-section">
      <details class="pipeline-details">
        <summary>${sleevesSummaryText}</summary>
        <div class="pipeline-subsections">
          ${sleevesContent || '<div class="placeholder-block"><p class="note">Нет данных для гильз.</p></div>'}
        </div>
      </details>
    </div>
  `;

  // =============================================
  // ПОДРАЗДЕЛ "ПУСКОНАЛАДОЧНЫЕ РАБОТЫ"
  // =============================================
  // Используем единый источник данных computeCommissioningData
  // Этот же источник используется в estimate.js для сметы
  let pnrBySectionAndSystem = new Map();
  let pnrBySection = new Map();
  let pnrBySystem = new Map();
  let pnrGrandTotal = 0;

  try {
    const commissioningData = computeCommissioningData(zonesData, sections);
    pnrBySectionAndSystem = commissioningData.bySectionAndSystem;
    pnrBySection = commissioningData.bySection;
    pnrBySystem = commissioningData.bySystem;
    pnrGrandTotal = commissioningData.grandTotal;
    console.log('[Render ПНР] Данные пусконаладки: grandTotal =', pnrGrandTotal);
  } catch (err) {
    console.error('[Render ПНР] Ошибка computeCommissioningData:', err);
  }

  // Названия систем для ПНР (коды систем: В1, Т3, Т4)
  const pnrSysNames = { V1: 'В1', T3: 'Т3', T4: 'Т4' };

  // Формируем HTML для таблицы ПНР
  let pnrContent = '';

  if (pnrGrandTotal > 0) {
    // Таблица по корпусам и системам
    let pnrTableRows = '';
    const sortedSections = Array.from(pnrBySection.keys()).sort((a, b) => a - b);

    sortedSections.forEach(si => {
      const sectionTotal = pnrBySection.get(si);
      const systems = ['V1', 'T3', 'T4'];
      const sectionSystems = systems.filter(sys => pnrBySectionAndSystem.has(`${si}:${sys}`));

      sectionSystems.forEach((sys, idx) => {
        const key = `${si}:${sys}`;
        const len = pnrBySectionAndSystem.get(key) || 0;

        // Первая строка корпуса - с rowspan
        const sectionCell = idx === 0
          ? `<td rowspan="${sectionSystems.length}" class="section-cell">Корпус ${si + 1}</td>`
          : '';

        pnrTableRows += `
          <tr>
            ${sectionCell}
            <td class="sys-cell ${getSysCellClass(sys)}">${pnrSysNames[sys]}</td>
            <td>${len.toFixed(2)}</td>
          </tr>
        `;
      });

      // Итого по корпусу
      pnrTableRows += `
        <tr class="subtotal-row">
          <td colspan="2"><em>Итого по корпусу ${si + 1}</em></td>
          <td class="qty-col"><em>${sectionTotal.toFixed(2)}</em></td>
        </tr>
      `;
    });

    // Сводка по системам (итого по зданию)
    let systemSummaryRows = '';
    ['V1', 'T3', 'T4'].forEach(sys => {
      const sysTotal = pnrBySystem.get(sys) || 0;
      if (sysTotal > 0) {
        systemSummaryRows += `
          <tr>
            <td>${pnrSysNames[sys]}</td>
            <td>${sysTotal.toFixed(2)}</td>
          </tr>
        `;
      }
    });

    pnrContent = `
      <div class="pipeline-subsection">
        <h4>Детализация по корпусам и системам</h4>
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Корпус</th>
              <th>Система</th>
              <th>Длина труб, м.п.</th>
            </tr>
          </thead>
          <tbody>
            ${pnrTableRows}
          </tbody>
        </table>
      </div>

      <div class="pipeline-subsection pipeline-summary">
        <h4>Итого по зданию</h4>
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Система</th>
              <th>Длина труб, м.п.</th>
            </tr>
          </thead>
          <tbody>
            ${systemSummaryRows}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td><strong>Всего по зданию</strong></td>
              <td class="qty-col"><strong>${pnrGrandTotal.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // Оборачиваем в details "Пусконаладочные работы"
  const pnrSummaryText = pnrGrandTotal > 0
    ? `Пусконаладочные работы (итого: ${pnrGrandTotal.toFixed(2)} м.п.)`
    : 'Пусконаладочные работы';

  html += `
    <div class="pipeline-section">
      <details class="pipeline-details">
        <summary>${pnrSummaryText}</summary>
        <div class="pipeline-subsections">
          ${pnrContent || '<div class="placeholder-block"><p class="note">Нет данных для пусконаладочных работ. Выполните расчёт.</p></div>'}
        </div>
      </details>
    </div>
  `;

  // Сохраняем состояние открытости всех <details> перед ререндером
  const openDetails = new Set();
  container.querySelectorAll('details').forEach((det, idx) => {
    if (det.open) {
      openDetails.add(idx);
    }
  });

  container.innerHTML = html;

  // Восстанавливаем состояние открытости <details> после ререндера
  container.querySelectorAll('details').forEach((det, idx) => {
    if (openDetails.has(idx)) {
      det.open = true;
    }
  });
}

// Расчёт шага для компенсаторов по диаметру
function getCompensatorStep(dia) {
  if (dia <= 25) return 25; // DN 15-25: каждые 25м
  if (dia <= 40) return 30; // DN 32-40: каждые 30м
  return 35; // DN 50+: каждые 35м
}

// Склонение слова "выход" в зависимости от числа
function getOutletsSuffix(n) {
  const abs = Math.abs(n) % 100;
  const lastDigit = abs % 10;
  if (abs > 10 && abs < 20) return 'ов'; // 11-19 выходов
  if (lastDigit === 1) return '';         // 1 выход
  if (lastDigit >= 2 && lastDigit <= 4) return 'а'; // 2-4 выхода
  return 'ов'; // 5-9, 0 выходов
}

// Расчёт количества компенсаторов
function calcCompensators(length, dia) {
  const step = getCompensatorStep(dia);
  return Math.floor(length / step);
}

// Рендер блока "Арматура"
export function renderFittingsBlock(totalApartments, ivptEnabled, zonesData, totalRentUnits = 0, sections = []) {
  const container = document.getElementById('fittingsContent');
  if (!container) return;

  let html = '';
  let hasData = false;

  // === Компенсаторы для Т3 и Т4 (с детализацией по корпусам) ===
  const sysNames = { T3: 'Т3', T4: 'Т4', V1: 'В1' };
  const compensatorsBySection = new Map(); // sectionIndex -> Map(key -> count)
  const compensatorsTotal = new Map(); // общая сводка

  if (zonesData && zonesData.length > 0) {
    zonesData.forEach(zd => {
      const si = zd.sectionIndex;
      const d = zd.d || {};
      const risers = zd.risersPerSection || 1;
      const pipeLength = zd.hZone || 0;

      if (!compensatorsBySection.has(si)) {
        compensatorsBySection.set(si, new Map());
      }
      const secMap = compensatorsBySection.get(si);

      ['T3', 'T4'].forEach(sys => {
        const dia = d[sys] || 0;
        if (dia > 0 && pipeLength > 0) {
          const compPerRiser = calcCompensators(pipeLength, dia);
          const totalComp = compPerRiser * risers;
          if (totalComp > 0) {
            const key = `${sys}:${dia}`;
            secMap.set(key, (secMap.get(key) || 0) + totalComp);
            compensatorsTotal.set(key, (compensatorsTotal.get(key) || 0) + totalComp);
          }
        }
      });
    });
  }

  if (compensatorsTotal.size > 0) {
    hasData = true;
    let totalCompensators = 0;
    compensatorsTotal.forEach(count => { totalCompensators += count; });

    // Генерируем HTML по корпусам для компенсаторов
    let compSectionsHtml = '';
    compensatorsBySection.forEach((secMap, si) => {
      if (secMap.size === 0) return;
      let sectionTotal = 0;
      secMap.forEach(count => { sectionTotal += count; });

      const sortedKeys = Array.from(secMap.keys()).sort((a, b) => {
        const [sysA, diaA] = a.split(':');
        const [sysB, diaB] = b.split(':');
        if (sysA !== sysB) return sysA.localeCompare(sysB);
        return (+diaA) - (+diaB);
      });

      let rowsHtml = '';
      sortedKeys.forEach(key => {
        const [sys, dia] = key.split(':');
        rowsHtml += `<tr><td class="sys-cell ${getSysCellClass(sys)}">${sysNames[sys]}</td><td class="name-col">Компенсатор Ду ${dia}</td><td class="unit-col">шт</td><td class="col-qty num-col">${secMap.get(key)}</td></tr>`;
      });

      compSectionsHtml += `
        <details class="fittings-details" style="margin: 8px 0;">
          <summary>Корпус ${si + 1} (итого: ${sectionTotal} шт)</summary>
          <table class="results-table">
            <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по корпусу ${si + 1}</strong></td><td class="qty-col"><strong>${sectionTotal}</strong></td></tr></tfoot>
          </table>
        </details>
      `;
    });

    // Сводка по зданию
    const sortedTotalKeys = Array.from(compensatorsTotal.keys()).sort((a, b) => {
      const [sysA, diaA] = a.split(':');
      const [sysB, diaB] = b.split(':');
      if (sysA !== sysB) return sysA.localeCompare(sysB);
      return (+diaA) - (+diaB);
    });
    let summaryRows = '';
    sortedTotalKeys.forEach(key => {
      const [sys, dia] = key.split(':');
      summaryRows += `<tr><td class="sys-cell ${getSysCellClass(sys)}">${sysNames[sys]}</td><td class="name-col">Компенсатор Ду ${dia}</td><td class="unit-col">шт</td><td class="col-qty num-col">${compensatorsTotal.get(key)}</td></tr>`;
    });

    html += `
      <div class="fittings-section">
        <details class="fittings-details">
          <summary>Компенсаторы (итого: ${totalCompensators} шт)</summary>
          <div class="fittings-subsections" style="padding: 12px;">
            ${compSectionsHtml}
            <div class="pipeline-summary" style="margin-top: 12px;">
              <h4>Сводка по зданию</h4>
              <table class="results-table summary-table">
                <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
                <tbody>${summaryRows}</tbody>
                <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по зданию</strong></td><td class="qty-col"><strong>${totalCompensators}</strong></td></tr></tfoot>
              </table>
            </div>
          </div>
        </details>
      </div>
    `;

    // === Неподвижные опоры (количество компенсаторов × 2, с детализацией по корпусам) ===
    let totalSupports = totalCompensators * 2;

    let supportsSectionsHtml = '';
    compensatorsBySection.forEach((secMap, si) => {
      if (secMap.size === 0) return;
      let sectionTotal = 0;
      secMap.forEach(count => { sectionTotal += count * 2; });

      const sortedKeys = Array.from(secMap.keys()).sort((a, b) => {
        const [sysA, diaA] = a.split(':');
        const [sysB, diaB] = b.split(':');
        if (sysA !== sysB) return sysA.localeCompare(sysB);
        return (+diaA) - (+diaB);
      });

      let rowsHtml = '';
      sortedKeys.forEach(key => {
        const [sys, dia] = key.split(':');
        rowsHtml += `<tr><td class="sys-cell ${getSysCellClass(sys)}">${sysNames[sys]}</td><td class="name-col">Неподвижная опора Ду ${dia}</td><td class="unit-col">шт</td><td class="col-qty num-col">${secMap.get(key) * 2}</td></tr>`;
      });

      supportsSectionsHtml += `
        <details class="fittings-details" style="margin: 8px 0;">
          <summary>Корпус ${si + 1} (итого: ${sectionTotal} шт)</summary>
          <table class="results-table">
            <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по корпусу ${si + 1}</strong></td><td class="qty-col"><strong>${sectionTotal}</strong></td></tr></tfoot>
          </table>
        </details>
      `;
    });

    let supportsSummaryRows = '';
    sortedTotalKeys.forEach(key => {
      const [sys, dia] = key.split(':');
      supportsSummaryRows += `<tr><td class="sys-cell ${getSysCellClass(sys)}">${sysNames[sys]}</td><td class="name-col">Неподвижная опора Ду ${dia}</td><td class="unit-col">шт</td><td class="col-qty num-col">${compensatorsTotal.get(key) * 2}</td></tr>`;
    });

    html += `
      <div class="fittings-section">
        <details class="fittings-details">
          <summary>Неподвижные опоры (итого: ${totalSupports} шт)</summary>
          <div class="fittings-subsections" style="padding: 12px;">
            ${supportsSectionsHtml}
            <div class="pipeline-summary" style="margin-top: 12px;">
              <h4>Сводка по зданию</h4>
              <table class="results-table summary-table">
                <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
                <tbody>${supportsSummaryRows}</tbody>
                <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по зданию</strong></td><td class="qty-col"><strong>${totalSupports}</strong></td></tr></tfoot>
              </table>
            </div>
          </div>
        </details>
      </div>
    `;
  }

  // === Устройство внутриквартирного пожаротушения (с детализацией по корпусам) ===
  if (ivptEnabled && totalApartments > 0) {
    hasData = true;

    let ivptSectionsHtml = '';
    sections.forEach((sec, si) => {
      let secApts = 0;
      Object.keys(sec.apts).forEach(f => {
        if (+f >= 2) secApts += sec.apts[f] || 0;
      });
      if (secApts <= 0) return;

      ivptSectionsHtml += `
        <details class="fittings-details" style="margin: 8px 0;">
          <summary>Корпус ${si + 1} (итого: ${secApts} кв.)</summary>
          <table class="results-table">
            <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
            <tbody>
              <tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">Устройство внутриквартирного пожаротушения</td><td class="unit-col">шт</td><td class="col-qty num-col">${secApts}</td></tr>
              <tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">Кран шаровый Ду 15 (для ВКП)</td><td class="unit-col">шт</td><td class="col-qty num-col">${secApts}</td></tr>
            </tbody>
            <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по корпусу ${si + 1}</strong></td><td class="qty-col"><strong>${secApts * 2}</strong></td></tr></tfoot>
          </table>
        </details>
      `;
    });

    html += `
      <div class="fittings-section">
        <details class="fittings-details">
          <summary>Внутриквартирное пожаротушение (итого: ${totalApartments} кв.)</summary>
          <div class="fittings-subsections" style="padding: 12px;">
            ${ivptSectionsHtml}
            <div class="pipeline-summary" style="margin-top: 12px;">
              <h4>Сводка по зданию</h4>
              <table class="results-table summary-table">
                <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
                <tbody>
                  <tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">Устройство внутриквартирного пожаротушения</td><td class="unit-col">шт</td><td class="col-qty num-col">${totalApartments}</td></tr>
                  <tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">Кран шаровый Ду 15 (для ВКП)</td><td class="unit-col">шт</td><td class="col-qty num-col">${totalApartments}</td></tr>
                </tbody>
                <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по зданию</strong></td><td class="qty-col"><strong>${totalApartments * 2}</strong></td></tr></tfoot>
              </table>
            </div>
          </div>
        </details>
      </div>
    `;
  }

  // === Монтаж узла концевого (В1 + Т3, с детализацией по корпусам) ===
  const endNodeBySection = new Map(); // sectionIndex -> { V1: count, T3: count }
  let totalRisersV1 = 0;
  let totalRisersT3 = 0;

  if (zonesData && zonesData.length > 0) {
    zonesData.forEach(zd => {
      const si = zd.sectionIndex;
      const d = zd.d || {};
      const risers = zd.risersPerSection || 0;

      if (!endNodeBySection.has(si)) {
        endNodeBySection.set(si, { V1: 0, T3: 0 });
      }
      const secData = endNodeBySection.get(si);

      if (d.V1 && d.V1 > 0) {
        secData.V1 += risers;
        totalRisersV1 += risers;
      }
      if (d.T3 && d.T3 > 0) {
        secData.T3 += risers;
        totalRisersT3 += risers;
      }
    });
  }

  const totalEndNodeItems = totalRisersV1 + totalRisersT3;
  if (totalEndNodeItems > 0) {
    hasData = true;

    let endNodeSectionsHtml = '';
    endNodeBySection.forEach((secData, si) => {
      const sectionTotal = secData.V1 + secData.T3; // только воздухоотводчики
      if (sectionTotal <= 0) return;

      let rowsHtml = '';
      if (secData.V1 > 0) {
        rowsHtml += `<tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">Автоматический воздухоотводчик Ду 15</td><td class="unit-col">шт</td><td class="col-qty num-col">${secData.V1}</td></tr>`;
        rowsHtml += `<tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">Кран шаровый Ду 15</td><td class="unit-col">шт</td><td class="col-qty num-col">${secData.V1}</td></tr>`;
      }
      if (secData.T3 > 0) {
        rowsHtml += `<tr><td class="sys-cell sys-cell--T3">Т3</td><td class="name-col">Автоматический воздухоотводчик Ду 15</td><td class="unit-col">шт</td><td class="col-qty num-col">${secData.T3}</td></tr>`;
        rowsHtml += `<tr><td class="sys-cell sys-cell--T3">Т3</td><td class="name-col">Кран шаровый Ду 15</td><td class="unit-col">шт</td><td class="col-qty num-col">${secData.T3}</td></tr>`;
      }

      endNodeSectionsHtml += `
        <details class="fittings-details" style="margin: 8px 0;">
          <summary>Корпус ${si + 1} (итого: ${sectionTotal} шт)</summary>
          <table class="results-table">
            <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по корпусу ${si + 1}</strong></td><td class="qty-col"><strong>${sectionTotal}</strong></td></tr></tfoot>
          </table>
        </details>
      `;
    });

    let summaryRows = '';
    if (totalRisersV1 > 0) {
      summaryRows += `<tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">Автоматический воздухоотводчик Ду 15</td><td class="unit-col">шт</td><td class="col-qty num-col">${totalRisersV1}</td></tr>`;
      summaryRows += `<tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">Кран шаровый Ду 15</td><td class="unit-col">шт</td><td class="col-qty num-col">${totalRisersV1}</td></tr>`;
    }
    if (totalRisersT3 > 0) {
      summaryRows += `<tr><td class="sys-cell sys-cell--T3">Т3</td><td class="name-col">Автоматический воздухоотводчик Ду 15</td><td class="unit-col">шт</td><td class="col-qty num-col">${totalRisersT3}</td></tr>`;
      summaryRows += `<tr><td class="sys-cell sys-cell--T3">Т3</td><td class="name-col">Кран шаровый Ду 15</td><td class="unit-col">шт</td><td class="col-qty num-col">${totalRisersT3}</td></tr>`;
    }

    html += `
      <div class="fittings-section">
        <details class="fittings-details">
          <summary>Монтаж узла концевого (итого: ${totalEndNodeItems} шт)</summary>
          <div class="fittings-subsections" style="padding: 12px;">
            ${endNodeSectionsHtml}
            <div class="pipeline-summary" style="margin-top: 12px;">
              <h4>Сводка по зданию</h4>
              <table class="results-table summary-table">
                <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
                <tbody>${summaryRows}</tbody>
                <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по зданию</strong></td><td class="qty-col"><strong>${totalEndNodeItems}</strong></td></tr></tfoot>
              </table>
            </div>
          </div>
        </details>
      </div>
    `;
  }

  // === Установка счетчика (водомера) ГВС, ХВС (с детализацией по корпусам) ===
  // Квартиры = счетчик В1 + счетчик Т3, аренда = счетчик В1 + счетчик Т3
  const totalUnits = totalApartments + totalRentUnits;
  if (totalUnits > 0) {
    hasData = true;
    const totalMetersV1 = totalUnits; // В1: квартиры + аренда
    const totalMetersT3 = totalUnits; // Т3: квартиры + аренда
    const waterMetersCount = totalMetersV1 + totalMetersT3;

    let metersSectionsHtml = '';
    sections.forEach((sec, si) => {
      let secApts = 0;
      Object.keys(sec.apts).forEach(f => {
        if (+f >= 2) secApts += sec.apts[f] || 0;
      });
      const secRent = sec.rent?.enabled ? (sec.rent.qty || 0) : 0;
      const secUnits = secApts + secRent;
      if (secUnits <= 0) return;

      const secMetersV1 = secUnits; // В1: квартиры + аренда
      const secMetersT3 = secUnits; // Т3: квартиры + аренда
      const secMetersTotal = secMetersV1 + secMetersT3;

      metersSectionsHtml += `
        <details class="fittings-details" style="margin: 8px 0;">
          <summary>Корпус ${si + 1} (итого: ${secMetersTotal} шт)</summary>
          <table class="results-table">
            <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
            <tbody>
              <tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">Счетчик воды Ду 15 универс. крыльчатый одноструйный с цифровым выходом RS485</td><td class="unit-col">шт</td><td class="col-qty num-col">${secMetersV1}</td></tr>
              <tr><td class="sys-cell sys-cell--T3">Т3</td><td class="name-col">Счетчик воды Ду 15 универс. крыльчатый одноструйный с цифровым выходом RS485</td><td class="unit-col">шт</td><td class="col-qty num-col">${secMetersT3}</td></tr>
            </tbody>
            <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по корпусу ${si + 1}</strong></td><td class="qty-col"><strong>${secMetersTotal}</strong></td></tr></tfoot>
          </table>
        </details>
      `;
    });

    html += `
      <div class="fittings-section">
        <details class="fittings-details">
          <summary>Установка счетчика (водомера) ГВС, ХВС (итого: ${waterMetersCount} шт)</summary>
          <div class="fittings-subsections" style="padding: 12px;">
            ${metersSectionsHtml}
            <div class="pipeline-summary" style="margin-top: 12px;">
              <h4>Сводка по зданию</h4>
              <table class="results-table summary-table">
                <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
                <tbody>
                  <tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">Счетчик воды Ду 15 универс. крыльчатый одноструйный с цифровым выходом RS485</td><td class="unit-col">шт</td><td class="col-qty num-col">${totalMetersV1}</td></tr>
                  <tr><td class="sys-cell sys-cell--T3">Т3</td><td class="name-col">Счетчик воды Ду 15 универс. крыльчатый одноструйный с цифровым выходом RS485</td><td class="unit-col">шт</td><td class="col-qty num-col">${totalMetersT3}</td></tr>
                </tbody>
                <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по зданию</strong></td><td class="qty-col"><strong>${waterMetersCount}</strong></td></tr></tfoot>
              </table>
            </div>
          </div>
        </details>
      </div>
    `;
  }

  // === Распределительный этажный коллектор ===
  // Собираем данные по корпусам: { sectionIndex: Map(outlets -> count) }
  const collectorsBySection = new Map();
  const collectorsTotalByOutlets = new Map(); // общая сводка по выходам

  // Обрабатываем каждый корпус
  sections.forEach((sec, si) => {
    if (!sec.zones || sec.zones.length === 0) return;

    const sectionCollectors = new Map();

    // Находим максимальный этаж с данными (на случай если apts содержит этажи выше floors)
    const aptsFloors = Object.keys(sec.apts).map(k => parseInt(k, 10)).filter(k => k > 0 && sec.apts[k] > 0);
    const maxFloor = Math.max(sec.floors || 0, ...aptsFloors);

    // Проходим по всем этажам корпуса (со 2-го, т.к. 1-й - аренда)
    for (let floor = 2; floor <= maxFloor; floor++) {
      const aptsOnFloor = sec.apts[floor] || 0;
      if (aptsOnFloor <= 0) continue;

      // Находим зону, которая покрывает этот этаж
      const zone = sectionZoneForFloor(sec, floor);
      if (!zone) continue;

      const risers = Math.max(1, +zone.risers || 1);

      // Распределяем квартиры по стоякам (коллекторам)
      const base = Math.floor(aptsOnFloor / risers);
      const rem = aptsOnFloor % risers;

      for (let i = 0; i < risers; i++) {
        const outlets = i < rem ? base + 1 : base;
        if (outlets <= 0) continue;
        const actualOutlets = Math.max(2, outlets);

        sectionCollectors.set(actualOutlets, (sectionCollectors.get(actualOutlets) || 0) + 1);
        collectorsTotalByOutlets.set(actualOutlets, (collectorsTotalByOutlets.get(actualOutlets) || 0) + 1);
      }
    }

    if (sectionCollectors.size > 0) {
      collectorsBySection.set(si, sectionCollectors);
    }
  });

  if (collectorsBySection.size > 0) {
    hasData = true;

    // Считаем общее количество коллекторов (×2, так как нужны для В1 и Т3)
    let totalCollectors = 0;
    collectorsTotalByOutlets.forEach(count => { totalCollectors += count; });
    totalCollectors *= 2; // В1 + Т3

    // Генерируем HTML по корпусам
    let sectionsHtml = '';
    collectorsBySection.forEach((sectionCollectors, si) => {
      let sectionTotal = 0;
      sectionCollectors.forEach(count => { sectionTotal += count; });
      sectionTotal *= 2; // В1 + Т3

      const sortedOutlets = Array.from(sectionCollectors.keys()).sort((a, b) => a - b);

      let rowsHtml = '';
      sortedOutlets.forEach(outlets => {
        const count = sectionCollectors.get(outlets);
        // Коллекторы нужны для обеих систем В1 и Т3
        rowsHtml += `
          <tr>
            <td class="sys-cell sys-cell--V1">В1</td>
            <td class="name-col">Коллектор на ${outlets} выход${getOutletsSuffix(outlets)}</td>
            <td class="unit-col">шт</td>
            <td class="col-qty num-col">${count}</td>
          </tr>
          <tr>
            <td class="sys-cell sys-cell--T3">Т3</td>
            <td class="name-col">Коллектор на ${outlets} выход${getOutletsSuffix(outlets)}</td>
            <td class="unit-col">шт</td>
            <td class="col-qty num-col">${count}</td>
          </tr>
        `;
      });

      sectionsHtml += `
        <details class="fittings-details" style="margin: 8px 0;">
          <summary>Корпус ${si + 1} (итого: ${sectionTotal} шт)</summary>
          <table class="results-table">
            <thead>
              <tr>
                <th>Система</th>
                <th class="name-col">Наименование</th>
                <th class="unit-col">Ед. изм.</th>
                <th class="qty-col">Количество</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="3"><strong>Итого по корпусу ${si + 1}</strong></td>
                <td class="qty-col"><strong>${sectionTotal}</strong></td>
              </tr>
            </tfoot>
          </table>
        </details>
      `;
    });

    // Сводка по зданию
    const sortedTotalOutlets = Array.from(collectorsTotalByOutlets.keys()).sort((a, b) => a - b);
    let summaryRowsHtml = '';
    sortedTotalOutlets.forEach(outlets => {
      const count = collectorsTotalByOutlets.get(outlets);
      // Коллекторы нужны для обеих систем В1 и Т3
      summaryRowsHtml += `
        <tr>
          <td class="sys-cell sys-cell--V1">В1</td>
          <td class="name-col">Коллектор на ${outlets} выход${getOutletsSuffix(outlets)}</td>
          <td class="unit-col">шт</td>
          <td class="col-qty num-col">${count}</td>
        </tr>
        <tr>
          <td class="sys-cell sys-cell--T3">Т3</td>
          <td class="name-col">Коллектор на ${outlets} выход${getOutletsSuffix(outlets)}</td>
          <td class="unit-col">шт</td>
          <td class="col-qty num-col">${count}</td>
        </tr>
      `;
    });

    html += `
      <div class="fittings-section">
        <details class="fittings-details">
          <summary>Распределительный этажный коллектор (итого: ${totalCollectors} шт)</summary>
          <div class="fittings-subsections" style="padding: 12px;">
            ${sectionsHtml}
            <div class="pipeline-summary" style="margin-top: 12px;">
              <h4>Сводка по зданию</h4>
              <table class="results-table summary-table">
                <thead>
                  <tr>
                    <th>Система</th>
                    <th class="name-col">Наименование</th>
                    <th class="unit-col">Ед. изм.</th>
                    <th class="qty-col">Количество</th>
                  </tr>
                </thead>
                <tbody>
                  ${summaryRowsHtml}
                </tbody>
                <tfoot>
                  <tr class="total-row">
                    <td colspan="3"><strong>Итого по зданию</strong></td>
                    <td class="qty-col"><strong>${totalCollectors}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </details>
      </div>
    `;

    // === Запорнорегулирующая арматура обвязки коллекторов ===
    // Отображаем отдельно для систем В1 и Т3 (как в "Распределительный этажный коллектор")
    const valveItems = [
      { name: 'Кран шаровый Ду 32', unit: 'шт' },
      { name: 'Кран шаровый Ду 15', unit: 'шт' },
      { name: 'Фильтр сетчатый косой Ду 32', unit: 'шт' },
      { name: 'Регулятор давления Ду 32', unit: 'шт' },
      { name: 'Манометр', unit: 'шт' },
      { name: 'Кран сливной Ду 15', unit: 'шт' }
    ];

    // totalCollectors уже включает обе системы (В1 + Т3), делим на 2 для каждой системы
    const collectorsPerSystem = totalCollectors / 2;
    const totalValveItems = valveItems.length * totalCollectors;

    let valveRowsHtml = '';
    // Система В1
    valveItems.forEach(item => {
      valveRowsHtml += `
              <tr>
                <td class="sys-cell sys-cell--V1">В1</td>
                <td class="name-col">${item.name}</td>
                <td class="unit-col">${item.unit}</td>
                <td class="col-qty num-col">${collectorsPerSystem}</td>
              </tr>
      `;
    });
    // Система Т3
    valveItems.forEach(item => {
      valveRowsHtml += `
              <tr>
                <td class="sys-cell sys-cell--T3">Т3</td>
                <td class="name-col">${item.name}</td>
                <td class="unit-col">${item.unit}</td>
                <td class="col-qty num-col">${collectorsPerSystem}</td>
              </tr>
      `;
    });

    html += `
      <div class="fittings-section">
        <details class="fittings-details">
          <summary>Запорнорегулирующая арматура обвязки коллекторов (итого: ${totalValveItems} шт)</summary>
          <table class="results-table">
            <thead>
              <tr>
                <th>Система</th>
                <th class="name-col">Наименование</th>
                <th class="unit-col">Ед. изм.</th>
                <th class="qty-col">Количество</th>
              </tr>
            </thead>
            <tbody>
              ${valveRowsHtml}
            </tbody>
          </table>
        </details>
      </div>
    `;
  }

  // === Монтаж водомерного узла (Аренда) — детализация по корпусам и системам В1 и Т3 ===
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

  // Собираем данные по корпусам с активной арендой
  const rentalBySection = new Map(); // sectionIndex -> rentQty
  let totalRentalNodes = 0;

  if (sections && sections.length > 0) {
    sections.forEach((sec, si) => {
      if (sec.rent && sec.rent.enabled && sec.rent.qty > 0) {
        rentalBySection.set(si, sec.rent.qty);
        totalRentalNodes += sec.rent.qty;
      }
    });
  }

  if (totalRentalNodes > 0) {
    hasData = true;
    const totalRentalUnitsDisplay = totalRentalNodes * 2; // количество узлов × 2 (для В1 и Т3)

    // Генерируем HTML по корпусам
    let rentalSectionsHtml = '';
    rentalBySection.forEach((rentQty, si) => {
      const sectionUnitsDisplay = rentQty * 2; // узлов × 2 (для В1 и Т3)

      let rowsHtml = '';
      // Система В1
      rentalWaterMeterItems.forEach(item => {
        rowsHtml += `<tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">${item.name}</td><td class="unit-col">${item.unit}</td><td class="col-qty num-col">${rentQty}</td></tr>`;
      });
      // Система Т3
      rentalWaterMeterItems.forEach(item => {
        rowsHtml += `<tr><td class="sys-cell sys-cell--T3">Т3</td><td class="name-col">${item.name}</td><td class="unit-col">${item.unit}</td><td class="col-qty num-col">${rentQty}</td></tr>`;
      });

      rentalSectionsHtml += `
        <details class="fittings-details" style="margin: 8px 0;">
          <summary>Корпус ${si + 1} (итого: ${sectionUnitsDisplay} шт)</summary>
          <table class="results-table">
            <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по корпусу ${si + 1}</strong></td><td class="qty-col"><strong>${sectionUnitsDisplay}</strong></td></tr></tfoot>
          </table>
        </details>
      `;
    });

    // Сводка по зданию
    let summaryRowsHtml = '';
    // Система В1
    rentalWaterMeterItems.forEach(item => {
      summaryRowsHtml += `<tr><td class="sys-cell sys-cell--V1">В1</td><td class="name-col">${item.name}</td><td class="unit-col">${item.unit}</td><td class="col-qty num-col">${totalRentalNodes}</td></tr>`;
    });
    // Система Т3
    rentalWaterMeterItems.forEach(item => {
      summaryRowsHtml += `<tr><td class="sys-cell sys-cell--T3">Т3</td><td class="name-col">${item.name}</td><td class="unit-col">${item.unit}</td><td class="col-qty num-col">${totalRentalNodes}</td></tr>`;
    });

    html += `
      <div class="fittings-section">
        <details class="fittings-details">
          <summary>Монтаж водомерного узла (Аренда) (итого: ${totalRentalUnitsDisplay} шт)</summary>
          <div class="fittings-subsections" style="padding: 12px;">
            ${rentalSectionsHtml}
            <div class="pipeline-summary" style="margin-top: 12px;">
              <h4>Сводка по зданию</h4>
              <table class="results-table summary-table">
                <thead><tr><th>Система</th><th class="name-col">Наименование</th><th class="unit-col">Ед. изм.</th><th class="qty-col">Количество</th></tr></thead>
                <tbody>${summaryRowsHtml}</tbody>
                <tfoot><tr class="total-row"><td colspan="3"><strong>Итого по зданию</strong></td><td class="qty-col"><strong>${totalRentalUnitsDisplay}</strong></td></tr></tfoot>
              </table>
            </div>
          </div>
        </details>
      </div>
    `;
  }

  // Если нет данных
  if (!hasData) {
    html += `
      <div class="placeholder-block">
        <p class="note">Нет данных для отображения. Добавьте зоны в корпусах и выполните расчёт.</p>
      </div>
    `;
  }

  // Сохраняем состояние открытости всех <details> перед ререндером
  const openDetails = new Set();
  container.querySelectorAll('details').forEach((det, idx) => {
    if (det.open) {
      openDetails.add(idx);
    }
  });

  container.innerHTML = html;

  // Восстанавливаем состояние открытости <details> после ререндера
  container.querySelectorAll('details').forEach((det, idx) => {
    if (openDetails.has(idx)) {
      det.open = true;
    }
  });
}

// Склонение слова "выход" в зависимости от числа (для сводки по коллекторам)
function getOutletsSuffixForSummary(n) {
  const abs = Math.abs(n) % 100;
  const lastDigit = abs % 10;
  if (abs > 10 && abs < 20) return 'ов'; // 11-19 выходов
  if (lastDigit === 1) return '';         // 1 выход
  if (lastDigit >= 2 && lastDigit <= 4) return 'а'; // 2-4 выхода
  return 'ов'; // 5-9, 0 выходов
}

// Рендер сводки по коллекторам (по корпусам)
// Использует collectorsDistribution из zonesData
export function renderCollectorsSummary(zonesData) {
  const container = document.getElementById('collectorsSummary');
  if (!container) return;

  if (!zonesData || zonesData.length === 0) {
    container.innerHTML = `
      <div class="placeholder-block">
        <p class="note">Нет данных для отображения. Добавьте корпуса и зоны.</p>
      </div>
    `;
    return;
  }

  // Сохраняем состояние открытости <details> перед ререндером
  const openDetails = new Set();
  container.querySelectorAll('details').forEach((det, idx) => {
    if (det.open) {
      openDetails.add(idx);
    }
  });

  let html = '';

  // Общая сводка по всему зданию
  const totalByOutlets = new Map(); // ключ: количество выходов, значение: количество коллекторов

  // Группируем zonesData по корпусам
  const sectionIndices = [...new Set(zonesData.map(zd => zd.sectionIndex))].sort((a, b) => a - b);

  sectionIndices.forEach(si => {
    // Коллекторы для этого корпуса (агрегируем из всех зон)
    const collectorsByOutlets = new Map();

    // Берём все зоны этого корпуса
    const zonesOfSection = zonesData.filter(zd => zd.sectionIndex === si);

    zonesOfSection.forEach(zd => {
      if (!zd.collectorsDistribution) return;

      // Добавляем данные из распределения зоны
      Object.entries(zd.collectorsDistribution).forEach(([outlets, count]) => {
        const n = +outlets;
        collectorsByOutlets.set(n, (collectorsByOutlets.get(n) || 0) + count);
        totalByOutlets.set(n, (totalByOutlets.get(n) || 0) + count);
      });
    });

    // Если для корпуса есть коллекторы
    if (collectorsByOutlets.size > 0) {
      // Считаем общее количество коллекторов для корпуса
      let sectionTotal = 0;
      collectorsByOutlets.forEach(count => { sectionTotal += count; });

      // Сортируем по количеству выходов
      const sortedOutlets = Array.from(collectorsByOutlets.keys()).sort((a, b) => a - b);

      html += `
        <details class="collector-details">
          <summary><b>Корпус ${si + 1}</b> (итого: ${sectionTotal} шт)</summary>
          <table class="pipeline-table">
            <thead>
              <tr>
                <th>Тип коллектора</th>
                <th>Количество, шт</th>
              </tr>
            </thead>
            <tbody>
      `;

      sortedOutlets.forEach(outlets => {
        const count = collectorsByOutlets.get(outlets);
        html += `
              <tr>
                <td>Коллектор на ${outlets} выход${getOutletsSuffixForSummary(outlets)}</td>
                <td>${count}</td>
              </tr>
        `;
      });

      html += `
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td><strong>Итого по корпусу ${si + 1}</strong></td>
                <td class="qty-col"><strong>${sectionTotal}</strong></td>
              </tr>
            </tfoot>
          </table>
        </details>
      `;
    }
  });

  // Общая сводка по зданию
  if (totalByOutlets.size > 0) {
    let grandTotal = 0;
    totalByOutlets.forEach(count => { grandTotal += count; });

    const sortedTotalOutlets = Array.from(totalByOutlets.keys()).sort((a, b) => a - b);

    html += `
      <div class="pipeline-section pipeline-summary" style="margin-top: 16px;">
        <h4>Сводка по зданию</h4>
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Тип коллектора</th>
              <th>Количество, шт</th>
            </tr>
          </thead>
          <tbody>
    `;

    sortedTotalOutlets.forEach(outlets => {
      const count = totalByOutlets.get(outlets);
      html += `
            <tr>
              <td>Коллектор на ${outlets} выход${getOutletsSuffixForSummary(outlets)}</td>
              <td>${count}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td><strong>Итого по зданию</strong></td>
              <td class="qty-col"><strong>${grandTotal}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  if (!html) {
    html = `
      <div class="placeholder-block">
        <p class="note">Нет данных для отображения. Убедитесь, что указано количество квартир по этажам.</p>
      </div>
    `;
  }

  container.innerHTML = html;

  // Восстанавливаем состояние открытости <details> после ререндера
  container.querySelectorAll('details').forEach((det, idx) => {
    if (openDetails.has(idx)) {
      det.open = true;
    }
  });
}

// ===== Рендер вкладки "Спецификация" =====

/**
 * Рендер содержимого вкладки "Спецификация"
 * Отображает:
 * - Трубы стальные оцинкованные (стояки) по диаметрам
 * - Трубы стальные (гильзы) по диаметрам
 * @param {Array} zonesData - данные по зонам из computeZonesData
 */
export function renderSpecificationContent(zonesData, sections = []) {
  const container = document.getElementById('specificationContent');
  if (!container) return;

  if (!zonesData || zonesData.length === 0) {
    container.innerHTML = `
      <div class="placeholder-block">
        <p class="note">Нет данных для отображения. Выполните расчёт на вкладке "Жилая часть".</p>
      </div>
    `;
    return;
  }

  // =============================================
  // 1. Трубы стальные оцинкованные (стояки)
  // =============================================
  const byDiameter = new Map(); // dia -> { len: number }
  let grandTotal = 0;

  zonesData.forEach(zd => {
    const d = zd.d || {};
    ['V1', 'T3', 'T4'].forEach(sys => {
      const dia = d[sys] || 0;
      if (dia > 0) {
        const totalLen = zd.hZone * zd.risersPerSection;
        if (!byDiameter.has(dia)) {
          byDiameter.set(dia, { len: 0 });
        }
        byDiameter.get(dia).len += totalLen;
        grandTotal += totalLen;
      }
    });
  });

  const sortedDiameters = Array.from(byDiameter.keys()).sort((a, b) => a - b);

  // =============================================
  // 2. Трубы стальные (гильзы)
  // =============================================
  const SLEEVE_LENGTH = 0.35; // длина одной гильзы в метрах
  const sleevesByDiameter = new Map(); // dia -> { len: number }
  let sleevesGrandTotal = 0;

  zonesData.forEach(zd => {
    const d = zd.d || {};
    const risers = zd.risersPerSection || 1;
    const floorsInZone = zd.zoneTo - zd.zoneFrom + 1;

    ['V1', 'T3', 'T4'].forEach(sys => {
      const pipeDia = d[sys] || 0;
      if (pipeDia > 0 && floorsInZone > 0) {
        // Диаметр гильзы на один типоразмер больше диаметра трубы
        const sleeveDia = getSleeveDn(pipeDia);
        // Количество гильз = стояков × этажей
        const sleevesCount = risers * floorsInZone;
        const sleevesLen = sleevesCount * SLEEVE_LENGTH;

        if (!sleevesByDiameter.has(sleeveDia)) {
          sleevesByDiameter.set(sleeveDia, { len: 0 });
        }
        sleevesByDiameter.get(sleeveDia).len += sleevesLen;
        sleevesGrandTotal += sleevesLen;
      }
    });
  });

  const sortedSleeveDiameters = Array.from(sleevesByDiameter.keys()).sort((a, b) => a - b);

  // =============================================
  // 3. Трубы PP-R (сшитый полиэтилен в МОП)
  // =============================================
  const pprByDiameter = new Map(); // dn -> { len: number }
  let pprGrandTotal = 0;

  sections.forEach(sec => {
    const mopResult = computeMopPexLengthsForSection(sec);
    if (mopResult.lengthV1 > 0 || mopResult.lengthT3 > 0) {
      const dn = sec.mop?.dn || 20;
      const totalLen = mopResult.lengthV1 + mopResult.lengthT3;

      if (!pprByDiameter.has(dn)) {
        pprByDiameter.set(dn, { len: 0 });
      }
      pprByDiameter.get(dn).len += totalLen;
      pprGrandTotal += totalLen;
    }
  });

  const sortedPprDiameters = Array.from(pprByDiameter.keys()).sort((a, b) => a - b);

  // =============================================
  // 4. Изоляция трубопроводов (стальные + PP-R объединённые по диаметрам)
  // =============================================
  const insulationByDiameter = new Map(); // dn -> { len: number }
  let insulationGrandTotal = 0;

  // Добавляем стальные трубы (стояки)
  zonesData.forEach(zd => {
    const d = zd.d || {};
    ['V1', 'T3', 'T4'].forEach(sys => {
      const dia = d[sys] || 0;
      if (dia > 0) {
        const totalLen = zd.hZone * zd.risersPerSection;
        if (!insulationByDiameter.has(dia)) {
          insulationByDiameter.set(dia, { len: 0 });
        }
        insulationByDiameter.get(dia).len += totalLen;
        insulationGrandTotal += totalLen;
      }
    });
  });

  // Добавляем PP-R трубы
  sections.forEach(sec => {
    const mopResult = computeMopPexLengthsForSection(sec);
    if (mopResult.lengthV1 > 0 || mopResult.lengthT3 > 0) {
      const dn = sec.mop?.dn || 20;
      const totalLen = mopResult.lengthV1 + mopResult.lengthT3;

      if (!insulationByDiameter.has(dn)) {
        insulationByDiameter.set(dn, { len: 0 });
      }
      insulationByDiameter.get(dn).len += totalLen;
      insulationGrandTotal += totalLen;
    }
  });

  const sortedInsulationDiameters = Array.from(insulationByDiameter.keys()).sort((a, b) => a - b);

  // =============================================
  // 5. Приборы учета воды (счётчики)
  // =============================================
  // Считаем квартиры и аренду
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
  // Каждая квартира/аренда = 2 счётчика (В1 + Т3)
  const totalUnits = totalApartments + totalRentUnits;
  const waterMetersCount = totalUnits * 2;

  // =============================================
  // Формируем HTML
  // =============================================
  let html = '';

  // Блок "Трубы стальные оцинкованные"
  html += `
    <details class="accordion">
      <summary class="accordion-header">
        <span class="accordion-icon"></span>
        <span class="accordion-title">Трубы стальные оцинкованные</span>
        <span class="accordion-manufacturer">
          <label>Производитель:</label>
          <select class="manufacturer-select" data-section="steel-galvanized" onchange="window.app.updateManufacturerEmail(this)" onclick="event.stopPropagation()">
            <option value="Erokhovd@mail.ru">РФ</option>
          </select>
          <a href="mailto:Erokhovd@mail.ru" class="manufacturer-email" onclick="event.stopPropagation()">Erokhovd@mail.ru</a>
        </span>
      </summary>
      <div class="accordion-content">
  `;

  if (sortedDiameters.length > 0) {
    html += `
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Диаметр, мм</th>
              <th>Длина, м.п.</th>
            </tr>
          </thead>
          <tbody>
    `;

    sortedDiameters.forEach(dia => {
      const item = byDiameter.get(dia);
      html += `
            <tr>
              <td>Ду ${dia}</td>
              <td>${item.len.toFixed(2)}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td><strong>Итого</strong></td>
              <td class="qty-col"><strong>${grandTotal.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
    `;
  } else {
    html += `
        <p class="note">Нет данных по трубам. Убедитесь, что в зонах указаны диаметры.</p>
    `;
  }

  html += `
      </div>
    </details>
  `;

  // Блок "Трубы стальные" (гильзы)
  html += `
    <details class="accordion">
      <summary class="accordion-header">
        <span class="accordion-icon"></span>
        <span class="accordion-title">Трубы стальные</span>
        <span class="accordion-manufacturer">
          <label>Производитель:</label>
          <select class="manufacturer-select" data-section="steel-sleeves" onchange="window.app.updateManufacturerEmail(this)" onclick="event.stopPropagation()">
            <option value="Erokhovd@mail.ru">РФ</option>
          </select>
          <a href="mailto:Erokhovd@mail.ru" class="manufacturer-email" onclick="event.stopPropagation()">Erokhovd@mail.ru</a>
        </span>
      </summary>
      <div class="accordion-content">
  `;

  if (sortedSleeveDiameters.length > 0) {
    html += `
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Диаметр, мм</th>
              <th>Длина, м.п.</th>
            </tr>
          </thead>
          <tbody>
    `;

    sortedSleeveDiameters.forEach(dia => {
      const item = sleevesByDiameter.get(dia);
      html += `
            <tr>
              <td>Ду ${dia}</td>
              <td>${item.len.toFixed(2)}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td><strong>Итого</strong></td>
              <td class="qty-col"><strong>${sleevesGrandTotal.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
    `;
  } else {
    html += `
        <p class="note">Нет данных по гильзам.</p>
    `;
  }

  html += `
      </div>
    </details>
  `;

  // Блок "Трубы PP-R"
  html += `
    <details class="accordion">
      <summary class="accordion-header">
        <span class="accordion-icon"></span>
        <span class="accordion-title">Трубы PP-R</span>
        <span class="accordion-manufacturer">
          <label>Производитель:</label>
          <select class="manufacturer-select" data-section="ppr-pipes" onchange="window.app.updateManufacturerEmail(this)" onclick="event.stopPropagation()">
            <option value="Erokhovd@mail.ru">РФ</option>
            <option value="rehau@rehau.com">РЕХАУ</option>
            <option value="info@pro-aqua.ru">Pro aqua</option>
            <option value="info@wefatherm.ru">Wefatherm</option>
            <option value="info@aquatherm.de">Aquatherm</option>
            <option value="info@fdplast.ru">FDplast</option>
            <option value="info@tebo.ru">Tebo</option>
          </select>
          <a href="mailto:Erokhovd@mail.ru" class="manufacturer-email" onclick="event.stopPropagation()">Erokhovd@mail.ru</a>
        </span>
      </summary>
      <div class="accordion-content">
  `;

  if (sortedPprDiameters.length > 0) {
    html += `
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Диаметр, мм</th>
              <th>Длина, м.п.</th>
            </tr>
          </thead>
          <tbody>
    `;

    sortedPprDiameters.forEach(dn => {
      const item = pprByDiameter.get(dn);
      html += `
            <tr>
              <td>DN${dn}</td>
              <td>${item.len.toFixed(2)}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td><strong>Итого</strong></td>
              <td class="qty-col"><strong>${pprGrandTotal.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
    `;
  } else {
    html += `
        <p class="note">Нет данных по трубам PP-R. Настройте параметры МОП в карточках корпусов.</p>
    `;
  }

  html += `
      </div>
    </details>
  `;

  // Блок "Изоляция трубопроводов"
  html += `
    <details class="accordion">
      <summary class="accordion-header">
        <span class="accordion-icon"></span>
        <span class="accordion-title">Изоляция трубопроводов</span>
        <span class="accordion-manufacturer">
          <label>Производитель:</label>
          <select class="manufacturer-select" data-section="insulation" onchange="window.app.updateManufacturerEmail(this)" onclick="event.stopPropagation()">
            <option value="Erokhovd@mail.ru">РФ</option>
            <option value="info@k-flex.ru">K-Flex</option>
            <option value="info@thermaflex.com">Thermaflex</option>
          </select>
          <a href="mailto:Erokhovd@mail.ru" class="manufacturer-email" onclick="event.stopPropagation()">Erokhovd@mail.ru</a>
        </span>
      </summary>
      <div class="accordion-content">
  `;

  if (sortedInsulationDiameters.length > 0) {
    html += `
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Диаметр, мм</th>
              <th>Длина, м.п.</th>
            </tr>
          </thead>
          <tbody>
    `;

    sortedInsulationDiameters.forEach(dn => {
      const item = insulationByDiameter.get(dn);
      html += `
            <tr>
              <td>Ду ${dn}</td>
              <td>${item.len.toFixed(2)}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td><strong>Итого</strong></td>
              <td class="qty-col"><strong>${insulationGrandTotal.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
    `;
  } else {
    html += `
        <p class="note">Нет данных по изоляции.</p>
    `;
  }

  html += `
      </div>
    </details>
  `;

  // Блок "Приборы учета воды"
  html += `
    <details class="accordion">
      <summary class="accordion-header">
        <span class="accordion-icon"></span>
        <span class="accordion-title">Приборы учета воды</span>
        <span class="accordion-manufacturer">
          <label>Производитель:</label>
          <select class="manufacturer-select" data-section="water-meters" onchange="window.app.updateManufacturerEmail(this)" onclick="event.stopPropagation()">
            <option value="Erokhovd@mail.ru">РФ</option>
            <option value="info@teplovodokhran.ru">Тепловодохран</option>
          </select>
          <a href="mailto:Erokhovd@mail.ru" class="manufacturer-email" onclick="event.stopPropagation()">Erokhovd@mail.ru</a>
        </span>
      </summary>
      <div class="accordion-content">
  `;

  if (waterMetersCount > 0) {
    html += `
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Количество, шт</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Счетчик воды Ду 15 универс. крыльчатый одноструйный с цифровым выходом RS485</td>
              <td>${waterMetersCount}</td>
            </tr>
          </tbody>
        </table>
    `;
  } else {
    html += `
        <p class="note">Нет данных по счётчикам. Укажите количество квартир.</p>
    `;
  }

  html += `
      </div>
    </details>
  `;

  // =============================================
  // 6. Компенсаторы и опоры (без разделения по системам)
  // =============================================
  const compensatorsByDia = new Map(); // dia -> count

  zonesData.forEach(zd => {
    const d = zd.d || {};
    const risers = zd.risersPerSection || 1;
    const pipeLength = zd.hZone || 0;

    ['T3', 'T4'].forEach(sys => {
      const dia = d[sys] || 0;
      if (dia > 0 && pipeLength > 0) {
        const compPerRiser = calcCompensators(pipeLength, dia);
        const totalComp = compPerRiser * risers;
        if (totalComp > 0) {
          compensatorsByDia.set(dia, (compensatorsByDia.get(dia) || 0) + totalComp);
        }
      }
    });
  });

  const sortedCompDiameters = Array.from(compensatorsByDia.keys()).sort((a, b) => a - b);
  let totalCompensators = 0;
  let totalSupports = 0;
  compensatorsByDia.forEach(count => { totalCompensators += count; });
  totalSupports = totalCompensators * 2;

  html += `
    <details class="accordion">
      <summary class="accordion-header">
        <span class="accordion-icon"></span>
        <span class="accordion-title">Компенсаторы и опоры</span>
        <span class="accordion-manufacturer">
          <label>Производитель:</label>
          <select class="manufacturer-select" data-section="compensators" onchange="window.app.updateManufacturerEmail(this)" onclick="event.stopPropagation()">
            <option value="Erokhovd@mail.ru">РФ</option>
            <option value="info@proton-e.ru">Протон-Энергия</option>
            <option value="info@alteza.ru">Алтеза</option>
          </select>
          <a href="mailto:Erokhovd@mail.ru" class="manufacturer-email" onclick="event.stopPropagation()">Erokhovd@mail.ru</a>
        </span>
      </summary>
      <div class="accordion-content">
  `;

  if (sortedCompDiameters.length > 0) {
    html += `
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Диаметр, мм</th>
              <th>Количество, шт</th>
            </tr>
          </thead>
          <tbody>
    `;

    // Компенсаторы
    sortedCompDiameters.forEach(dia => {
      const count = compensatorsByDia.get(dia);
      html += `
            <tr>
              <td>Компенсатор</td>
              <td>Ду ${dia}</td>
              <td>${count}</td>
            </tr>
      `;
    });

    // Неподвижные опоры
    sortedCompDiameters.forEach(dia => {
      const count = compensatorsByDia.get(dia) * 2;
      html += `
            <tr>
              <td>Неподвижная опора</td>
              <td>Ду ${dia}</td>
              <td>${count}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="2"><strong>Итого компенсаторов</strong></td>
              <td class="qty-col"><strong>${totalCompensators}</strong></td>
            </tr>
            <tr class="total-row">
              <td colspan="2"><strong>Итого опор</strong></td>
              <td class="qty-col"><strong>${totalSupports}</strong></td>
            </tr>
          </tfoot>
        </table>
    `;
  } else {
    html += `
        <p class="note">Нет данных по компенсаторам и опорам.</p>
    `;
  }

  html += `
      </div>
    </details>
  `;

  // =============================================
  // 7. Узел коллекторный (из раздела "Распределительный этажный коллектор")
  // =============================================
  const collectorsByOutlets = new Map(); // outlets -> count

  sections.forEach((sec, si) => {
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
        collectorsByOutlets.set(actualOutlets, (collectorsByOutlets.get(actualOutlets) || 0) + 1);
      }
    }
  });

  const sortedCollectorOutlets = Array.from(collectorsByOutlets.keys()).sort((a, b) => a - b);
  let totalCollectorsSpec = 0;
  collectorsByOutlets.forEach(count => { totalCollectorsSpec += count; });

  html += `
    <details class="accordion">
      <summary class="accordion-header">
        <span class="accordion-icon"></span>
        <span class="accordion-title">Узел коллекторный</span>
        <span class="accordion-manufacturer">
          <label>Производитель:</label>
          <select class="manufacturer-select" data-section="collectors" onchange="window.app.updateManufacturerEmail(this)" onclick="event.stopPropagation()">
            <option value="Erokhovd@mail.ru">РФ</option>
            <option value="info@giacomini.com">Giacomini</option>
            <option value="info@ridan.ru">Ридан</option>
          </select>
          <a href="mailto:Erokhovd@mail.ru" class="manufacturer-email" onclick="event.stopPropagation()">Erokhovd@mail.ru</a>
        </span>
      </summary>
      <div class="accordion-content">
  `;

  if (sortedCollectorOutlets.length > 0) {
    html += `
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Количество, шт</th>
            </tr>
          </thead>
          <tbody>
    `;

    sortedCollectorOutlets.forEach(outlets => {
      const count = collectorsByOutlets.get(outlets);
      html += `
            <tr>
              <td>Коллектор на ${outlets} выход${getOutletsSuffix(outlets)}</td>
              <td>${count}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td><strong>Итого</strong></td>
              <td class="qty-col"><strong>${totalCollectorsSpec}</strong></td>
            </tr>
          </tfoot>
        </table>
    `;
  } else {
    html += `
        <p class="note">Нет данных по коллекторам.</p>
    `;
  }

  html += `
      </div>
    </details>
  `;

  // =============================================
  // 8. Запорная арматура (сводная из "Монтаж узла концевого" и "Запорнорегулирующая арматура обвязки коллекторов")
  // =============================================
  const shutoffValvesMap = new Map(); // name -> { unit, qty }

  // Считаем стояки V1 и T3 из zonesData
  let totalRisersV1 = 0;
  let totalRisersT3 = 0;
  if (zonesData && zonesData.length > 0) {
    zonesData.forEach(zd => {
      const d = zd.d || {};
      const risers = zd.risersPerSection || 0;
      if (d.V1 && d.V1 > 0) {
        totalRisersV1 += risers;
      }
      if (d.T3 && d.T3 > 0) {
        totalRisersT3 += risers;
      }
    });
  }

  // Добавляем позиции из "Монтаж узла концевого"
  if (totalRisersV1 > 0) {
    shutoffValvesMap.set('Автоматический воздухоотводчик Ду 15', {
      unit: 'шт',
      qty: (shutoffValvesMap.get('Автоматический воздухоотводчик Ду 15')?.qty || 0) + totalRisersV1
    });
    shutoffValvesMap.set('Кран шаровый Ду 15', {
      unit: 'шт',
      qty: (shutoffValvesMap.get('Кран шаровый Ду 15')?.qty || 0) + totalRisersV1
    });
  }
  if (totalRisersT3 > 0) {
    shutoffValvesMap.set('Автоматический воздухоотводчик Ду 15', {
      unit: 'шт',
      qty: (shutoffValvesMap.get('Автоматический воздухоотводчик Ду 15')?.qty || 0) + totalRisersT3
    });
    shutoffValvesMap.set('Кран шаровый Ду 15', {
      unit: 'шт',
      qty: (shutoffValvesMap.get('Кран шаровый Ду 15')?.qty || 0) + totalRisersT3
    });
  }

  // Добавляем позиции из "Запорнорегулирующая арматура обвязки коллекторов"
  const valveItemsSpec = [
    { name: 'Кран шаровый Ду 32', unit: 'шт' },
    { name: 'Кран шаровый Ду 15', unit: 'шт' },
    { name: 'Фильтр сетчатый косой Ду 32', unit: 'шт' },
    { name: 'Регулятор давления Ду 32', unit: 'шт' },
    { name: 'Манометр', unit: 'шт' },
    { name: 'Кран сливной Ду 15', unit: 'шт' }
  ];

  valveItemsSpec.forEach(item => {
    shutoffValvesMap.set(item.name, {
      unit: item.unit,
      qty: (shutoffValvesMap.get(item.name)?.qty || 0) + totalCollectorsSpec
    });
  });

  // Добавляем позиции из "Монтаж водомерного узла (Аренда)"
  // Позиции: Кран шаровый Ду 15, Клапан обратный Ду 15, Фильтр сетчатый косой Ду 15, Регулятор давления Ду 15
  // Количество = узлов аренды × 2 (для систем В1 и Т3)
  const rentalWaterMeterItemsSpec = [
    { name: 'Кран шаровый Ду 15', unit: 'шт' },
    { name: 'Клапан обратный Ду 15', unit: 'шт' },
    { name: 'Фильтр сетчатый косой Ду 15', unit: 'шт' },
    { name: 'Регулятор давления Ду 15', unit: 'шт' },
  ];

  let totalRentalNodesSpec = 0;
  if (sections && sections.length > 0) {
    sections.forEach(sec => {
      if (sec.rent && sec.rent.enabled && sec.rent.qty > 0) {
        totalRentalNodesSpec += sec.rent.qty;
      }
    });
  }

  if (totalRentalNodesSpec > 0) {
    const rentalQtyPerItem = totalRentalNodesSpec * 2; // × 2 для В1 и Т3
    rentalWaterMeterItemsSpec.forEach(item => {
      shutoffValvesMap.set(item.name, {
        unit: item.unit,
        qty: (shutoffValvesMap.get(item.name)?.qty || 0) + rentalQtyPerItem
      });
    });
  }

  // Считаем общее количество
  let totalShutoffValves = 0;
  shutoffValvesMap.forEach(item => { totalShutoffValves += item.qty; });

  html += `
    <details class="accordion">
      <summary class="accordion-header">
        <span class="accordion-icon"></span>
        <span class="accordion-title">Запорная арматура</span>
        <span class="accordion-manufacturer">
          <label>Производитель:</label>
          <select class="manufacturer-select" data-section="shutoff-valves" onchange="window.app.updateManufacturerEmail(this)" onclick="event.stopPropagation()">
            <option value="Erokhovd@mail.ru">РФ</option>
            <option value="info@giacomini.com">Giacomini</option>
            <option value="info@ridan.ru">Ридан</option>
            <option value="info@itap.it">ITAP</option>
            <option value="info@broen.com">BROEN</option>
            <option value="info@stout.ru">Stout</option>
            <option value="info@herz.eu">HERZ</option>
            <option value="info@faf.ru">FAF</option>
            <option value="info@dinarm.ru">DINARM</option>
            <option value="info@adl.ru">ADL</option>
          </select>
          <a href="mailto:Erokhovd@mail.ru" class="manufacturer-email" onclick="event.stopPropagation()">Erokhovd@mail.ru</a>
        </span>
      </summary>
      <div class="accordion-content">
  `;

  if (totalShutoffValves > 0) {
    html += `
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Ед. изм.</th>
              <th>Количество</th>
            </tr>
          </thead>
          <tbody>
    `;

    shutoffValvesMap.forEach((item, name) => {
      html += `
            <tr>
              <td>${name}</td>
              <td>${item.unit}</td>
              <td>${item.qty}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="2"><strong>Итого</strong></td>
              <td class="qty-col"><strong>${totalShutoffValves}</strong></td>
            </tr>
          </tfoot>
        </table>
    `;
  } else {
    html += `
        <p class="note">Нет данных по запорной арматуре.</p>
    `;
  }

  html += `
      </div>
    </details>
  `;

  // =============================================
  // 9. Крепления труб (хомуты для стальных оцинкованных труб)
  // =============================================
  // Расчёт хомутов по длинам стальных труб и нормам расхода
  const clampTotals = new Map(); // name -> totalQty

  // Используем те же данные по диаметрам, что и для стальных труб (byDiameter)
  // byDiameter: Map(dia -> { len })
  byDiameter.forEach((item, dia) => {
    const rule = STEEL_ZN_CLAMPS_RULES[dia];
    if (rule && item.len > 0) {
      const rawQty = item.len * rule.norm;
      const qty = Math.ceil(rawQty); // округление до целого вверх
      if (qty > 0) {
        const prev = clampTotals.get(rule.name) || 0;
        clampTotals.set(rule.name, prev + qty);
      }
    }
  });

  let totalClamps = 0;
  clampTotals.forEach(qty => { totalClamps += qty; });

  html += `
    <details class="accordion">
      <summary class="accordion-header">
        <span class="accordion-icon"></span>
        <span class="accordion-title">Крепления труб</span>
        <span class="accordion-manufacturer">
          <label>Производитель:</label>
          <select class="manufacturer-select" data-section="pipe-clamps" onchange="window.app.updateManufacturerEmail(this)" onclick="event.stopPropagation()">
            <option value="info@1001krep.ru">Hilti</option>
            <option value="Erokhovd@mail.ru">РФ</option>
          </select>
          <a href="mailto:info@1001krep.ru" class="manufacturer-email" onclick="event.stopPropagation()">info@1001krep.ru</a>
        </span>
      </summary>
      <div class="accordion-content">
  `;

  if (totalClamps > 0) {
    html += `
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Ед. изм.</th>
              <th>Количество</th>
            </tr>
          </thead>
          <tbody>
    `;

    // Сортируем по диаметру (извлекаем из названия для порядка)
    const sortedClamps = Array.from(clampTotals.entries()).sort((a, b) => {
      // Извлекаем диаметр из названия для сортировки
      const getDiaOrder = (name) => {
        if (name.includes('1/2"')) return 15;
        if (name.includes('3/4"')) return 20;
        if (name.includes('1/8"-6"')) return 25;
        if (name.includes('1 1/4"')) return 32;
        if (name.includes('1 1/2"')) return 40;
        if (name.includes('2 1/2"')) return 65;
        if (name.includes('2"')) return 50;
        if (name.includes('3"')) return 80;
        if (name.includes('4"')) return 100;
        return 999;
      };
      return getDiaOrder(a[0]) - getDiaOrder(b[0]);
    });

    sortedClamps.forEach(([name, qty]) => {
      html += `
            <tr>
              <td>${name}</td>
              <td>шт</td>
              <td>${qty}</td>
            </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="2"><strong>Итого</strong></td>
              <td class="qty-col"><strong>${totalClamps}</strong></td>
            </tr>
          </tfoot>
        </table>
    `;
  } else {
    html += `
        <p class="note">Нет данных по креплениям труб.</p>
    `;
  }

  html += `
      </div>
    </details>
  `;

  // =============================================
  // 10. Насосное оборудование
  // =============================================
  html += `
    <details class="accordion">
      <summary class="accordion-header">
        <span class="accordion-icon"></span>
        <span class="accordion-title">Насосное оборудование</span>
        <span class="accordion-manufacturer">
          <label>Производитель:</label>
          <select class="manufacturer-select" data-section="pumps" onchange="window.app.updateManufacturerEmail(this)" onclick="event.stopPropagation()">
            <option value="Erokhovd@mail.ru">РФ</option>
            <option value="info@wilo.com">Wilo</option>
            <option value="info@vanjord.ru">Vanjord</option>
            <option value="info@antarus.ru">Antarus</option>
            <option value="info@adl.ru">ADL</option>
            <option value="info@mfmc.ru">МФМК</option>
          </select>
          <a href="mailto:Erokhovd@mail.ru" class="manufacturer-email" onclick="event.stopPropagation()">Erokhovd@mail.ru</a>
        </span>
      </summary>
      <div class="accordion-content">
        <p class="note">Раздел в разработке. Здесь будет спецификация насосного оборудования.</p>
      </div>
    </details>
  `;

  container.innerHTML = html;
}
