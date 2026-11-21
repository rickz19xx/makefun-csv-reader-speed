// csv-reader drop-in v15: streaming emitter with raw values joined by '","',
// quoted-field unescaping done by hand (no regex) when the field has "" or a line break.
const EMPTY = '""';

export function answer(input) {
  const text = typeof input.text === 'string' ? input.text : String(input.text);
  const len = text.length;
  const header = input.header === true;
  const rowsOut = [];
  const errOut = [];
  let columnsText = null;
  let width = -1;
  let pos = len > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
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
    const recordRow = header && columnsText === null ? null : rowsOut.length;
    const rowStr = recordRow === null ? 'null' : String(recordRow);
    const parts = [];
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
      parts.push(value === null ? '' : value);
      if (parts.length === 1) onlyEmpty = empty;
      if (!comma) break;
    }

    const n = parts.length;
    if (n === 1 && onlyEmpty && !lastQuoted) continue;
    if (width < 0) width = n;
    if (header && columnsText === null) {
      columnsText = '["' + parts.join('","') + '"]';
      continue;
    }
    if (n < width) {
      errOut.push('{"code":"short_row","line":' + recordLine + ',"row":' + rowStr + ',"fields":' + n + '}');
      for (let k = n; k < width; k++) parts.push('');
    } else if (n > width) {
      errOut.push('{"code":"long_row","line":' + recordLine + ',"row":' + rowStr + ',"extra":["' + parts.slice(width).join('","') + '"]}');
      parts.length = width;
    }
    rowsOut.push('["' + parts.join('","') + '"]');
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
