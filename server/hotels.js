import { records, settings } from './db.js';
import { readXlsx, readCsv, writeXlsx } from './xlsx.js';

export const CITIES = ['Makkah', 'Madinah'];
export const HARAM = { Makkah: 'Masjid Al-Haram', Madinah: 'Al-Masjid An-Nabawi' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max = 200) => (v == null ? '' : String(v).trim().slice(0, max));
const num = v => { const n = Number(String(v ?? '').replace(/[, ]/g, '')); return Number.isFinite(n) ? n : NaN; };

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());   // YYYY-MM-DD
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export const validDate = s => ISO.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const excelDate = v => { const s = str(v); if (/^\d{5}(\.\d+)?$/.test(s)) { const n = Math.floor(+s); if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10); } return s; };

export function distanceLabel(h) {
  const d = h.distanceM; if (d == null || d === '') return '';
  return `${d >= 1000 ? (d / 1000).toFixed(d % 1000 ? 1 : 0) + ' km' : d + ' m'} to ${HARAM[h.city] || 'the Haram'}`;
}

/** Validate + normalise one inventory row (manual form or Excel row). Returns {value} | {errors}. */
export function normalizeHotel(b = {}, defaults = {}) {
  const errors = {};
  const cityRaw = str(b.city).toLowerCase();
  const city = CITIES.find(c => c.toLowerCase() === cityRaw) || (cityRaw.startsWith('mad') ? 'Madinah' : cityRaw.startsWith('mak') || cityRaw === 'mecca' ? 'Makkah' : '');
  const fac = Array.isArray(b.facilities) ? b.facilities : str(b.facilities, 600).split(/[,;|\n]/);
  const v = {
    name: str(b.name, 120), city, address: str(b.address, 220), roomType: str(b.roomType, 80),
    distanceM: b.distanceM === '' || b.distanceM == null ? null : Math.round(num(b.distanceM)),
    stars: b.stars === '' || b.stars == null ? 0 : Math.round(num(b.stars)),
    facilities: fac.map(x => str(x, 40)).filter(Boolean).slice(0, 20),
    cost: num(b.cost), currency: str(b.currency || 'SAR', 3).toUpperCase(),
    capacity: b.capacity === '' || b.capacity == null ? 4 : Math.round(num(b.capacity)),
    imageUrl: str(b.imageUrl, 300), validFrom: excelDate(b.validFrom), validTo: excelDate(b.validTo),
    markupPct: b.markupPct === '' || b.markupPct == null ? (defaults.markupPct ?? 0) : num(b.markupPct),
    markupFixed: b.markupFixed === '' || b.markupFixed == null ? (defaults.markupFixed ?? 0) : num(b.markupFixed),
    active: b.active === false || /^(false|no|0|off)$/i.test(String(b.active ?? '')) ? false : true,
    offerPdf: str(b.offerPdf, 120),
  };
  if (!v.name) errors.name = 'Hotel name is required.';
  if (!v.city) errors.city = 'City must be Makkah or Madinah.';
  if (!v.roomType) errors.roomType = 'Room type is required.';
  if (!(v.cost > 0) || v.cost > 1e8) errors.cost = 'Rate per night must be a positive number.';
  if (!['SAR', 'NGN'].includes(v.currency)) errors.currency = 'Currency must be SAR or NGN.';
  if (v.distanceM != null && (Number.isNaN(v.distanceM) || v.distanceM < 0 || v.distanceM > 100000)) errors.distanceM = 'Distance must be metres (0–100000).';
  if (Number.isNaN(v.stars) || v.stars < 0 || v.stars > 5) errors.stars = 'Stars must be 0–5.';
  if (Number.isNaN(v.capacity) || v.capacity < 1 || v.capacity > 12) errors.capacity = 'Capacity per room must be 1–12.';
  if (Number.isNaN(v.markupPct) || v.markupPct < 0 || v.markupPct > 500) errors.markupPct = 'Mark-up % must be 0–500.';
  if (Number.isNaN(v.markupFixed) || v.markupFixed < 0 || v.markupFixed > 1e7) errors.markupFixed = 'Fixed mark-up must be ₦0–10,000,000.';
  for (const k of ['validFrom', 'validTo']) if (v[k] && !validDate(v[k])) errors[k] = 'Use the date format YYYY-MM-DD.';
  if (v.validFrom && v.validTo && v.validTo < v.validFrom) errors.validTo = '“Valid to” must be after “valid from”.';
  if (v.imageUrl && !/^(https?:\/\/\S+|api\/media\/[\w.-]+)$/i.test(v.imageUrl)) errors.imageUrl = 'Image must be an http(s) link or an uploaded image.';
  return Object.keys(errors).length ? { errors } : { value: v };
}

