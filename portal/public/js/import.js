// Модуль импорта данных из Excel
// Структура файла: для каждого корпуса две колонки «Этаж» и «Кол-во кв»

/**
 * Парсинг Excel-файла и извлечение данных по корпусам
 * @param {File} file - файл Excel
 * @returns {Promise<{success: boolean, data?: Array, error?: string, stats?: object}>}
 */
export async function parseExcelFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Берём первый лист
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Преобразуем в массив массивов (AOA)
    const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (!aoa || aoa.length < 2) {
      return { success: false, error: 'Файл пуст или содержит недостаточно данных.' };
    }

    // Ищем корпуса в заголовках
    const buildings = findBuildings(aoa);

    if (buildings.length === 0) {
      return { success: false, error: 'Не найдены корпуса. Проверьте, что в файле есть заголовки "Корпус N" с колонками "Этаж" и "Кол-во кв".' };
    }

    // Извлекаем данные для каждого корпуса
    const data = extractBuildingData(aoa, buildings);

    // Статистика
    const stats = {
      buildingsCount: data.length,
      maxFloor: Math.max(...data.map(b => b.maxFloor)),
      totalApts: data.reduce((sum, b) => sum + b.totalApts, 0)
    };

    return { success: true, data, stats };

  } catch (e) {
    console.error('Ошибка при чтении Excel:', e);
    return { success: false, error: `Ошибка чтения файла: ${e.message || e}` };
  }
}

/**
 * Поиск корпусов в заголовках таблицы
 * @param {Array<Array>} aoa - данные листа как массив массивов
 * @returns {Array<{name: string, floorCol: number, aptsCol: number, headerRow: number}>}
 */
function findBuildings(aoa) {
  const buildings = [];

  // Проходим по первым 10 строкам в поисках заголовков корпусов
  for (let row = 0; row < Math.min(10, aoa.length); row++) {
    const rowData = aoa[row] || [];

    for (let col = 0; col < rowData.length; col++) {
      const cellValue = String(rowData[col] || '').trim();

      // Ищем ячейки с текстом "Корпус N" или "корпус N"
      const buildingMatch = cellValue.match(/корпус\s*(\d+)/i);

      if (buildingMatch) {
        const buildingNum = parseInt(buildingMatch[1], 10);
        const buildingName = `Корпус ${buildingNum}`;

        // Проверяем, не добавлен ли уже этот корпус
        if (buildings.some(b => b.name === buildingName)) continue;

        // Ищем колонки "Этаж" и "Кол-во кв" под этим заголовком
        const columnsInfo = findFloorAndAptsColumns(aoa, row, col);

        if (columnsInfo) {
          buildings.push({
            name: buildingName,
            num: buildingNum,
            floorCol: columnsInfo.floorCol,
            aptsCol: columnsInfo.aptsCol,
            dataStartRow: columnsInfo.dataStartRow
          });
        }
      }
    }
  }

  // Сортируем по номеру корпуса
  buildings.sort((a, b) => a.num - b.num);

  return buildings;
}

/**
 * Поиск колонок "Этаж" и "Кол-во кв" для корпуса
 * @param {Array<Array>} aoa
 * @param {number} headerRow - строка с заголовком корпуса
 * @param {number} startCol - колонка с заголовком корпуса
 * @returns {{floorCol: number, aptsCol: number, dataStartRow: number} | null}
 */
function findFloorAndAptsColumns(aoa, headerRow, startCol) {
  // Ищем в следующих строках колонки "Этаж" и "Кол-во кв"
  for (let row = headerRow; row < Math.min(headerRow + 5, aoa.length); row++) {
    const rowData = aoa[row] || [];

    // Проверяем несколько колонок справа от заголовка корпуса
    for (let col = startCol; col < Math.min(startCol + 5, rowData.length); col++) {
      const cellValue = String(rowData[col] || '').trim().toLowerCase();

      if (cellValue === 'этаж' || cellValue.includes('этаж')) {
        // Нашли колонку "Этаж", ищем рядом "Кол-во кв"
        const nextCol = col + 1;
        if (nextCol < rowData.length) {
          const nextCellValue = String(rowData[nextCol] || '').trim().toLowerCase();
          if (nextCellValue.includes('кол') || nextCellValue.includes('кв') || nextCellValue.includes('квартир')) {
            return {
              floorCol: col,
              aptsCol: nextCol,
              dataStartRow: row + 1
            };
          }
        }
      }
    }
  }

  // Альтернативный поиск: две соседние колонки под заголовком корпуса
  // Предполагаем, что первая колонка - этаж, вторая - кол-во кв
  const nextRow = headerRow + 1;
  if (nextRow < aoa.length) {
    const rowData = aoa[nextRow] || [];
    const cell1 = String(rowData[startCol] || '').trim().toLowerCase();
    const cell2 = String(rowData[startCol + 1] || '').trim().toLowerCase();

    if ((cell1.includes('этаж') || !isNaN(parseFloat(cell1))) &&
        (cell2.includes('кол') || cell2.includes('кв') || !isNaN(parseFloat(cell2)))) {
      return {
        floorCol: startCol,
        aptsCol: startCol + 1,
        dataStartRow: cell1.includes('этаж') ? nextRow + 1 : nextRow
      };
    }
  }

  return null;
}

