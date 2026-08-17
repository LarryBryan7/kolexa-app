import Papa from 'papaparse';
import type * as XLSXType from 'xlsx';
import {
  IMPORT_CONFIG,
  ImportFileError,
  type ImportType,
  type ParseResult,
  type ParsedRow,
} from './types';
import { normalizeHeader, validateHeaders } from './validation';

/** Convierte un valor de celda a string limpio. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    // Evitar notación científica en DNI/códigos largos.
    if (Number.isInteger(value) && Math.abs(value) > 1e12) {
      return value.toFixed(0);
    }
    return String(value);
  }
  return String(value).trim();
}

/** Detecta la extensión de un archivo. */
function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx === -1) return '';
  return fileName.slice(idx).toLowerCase();
}

/** Convierte un File a ArrayBuffer. */
function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new ImportFileError('read_error', 'No se pudo leer el archivo.'));
    reader.readAsArrayBuffer(file);
  });
}

/** Convierte un File a string (para CSV). */
function fileToString(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new ImportFileError('read_error', 'No se pudo leer el archivo.'));
    reader.readAsText(file, 'utf-8');
  });
}

function isNonDataRow(
  cells: unknown[],
  headers: string[],
  type: ImportType,
): boolean {
  const values: Record<string, string> = {};
  let filledCount = 0;
  headers.forEach((header, colIdx) => {
    const val = cellToString(cells[colIdx]);
    values[header] = val;
    if (val !== '') filledCount++;
  });

  // Fila completamente vacía.
  if (filledCount === 0) return true;

  // Contenido solo en la primera columna → título / sección / nota.
  if (filledCount === 1) {
    const first = cellToString(cells[0]);
    if (first !== '') return true;
  }

  // Repite la fila de cabeceras (misma cantidad de celdas llenas y coinciden).
  if (filledCount === headers.length) {
    const isHeaderRepeat = headers.every(
      (header, colIdx) => normalizeHeader(cellToString(cells[colIdx])) === header,
    );
    if (isHeaderRepeat) return true;
  }

  // No contiene ningún campo obligatorio del tipo → no es un registro válido.
  const required = IMPORT_CONFIG[type].columns
    .filter((c) => c.required)
    .map((c) => c.header);
  const hasAnyRequired = required.some((r) => {
    const direct = values[r];
    const alias = IMPORT_CONFIG[type].columns.find((c) => c.header === r)?.alias;
    const aliased = alias ? values[alias] : '';
    return (direct ?? aliased ?? '').trim() !== '';
  });
  if (!hasAnyRequired) return true;

  return false;
}

function expectedHeaderSet(type: ImportType): Set<string> {
  const set = new Set<string>();
  IMPORT_CONFIG[type].columns.forEach((c) => {
    set.add(c.header);
    if (c.alias) set.add(c.alias);
  });
  return set;
}

function findHeaderRow(matrix: unknown[][], type: ImportType): number {
  const expected = expectedHeaderSet(type);
  const required = IMPORT_CONFIG[type].columns
    .filter((c) => c.required)
    .map((c) => c.header);

  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < matrix.length; i++) {
    const cells = matrix[i];
    if (!cells || cells.length === 0) continue;

    let score = 0;
    let hasRequired = false;
    cells.forEach((cell) => {
      const normalized = normalizeHeader(cellToString(cell));
      if (normalized === '') return;
      if (expected.has(normalized)) {
        score++;
        if (required.includes(normalized)) hasRequired = true;
      }
    });

    // Solo considerar filas que contengan al menos un campo requerido.
    if (!hasRequired) continue;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function buildResult(
  source: 'excel' | 'csv',
  fileName: string,
  matrix: unknown[][],
  type: ImportType,
): ParseResult {
  if (matrix.length === 0) {
    throw new ImportFileError('empty_file', 'El archivo no contiene datos.');
  }

  const headerIdx = findHeaderRow(matrix, type);
  if (headerIdx === -1) {
    throw new ImportFileError(
      'no_headers',
      'No se encontró la fila de cabeceras. Verifica que el archivo tenga las columnas esperadas.',
    );
  }

  const headers = matrix[headerIdx].map((h) => normalizeHeader(cellToString(h)));

  const rows: ParsedRow[] = [];
  let rowNum = 2;
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const cells = matrix[i];
    // Saltar filas vacías y filas de título/información (no-datos).
    if (isNonDataRow(cells, headers, type)) {
      continue;
    }

    const values: Record<string, string> = {};
    headers.forEach((header, colIdx) => {
      values[header] = cellToString(cells[colIdx]);
    });
    rows.push({ row: rowNum, values });
    rowNum++;
  }

  const { missingRequired, unknownHeaders } = validateHeaders(headers, type);

  return {
    source,
    fileName,
    headers,
    rows,
    missingRequired,
    unknownHeaders,
  };
}

/** Parsea un archivo Excel (.xlsx/.xls) con SheetJS (carga diferida). */
async function parseExcel(file: File, type: ImportType): Promise<ParseResult> {
  const buffer = await fileToArrayBuffer(file);
  // Carga diferida de SheetJS solo cuando se necesita.
  const XLSX = await import('xlsx');
  let workbook: XLSXType.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch {
    throw new ImportFileError('corrupt_file', 'El archivo Excel está dañado o no es válido.');
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new ImportFileError('no_sheets', 'El archivo Excel no tiene hojas.');
  }

  // Usar la primera hoja por defecto.
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new ImportFileError('no_sheets', 'No se pudo leer la hoja del archivo Excel.');
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  return buildResult('excel', file.name, matrix, type);
}

/** Parsea un archivo CSV con Papa Parse. */
async function parseCsv(file: File, type: ImportType): Promise<ParseResult> {
  const text = await fileToString(file);

  // Detectar delimitador automáticamente (coma, punto y coma, tab).
  const parsed = Papa.parse<unknown[]>(text, {
    skipEmptyLines: 'greedy',
    transformHeader: (h) => normalizeHeader(h),
  });

  if (parsed.errors && parsed.errors.length > 0) {
    const fatal = parsed.errors.find((e) => e.type === 'Delimiter' || e.code === 'TooFewFields');
    if (fatal) {
      const row = fatal.row !== undefined ? fatal.row + 1 : '?';
      throw new ImportFileError(
        'invalid_csv',
        `CSV inválido en la fila ${row}: ${fatal.message}`,
      );
    }
  }

  const matrix = parsed.data as unknown[][];
  return buildResult('csv', file.name, matrix, type);
}

export async function parseImportFile(file: File, type: ImportType): Promise<ParseResult> {
  const ext = getExtension(file.name);
  if (ext === '.xlsx' || ext === '.xls') {
    return parseExcel(file, type);
  }
  if (ext === '.csv') {
    return parseCsv(file, type);
  }
  throw new ImportFileError(
    'unsupported_extension',
    `Extensión no soportada (${ext || 'sin extensión'}). Usa .xlsx, .xls o .csv.`,
  );
}