/** Selling price per night in NGN (integer) or null when it cannot be computed (SAR rate but no FX set). */
export function nightlyNgn(h, fx) {
  const base = h.currency === 'SAR' ? (fx > 0 ? h.cost * fx : null) : h.cost;
  if (base == null) return null;
  return Math.round(base * (1 + (h.markupPct || 0) / 100) + (h.markupFixed || 0));
}

const publicHotel = (h, nights, rooms, perNight) => ({
  id: h.id, name: h.name, city: h.city, address: h.address, distance: distanceLabel(h), distanceM: h.distanceM, stars: h.stars,
  facilities: h.facilities, roomType: h.roomType, capacity: h.capacity, image: h.imageUrl || '',
  nights, rooms, perNight, total: perNight * nights * rooms, currency: 'NGN',
});

export function parseStay(q = {}) {
  const errors = {};
  const city = CITIES.find(c => c.toLowerCase() === str(q.city).toLowerCase());
  const checkIn = str(q.checkIn, 10), checkOut = str(q.checkOut, 10);
  const adults = Math.round(num(q.adults ?? 2)), children = Math.round(num(q.children ?? 0)), rooms = Math.round(num(q.rooms ?? 1));
  if (!city) errors.city = 'Choose Makkah or Madinah.';
  if (!validDate(checkIn)) errors.checkIn = 'Choose a check-in date.'; else if (checkIn < today()) errors.checkIn = 'Check-in cannot be in the past.';
  if (!validDate(checkOut)) errors.checkOut = 'Choose a check-out date.';
  const nights = validDate(checkIn) && validDate(checkOut) ? dayDiff(checkIn, checkOut) : 0;
  if (validDate(checkIn) && validDate(checkOut) && (nights < 1 || nights > 60)) errors.checkOut = nights < 1 ? 'Check-out must be after check-in.' : 'Maximum stay is 60 nights.';
  if (!(adults >= 1 && adults <= 40)) errors.adults = 'Adults must be 1–40.';
  if (!(children >= 0 && children <= 40)) errors.children = 'Children must be 0–40.';
  if (!(rooms >= 1 && rooms <= 20)) errors.rooms = 'Rooms must be 1–20.';
  return Object.keys(errors).length ? { errors } : { value: { city, checkIn, checkOut, nights, adults, children, rooms } };
}

function available(h, s, fx) {
  if (!h.active || h.city !== s.city) return null;
  if (h.validFrom && s.checkIn < h.validFrom) return null;
  if (h.validTo && s.checkOut > h.validTo) return null;
  if (h.capacity * s.rooms < s.adults + s.children) return null;
  const p = nightlyNgn(h, fx); if (p == null) return null;
  return publicHotel(h, s.nights, s.rooms, p);
}

export function searchHotels(s) {
  const fx = Number(settings.all().fxRate) || 0;
  return records.list('hotels').map(h => available(h, s, fx)).filter(Boolean)
    .sort((a, b) => a.total - b.total || (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9) || a.name.localeCompare(b.name));
}
export function quoteHotel(id, s) {
  const h = records.get('hotels', id); if (!h) return null;
  return available(h, s, Number(settings.all().fxRate) || 0);
}

