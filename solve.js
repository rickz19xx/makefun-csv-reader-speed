// csv-reader drop-in v15: streaming emitter with raw values joined by '","',
// quoted-field unescaping done by hand (no regex) when the field has "" or a line break.
const EMPTY = '""';

export function answer(input) {
  const text = typeof input.text === 'string' ? input.text : String(input.text);
  const len = text.length;
  const header = input.header === true;
  const rowsOut = [];
  const errOut = [];
  const batch = [];
  const colParts = [];
  let inBatch = 0;
  let rowIndex = 0;
  let columnsText = null;
  let width = -1;
  // a U+FEFF at its very start is dropped: one char when the text is UTF-16, three bytes
  // (EF BB BF) when the bytes are read as one-byte chars
  let pos = 0;
  if (len > 0) {
    const c0 = text.charCodeAt(0);
    if (c0 === 0xfeff) pos = 1;
    else if (c0 === 0xef && text.charCodeAt(1) === 0xbb && text.charCodeAt(2) === 0xbf) pos = 3;
  }
  let line = 1;

  for (;;) {
    for (;;) {
      if (pos >= len) break;
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; continue; }
      if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; continue; }
      break;
    }
    if (pos >= len) break;

    const recordLine = line;
    const recordRow = header && columnsText === null ? null : rowIndex;
    const rowStr = recordRow === null ? 'null' : String(recordRow);
    const mark = batch.length;
    const isHeader = header && columnsText === null;
    const arr = isHeader ? colParts : batch;
    if (!isHeader) batch.push(batch.length === 0 ? '["' : '"],["');
    let n = 0;
    let lastQuoted = false;
    let onlyEmpty = false;

    for (;;) {
      let value = null;
      let comma = false;
      let quoted = false;
      let closed = -1;
      let empty = true;

      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        lastQuoted = true;
        const openLine = line;
        let i = pos + 1;
        let inner = false;
        let lb = 0;
        for (;;) {
          if (i >= len) break;
          const c = text.charCodeAt(i);
          if (c === 34) {
            if (i + 1 < len && text.charCodeAt(i + 1) === 34) { inner = true; i += 2; continue; }
            closed = i;
            break;
          }
          if (c === 13 || c === 10) {
            inner = true;
            lb += 1;
            if (c === 13 && i + 1 < len && text.charCodeAt(i + 1) === 10) i += 2;
            else i += 1;
            continue;
          }
          i += 1;
        }
        if (closed < 0) {
          line = openLine;
          errOut.push('{"code":"unterminated_quote","line":' + recordLine + ',"row":' + rowStr + '}');
          pos += 1;
          value = '\\"';
          empty = false;
        } else {
          value = text.slice(pos + 1, closed);
          if (inner) {
            const L = value.length;
            let res = '';
            let last = 0;
            let k = 0;
            while (k < L) {
              const vc = value.charCodeAt(k);
              if (vc === 34) {
                if (k + 1 < L && value.charCodeAt(k + 1) === 34) {
                  res += value.slice(last, k) + '\\"';
                  k += 2;
                  last = k;
                  continue;
                }
                k += 1;
                continue;
              }
              if (vc === 13) {
                res += value.slice(last, k) + '\\n';
                last = k + 1 < L && value.charCodeAt(k + 1) === 10 ? k + 2 : k + 1;
                k = last;
                continue;
              }
              if (vc === 10) {
                res += value.slice(last, k) + '\\n';
                k += 1;
                last = k;
                continue;
              }
              k += 1;
            }
            if (last > 0) value = res + value.slice(last);
          }
          if (value.length > 0) empty = false;
          line += lb;
          pos = closed + 1;
        }
      } else {
        lastQuoted = false;
      }

      let added = 0;
      for (;;) {
        const start = pos;
        while (pos < len) {
          const d = text.charCodeAt(pos);
          if (d === 44 || d === 10 || d === 13 || d === 34) break;
          pos += 1;
        }
        if (pos > start) {
          added += pos - start;
          empty = false;
          const seg = text.slice(start, pos);
          value = value === null ? seg : value + seg;
        }
        if (pos >= len) break;
        const d = text.charCodeAt(pos);
        if (d === 44) { pos += 1; comma = true; break; }
        if (d === 10) { pos += 1; line += 1; break; }
        if (d === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; break; }
        if (d === 13) {
          errOut.push('{"code":"stray_cr","line":' + recordLine + ',"row":' + rowStr + '}');
          pos += 1;
          continue;
        }
        added += 1;
        empty = false;
        value = (value === null ? '' : value) + '\\"';
        pos += 1;
      }

      if (quoted && closed >= 0 && added > 0) {
        errOut.push('{"code":"quote_junk","line":' + recordLine + ',"row":' + rowStr + '}');
      }
      if (n > 0) arr.push('","');
      arr.push(value === null ? '' : value);
      if (n === 0) onlyEmpty = empty;
      n += 1;
      if (!comma) break;
    }

    if (n === 1 && onlyEmpty && !lastQuoted) {
      if (isHeader) colParts.length = 0;
      else batch.length = mark;
      continue;
    }
    if (width < 0) width = n;
    if (isHeader) {
      columnsText = '["' + colParts.join('') + '"]';
      colParts.length = 0;
      continue;
    }
    if (n < width) {
      errOut.push('{"code":"short_row","line":' + recordLine + ',"row":' + rowStr + ',"fields":' + n + '}');
      batch.push('","'.repeat(width - n));
    } else if (n > width) {
      const cutAt = batch.length - 2 * (n - width);
      const tail = batch.slice(cutAt);
      const extra = [];
      for (let k = 1; k < tail.length; k += 2) extra.push(tail[k]);
      errOut.push('{"code":"long_row","line":' + recordLine + ',"row":' + rowStr + ',"extra":["' + extra.join('","') + '"]}');
      batch.length = cutAt;
    }
    rowIndex += 1;
    inBatch += 1;
    if (inBatch === 8) {
      batch.push('"]');
      rowsOut.push(batch.join(''));
      batch.length = 0;
      inBatch = 0;
    }
  }

  if (batch.length > 0) {
    batch.push('"]');
    rowsOut.push(batch.join(''));
  }
  return '{"columns":' + (header ? (columnsText === null ? '[]' : columnsText) : 'null') +
    ',"rows":[' + rowsOut.join(',') + '],"errors":[' + errOut.join(',') + ']}';
}

const WARM_LINES = [
  'a,b,c\n', '"x""y",z\n', '"p\r\nq",r\n', '"m\rn",s\n', 'u"v,w\n', 'junk"tail",k\n',
  'bad,"unterm\n', 'a\rb,c\n', 'short\n', 'a,b,c,d,e,f\n', '\n', '\r\n',
];
export function warm(bytes, reps) {
  const chunk = WARM_LINES.join('');
  const unit = chunk.repeat(16);
  const per = chunk.length * 16;
  let acc = '\uFEFF';
  for (let k = 0, n = Math.max(1, Math.floor(bytes / per)); k < n; k++) acc += unit;
  for (let r = 0; r < reps; r++) answer({ text: acc, header: true });
  return acc.length;
}

export function run(input) {
  return JSON.parse(answer(input));
}
