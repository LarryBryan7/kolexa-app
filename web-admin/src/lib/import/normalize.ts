import { IMPORT_CONFIG, type ImportType, type ParseResult } from './types';

function escapeCsvValue(value: string): string {
  const v = value ?? '';
  if (/[",\n\r]/.test(v) || /^\s|\s$/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function resultToCsv(result: ParseResult, type: ImportType): string {
  const config = IMPORT_CONFIG[type];

  // Cabeceras de salida en el orden del contrato.
  const headers = config.columns.map((c) => c.header);

  // Mapa de alias → cabecera canónica.
  const aliasToCanonical: Record<string, string> = {};
  config.columns.forEach((col) => {
    if (col.alias) aliasToCanonical[col.alias] = col.header;
  });

  const lines: string[] = [headers.join(',')];

  result.rows.forEach((row) => {
    const cells = headers.map((header) => {
      // Buscar el valor: primero por cabecera canónica, luego por alias.
      let value = row.values[header] ?? '';
      if (value === '') {
        const col = config.columns.find((c) => c.header === header);
        if (col?.alias) value = row.values[col.alias] ?? '';
      }
      return escapeCsvValue(value);
    });
    lines.push(cells.join(','));
  });

  return lines.join('\n');
}

export function resultToCsvWithBom(result: ParseResult, type: ImportType): string {
  return '\uFEFF' + resultToCsv(result, type);
}
