// Модуль вкладок

// Конфигурация вкладок
export const TABS = [
  { id: 'residential', label: 'Жилая часть' },
  { id: 'underground', label: 'Подземная часть' },
  { id: 'equipment', label: 'Оборудование' },
  { id: 'inlet', label: 'Узел ввода' },
  { id: 'external', label: 'Наружные сети' },
  { id: 'specification', label: 'Спецификация' },
  { id: 'estimate', label: 'Смета' },
];

// Текущая активная вкладка
let activeTabId = 'residential';

// Callback при смене вкладки
let onTabChangeCallback = null;

// Callback для рендеринга спецификации
let specificationRenderer = null;

// Callback для рендеринга сметы
let estimateRenderer = null;

// Установка callback
export function setOnTabChange(callback) {
  onTabChangeCallback = callback;
}

// Установка renderer для спецификации
export function setSpecificationRenderer(renderer) {
  specificationRenderer = renderer;
}

// Установка renderer для сметы
export function setEstimateRenderer(renderer) {
  estimateRenderer = renderer;
}

// Получение активной вкладки
export function getActiveTabId() {
  return activeTabId;
}

// Установка активной вкладки
export function setActiveTabId(tabId) {
  if (TABS.find(t => t.id === tabId)) {
    activeTabId = tabId;
  } else {
    activeTabId = 'residential';
  }
}

// Рендер панели вкладок
export function renderTabs() {
  const container = document.getElementById('calcTabs');
  if (!container) return;

  const html = TABS.map(tab => `
    <button
      class="tab-btn ${tab.id === activeTabId ? 'active' : ''}"
      data-tab-id="${tab.id}"
    >
      ${tab.label}
    </button>
  `).join('');

  container.innerHTML = html;

  // Навешиваем обработчики
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tabId;
      if (tabId !== activeTabId) {
        activeTabId = tabId;
        renderTabs();
        renderTabContent();
        if (onTabChangeCallback) {
          onTabChangeCallback(tabId);
        }
      }
    });
  });
}

// Рендер содержимого вкладки
export function renderTabContent() {
  const container = document.getElementById('tabContent');
  if (!container) return;

  // Все контейнеры вкладок
  const calculatorContainer = document.getElementById('calculatorContainer');
  const undergroundContainer = document.getElementById('undergroundContainer');
  const specificationContainer = document.getElementById('specificationContainer');
  const estimateContainer = document.getElementById('estimateContainer');
  const placeholderContainer = document.getElementById('placeholderContainer');

  // Скрываем все контейнеры
  if (calculatorContainer) calculatorContainer.style.display = 'none';
  if (undergroundContainer) undergroundContainer.style.display = 'none';
  if (specificationContainer) specificationContainer.style.display = 'none';
  if (estimateContainer) estimateContainer.style.display = 'none';
  if (placeholderContainer) placeholderContainer.style.display = 'none';

  // Показываем нужный контейнер
  if (activeTabId === 'residential') {
    if (calculatorContainer) calculatorContainer.style.display = 'block';
  } else if (activeTabId === 'underground') {
    if (undergroundContainer) undergroundContainer.style.display = 'block';
  } else if (activeTabId === 'specification') {
    if (specificationContainer) {
      specificationContainer.style.display = 'block';
      // Вызываем renderer для обновления данных
      if (specificationRenderer) {
        specificationRenderer();
      }
    }
  } else if (activeTabId === 'estimate') {
    if (estimateContainer) {
      estimateContainer.style.display = 'block';
      // Вызываем renderer для обновления данных сметы
      if (estimateRenderer) {
        estimateRenderer();
      }
    }
  } else {
    // Показываем заглушку для остальных вкладок
    if (placeholderContainer) {
      placeholderContainer.style.display = 'block';
      renderPlaceholder(placeholderContainer);
    }
  }
}

// Рендер заглушки для неактивных вкладок
function renderPlaceholder(container) {
  const tab = TABS.find(t => t.id === activeTabId);
  if (!tab) return;

  const descriptions = {
    underground: 'Здесь будут расчёты подземной части системы водоснабжения: насосные станции, резервуары, подземные коммуникации.',
    equipment: 'Здесь будет подбор оборудования: насосы, фильтры, запорная арматура, приборы учёта.',
    inlet: 'Здесь будут расчёты узла ввода: водомерный узел, регуляторы давления, обратные клапаны.',
    external: 'Здесь будут расчёты наружных сетей: трассировка, диаметры, гидравлический расчёт.',
    specification: 'Здесь будет формирование спецификации оборудования и материалов для системы водоснабжения.',
    estimate: 'Здесь будет формирование сметы: расценки, объёмы работ, стоимость материалов и монтажа.'
  };

  container.innerHTML = `
    <div class="main-container placeholder-container">
      <div class="header">
        <div class="header-left">
          <h1>${tab.label}</h1>
          <p>Раздел системы водоснабжения</p>
        </div>
      </div>
      <div class="placeholder-content">
        <div class="placeholder-icon">
          ${getTabIcon(activeTabId)}
        </div>
        <h2>Раздел в разработке</h2>
        <p class="note">${descriptions[activeTabId] || 'Содержимое этого раздела будет добавлено позже.'}</p>
      </div>
    </div>
  `;
}

// Иконки для вкладок (SVG)
function getTabIcon(tabId) {
  const icons = {
    underground: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 3v18M3 12h18M5 5l14 14M19 5L5 19"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`,
    equipment: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>`,
    inlet: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M3 12h4l3-9 4 18 3-9h4"/>
    </svg>`,
    external: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18"/>
    </svg>`,
    specification: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <path d="M9 12h6M9 16h6"/>
    </svg>`,
    estimate: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6"/>
      <path d="M8 13h8M8 17h8M8 9h2"/>
    </svg>`
  };
  return icons[tabId] || '';
}

// Инициализация вкладок
export function initTabs(initialTabId) {
  setActiveTabId(initialTabId || 'residential');
  renderTabs();
  renderTabContent();
}
