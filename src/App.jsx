import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Coins,
  Database,
  Download,
  Edit3,
  Filter,
  Gauge,
  Layers,
  LogOut,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  User,
  WalletCards,
  X
} from 'lucide-react';

const STORAGE_KEY = 'points-redemption-dashboard-v1';
const userStorageKey = (user) => (user?.id ? `${STORAGE_KEY}:${user.id}` : STORAGE_KEY);
const DEFAULT_POINTS_PROGRAMS = ['American Express', 'Chase', 'Capital One', 'Bilt', 'Citi'];
const DEFAULT_REDEMPTION_TYPES = ['Redemption', 'Upgrade', 'Redemption + Upgrade', 'Cash + Points', 'Other'];
const DEFAULT_FARE_TYPES = ['Saver', 'Dynamic', 'Standard', 'Special Award', 'Unknown'];
const DEFAULT_CABINS = ['First', 'Business', 'Premium Economy', 'Economy'];
const EMPTY_BOOKING = {
  tripName: '',
  bookingDate: '',
  departureDate: '',
  daysBeforeOverride: '',
  mainAirline: '',
  passengerName: '',
  redemptionProgram: '',
  redemptionType: 'Redemption',
  fareType: 'Saver',
  transferBonusUsed: false,
  transferBonusPct: '',
  totalPointsUsed: '',
  taxesFees: '',
  purchasedPointsCost: '',
  flightCashFare: '',
  flightCashFareType: 'oneway',
  notes: '',
  segments: [blankSegment(1)],
  pointSources: [blankPointSource()]
};

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function blankSegment(order = 1) {
  return {
    id: uid(),
    order,
    origin: '',
    destination: '',
    departureDate: '',
    departureTime: '',
    arrivalDate: '',
    arrivalTime: '',
    operatingAirline: '',
    flightNumber: '',
    cabin: '',
    aircraft: '',
    product: '',
    productNotes: '',
    seat: '',
    notes: ''
  };
}

function blankPointSource() {
  return {
    id: uid(),
    sourceType: 'Transfer',
    pointsProgram: 'American Express',
    airlineProgram: '',
    amount: '',
    transferBonusUsed: false,
    transferBonusPct: '',
    cost: '',
    notes: ''
  };
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/^"|"$/g, '')
    .trim();
}

