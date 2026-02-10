// Работа с localStorage для проектов

const STORAGE_KEY = 'water-supply-projects';
const ACTIVE_PROJECT_KEY = 'water-supply-active-project';

// Генерация UUID
export function generateId() {
  return 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Получение списка проектов из localStorage
export function loadProjects() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    console.error('Ошибка загрузки проектов:', e);
    return [];
  }
}

// Сохранение списка проектов в localStorage
export function saveProjects(projects) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Ошибка сохранения проектов:', e);
  }
}

// Получение ID активного проекта
export function getActiveProjectId() {
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

// Установка ID активного проекта
export function setActiveProjectId(id) {
  if (id) {
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }
}

// Создание нового проекта
export function createProject(name, defaultCalculatorState) {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: name || 'Новый проект',
    createdAt: now,
    updatedAt: now,
    data: defaultCalculatorState
  };
}

// Поиск проекта по ID
export function findProjectById(projects, id) {
  return projects.find(p => p.id === id);
}

// Обновление проекта в списке
export function updateProjectInList(projects, updatedProject) {
  const index = projects.findIndex(p => p.id === updatedProject.id);
  if (index !== -1) {
    projects[index] = updatedProject;
  }
  return projects;
}

// Удаление проекта из списка
export function removeProjectFromList(projects, projectId) {
  return projects.filter(p => p.id !== projectId);
}

// Форматирование даты для отображения
export function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
}

// Получение краткой статистики проекта
export function getProjectStats(project) {
  if (!project.data || !project.data.sections) {
    return { sectionsCount: 0, totalFloors: 0, totalApts: 0 };
  }

  const sections = project.data.sections;
  const sectionsCount = sections.length;
  const totalFloors = sections.reduce((sum, s) => sum + (s.floors || 0), 0);

  let totalApts = 0;
  sections.forEach(sec => {
    Object.values(sec.apts || {}).forEach(count => {
      totalApts += count || 0;
    });
  });

  return { sectionsCount, totalFloors, totalApts };
}
