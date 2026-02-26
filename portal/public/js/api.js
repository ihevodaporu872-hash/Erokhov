// API-клиент для инженерного портала
const API_BASE = '/api';

// ==================== Проекты ====================

export async function fetchProjects() {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error('Ошибка загрузки проектов');
  return res.json();
}

export async function createProjectAPI(name) {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('Ошибка создания проекта');
  return res.json();
}

export async function updateProjectAPI(id, name) {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('Ошибка обновления проекта');
  return res.json();
}

export async function deleteProjectAPI(id) {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Ошибка удаления проекта');
  return res.json();
}

// ==================== Расчёты ====================

export async function fetchCalculation(projectId, systemType) {
  const res = await fetch(`${API_BASE}/calculations/${projectId}/${systemType}`);
  if (!res.ok) throw new Error('Ошибка загрузки расчёта');
  return res.json();
}

export async function saveCalculation(projectId, systemType, data) {
  const res = await fetch(`${API_BASE}/calculations/${projectId}/${systemType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data_json: typeof data === 'string' ? data : JSON.stringify(data) })
  });
  if (!res.ok) throw new Error('Ошибка сохранения расчёта');
  return res.json();
}