function isNA(value) {
  const text = cleanText(value).toLowerCase();
  return !text || text === 'n/a' || text === 'na' || text === 'none' || text === '-';
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/[$,]/g, '').replace(/\(([^)]+)\)/g, '$1').trim();
  const match = normalized.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function money(value) {
  return toNumber(value).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function moneyExact(value) {
  return toNumber(value).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function points(value) {
  return Math.round(toNumber(value)).toLocaleString();
}

function pct(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(digits)}¢`;
}

function dateMonth(value) {
  if (!value) return 'No date';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'No date';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function friendlyMonth(monthKey) {
  if (!monthKey || monthKey === 'No date') return 'No date';
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString(undefined, { month: 'short', year: '2-digit' });
}

function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

function getLeadDays(booking) {
  const calculated = daysBetween(booking.bookingDate, booking.departureDate);
  if (calculated !== null) return calculated;
  const override = toNumber(booking.daysBeforeOverride);
  return override || null;
}

function getRoute(booking) {
  const sorted = [...(booking.segments || [])].sort((a, b) => toNumber(a.order) - toNumber(b.order));
  if (!sorted.length) return 'No route';
  const legs = [];
  sorted.forEach((seg, idx) => {
    if (idx === 0 && seg.origin) legs.push(seg.origin.toUpperCase());
    if (seg.destination) legs.push(seg.destination.toUpperCase());
  });
  return legs.length ? legs.join(' → ') : 'No route';
}

function oneWayCashFare(booking) {
  const cashFare = toNumber(booking.flightCashFare);
  if (!cashFare) return 0;
  return booking.flightCashFareType === 'roundtrip' ? cashFare / 2 : cashFare;
}

function purchasedPointsCost(booking) {
  const manual = toNumber(booking.purchasedPointsCost);
  if (manual) return manual;
  return (booking.pointSources || [])
    .filter((source) => cleanText(source.sourceType).toLowerCase().includes('purchased'))
    .reduce((sum, source) => sum + toNumber(source.cost), 0);
}

function totalCashPaid(booking) {
  return toNumber(booking.taxesFees) + purchasedPointsCost(booking);
}

function bookingCpp(booking) {
  const pts = toNumber(booking.totalPointsUsed);
  const fare = oneWayCashFare(booking);
  if (!pts || !fare) return null;
  return ((fare - totalCashPaid(booking)) / pts) * 100;
}

function grossCpp(booking) {
  const pts = toNumber(booking.totalPointsUsed);
  const fare = oneWayCashFare(booking);
  if (!pts || !fare) return null;
  return (fare / pts) * 100;
}

function normalizeBooking(input) {
  const booking = {
    ...EMPTY_BOOKING,
    ...input,
    id: input.id || uid(),
    segments: (input.segments && input.segments.length ? input.segments : [blankSegment(1)]).map((s, idx) => ({
      ...blankSegment(idx + 1),
      ...s,
      departureDate: s.departureDate || s.depDate || s.date || '',
      departureTime: s.departureTime || s.depTime || s.time || '',
      arrivalDate: s.arrivalDate || s.arrDate || '',
      arrivalTime: s.arrivalTime || s.arrTime || '',
      id: s.id || uid(),
      order: s.order || idx + 1
    })),
    pointSources: (input.pointSources && input.pointSources.length ? input.pointSources : [blankPointSource()]).map((p) => ({
      ...blankPointSource(),
      ...p,
      id: p.id || uid()
    }))
  };
  return booking;
}

function splitLines(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter((line) => !isNA(line));
}

function parseAircraftProduct(value) {
  let text = cleanText(value).replace(/\s+/g, ' ');
  let product = '';
  let productNotes = '';
  const parenMatches = [...text.matchAll(/\(([^)]+)\)/g)].map((m) => cleanText(m[1]));
  if (parenMatches.length) {
    product = parenMatches[0];
    productNotes = parenMatches.slice(1).join(' | ');
    text = cleanText(text.replace(/\([^)]*\)/g, ''));
  }
  return { aircraft: text, product, productNotes };
}

function extractNumbersOutsideMoney(value) {
  const text = String(value ?? '');
  const noMoney = text.replace(/\$\s*[\d,]+(\.\d+)?/g, '');
  return [...noMoney.matchAll(/\d[\d,]*(\.\d+)?/g)].map((m) => toNumber(m[0]));
}

function normalizeProgramName(name) {
  const text = cleanText(name);
  const lower = text.toLowerCase();
  if (lower.includes('amex') || lower.includes('american express')) return 'American Express';
  if (lower.includes('chase')) return 'Chase';
  if (lower.includes('capital one')) return 'Capital One';
  if (lower.includes('bilt')) return 'Bilt';
  if (lower.includes('citi')) return 'Citi';
  return text || 'Other';
}

function parseTransferSource(value, redemptionProgram) {
  if (isNA(value)) return null;
  const text = cleanText(value);
  const [namePart, ...rest] = text.split('-');
  const numbers = extractNumbersOutsideMoney(text);
  const amount = numbers.reduce((sum, n) => sum + n, 0);
  return {
    id: uid(),
    sourceType: 'Transfer',
    pointsProgram: normalizeProgramName(namePart),
    airlineProgram: redemptionProgram,
    amount,
    transferBonusUsed: /bonus/i.test(text),
    transferBonusPct: '',
    cost: '',
    notes: cleanText(rest.join('-').replace(/[\d,]+/g, '').replace(/\+|\(|\)/g, ' '))
  };
}

function parseAirlineBalance(value, redemptionProgram) {
  if (isNA(value)) return null;
  const amount = extractNumbersOutsideMoney(value).reduce((sum, n) => sum + n, 0);
  if (!amount) return null;
  return {
    id: uid(),
    sourceType: 'Existing Airline Balance',
    pointsProgram: 'Airline Balance',
    airlineProgram: redemptionProgram,
    amount,
    transferBonusUsed: false,
    transferBonusPct: '',
    cost: '',
    notes: ''
  };
}

function parsePurchasedPoints(value, redemptionProgram) {
  if (isNA(value)) return null;
  const text = String(value ?? '');
  const costMatch = text.match(/\$\s*([\d,]+(\.\d+)?)/);
  const cost = costMatch ? toNumber(costMatch[1]) : 0;
  const amount = extractNumbersOutsideMoney(text).reduce((sum, n) => sum + n, 0);
  if (!amount && !cost) return null;
  return {
    id: uid(),
    sourceType: 'Purchased Points',
    pointsProgram: 'Purchased Points',
    airlineProgram: redemptionProgram,
    amount,
    transferBonusUsed: false,
    transferBonusPct: '',
    cost,
    notes: ''
  };
}

function rowValue(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const name of names) {
      const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedKey === normalizedName || normalizedKey.includes(normalizedName)) return value;
    }
  }
  return '';
}

function importRowsFromSheet(rows) {
  return rows
    .filter((row) => !Object.values(row).every(isNA))
    .map((row, index) => {
      const airline = cleanText(rowValue(row, ['Airline']));
      const passengerName = cleanText(rowValue(row, ['Passenger', 'Passenger Name', 'Traveler', 'Traveler Name']));
      const origin = cleanText(rowValue(row, ['Origin'])).toUpperCase();
      const layoverRaw = cleanText(rowValue(row, ['Layover'])).toUpperCase();
      const layover = isNA(layoverRaw) ? '' : layoverRaw;
      const destination = cleanText(rowValue(row, ['Destination'])).toUpperCase();
      const cabinRaw = rowValue(row, ['Cabin']);
      const aircraftRaw = rowValue(row, ['Aircraft/Product', 'Aircraft Product']);
      const totalPoints = toNumber(rowValue(row, ['Total Points Used']));
      const redemptionProgram = cleanText(rowValue(row, ['Redemption Program']));
      const redemptionType = cleanText(rowValue(row, ['Type', 'Redemption Type'])) || 'Redemption';
      const totalCash = toNumber(rowValue(row, ['Total Cash (Taxes/Fees/Points)', 'Total Cash']));
      const daysBefore = toNumber(rowValue(row, ['Days before Departure', 'Days Before Departure']));
      const transfer1 = parseTransferSource(rowValue(row, ['Transfer Partner 1']), redemptionProgram);
      const transfer2 = parseTransferSource(rowValue(row, ['Transfer Partner 2']), redemptionProgram);
      const airlineBalance = parseAirlineBalance(rowValue(row, ['Airline Account']), redemptionProgram);
      const purchased = parsePurchasedPoints(rowValue(row, ['Points Bought']), redemptionProgram);
      const pointSources = [transfer1, transfer2, airlineBalance, purchased].filter(Boolean);
      const purchasedCost = purchased ? toNumber(purchased.cost) : 0;
      const taxesFees = Math.max(totalCash - purchasedCost, 0);
      const airports = layover ? [origin, layover, destination] : [origin, destination];
      const segmentCount = Math.max(airports.length - 1, 1);
      const cabinLines = splitLines(cabinRaw);
      const aircraftLinesRaw = splitLines(aircraftRaw);
      const aircraftLines = segmentCount === 1 ? [aircraftLinesRaw.join(' ')] : aircraftLinesRaw;
      const segments = Array.from({ length: segmentCount }).map((_, segIdx) => {
        const aircraftParsed = parseAircraftProduct(aircraftLines[segIdx] || aircraftLines[0] || '');
        return {
          id: uid(),
          order: segIdx + 1,
          origin: airports[segIdx] || '',
          destination: airports[segIdx + 1] || '',
          departureDate: '',
          departureTime: '',
          arrivalDate: '',
          arrivalTime: '',
          operatingAirline: airline,
          flightNumber: '',
          cabin: cleanText(cabinLines[segIdx] || cabinLines[0] || ''),
          aircraft: aircraftParsed.aircraft,
          product: aircraftParsed.product,
          productNotes: aircraftParsed.productNotes,
          seat: '',
          notes: ''
        };
      });
      return normalizeBooking({
        id: uid(),
        tripName: `${origin || 'Trip'} → ${destination || 'Destination'}${redemptionProgram ? ` · ${redemptionProgram}` : ''}`,
        bookingDate: '',
        departureDate: '',
        daysBeforeOverride: daysBefore || '',
        mainAirline: airline,
        passengerName,
        redemptionProgram,
        redemptionType,
        fareType: 'Unknown',
        transferBonusUsed: pointSources.some((source) => source.transferBonusUsed),
        transferBonusPct: '',
        totalPointsUsed: totalPoints,
        taxesFees,
        purchasedPointsCost: purchasedCost,
        flightCashFare: '',
        flightCashFareType: 'oneway',
        notes: `Imported from Excel row ${index + 2}`,
        segments,
        pointSources: pointSources.length ? pointSources : [blankPointSource()]
      });
    });
}


function useAuth() {
  const [authState, setAuthState] = useState({ loading: true, authAvailable: true, user: null, error: '' });

  async function refreshAuth() {
    try {
      const response = await fetch('/api/auth/me');
      const payload = await response.json().catch(() => ({}));
      if (response.status === 503 || payload.authAvailable === false) {
        setAuthState({ loading: false, authAvailable: false, user: null, error: payload.error || 'Account storage unavailable' });
        return;
      }
      setAuthState({ loading: false, authAvailable: true, user: payload.user || null, error: response.ok ? '' : payload.error || '' });
    } catch (err) {
      setAuthState({ loading: false, authAvailable: false, user: null, error: err.message || 'Account API unavailable' });
    }
  }

  useEffect(() => {
    refreshAuth();
  }, []);

  async function submitAuth(mode, values) {
    setAuthState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error([payload.error, payload.detail].filter(Boolean).join(' ') || 'Authentication failed');
      setAuthState({ loading: false, authAvailable: true, user: payload.user, error: '' });
      return payload.user;
    } catch (err) {
      setAuthState((current) => ({ ...current, loading: false, error: err.message || 'Authentication failed' }));
      throw err;
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setAuthState({ loading: false, authAvailable: true, user: null, error: '' });
  }

  return { ...authState, login: (values) => submitAuth('login', values), register: (values) => submitAuth('register', values), logout };
}

function useBookings(auth) {
  const [bookings, setBookingsState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeBooking) : [];
    } catch {
      return [];
    }
  });
  const [syncState, setSyncState] = useState({ mode: 'local', loading: true, saving: false, error: '' });
  const loadedRemoteRef = useRef(false);

  useEffect(() => {
    if (auth.loading) return undefined;
    if (!auth.authAvailable || !auth.user) {
      loadedRemoteRef.current = true;
      setSyncState({ mode: 'local', loading: false, saving: false, error: auth.authAvailable ? 'Sign in to use D1 sync.' : auth.error });
      return undefined;
    }

    loadedRemoteRef.current = false;
    try {
      const cached = localStorage.getItem(userStorageKey(auth.user));
      const parsed = cached ? JSON.parse(cached) : [];
      setBookingsState(Array.isArray(parsed) ? parsed.map(normalizeBooking) : []);
    } catch {
      setBookingsState([]);
    }

    let cancelled = false;
    async function loadRemoteBookings() {
      try {
        const response = await fetch('/api/bookings');
        if (!response.ok) throw new Error(`Remote storage returned ${response.status}`);
        const payload = await response.json();
        if (cancelled) return;
        const remoteBookings = Array.isArray(payload.bookings) ? payload.bookings.map(normalizeBooking) : [];
        loadedRemoteRef.current = true;
        setBookingsState(remoteBookings);
        localStorage.setItem(userStorageKey(auth.user), JSON.stringify(remoteBookings));
        setSyncState({ mode: 'cloud', loading: false, saving: false, error: '' });
      } catch (err) {
        if (cancelled) return;
        loadedRemoteRef.current = true;
        setSyncState({ mode: 'local', loading: false, saving: false, error: err.message || 'Cloud storage unavailable' });
      }
    }
    loadRemoteBookings();
    return () => {
      cancelled = true;
    };
  }, [auth.loading, auth.authAvailable, auth.user?.id]);

  useEffect(() => {
    localStorage.setItem(userStorageKey(auth.user), JSON.stringify(bookings));
    if (!loadedRemoteRef.current || syncState.mode !== 'cloud' || !auth.user) return;
    const controller = new AbortController();
    setSyncState((current) => ({ ...current, saving: true, error: '' }));
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch('/api/bookings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookings }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Save failed with status ${response.status}`);
        setSyncState((current) => ({ ...current, saving: false, error: '' }));
      } catch (err) {
        if (err.name === 'AbortError') return;
        setSyncState((current) => ({ ...current, mode: 'local', saving: false, error: err.message || 'Cloud save failed' }));
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [bookings, syncState.mode, auth.user?.id]);

  return [bookings, setBookingsState, syncState];
}

function bookingTimestamp(booking) {
  const stamp = Date.parse(booking.updatedAt || booking.createdAt || '');
  return Number.isNaN(stamp) ? 0 : stamp;
}

function mergeBookings(primaryBookings, secondaryBookings) {
  const merged = new Map();
  [...primaryBookings, ...secondaryBookings].forEach((booking) => {
    const normalized = normalizeBooking(booking);
    const current = merged.get(normalized.id);
    if (!current || bookingTimestamp(normalized) >= bookingTimestamp(current)) merged.set(normalized.id, normalized);
  });
  return [...merged.values()].sort((a, b) => bookingTimestamp(b) - bookingTimestamp(a));
}

function getUniqueValues(bookings, getter) {
  return [...new Set(bookings.flatMap((booking) => getter(booking)).filter(Boolean))].sort();
}

