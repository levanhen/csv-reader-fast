// Fast CSV reader: byte-equivalent semantics to the reference (baselines/csv-reader),
// with a code-point scanner and slice-based field building instead of per-char concatenation.

const CH_COMMA = 44;
const CH_QUOTE = 34;
const CH_LF = 10;
const CH_CR = 13;
const CH_BOM = 0xFEFF;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  const n = text.length;
  let pos = 0;
  if (n > 0 && text.charCodeAt(0) === CH_BOM) pos = 1;

  function fail(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Read an unquoted field starting at pos; value holds any prefix (used for
  // the literal '"' after an unterminated quote). Returns {value, ended, added}.
  // ended: 0 = comma, 1 = line break, 2 = end of text.
  function readUnquoted(value) {
    let added = 0;
    let i = pos;
    let seg = i;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === CH_COMMA) {
        if (i > seg) { value += text.slice(seg, i); added += i - seg; }
        pos = i + 1;
        return { value, ended: 0, added };
      }
      if (c === CH_LF) {
        if (i > seg) { value += text.slice(seg, i); added += i - seg; }
        pos = i + 1;
        line += 1;
        return { value, ended: 1, added };
      }
      if (c === CH_CR) {
        const nxt = text.charCodeAt(i + 1);
        if (nxt === CH_LF) {
          if (i > seg) { value += text.slice(seg, i); added += i - seg; }
          pos = i + 2;
          line += 1;
          return { value, ended: 1, added };
        }
        // stray CR: dropped, with an error
        if (i > seg) { value += text.slice(seg, i); added += i - seg; }
        fail('stray_cr');
        pos = i + 1;
        seg = i + 1;
        i = seg;
        continue;
      }
      i += 1;
    }
    if (i > seg) { value += text.slice(seg, i); added += i - seg; }
    pos = i;
    return { value, ended: 2, added };
  }

  // Read a quoted field starting at pos (text[pos] === '"').
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let i = pos + 1;
    let seg = i;
    let closed = false;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === CH_QUOTE) {
        if (text.charCodeAt(i + 1) === CH_QUOTE) {
          // doubled quote: one literal quote
          value += text.slice(seg, i) + '"';
          i += 2;
          seg = i;
          continue;
        }
        // closing quote
        if (i > seg) value += text.slice(seg, i);
        pos = i + 1;
        closed = true;
        break;
      }
      if (c === CH_CR) {
        if (text.charCodeAt(i + 1) === CH_LF) {
          value += text.slice(seg, i) + '\n';
          i += 2;
          seg = i;
          line += 1;
          continue;
        }
        // lone CR inside quotes: kept as an LF
        value += text.slice(seg, i) + '\n';
        i += 1;
        seg = i;
        line += 1;
        continue;
      }
      if (c === CH_LF) {
        value += text.slice(seg, i) + '\n';
        i += 1;
        seg = i;
        line += 1;
        continue;
      }
      i += 1;
    }
    if (!closed) {
      pos = open + 1;
      line = openLine;
      fail('unterminated_quote');
      return readUnquoted('"');
    }
    if (pos >= n) return { value, ended: 2, added: 0 };
    const c = text.charCodeAt(pos);
    if (c === CH_COMMA) { pos += 1; return { value, ended: 0, added: 0 }; }
    if (c === CH_LF) { pos += 1; line += 1; return { value, ended: 1, added: 0 }; }
    if (c === CH_CR) {
      if (text.charCodeAt(pos + 1) === CH_LF) {
        pos += 2;
        line += 1;
        return { value, ended: 1, added: 0 };
      }
    }
    // junk after the closing quote: read as unquoted text onto the value
    const junk = readUnquoted(value);
    if (junk.added > 0) fail('quote_junk');
    return junk;
  }

  while (true) {
    // skip empty lines (LF or CRLF with no characters on them)
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === CH_LF) { pos += 1; line += 1; }
      else if (c === CH_CR && text.charCodeAt(pos + 1) === CH_LF) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === CH_QUOTE;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === 0);

    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      fail('long_row');
      const extra = fields.splice(width);
      errors[errors.length - 1].extra = extra;
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
