/**
 * Minimal RFC-4180 CSV parser — handles quoted fields, embedded commas,
 * embedded newlines, and doubled-quote escaping ("" -> "). No dependency
 * added just for the Lists CSV import flow; this is the whole thing.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Normalize line endings up front so \r\n inside/outside quotes behaves consistently.
  const s = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  // Last field/row, if the file didn't end with a trailing newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  // Strip a UTF-8 BOM on the first cell, if present (Excel-exported CSVs commonly have one).
  if (rows[0]?.[0]?.charCodeAt(0) === 0xfeff) rows[0][0] = rows[0][0].slice(1);

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