function makeAnalytics(bookings) {
  const bookingMetrics = bookings.map((booking) => ({
    ...booking,
    route: getRoute(booking),
    leadDays: getLeadDays(booking),
    totalCash: totalCashPaid(booking),
    oneWayFare: oneWayCashFare(booking),
    cpp: bookingCpp(booking),
    grossCpp: grossCpp(booking),
    netValue: oneWayCashFare(booking) ? Math.max(oneWayCashFare(booking) - totalCashPaid(booking), 0) : 0
  }));

  const allSegments = bookingMetrics.flatMap((booking) =>
    (booking.segments || []).map((segment) => ({ ...segment, booking }))
  );
  const allSources = bookingMetrics.flatMap((booking) =>
    (booking.pointSources || []).map((source) => ({ ...source, booking }))
  );
  const totalPoints = bookingMetrics.reduce((sum, b) => sum + toNumber(b.totalPointsUsed), 0);
  const totalTaxes = bookingMetrics.reduce((sum, b) => sum + toNumber(b.taxesFees), 0);
  const totalPurchasedCost = bookingMetrics.reduce((sum, b) => sum + purchasedPointsCost(b), 0);
  const totalCash = bookingMetrics.reduce((sum, b) => sum + b.totalCash, 0);
  const totalCashFare = bookingMetrics.reduce((sum, b) => sum + b.oneWayFare, 0);
  const cppBookings = bookingMetrics.filter((b) => b.cpp !== null && Number.isFinite(b.cpp));
  const weightedCpp = cppBookings.length
    ? (cppBookings.reduce((sum, b) => sum + b.netValue, 0) / cppBookings.reduce((sum, b) => sum + toNumber(b.totalPointsUsed), 0)) * 100
    : null;
  const bestCpp = [...cppBookings].sort((a, b) => b.cpp - a.cpp)[0] || null;
  const worstCpp = [...cppBookings].sort((a, b) => a.cpp - b.cpp)[0] || null;
  const leadValues = bookingMetrics.map((b) => b.leadDays).filter((value) => value !== null && Number.isFinite(value));
  const avgLead = leadValues.length ? leadValues.reduce((a, b) => a + b, 0) / leadValues.length : null;
  const premiumSegments = allSegments.filter((s) => ['first', 'business'].includes(cleanText(s.cabin).toLowerCase())).length;

  return {
    bookings: bookingMetrics,
    segments: allSegments,
    sources: allSources,
    stats: {
      totalBookings: bookingMetrics.length,
      totalSegments: allSegments.length,
      totalPoints,
      totalTaxes,
      totalPurchasedCost,
      totalCash,
      totalCashFare,
      weightedCpp,
      bestCpp,
      worstCpp,
      avgLead,
      premiumSegments,
      transferBonusCount: bookingMetrics.filter((b) => b.transferBonusUsed || (b.pointSources || []).some((s) => s.transferBonusUsed)).length
    },
    byProgram: groupBookings(bookingMetrics, (b) => b.redemptionProgram || 'Unknown Program'),
    byType: groupBookings(bookingMetrics, (b) => b.redemptionType || 'Unknown Type'),
    byFareType: groupBookings(bookingMetrics, (b) => b.fareType || 'Unknown Fare'),
    bySource: groupSources(allSources),
    byCabin: groupSegments(allSegments, (s) => s.cabin || 'Unknown Cabin'),
    byAirline: groupSegments(allSegments, (s) => s.operatingAirline || s.booking.mainAirline || 'Unknown Airline'),
    byAircraft: groupSegments(allSegments, (s) => s.aircraft || 'Unknown Aircraft'),
    byProduct: groupSegments(allSegments, (s) => s.product || 'No Product Entered'),
    byRoute: groupBookings(bookingMetrics, (b) => b.route || 'No route'),
    timeline: groupTimeline(bookingMetrics),
    cppScatter: cppBookings
      .filter((b) => b.leadDays !== null)
      .map((b) => ({ x: b.leadDays, y: Number(b.cpp.toFixed(2)), route: b.route, program: b.redemptionProgram })),
    bestRedemptions: [...cppBookings].sort((a, b) => b.cpp - a.cpp).slice(0, 8),
    worstRedemptions: [...cppBookings].sort((a, b) => a.cpp - b.cpp).slice(0, 8)
  };
}

function groupBookings(bookings, keyFn) {
  const map = new Map();
  bookings.forEach((booking) => {
    const key = cleanText(keyFn(booking)) || 'Unknown';
    if (!map.has(key)) {
      map.set(key, { name: key, bookings: 0, points: 0, cash: 0, cashFare: 0, netValue: 0, cppPoints: 0 });
    }
    const item = map.get(key);
    item.bookings += 1;
    item.points += toNumber(booking.totalPointsUsed);
    item.cash += booking.totalCash;
    item.cashFare += booking.oneWayFare;
    if (booking.cpp !== null) {
      item.netValue += booking.netValue;
      item.cppPoints += toNumber(booking.totalPointsUsed);
    }
  });
  return [...map.values()]
    .map((item) => ({ ...item, avgCpp: item.cppPoints ? (item.netValue / item.cppPoints) * 100 : null }))
    .sort((a, b) => b.points - a.points || b.bookings - a.bookings);
}

function groupSources(sources) {
  const map = new Map();
  sources.forEach((source) => {
    const key = source.pointsProgram || source.sourceType || 'Unknown Source';
    if (!map.has(key)) map.set(key, { name: key, points: 0, cost: 0, count: 0, bonusCount: 0 });
    const item = map.get(key);
    item.points += toNumber(source.amount);
    item.cost += toNumber(source.cost);
    item.count += 1;
    if (source.transferBonusUsed) item.bonusCount += 1;
  });
  return [...map.values()].sort((a, b) => b.points - a.points);
}

function groupSegments(segments, keyFn) {
  const map = new Map();
  segments.forEach((segment) => {
    const key = cleanText(keyFn(segment)) || 'Unknown';
    if (!map.has(key)) map.set(key, { name: key, segments: 0, bookings: new Set(), points: 0 });
    const item = map.get(key);
    item.segments += 1;
    item.bookings.add(segment.booking.id);
    item.points += toNumber(segment.booking.totalPointsUsed) / Math.max((segment.booking.segments || []).length, 1);
  });
  return [...map.values()]
    .map((item) => ({ ...item, bookings: item.bookings.size }))
    .sort((a, b) => b.segments - a.segments || b.points - a.points);
}

