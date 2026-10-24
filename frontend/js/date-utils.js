(() => {
  'use strict';

  const displayFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  });
  const inputFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = (formatter, date) => Object.fromEntries(
    formatter.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
  );
  const normalizeDigits = value => String(value).replace(/[۰-۹٠-٩]/g, ch => {
    const fa = '۰۱۲۳۴۵۶۷۸۹'.indexOf(ch);
    if (fa >= 0) return String(fa);
    const ar = '٠١٢٣٤٥٦٧٨٩'.indexOf(ch);
    return ar >= 0 ? String(ar) : ch;
  });
  const pad = value => String(value).padStart(2, '0');
  const isValidDate = d => d instanceof Date && !Number.isNaN(d.getTime());

  function format(value, dateOnly = false) {
    if (value === null || value === undefined || value === '') return '-';
    const date = value instanceof Date ? value : (dateOnly && /^\\d{4}-\\d{2}-\\d{2}/.test(String(value))
      ? new Date(Number(String(value).slice(0, 4)), Number(String(value).slice(5, 7)) - 1, Number(String(value).slice(8, 10)), 12)
      : new Date(value));
    if (!isValidDate(date)) return String(value);
    const p = parts(displayFormatter, date);
    const dateText = `${p.year}/${p.month}/${p.day}`;
    return dateOnly ? dateText : `${dateText}\u00A0\u00A0\u00A0${p.hour}:${p.minute}:${p.second}`;
  }

  function toJalaliInput(value, dateOnly = false) {
    if (value === null || value === undefined || value === '') return '';
    const date = value instanceof Date ? value : (dateOnly && /^\\d{4}-\\d{2}-\\d{2}/.test(String(value))
      ? new Date(Number(String(value).slice(0, 4)), Number(String(value).slice(5, 7)) - 1, Number(String(value).slice(8, 10)), 12)
      : new Date(value));
    if (!isValidDate(date)) return String(value);
    const p = parts(inputFormatter, date);
    const dateText = `${p.year}/${p.month}/${p.day}`;
    return dateOnly ? dateText : `${dateText} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function fromJalaliInput(value, dateOnly = false) {
    const raw = normalizeDigits(String(value ?? '')).trim();
    if (!raw) return null;
    const match = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
    if (!match) throw new Error('تاریخ را به شکل شمسی YYYY/MM/DD وارد کنید؛ برای تاریخ‌وساعت از YYYY/MM/DD HH:mm:ss استفاده کنید.');
    const jy = Number(match[1]), jm = Number(match[2]), jd = Number(match[3]);
    const hour = Number(match[4] || 0), minute = Number(match[5] || 0), second = Number(match[6] || 0);
    if (jm < 1 || jm > 12 || jd < 1 || jd > 31 || hour > 23 || minute > 59 || second > 59) {
      throw new Error('مقدار تاریخ یا ساعت معتبر نیست.');
    }
    let found = null;
    const start = new Date(jy + 621, 0, 1, 12, 0, 0);
    const end = new Date(jy + 623, 0, 1, 12, 0, 0);
    for (let cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
      const p = parts(inputFormatter, cursor);
      if (Number(p.year) === jy && Number(p.month) === jm && Number(p.day) === jd) {
        found = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hour, minute, second, 0);
        break;
      }
    }
    if (!found) throw new Error('تاریخ شمسی معتبر نیست.');
    if (dateOnly) return `${found.getFullYear()}-${pad(found.getMonth() + 1)}-${pad(found.getDate())}`;
    return found.toISOString();
  }

  window.DMSDate = Object.freeze({ format, toJalaliInput, fromJalaliInput, normalizeDigits });


})();