// ---------- Excel / CSV import ----------
export const TEMPLATE_COLUMNS = ['hotel_name', 'city', 'address', 'distance_m', 'stars', 'facilities', 'room_type', 'rate_per_night', 'currency', 'capacity', 'image_url', 'valid_from', 'valid_to', 'markup_pct'];
const ALIAS = {
  hotel_name: 'name', name: 'name', hotel: 'name', city: 'city', destination: 'city', address: 'address', distance_m: 'distanceM', distance: 'distanceM', distance_to_haram: 'distanceM',
  stars: 'stars', star: 'stars', facilities: 'facilities', amenities: 'facilities', room_type: 'roomType', room: 'roomType', roomtype: 'roomType',
  rate_per_night: 'cost', rate: 'cost', price: 'cost', cost: 'cost', price_per_night: 'cost', currency: 'currency', capacity: 'capacity', max_guests: 'capacity',
  image_url: 'imageUrl', image: 'imageUrl', valid_from: 'validFrom', valid_to: 'validTo', markup_pct: 'markupPct', markup: 'markupPct', markup_fixed: 'markupFixed',
};
export function templateXlsx() {
  return writeXlsx([TEMPLATE_COLUMNS,
    ['Sample Makkah Hotel', 'Makkah', 'Ibrahim Al-Khalil Rd, Makkah', 250, 5, 'Wi-Fi, Breakfast, Shuttle', 'Double Room', 450, 'SAR', 3, 'https://example.com/photo.jpg', '2026-11-01', '2027-03-31', ''],
    ['Sample Madinah Hotel', 'Madinah', 'Central Area, Madinah', 120, 4, 'Wi-Fi, Breakfast', 'Quad Room', 380, 'SAR', 4, '', '', '', 12]], 'Hotel rates');
}

export function parseRatesFile(buf, filename = '', defaults = {}) {
  const isXlsx = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  const rows = isXlsx ? readXlsx(buf) : readCsv(buf.toString('utf8'));
  if (rows.length < 2) throw new Error('The file has no data rows.');
  const head = rows[0].map(h => ALIAS[String(h).trim().toLowerCase().replace(/[\s-]+/g, '_')] || null);
  for (const need of ['name', 'city', 'roomType', 'cost']) if (!head.includes(need)) throw new Error(`Missing required column for “${need === 'roomType' ? 'room_type' : need === 'cost' ? 'rate_per_night' : need === 'name' ? 'hotel_name' : need}”. Download the template to see the expected columns.`);
  if (rows.length > 5001) throw new Error('Too many rows (max 5000 per upload).');
  const out = [], errors = [];
  rows.slice(1).forEach((r, i) => {
    if (!r.some(x => String(x).trim())) return;
    const obj = {}; head.forEach((k, ci) => { if (k) obj[k] = r[ci]; });
    const res = normalizeHotel(obj, defaults);
    if (res.errors) errors.push({ row: i + 2, errors: Object.values(res.errors).join(' ') }); else out.push(res.value);
  });
  return { rows: out, errors };
}

/** Insert or update (match on name + city + room type + valid window). */
export function upsertHotels(items) {
  const existing = records.list('hotels');
  const key = h => [h.name, h.city, h.roomType, h.validFrom || '', h.validTo || ''].join('|').toLowerCase();
  const map = new Map(existing.map(h => [key(h), h]));
  let created = 0, updated = 0;
  for (const it of items) {
    const cur = map.get(key(it));
    if (cur) { records.update('hotels', cur.id, { ...it, offerPdf: it.offerPdf || cur.offerPdf || '', imageUrl: it.imageUrl || cur.imageUrl || '' }); updated++; }
    else { map.set(key(it), records.create('hotels', it)); created++; }
  }
  return { created, updated };
}
