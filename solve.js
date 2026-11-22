// Fast CSV reader: byte-equivalent semantics to the reference (baselines/csv-reader).
// Char-code scanner with a fast path for ordinary characters, slice-based field
// building, and no per-field result objects (field end state lives in module vars).

const CH_COMMA = 44;
const CH_QUOTE = 34;
const CH_LF = 10;
const CH_CR = 13;
const CH_BOM = 0xFEFF;

let text = '';
let n = 0;
let pos = 0;
let line = 1;
let recordLine = 1;
let recordRow = null;
let errors = null;
let nextLF = -1;
let nextQuote = -1;
let nextCR = -1;
let nextComma = -1;
// results of the last field read
let ended = 0; // 0 = comma, 1 = line break, 2 = end of text
let added = 0;

function fail(code) {
  errors.push({ code, line: recordLine, row: recordRow });
}

// Unquoted field starting at pos, appended to prefix `value`.
function readUnquoted(value) {
  let a = 0;
  let i = pos;
  let seg = i;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c > CH_COMMA || (c !== CH_COMMA && c !== CH_LF && c !== CH_CR)) { i++; continue; }
    if (c === CH_COMMA) {
      if (i > seg) { value += text.slice(seg, i); a += i - seg; }
      pos = i + 1;
      ended = 0; added = a;
      return value;
    }
    if (c === CH_LF) {
      if (i > seg) { value += text.slice(seg, i); a += i - seg; }
      pos = i + 1;
      line++;
      ended = 1; added = a;
      return value;
    }
    // CR
    if (text.charCodeAt(i + 1) === CH_LF) {
      if (i > seg) { value += text.slice(seg, i); a += i - seg; }
      pos = i + 2;
      line++;
      ended = 1; added = a;
      return value;
    }
    // stray CR: dropped, with an error
    if (i > seg) { value += text.slice(seg, i); a += i - seg; }
    fail('stray_cr');
    i++;
    seg = i;
  }
  if (i > seg) { value += text.slice(seg, i); a += i - seg; }
  pos = i;
  ended = 2; added = a;
  return value;
}

// After a closing quote at pos-1: decide how the field ends.
function afterClose(value) {
  if (pos >= n) { ended = 2; added = 0; return value; }
  const c = text.charCodeAt(pos);
  if (c === CH_COMMA) { pos++; ended = 0; added = 0; return value; }
  if (c === CH_LF) { pos++; line++; ended = 1; added = 0; return value; }
  if (c === CH_CR && text.charCodeAt(pos + 1) === CH_LF) {
    pos += 2; line++; ended = 1; added = 0; return value;
  }
  // junk after the closing quote: read as unquoted text onto the value
  const v = readUnquoted(value);
  if (added > 0) fail('quote_junk');
  return v;
}

// Quoted field starting at pos (text[pos] === '"').
function readQuoted() {
  const open = pos;
  const openLine = line;
  let value = '';
  let i = open + 1;
  let seg = i;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c > CH_QUOTE || (c !== CH_QUOTE && c !== CH_LF && c !== CH_CR)) { i++; continue; }
    if (c === CH_QUOTE) {
      if (text.charCodeAt(i + 1) === CH_QUOTE) {
        // doubled quote: one literal quote
        value += text.slice(seg, i + 1);
        i += 2;
        seg = i;
        continue;
      }
      // closing quote
      if (i > seg) value += text.slice(seg, i);
      pos = i + 1;
      return afterClose(value);
    }
    if (c === CH_CR) {
      value += text.slice(seg, i) + '\n';
      i += text.charCodeAt(i + 1) === CH_LF ? 2 : 1;
      seg = i;
      line++;
      continue;
    }
    // LF
    i++;
    line++;
  }
  // unterminated: reread from after the quote as unquoted text
  pos = open + 1;
  line = openLine;
  fail('unterminated_quote');
  return readUnquoted('"');
}

export function run(input) {
  text = String(input.text);
  const header = input.header === true;
  errors = [];
  const errs = errors;
  const rows = [];
  let columns = null;
  let width = -1;
  line = 1;
  recordLine = 1;
  recordRow = null;
  n = text.length;
  pos = 0;
  nextLF = -1;
  nextQuote = -1;
  nextCR = -1;
  nextComma = -1;
  if (n > 0 && text.charCodeAt(0) === CH_BOM) pos = 1;

  while (true) {
    // skip empty lines (LF or CRLF with no characters on them)
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === CH_LF) { pos++; line++; }
      else if (c === CH_CR && text.charCodeAt(pos + 1) === CH_LF) { pos += 2; line++; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a line with no '"' and no CR (other than its CRLF ending) is
    // exactly its text cut at each ',' (fields sliced straight from text).
    if (nextLF < pos) { nextLF = text.indexOf('\n', pos); if (nextLF < 0) nextLF = n; }
    if (nextQuote < pos) { nextQuote = text.indexOf('"', pos); if (nextQuote < 0) nextQuote = n; }
    if (nextCR < pos) { nextCR = text.indexOf('\r', pos); if (nextCR < 0) nextCR = n; }
    let contentEnd = nextLF;
    if (nextLF < n && nextLF > pos && text.charCodeAt(nextLF - 1) === CH_CR) contentEnd = nextLF - 1;
    let fields;
    let quoted = false;
    if (nextQuote >= contentEnd && nextCR >= contentEnd) {
      fields = [];
      let p = pos;
      for (;;) {
        if (nextComma < p) { nextComma = text.indexOf(',', p); if (nextComma < 0) nextComma = n; }
        if (nextComma >= contentEnd) { fields.push(text.slice(p, contentEnd)); break; }
        fields.push(text.slice(p, nextComma));
        p = nextComma + 1;
      }
      if (nextLF < n) { pos = nextLF + 1; line++; } else pos = n;
    } else {
      fields = [];
      do {
        quoted = text.charCodeAt(pos) === CH_QUOTE;
        fields.push(quoted ? readQuoted() : readUnquoted(''));
      } while (ended === 0);
    }

    if (fields.length === 1 && !quoted && fields[0] === '') continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    const len = fields.length;
    if (len < width) {
      errs.push({ code: 'short_row', line: recordLine, row: recordRow, fields: len });
      while (fields.length < width) fields.push('');
    } else if (len > width) {
      const e = { code: 'long_row', line: recordLine, row: recordRow };
      errs.push(e);
      e.extra = fields.splice(width);
    }
    rows.push(fields);
  }

  text = '';
  errors = null;
  return { columns: header ? (columns ?? []) : null, rows, errors: errs };
}