function groupTimeline(bookings) {
  const map = new Map();
  bookings.forEach((booking) => {
    const key = dateMonth(booking.departureDate || booking.bookingDate);
    if (!map.has(key)) map.set(key, { month: key, label: friendlyMonth(key), bookings: 0, points: 0, cash: 0, cashFare: 0, netValue: 0, cppPoints: 0 });
    const item = map.get(key);
    item.bookings += 1;
    item.points += toNumber(booking.totalPointsUsed);
    item.cash += booking.totalCash;
    item.cashFare += booking.oneWayFare;
    if (booking.cpp !== null) {
      item.netValue += booking.netValue;
      item.cppPoints += toNumber(booking.totalPointsUsed);
    }
  });
  return [...map.values()]
    .map((item) => ({ ...item, avgCpp: item.cppPoints ? (item.netValue / item.cppPoints) * 100 : null }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function filterBookings(bookings, filters) {
  return bookings.filter((booking) => {
    const route = getRoute(booking);
    const query = filters.query.trim().toLowerCase();
    if (query) {
      const haystack = [booking.tripName, booking.mainAirline, booking.passengerName, booking.redemptionProgram, booking.redemptionType, booking.fareType, route, booking.notes, ...(booking.segments || []).flatMap((s) => [s.departureDate, s.departureTime, s.arrivalDate, s.arrivalTime, s.operatingAirline, s.flightNumber, s.cabin, s.aircraft, s.product, s.origin, s.destination])]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.program !== 'All' && booking.redemptionProgram !== filters.program) return false;
    if (filters.year !== 'All') {
      const date = booking.departureDate || booking.bookingDate;
      const year = date ? new Date(`${date}T00:00:00`).getFullYear().toString() : 'No date';
      if (year !== filters.year) return false;
    }
    if (filters.cabin !== 'All' && !(booking.segments || []).some((s) => s.cabin === filters.cabin)) return false;
    if (filters.source !== 'All' && !(booking.pointSources || []).some((s) => s.pointsProgram === filters.source || s.sourceType === filters.source)) return false;
    return true;
  });
}


function timeSortValue(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 24 * 60 + 99;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatBoardDate(value) {
  if (!value) return 'Date TBD';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

function formatBoardDateLong(value) {
  if (!value) return 'Date TBD';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function formatBoardTime(value) {
  if (!value) return 'Time TBD';
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const d = new Date(2000, 0, 1, hours, minutes);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatSplitFlapTime(value) {
  if (!value) return 'TBD';
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
}

function getFlightCode(segment) {
  return cleanText(segment.flightNumber) || cleanText(segment.operatingAirline) || 'Flight TBD';
}

function buildDepartureBoardGroups(bookings) {
  const groupedFlights = new Map();
  bookings.forEach((booking) => {
    (booking.segments || []).forEach((segment) => {
      const departureDate = segment.departureDate || booking.departureDate || '';
      const departureTime = segment.departureTime || '';
      const origin = cleanText(segment.origin).toUpperCase() || '---';
      const destination = cleanText(segment.destination).toUpperCase() || '---';
      const flightCode = getFlightCode(segment).toUpperCase();
      const flightKey = (cleanText(segment.flightNumber) || flightCode).toUpperCase().replace(/\s+/g, '');
      const key = [departureDate || 'Date TBD', departureTime || 'Time TBD', flightKey, origin, destination].join('|');
      if (!groupedFlights.has(key)) {
        groupedFlights.set(key, {
          key,
          departureDate,
          departureTime,
          origin,
          destination,
          flightCode,
          cabin: segment.cabin || '',
          aircraft: segment.aircraft || '',
          passengers: new Map()
        });
      }
      const flight = groupedFlights.get(key);
      const passenger = cleanText(booking.passengerName) || 'Passenger TBD';
      if (!flight.passengers.has(passenger)) flight.passengers.set(passenger, []);
      flight.passengers.get(passenger).push({ booking, segment });
    });
  });

  const byDate = new Map();
  [...groupedFlights.values()]
    .sort((a, b) => {
      const dateCompare = (a.departureDate || '9999-99-99').localeCompare(b.departureDate || '9999-99-99');
      if (dateCompare) return dateCompare;
      const timeCompare = timeSortValue(a.departureTime) - timeSortValue(b.departureTime);
      if (timeCompare) return timeCompare;
      return a.flightCode.localeCompare(b.flightCode);
    })
    .forEach((flight) => {
      const dateKey = flight.departureDate || 'Date TBD';
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push(flight);
    });
  return [...byDate.entries()].map(([date, flights]) => ({ date, flights }));
}

function DepartureBoard({ bookings }) {
  const days = useMemo(() => buildDepartureBoardGroups(bookings), [bookings]);
  if (!days.length) return null;
  return (
    <section className="departure-board-card">
      <div className="departure-board-header">
        <span className="eyebrow"><Plane size={14} /> Flight summary</span>
        <h3>Departure Board</h3>
        <p>Flights are sorted by departure date, then local departure time, with passengers grouped when flight details match.</p>
      </div>
      <div className="departure-board">
        {days.map((day) => (
          <div className="board-day" key={day.date}>
            <div className="board-date">{formatBoardDateLong(day.date)}</div>
            <div className="board-rows">
              {day.flights.map((flight) => {
                const passengers = [...flight.passengers.keys()].sort((a, b) => a.localeCompare(b));
                return (
                  <div className="board-row" key={flight.key}>
                    <span className="board-cell board-time">{formatSplitFlapTime(flight.departureTime)}</span>
                    <span className="board-cell board-flight">{flight.flightCode}</span>
                    <span className="board-cell board-route">{flight.origin} → {flight.destination}</span>
                    <span className="board-cell board-cabin">{flight.cabin || 'Cabin TBD'}</span>
                    <span className="board-cell board-pax"><strong>{passengers.length} pax</strong>{passengers.join(' / ')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function App() {
  const path = window.location.pathname;
  const auth = useAuth();
  const [bookings, setBookings, syncState] = useBookings(auth);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [editingId, setEditingId] = useState(null);
  const [filters, setFilters] = useState({ query: '', program: 'All', year: 'All', cabin: 'All', source: 'All' });
  const filteredBookings = useMemo(() => filterBookings(bookings, filters), [bookings, filters]);
  const analytics = useMemo(() => makeAnalytics(filteredBookings), [filteredBookings]);
  const allAnalytics = useMemo(() => makeAnalytics(bookings), [bookings]);
  const programs = useMemo(() => getUniqueValues(bookings, (b) => [b.redemptionProgram]), [bookings]);
  const years = useMemo(() => getUniqueValues(bookings, (b) => {
    const date = b.departureDate || b.bookingDate;
    if (!date) return ['No date'];
    const d = new Date(`${date}T00:00:00`);
    return Number.isNaN(d.getFullYear()) ? ['No date'] : [String(d.getFullYear())];
  }), [bookings]);
  const cabins = useMemo(() => getUniqueValues(bookings, (b) => (b.segments || []).map((s) => s.cabin)), [bookings]);
  const sources = useMemo(() => getUniqueValues(bookings, (b) => (b.pointSources || []).flatMap((s) => [s.pointsProgram, s.sourceType])), [bookings]);

  function saveBooking(booking) {
    const normalized = normalizeBooking({ ...booking, updatedAt: new Date().toISOString() });
    setBookings((current) => {
      const exists = current.some((item) => item.id === normalized.id);
      return exists ? current.map((item) => (item.id === normalized.id ? normalized : item)) : [normalized, ...current];
    });
    setEditingId(null);
    setActiveTab('bookings');
  }

  function deleteBooking(id) {
    const booking = bookings.find((item) => item.id === id);
    if (!window.confirm(`Delete ${booking?.tripName || 'this booking'}?`)) return;
    setBookings((current) => current.filter((item) => item.id !== id));
  }

  function duplicateBooking(id) {
    const original = bookings.find((item) => item.id === id);
    if (!original) return;
    const copy = normalizeBooking({
      ...original,
      id: uid(),
      tripName: `${original.tripName || getRoute(original)} copy`,
      segments: original.segments.map((s) => ({ ...s, id: uid() })),
      pointSources: original.pointSources.map((p) => ({ ...p, id: uid() }))
    });
    setBookings((current) => [copy, ...current]);
  }

  const editingBooking = editingId ? bookings.find((item) => item.id === editingId) : null;

  if (path === '/admin') return <AdminScreen />;
  if (path === '/login') return <AuthScreen auth={auth} />;
  if (auth.loading && auth.authAvailable) return <LoadingScreen />;
  if (auth.authAvailable && !auth.user) return <LandingLoginPrompt />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Plane size={24} /></div>
          <div>
            <h1>Points Atlas</h1>
            <p>Award travel command center</p>
          </div>
        </div>
        <nav className="nav-list">
          <NavButton active={activeTab === 'dashboard'} icon={<BarChart3 />} onClick={() => setActiveTab('dashboard')}>Dashboard</NavButton>
          <NavButton active={activeTab === 'form'} icon={<Plus />} onClick={() => { setEditingId(null); setActiveTab('form'); }}>Add Booking</NavButton>
          <NavButton active={activeTab === 'bookings'} icon={<Layers />} onClick={() => setActiveTab('bookings')}>Bookings</NavButton>
          <NavButton active={activeTab === 'data'} icon={<Database />} onClick={() => setActiveTab('data')}>Import / Export</NavButton>
        </nav>
        <div className="sidebar-card">
          <span className="eyebrow">All-time</span>
          <strong>{points(allAnalytics.stats.totalPoints)} pts</strong>
          <span>{allAnalytics.stats.totalBookings} bookings · {allAnalytics.stats.totalSegments} segments</span>
          <span className={`sync-pill ${syncState.mode}`}>{syncState.loading ? 'Checking storage…' : syncState.saving ? 'Saving…' : syncState.mode === 'cloud' ? 'D1 synced' : 'Local only'}</span>
          {auth.user ? (
            <button className="account-button" onClick={auth.logout}><User size={15} /> {auth.user.name || auth.user.email} <LogOut size={14} /></button>
          ) : null}
        </div>
      </aside>

      <main className="main-area">
        <TopBar
          filters={filters}
          setFilters={setFilters}
          programs={programs}
          years={years}
          cabins={cabins}
          sources={sources}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        {activeTab === 'dashboard' && <Dashboard analytics={analytics} allCount={bookings.length} filteredCount={filteredBookings.length} />}
        {activeTab === 'form' && <BookingForm key={editingBooking?.id || 'new'} initialBooking={editingBooking || null} onSave={saveBooking} onCancel={() => { setEditingId(null); setActiveTab('bookings'); }} />}
        {activeTab === 'bookings' && (
          <BookingsView
            bookings={analytics.bookings}
            onEdit={(id) => { setEditingId(id); setActiveTab('form'); }}
            onDelete={deleteBooking}
            onDuplicate={duplicateBooking}
          />
        )}
        {activeTab === 'data' && <DataTools bookings={bookings} setBookings={setBookings} syncState={syncState} />}
      </main>
    </div>
  );
}


function LoadingScreen() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand-icon"><Plane size={24} /></div>
        <span className="eyebrow">Checking account</span>
        <h1>Loading Points Atlas…</h1>
        <p>Checking whether this deployment has account storage configured.</p>
      </div>
    </div>
  );
}


function LandingLoginPrompt() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand-icon"><Plane size={24} /></div>
        <span className="eyebrow"><User size={14} /> Sign in required</span>
        <h1>Open your tracker</h1>
        <p>Use the user login your admin created for you, or go to the admin page to manage accounts.</p>
        <button className="primary-button" type="button" onClick={() => { window.location.href = '/login'; }}>User login</button>
        <button className="ghost-button" type="button" onClick={() => { window.location.href = '/admin'; }}>Admin</button>
      </div>
    </div>
  );
}

function AuthScreen({ auth }) {
  const [values, setValues] = useState({ email: '', password: '' });
  const [localError, setLocalError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError('');
    try {
      await auth.login(values);
      window.history.replaceState({}, '', '/');
    } catch (err) {
      setLocalError(err.message || 'Authentication failed');
    }
  }

  if (auth.user) {
    window.history.replaceState({}, '', '/');
    return <LoadingScreen />;
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="brand-icon"><Plane size={24} /></div>
        <span className="eyebrow"><User size={14} /> User login</span>
        <h1>Sign in to Points Atlas</h1>
        <p>Use the email and password your admin created for you.</p>
        <label>
          Email
          <input type="email" value={values.email} onChange={(e) => setValues((current) => ({ ...current, email: e.target.value }))} placeholder="you@example.com" required />
        </label>
        <label>
          Password
          <input type="password" value={values.password} onChange={(e) => setValues((current) => ({ ...current, password: e.target.value }))} placeholder="Your password" required minLength={8} />
        </label>
        {(localError || auth.error) && <div className="auth-error">{localError || auth.error}</div>}
        <button className="primary-button" type="submit" disabled={auth.loading}>{auth.loading ? 'Working…' : 'Sign in'}</button>
        <button className="ghost-button" type="button" onClick={() => { window.location.href = '/admin'; }}>Admin login</button>
      </form>
    </div>
  );
}

function AdminScreen() {
  const [adminState, setAdminState] = useState({ loading: true, hasAdmin: false, admin: null, error: '' });
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('');

  async function loadAdmin() {
    try {
      const response = await fetch('/api/admin/status');
      const payload = await response.json().catch(() => ({}));
      setAdminState({ loading: false, hasAdmin: !!payload.hasAdmin, admin: payload.admin || null, error: response.ok ? '' : payload.error || 'Admin unavailable' });
      if (payload.admin) loadUsers();
    } catch (err) {
      setAdminState({ loading: false, hasAdmin: false, admin: null, error: err.message || 'Admin unavailable' });
    }
  }

  async function loadUsers() {
    const response = await fetch('/api/admin/users');
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setUsers(payload.users || []);
  }

  useEffect(() => {
    loadAdmin();
  }, []);

  async function submitAdmin(event) {
    event.preventDefault();
    setStatus('');
    const endpoint = adminState.hasAdmin ? '/api/admin/login' : '/api/admin/setup';
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus([payload.error, payload.detail].filter(Boolean).join(' ') || 'Admin action failed');
      return;
    }
    setAdminState({ loading: false, hasAdmin: true, admin: payload.admin, error: '' });
    loadUsers();
  }

  async function createUser(event) {
    event.preventDefault();
    setStatus('');
    const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus([payload.error, payload.detail].filter(Boolean).join(' ') || 'Could not create user');
      return;
    }
    setStatus(`Created ${payload.user.email}. Share /login with them.`);
    setNewUser({ name: '', email: '', password: '' });
    loadUsers();
  }

  async function logoutAdmin() {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null);
    setAdminState((current) => ({ ...current, admin: null }));
    setUsers([]);
  }

  if (adminState.loading) return <LoadingScreen />;

  return (
    <div className="auth-shell admin-shell">
      <div className="auth-card admin-card">
        <div className="brand-icon"><Plane size={24} /></div>
        <span className="eyebrow"><User size={14} /> Admin</span>
        <h1>{adminState.admin ? 'Manage users' : adminState.hasAdmin ? 'Admin login' : 'Create the admin login'}</h1>
        <p>{adminState.admin ? 'Create user logins for friends. They sign in at /login.' : adminState.hasAdmin ? 'Sign in with the admin account to create users.' : 'Set this up once. After that, only the admin can create user accounts.'}</p>
        {adminState.admin ? (
          <>
            <div className="status-toast">Signed in as {adminState.admin.email}</div>
            <form className="admin-user-form" onSubmit={createUser}>
              <label>Name<input value={newUser.name} onChange={(e) => setNewUser((current) => ({ ...current, name: e.target.value }))} placeholder="Friend name" /></label>
              <label>Email<input type="email" value={newUser.email} onChange={(e) => setNewUser((current) => ({ ...current, email: e.target.value }))} placeholder="friend@example.com" required /></label>
              <label>Password<input type="text" value={newUser.password} onChange={(e) => setNewUser((current) => ({ ...current, password: e.target.value }))} placeholder="Temporary password" required minLength={8} /></label>
              <button className="primary-button" type="submit">Create user</button>
            </form>
            <div className="admin-users-list">
              {users.map((user) => <div className="import-batch-row" key={user.id}><div><strong>{user.email}</strong><span>{user.name || 'No name'}</span></div></div>)}
            </div>
            <button className="ghost-button" type="button" onClick={logoutAdmin}>Log out admin</button>
          </>
        ) : (
          <form className="admin-user-form" onSubmit={submitAdmin}>
            {!adminState.hasAdmin && <label>Name<input value={values.name} onChange={(e) => setValues((current) => ({ ...current, name: e.target.value }))} placeholder="Admin" /></label>}
            <label>Email<input type="email" value={values.email} onChange={(e) => setValues((current) => ({ ...current, email: e.target.value }))} placeholder="admin@example.com" required /></label>
            <label>Password<input type="password" value={values.password} onChange={(e) => setValues((current) => ({ ...current, password: e.target.value }))} placeholder={adminState.hasAdmin ? 'Admin password' : 'At least 10 characters'} required minLength={adminState.hasAdmin ? 1 : 10} /></label>
            <button className="primary-button" type="submit">{adminState.hasAdmin ? 'Sign in' : 'Create admin'}</button>
            <button className="ghost-button" type="button" onClick={() => { window.location.href = '/login'; }}>User login</button>
          </form>
        )}
        {(status || adminState.error) && <div className="auth-error">{status || adminState.error}</div>}
      </div>
    </div>
  );
}


function NavButton({ active, icon, children, onClick }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}{children}</button>;
}

function TopBar({ filters, setFilters, programs, years, cabins, sources, activeTab, setActiveTab }) {
  return (
    <div className="topbar">
      <div>
        <span className="eyebrow">{activeTab === 'dashboard' ? 'Live analytics' : activeTab === 'form' ? 'Redemption entry' : activeTab === 'bookings' ? 'Booking ledger' : 'Data tools'}</span>
        <h2>{activeTab === 'dashboard' ? 'Redemption Dashboard' : activeTab === 'form' ? 'Add / Edit Booking' : activeTab === 'bookings' ? 'All Bookings' : 'Import, Export & Backup'}</h2>
      </div>
      <div className="filter-rack">
        <label className="search-box">
          <Search size={16} />
          <input value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="Search route, product, program..." />
        </label>
        <SelectFilter value={filters.program} onChange={(v) => setFilters((f) => ({ ...f, program: v }))} options={['All', ...programs]} label="Program" />
        <SelectFilter value={filters.year} onChange={(v) => setFilters((f) => ({ ...f, year: v }))} options={['All', ...years]} label="Year" />
        <SelectFilter value={filters.cabin} onChange={(v) => setFilters((f) => ({ ...f, cabin: v }))} options={['All', ...cabins]} label="Cabin" />
        <SelectFilter value={filters.source} onChange={(v) => setFilters((f) => ({ ...f, source: v }))} options={['All', ...sources]} label="Source" />
        <button className="primary-button compact" onClick={() => setActiveTab('form')}><Plus size={16} /> Add</button>
      </div>
    </div>
  );
}

function SelectFilter({ value, onChange, options, label }) {
  return (
    <label className="select-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Dashboard({ analytics, allCount, filteredCount }) {
  const { stats } = analytics;
  const empty = !analytics.bookings.length;
  if (empty) return <EmptyState />;

  return (
    <div className="dashboard-grid">
      <section className="hero-panel">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> Redemption performance</span>
          <h3>{filteredCount === allCount ? 'All tracked redemptions' : `${filteredCount} of ${allCount} bookings shown`}</h3>
          <p>True CPP subtracts taxes, fees, and purchased-points cash from the one-way equivalent cash fare.</p>
        </div>
        <div className="hero-metric">
          <span>Weighted CPP</span>
          <strong>{pct(stats.weightedCpp)}</strong>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard icon={<Coins />} label="Total points redeemed" value={points(stats.totalPoints)} detail={`${stats.totalBookings} bookings`} />
        <StatCard icon={<CircleDollarSign />} label="Total cash spent" value={money(stats.totalCash)} detail={`${money(stats.totalTaxes)} taxes/fees · ${money(stats.totalPurchasedCost)} bought pts`} />
        <StatCard icon={<Plane />} label="Flight segments" value={stats.totalSegments.toLocaleString()} detail={`${stats.premiumSegments} premium cabin`} />
        <StatCard icon={<Gauge />} label="Avg booking lead" value={stats.avgLead === null ? '—' : `${stats.avgLead.toFixed(1)} days`} detail={`${stats.transferBonusCount} transfer-bonus bookings`} />
        <StatCard icon={<ArrowDownToLine />} label="Cash fare tracked" value={money(stats.totalCashFare)} detail="One-way equivalent fares" />
        <StatCard icon={<Activity />} label="Best CPP" value={stats.bestCpp ? pct(stats.bestCpp.cpp) : '—'} detail={stats.bestCpp ? stats.bestCpp.route : 'Add cash fare to calculate'} />
      </div>

      <div className="chart-grid two">
        <ChartCard title="Points by redemption program" subtitle="Which programs are eating the most points">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={analytics.byProgram.slice(0, 10)} layout="vertical" margin={{ left: 40, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltip moneyFields={['cash']} pointFields={['points']} />} />
              <Bar dataKey="points" radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Points by source" subtitle="Transferable currencies, balances, and purchased miles">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={analytics.bySource.slice(0, 8)} dataKey="points" nameKey="name" innerRadius={64} outerRadius={110} paddingAngle={2}>
                {analytics.bySource.slice(0, 8).map((_, index) => <Cell key={index} />)}
              </Pie>
              <Tooltip content={<ChartTooltip pointFields={['points']} />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="chart-grid two">
        <ChartCard title="Redemption timeline" subtitle="Points, cash, and cash-fare value by month">
          <ResponsiveContainer width="100%" height={330}>
            <ComposedChart data={analytics.timeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis yAxisId="left" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
              <Tooltip content={<ChartTooltip moneyFields={['cash', 'cashFare']} pointFields={['points']} cppFields={['avgCpp']} />} />
              <Bar yAxisId="left" dataKey="points" radius={[8, 8, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="cashFare" strokeWidth={3} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lead time vs CPP" subtitle="Do last-minute bookings actually hit harder?">
          <ResponsiveContainer width="100%" height={330}>
            <ScatterChart margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name="Lead days" unit="d" />
              <YAxis type="number" dataKey="y" name="CPP" unit="¢" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ScatterTooltip />} />
              <Scatter data={analytics.cppScatter} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="chart-grid three">
        <MiniRank title="Top cabins" rows={analytics.byCabin.slice(0, 6)} valueKey="segments" suffix="segments" />
        <MiniRank title="Top airlines" rows={analytics.byAirline.slice(0, 6)} valueKey="segments" suffix="segments" />
        <MiniRank title="Top products" rows={analytics.byProduct.slice(0, 6)} valueKey="segments" suffix="segments" />
      </div>

      <div className="chart-grid two">
        <Leaderboard title="Best redemptions by true CPP" rows={analytics.bestRedemptions} good />
        <Leaderboard title="Lowest redemptions by true CPP" rows={analytics.worstRedemptions} />
      </div>

      <div className="chart-grid two">
        <ChartCard title="Aircraft flown" subtitle="Segment counts by aircraft type">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.byAircraft.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="segments" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Fare type mix" subtitle="Saver vs dynamic vs standard">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={analytics.byFareType}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<ChartTooltip pointFields={['points']} />} />
              <Area dataKey="points" type="monotone" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Plane size={42} /></div>
      <h3>No bookings yet</h3>
      <p>Add a redemption or import your existing Excel tracker from the Import / Export tab. Once data is in, the dashboard lights up with CPP, routes, products, points sources, and booking behavior.</p>
    </div>
  );
}

function StatCard({ icon, label, value, detail }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <section className="chart-card">
      <div className="card-title-row">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ChartTooltip({ active, payload, label, moneyFields = [], pointFields = [], cppFields = [] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label || payload[0]?.payload?.name}</strong>
      {payload.map((entry) => {
        const name = entry.name || entry.dataKey;
        let value = entry.value;
        if (moneyFields.includes(entry.dataKey)) value = money(value);
        if (pointFields.includes(entry.dataKey)) value = points(value);
        if (cppFields.includes(entry.dataKey)) value = pct(value);
        return <span key={`${name}-${entry.dataKey}`}>{name}: {value}</span>;
      })}
    </div>
  );
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{data.route}</strong>
      <span>{data.program}</span>
      <span>Lead: {data.x} days</span>
      <span>CPP: {data.y}¢</span>
    </div>
  );
}

function MiniRank({ title, rows, valueKey, suffix }) {
  const max = rows[0]?.[valueKey] || 1;
  return (
    <section className="mini-rank">
      <h3>{title}</h3>
      {rows.length ? rows.map((row) => (
        <div className="rank-row" key={row.name}>
          <div>
            <span>{row.name}</span>
            <small>{row[valueKey]} {suffix}</small>
          </div>
          <div className="rank-bar"><span style={{ width: `${Math.max((row[valueKey] / max) * 100, 8)}%` }} /></div>
        </div>
      )) : <p className="muted">No data yet.</p>}
    </section>
  );
}

function Leaderboard({ title, rows, good = false }) {
  return (
    <section className="leaderboard">
      <h3>{title}</h3>
      {rows.length ? rows.map((booking, idx) => (
        <div className="leader-row" key={booking.id}>
          <span className={`rank-badge ${good ? 'good' : ''}`}>#{idx + 1}</span>
          <div className="leader-main">
            <strong>{booking.tripName || booking.route}</strong>
            <span>{booking.route} · {booking.redemptionProgram}</span>
          </div>
          <div className="leader-value">
            <strong>{pct(booking.cpp)}</strong>
            <span>{points(booking.totalPointsUsed)} pts</span>
          </div>
        </div>
      )) : <p className="muted">Add flight cash fares to calculate CPP rankings.</p>}
    </section>
  );
}

function BookingForm({ initialBooking, onSave, onCancel }) {
  const [booking, setBooking] = useState(() => normalizeBooking(initialBooking || { ...EMPTY_BOOKING, id: uid() }));
  const sourceTotal = useMemo(() => (booking.pointSources || []).reduce((sum, source) => sum + toNumber(source.amount), 0), [booking.pointSources]);
  const cashTotal = totalCashPaid(booking);
  const cpp = bookingCpp(booking);

  function update(field, value) {
    setBooking((current) => ({ ...current, [field]: value }));
  }

  function updateSegment(id, field, value) {
    setBooking((current) => ({
      ...current,
      segments: current.segments.map((segment) => (segment.id === id ? { ...segment, [field]: value } : segment))
    }));
  }

  function updatePointSource(id, field, value) {
    setBooking((current) => ({
      ...current,
      pointSources: current.pointSources.map((source) => (source.id === id ? { ...source, [field]: value } : source))
    }));
  }

  function addSegment() {
    setBooking((current) => ({ ...current, segments: [...current.segments, blankSegment(current.segments.length + 1)] }));
  }

  function removeSegment(id) {
    setBooking((current) => {
      const next = current.segments.filter((segment) => segment.id !== id).map((segment, index) => ({ ...segment, order: index + 1 }));
      return { ...current, segments: next.length ? next : [blankSegment(1)] };
    });
  }

  function addPointSource() {
    setBooking((current) => ({ ...current, pointSources: [...current.pointSources, blankPointSource()] }));
  }

  function removePointSource(id) {
    setBooking((current) => {
      const next = current.pointSources.filter((source) => source.id !== id);
      return { ...current, pointSources: next.length ? next : [blankPointSource()] };
    });
  }

  function syncPointsFromSources() {
    update('totalPointsUsed', sourceTotal || '');
  }

  function submit(e) {
    e.preventDefault();
    const cleaned = normalizeBooking({
      ...booking,
      totalPointsUsed: toNumber(booking.totalPointsUsed),
      taxesFees: toNumber(booking.taxesFees),
      purchasedPointsCost: toNumber(booking.purchasedPointsCost),
      flightCashFare: toNumber(booking.flightCashFare),
      transferBonusPct: toNumber(booking.transferBonusPct),
      daysBeforeOverride: booking.daysBeforeOverride === '' ? '' : toNumber(booking.daysBeforeOverride),
      segments: booking.segments.map((s, idx) => ({ ...s, order: idx + 1 })),
      pointSources: booking.pointSources.map((p) => ({ ...p, amount: toNumber(p.amount), cost: toNumber(p.cost), transferBonusPct: toNumber(p.transferBonusPct) }))
    });
    onSave(cleaned);
  }

  return (
    <form className="entry-form" onSubmit={submit}>
      <section className="form-section glow-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow"><WalletCards size={14} /> Booking details</span>
            <h3>Redemption summary</h3>
          </div>
          <div className="live-metrics">
            <span>Total cash: <strong>{moneyExact(cashTotal)}</strong></span>
            <span>CPP: <strong>{cpp === null ? '—' : pct(cpp)}</strong></span>
          </div>
        </div>
        <div className="form-grid four">
          <TextInput label="Trip name" value={booking.tripName} onChange={(v) => update('tripName', v)} placeholder="India return Jan 2026" />
          <TextInput label="Main airline" value={booking.mainAirline} onChange={(v) => update('mainAirline', v)} placeholder="Virgin Atlantic" />
          <TextInput label="Passenger name" value={booking.passengerName} onChange={(v) => update('passengerName', v)} placeholder="Alex Johnson" />
          <TextInput label="Redemption program" value={booking.redemptionProgram} onChange={(v) => update('redemptionProgram', v)} placeholder="Virgin Atlantic Flying Club" />
          <SelectInput label="Redemption type" value={booking.redemptionType} onChange={(v) => update('redemptionType', v)} options={DEFAULT_REDEMPTION_TYPES} allowCustom />
          <SelectInput label="Fare type" value={booking.fareType} onChange={(v) => update('fareType', v)} options={DEFAULT_FARE_TYPES} allowCustom />
          <DateInput label="Booking date" value={booking.bookingDate} onChange={(v) => update('bookingDate', v)} />
          <DateInput label="Departure date" value={booking.departureDate} onChange={(v) => update('departureDate', v)} />
          <NumberInput label="Manual lead days" value={booking.daysBeforeOverride} onChange={(v) => update('daysBeforeOverride', v)} placeholder="Optional" />
        </div>
      </section>

      <section className="form-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow"><Coins size={14} /> Points and cash</span>
            <h3>Value calculation</h3>
          </div>
          <button type="button" className="ghost-button" onClick={syncPointsFromSources}><RefreshCw size={15} /> Sync points from sources</button>
        </div>
        <div className="form-grid four">
          <NumberInput label="Total points used" value={booking.totalPointsUsed} onChange={(v) => update('totalPointsUsed', v)} placeholder="85000" required />
          <NumberInput label="Taxes / fees" value={booking.taxesFees} onChange={(v) => update('taxesFees', v)} placeholder="621" />
          <NumberInput label="Purchased points cost" value={booking.purchasedPointsCost} onChange={(v) => update('purchasedPointsCost', v)} placeholder="495" />
          <ReadOnlyMetric label="Total cash paid" value={moneyExact(cashTotal)} />
          <NumberInput label="Flight cost at booking" value={booking.flightCashFare} onChange={(v) => update('flightCashFare', v)} placeholder="Optional" />
          <SelectInput label="Flight cost type" value={booking.flightCashFareType} onChange={(v) => update('flightCashFareType', v)} options={[{ label: 'One Way', value: 'oneway' }, { label: 'Roundtrip', value: 'roundtrip' }]} />
          <ToggleInput label="Transfer bonus used?" checked={booking.transferBonusUsed} onChange={(v) => update('transferBonusUsed', v)} />
          <NumberInput label="Transfer bonus %" value={booking.transferBonusPct} onChange={(v) => update('transferBonusPct', v)} placeholder="Optional" />
        </div>
        <div className="form-note">
          <Check size={16} /> Source rows currently total <strong>{points(sourceTotal)}</strong> points. This can be different from total points used, but the warning helps catch data entry mistakes.
        </div>
      </section>

      <section className="form-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow"><Plane size={14} /> Flight segments</span>
            <h3>Aircraft, product, and route detail</h3>
          </div>
          <button type="button" className="primary-button compact" onClick={addSegment}><Plus size={15} /> Segment</button>
        </div>
        <div className="stack-list">
          {booking.segments.map((segment, index) => (
            <div className="segment-card" key={segment.id}>
              <div className="segment-head">
                <strong>Segment {index + 1}</strong>
                <button type="button" className="icon-button danger" onClick={() => removeSegment(segment.id)}><Trash2 size={15} /></button>
              </div>
              <div className="form-grid five">
                <TextInput label="Origin" value={segment.origin} onChange={(v) => updateSegment(segment.id, 'origin', v.toUpperCase())} placeholder="JFK" />
                <TextInput label="Destination" value={segment.destination} onChange={(v) => updateSegment(segment.id, 'destination', v.toUpperCase())} placeholder="LHR" />
                <DateInput label="Dep date" value={segment.departureDate} onChange={(v) => updateSegment(segment.id, 'departureDate', v)} />
                <TimeInput label="Dep time" value={segment.departureTime} onChange={(v) => updateSegment(segment.id, 'departureTime', v)} helper="Stored as local time at departure airport" />
                <DateInput label="Arr date" value={segment.arrivalDate} onChange={(v) => updateSegment(segment.id, 'arrivalDate', v)} />
                <TimeInput label="Arr time" value={segment.arrivalTime} onChange={(v) => updateSegment(segment.id, 'arrivalTime', v)} helper="Stored as local time at arrival airport" />
                <TextInput label="Operating airline" value={segment.operatingAirline} onChange={(v) => updateSegment(segment.id, 'operatingAirline', v)} placeholder="Qatar" />
                <TextInput label="Flight #" value={segment.flightNumber} onChange={(v) => updateSegment(segment.id, 'flightNumber', v.toUpperCase())} placeholder="QR704" />
                <SelectInput label="Cabin" value={segment.cabin} onChange={(v) => updateSegment(segment.id, 'cabin', v)} options={DEFAULT_CABINS} allowCustom />
                <TextInput label="Aircraft" value={segment.aircraft} onChange={(v) => updateSegment(segment.id, 'aircraft', v)} placeholder="777-300ER" />
                <TextInput label="Product" value={segment.product} onChange={(v) => updateSegment(segment.id, 'product', v)} placeholder="QSuite" />
                <TextInput label="Product notes" value={segment.productNotes} onChange={(v) => updateSegment(segment.id, 'productNotes', v)} placeholder="Old FC, ex-Etihad, new suites" />
                <TextInput label="Seat" value={segment.seat} onChange={(v) => updateSegment(segment.id, 'seat', v.toUpperCase())} placeholder="2A" />
                <TextInput label="Segment notes" value={segment.notes} onChange={(v) => updateSegment(segment.id, 'notes', v)} placeholder="Optional" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="form-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow"><WalletCards size={14} /> Points sources</span>
            <h3>Transfers, balances, and purchases</h3>
          </div>
          <button type="button" className="primary-button compact" onClick={addPointSource}><Plus size={15} /> Source</button>
        </div>
        <div className="stack-list">
          {booking.pointSources.map((source) => (
            <div className="source-card" key={source.id}>
              <div className="form-grid seven">
                <SelectInput label="Source type" value={source.sourceType} onChange={(v) => updatePointSource(source.id, 'sourceType', v)} options={['Transfer', 'Existing Airline Balance', 'Purchased Points', 'Other']} allowCustom />
                <SelectInput label="Points program" value={source.pointsProgram} onChange={(v) => updatePointSource(source.id, 'pointsProgram', v)} options={DEFAULT_POINTS_PROGRAMS} allowCustom />
                <TextInput label="Airline program" value={source.airlineProgram} onChange={(v) => updatePointSource(source.id, 'airlineProgram', v)} placeholder="Aeroplan" />
                <NumberInput label="Points amount" value={source.amount} onChange={(v) => updatePointSource(source.id, 'amount', v)} placeholder="85000" />
                <ToggleInput label="Bonus?" checked={source.transferBonusUsed} onChange={(v) => updatePointSource(source.id, 'transferBonusUsed', v)} />
                <NumberInput label="Bonus %" value={source.transferBonusPct} onChange={(v) => updatePointSource(source.id, 'transferBonusPct', v)} placeholder="Optional" />
                <div className="source-actions">
                  <NumberInput label="Source cash cost" value={source.cost} onChange={(v) => updatePointSource(source.id, 'cost', v)} placeholder="For bought points" />
                  <button type="button" className="icon-button danger" onClick={() => removePointSource(source.id)}><Trash2 size={15} /></button>
                </div>
              </div>
              <TextInput label="Source notes" value={source.notes} onChange={(v) => updatePointSource(source.id, 'notes', v)} placeholder="BA → Qatar, promo, account balance note..." />
            </div>
          ))}
        </div>
      </section>

      <section className="form-section">
        <TextArea label="General notes" value={booking.notes} onChange={(v) => update('notes', v)} placeholder="Anything else about this redemption..." />
        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-button"><Check size={16} /> Save booking</button>
        </div>
      </section>
    </form>
  );
}

function TextInput({ label, value, onChange, placeholder, required }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} />
    </label>
  );
}

function NumberInput({ label, value, onChange, placeholder, required }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} />
    </label>
  );
}

function DateInput({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TimeInput({ label, value, onChange, helper }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="time" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      {helper && <small>{helper}</small>}
    </label>
  );
}

function SelectInput({ label, value, onChange, options, allowCustom = false }) {
  const rendered = options.map((option) => (typeof option === 'string' ? { label: option, value: option } : option));
  const found = rendered.some((option) => option.value === value);
  return (
    <label className="field">
      <span>{label}</span>
      <select value={found || !allowCustom ? value : '__custom'} onChange={(e) => onChange(e.target.value)}>
        {rendered.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        {allowCustom && !found && value && <option value="__custom">Custom: {value}</option>}
      </select>
      {allowCustom && (
        <input className="custom-input" value={found ? '' : value} onChange={(e) => onChange(e.target.value)} placeholder="Or type custom value" />
      )}
    </label>
  );
}

function ToggleInput({ label, checked, onChange }) {
  return (
    <label className="toggle-field">
      <span>{label}</span>
      <button type="button" className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}>
        <span />
      </button>
    </label>
  );
}

function ReadOnlyMetric({ label, value }) {
  return (
    <label className="field read-only">
      <span>{label}</span>
      <strong>{value}</strong>
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }) {
  return (
    <label className="field text-area-field">
      <span>{label}</span>
      <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function BookingsView({ bookings, onEdit, onDelete, onDuplicate }) {
  const [openId, setOpenId] = useState(null);
  if (!bookings.length) return <EmptyState />;
  return (
    <div className="bookings-view">
      <DepartureBoard bookings={bookings} />
      {bookings.map((booking) => (
        <article className="booking-card" key={booking.id}>
          <button className="booking-summary" onClick={() => setOpenId(openId === booking.id ? null : booking.id)}>
            <div className="route-chip"><Plane size={16} /> {booking.route}</div>
            <div className="booking-title">
              <strong>{booking.tripName || booking.route}</strong>
              <span>{booking.passengerName ? `${booking.passengerName} · ` : ''}{booking.redemptionProgram || 'No program'} · {booking.redemptionType || 'No type'} · {booking.fareType || 'No fare type'}</span>
            </div>
            <div className="booking-numbers">
              <strong>{points(booking.totalPointsUsed)} pts</strong>
              <span>{money(booking.totalCash)} cash · {booking.cpp === null ? 'No CPP' : pct(booking.cpp)}</span>
            </div>
            <ChevronDown className={openId === booking.id ? 'rotated' : ''} />
          </button>
          {openId === booking.id && (
            <div className="booking-detail">
              <div className="detail-actions">
                <button className="ghost-button" onClick={() => onDuplicate(booking.id)}><Plus size={15} /> Duplicate</button>
                <button className="ghost-button" onClick={() => onEdit(booking.id)}><Edit3 size={15} /> Edit</button>
                <button className="ghost-button danger" onClick={() => onDelete(booking.id)}><Trash2 size={15} /> Delete</button>
              </div>
              <div className="detail-grid">
                <DetailItem label="Passenger" value={booking.passengerName || '—'} />
                <DetailItem label="Booking date" value={booking.bookingDate || '—'} />
                <DetailItem label="Departure date" value={booking.departureDate || '—'} />
                <DetailItem label="Lead days" value={booking.leadDays === null ? '—' : `${booking.leadDays} days`} />
                <DetailItem label="One-way fare basis" value={booking.oneWayFare ? money(booking.oneWayFare) : '—'} />
                <DetailItem label="Gross CPP" value={booking.grossCpp === null ? '—' : pct(booking.grossCpp)} />
                <DetailItem label="True CPP" value={booking.cpp === null ? '—' : pct(booking.cpp)} />
              </div>
              <h4>Segments</h4>
              <div className="mini-table">
                <div className="mini-table-head segment-table"><span>Leg</span><span>Dep</span><span>Arr</span><span>Airline</span><span>Cabin</span><span>Product</span></div>
                {booking.segments.map((segment) => (
                  <div className="mini-table-row segment-table" key={segment.id}>
                    <span>{segment.origin} → {segment.destination}</span>
                    <span>{formatBoardDate(segment.departureDate || booking.departureDate)} {formatBoardTime(segment.departureTime)}</span>
                    <span>{formatBoardDate(segment.arrivalDate)} {formatBoardTime(segment.arrivalTime)}</span>
                    <span>{segment.operatingAirline || '—'} {segment.flightNumber || ''}</span>
                    <span>{segment.cabin || '—'}</span>
                    <span>{segment.product || segment.productNotes || segment.aircraft || '—'}</span>
                  </div>
                ))}
              </div>
              <h4>Point sources</h4>
              <div className="mini-table">
                <div className="mini-table-head"><span>Type</span><span>Program</span><span>Airline program</span><span>Points</span><span>Cost</span></div>
                {booking.pointSources.map((source) => (
                  <div className="mini-table-row" key={source.id}>
                    <span>{source.sourceType || '—'}</span>
                    <span>{source.pointsProgram || '—'}</span>
                    <span>{source.airlineProgram || '—'}</span>
                    <span>{points(source.amount)}</span>
                    <span>{source.cost ? moneyExact(source.cost) : '—'}</span>
                  </div>
                ))}
              </div>
              {booking.notes && <p className="notes-box">{booking.notes}</p>}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function DetailItem({ label, value }) {
  return <div className="detail-item"><span>{label}</span><strong>{value}</strong></div>;
}

function getImportBatchLabel(booking) {
  return booking.importFileName || booking.importSheetName || 'Excel import';
}

function summarizeImportBatches(bookings) {
  const batches = new Map();
  bookings.forEach((booking) => {
    if (!booking.importBatchId) return;
    if (!batches.has(booking.importBatchId)) {
      batches.set(booking.importBatchId, {
        id: booking.importBatchId,
        label: getImportBatchLabel(booking),
        importedAt: booking.importedAt || '',
        count: 0,
        points: 0
      });
    }
    const batch = batches.get(booking.importBatchId);
    batch.count += 1;
    batch.points += toNumber(booking.totalPointsUsed);
    if (!batch.importedAt || (booking.importedAt && booking.importedAt < batch.importedAt)) batch.importedAt = booking.importedAt || batch.importedAt;
  });
  return [...batches.values()].sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''));
}

function formatImportDate(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function DataTools({ bookings, setBookings, syncState }) {
  const excelRef = useRef(null);
  const jsonRef = useRef(null);
  const [status, setStatus] = useState('');
  const importBatches = useMemo(() => summarizeImportBatches(bookings), [bookings]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(bookings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `points-redemptions-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const rows = bookings.map((booking) => ({
      Trip: booking.tripName,
      Route: getRoute(booking),
      'Booking Date': booking.bookingDate,
      'Departure Date': booking.departureDate,
      'Lead Days': getLeadDays(booking) || '',
      Airline: booking.mainAirline,
      Passenger: booking.passengerName,
      'Redemption Program': booking.redemptionProgram,
      'Redemption Type': booking.redemptionType,
      'Fare Type': booking.fareType,
      'Total Points': toNumber(booking.totalPointsUsed),
      'Taxes Fees': toNumber(booking.taxesFees),
      'Purchased Points Cost': purchasedPointsCost(booking),
      'Total Cash Paid': totalCashPaid(booking),
      'Flight Cash Fare': toNumber(booking.flightCashFare),
      'Flight Cost Type': booking.flightCashFareType,
      'True CPP': bookingCpp(booking) || '',
      Notes: booking.notes
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `points-redemptions-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importExcel(file) {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '', raw: false });
    const imported = importRowsFromSheet(rows);
    if (!imported.length) {
      setStatus('No rows found in Sheet 1.');
      return;
    }
    const importBatchId = uid();
    const importedAt = new Date().toISOString();
    const taggedImport = imported.map((booking) => normalizeBooking({
      ...booking,
      importBatchId,
      importedAt,
      importFileName: file.name || 'Excel import',
      importSheetName: firstSheet,
      updatedAt: importedAt
    }));
    setBookings((current) => [...taggedImport, ...current]);
    setStatus(`Imported ${taggedImport.length} bookings from ${file.name || 'Sheet 1'}. You can delete this import batch later.`);
    excelRef.current.value = '';
  }

  async function importJson(file) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('JSON file should contain an array of bookings.');
    const normalized = parsed.map(normalizeBooking);
    setBookings((current) => [...normalized, ...current]);
    setStatus(`Imported ${normalized.length} bookings from JSON backup.`);
    jsonRef.current.value = '';
  }

  function deleteImportBatch(batch) {
    if (!batch) return;
    if (!window.confirm(`Delete ${batch.count} bookings from ${batch.label}?`)) return;
    setBookings((current) => current.filter((booking) => booking.importBatchId !== batch.id));
    setStatus(`Deleted ${batch.count} bookings from ${batch.label}.`);
  }

  function clearData() {
    if (!bookings.length) return;
    if (!window.confirm('Clear all locally stored bookings? Export a backup first if needed.')) return;
    setBookings([]);
    setStatus('All local bookings cleared.');
  }

  return (
    <div className="data-tools">
      <section className="data-card hero-panel smaller">
        <div>
          <span className="eyebrow"><Database size={14} /> {syncState.mode === 'cloud' ? 'Cloud data' : 'Local data'}</span>
          <h3>{syncState.mode === 'cloud' ? 'Your data syncs to D1' : 'Your data lives in this browser'}</h3>
          <p>{syncState.mode === 'cloud' ? 'Bookings are saved through the Pages Function API backed by Cloudflare D1. JSON export is still recommended before large imports.' : 'D1 storage is unavailable in this environment, so changes are saved to this browser. Use JSON export as your backup.'}</p>
          {syncState.error && <p className="storage-warning">Storage note: {syncState.error}</p>}
        </div>
        <div className="hero-metric">
          <span>Saved bookings</span>
          <strong>{bookings.length}</strong>
        </div>
      </section>

      <div className="data-grid">
        <section className="data-card">
          <Upload size={28} />
          <h3>Import Excel Sheet 1</h3>
          <p>Reads your current tracker and splits aircraft/product notes into separate fields where possible.</p>
          <input ref={excelRef} type="file" accept=".xlsx,.xls" onChange={(e) => importExcel(e.target.files?.[0]).catch((err) => setStatus(err.message))} />
        </section>

        <section className="data-card">
          <Upload size={28} />
          <h3>Import JSON backup</h3>
          <p>Use this to restore data exported from this app.</p>
          <input ref={jsonRef} type="file" accept=".json" onChange={(e) => importJson(e.target.files?.[0]).catch((err) => setStatus(err.message))} />
        </section>

        <section className="data-card">
          <Download size={28} />
          <h3>Export backup</h3>
          <p>Download a full JSON backup or a summary CSV for spreadsheet analysis.</p>
          <div className="button-row">
            <button className="primary-button" onClick={exportJson}><Download size={16} /> JSON</button>
            <button className="ghost-button" onClick={exportCsv}><Download size={16} /> CSV</button>
          </div>
        </section>

        <section className="data-card import-batches">
          <Database size={28} />
          <h3>Excel import batches</h3>
          <p>Delete all bookings from a previous Excel import without touching manually added bookings.</p>
          {importBatches.length ? (
            <div className="import-batch-list">
              {importBatches.map((batch) => (
                <div className="import-batch-row" key={batch.id}>
                  <div>
                    <strong>{batch.label}</strong>
                    <span>{batch.count} bookings · {points(batch.points)} pts · {formatImportDate(batch.importedAt)}</span>
                  </div>
                  <button className="ghost-button danger" onClick={() => deleteImportBatch(batch)}><Trash2 size={16} /> Delete import</button>
                </div>
              ))}
            </div>
          ) : (
            <p>No Excel imports with batch tracking yet.</p>
          )}
        </section>

        <section className="data-card danger-zone">
          <X size={28} />
          <h3>Clear all data</h3>
          <p>This clears every saved booking in the current storage mode.</p>
          <button className="ghost-button danger" onClick={clearData}><Trash2 size={16} /> Clear all</button>
        </section>
      </div>

      {status && <div className="status-toast">{status}</div>}
    </div>
  );
}

export default App;