/**
 * Извлечение данных по этажам для каждого корпуса
 * @param {Array<Array>} aoa
 * @param {Array} buildings - найденные корпуса
 * @returns {Array<{name: string, floors: number, apts: object, maxFloor: number, totalApts: number}>}
 */
function extractBuildingData(aoa, buildings) {
  return buildings.map(building => {
    const apts = {}; // { floor: aptsCount }
    let maxFloor = 0;
    let totalApts = 0;

    // Читаем данные начиная с dataStartRow
    for (let row = building.dataStartRow; row < aoa.length; row++) {
      const rowData = aoa[row] || [];

      const floorValue = rowData[building.floorCol];
      const aptsValue = rowData[building.aptsCol];

      // Парсим номер этажа
      const floor = parseFloat(floorValue);
      if (isNaN(floor) || floor <= 0) {
        // Пустая строка или невалидные данные - прерываем чтение для этого корпуса
        // Но продолжаем, если это просто пробел в данных
        if (floorValue === '' || floorValue === undefined || floorValue === null) {
          // Проверяем, есть ли ещё данные ниже
          let hasMoreData = false;
          for (let checkRow = row + 1; checkRow < Math.min(row + 5, aoa.length); checkRow++) {
            const checkFloor = parseFloat(aoa[checkRow]?.[building.floorCol]);
            if (!isNaN(checkFloor) && checkFloor > 0) {
              hasMoreData = true;
              break;
            }
          }
          if (!hasMoreData) break;
          continue;
        }
        continue;
      }

      // Парсим количество квартир
      const aptsCount = parseInt(aptsValue, 10) || 0;

      if (floor >= 1 && floor <= 200) { // Разумные пределы
        apts[Math.floor(floor)] = aptsCount;
        maxFloor = Math.max(maxFloor, Math.floor(floor));
        totalApts += aptsCount;
      }
    }

    return {
      name: building.name,
      num: building.num,
      floors: maxFloor,
      apts,
      maxFloor,
      totalApts
    };
  });
}

/**
 * Преобразование данных из Excel в структуру секций калькулятора
 * @param {Array} excelData - данные из parseExcelFile
 * @returns {Array} - массив секций в формате калькулятора
 */
export function convertToSections(excelData) {
  return excelData.map(building => ({
    floors: building.maxFloor,
    floorsLocked: false,
    apts: { ...building.apts },
    rent: { enabled: false, qty: 1 },
    zones: generateDefaultZones(building.maxFloor)
  }));
}

/**
 * Генерация зон по умолчанию для корпуса
 * @param {number} maxFloor - максимальный этаж
 * @returns {Array} - массив зон
 */
function generateDefaultZones(maxFloor) {
  const zones = [];
  let zoneNum = 1;

  // Создаём зоны примерно по 10-15 этажей
  const zoneSize = maxFloor <= 15 ? maxFloor : Math.ceil(maxFloor / Math.ceil(maxFloor / 12));

  let currentTo = 0;
  while (currentTo < maxFloor) {
    const nextTo = Math.min(currentTo + zoneSize, maxFloor);

    zones.push({
      id: Date.now() + zoneNum + Math.random(),
      name: `Зона ${zoneNum}`,
      to: nextTo,
      risers: 2,
      fixedD: { V1: 32, T3: 32, T4: 32 },
      albumType: 'collector',
      locked: false
    });

    currentTo = nextTo;
    zoneNum++;
  }

  return zones;
}
