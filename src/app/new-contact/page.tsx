'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Check,
  AlertCircle,
  Radio,
  Plus,
  ExternalLink,
  MapPin,
} from 'lucide-react';

import Navbar from '@/components/Navbar';
import PreviousContacts from '@/components/PreviousContacts';
import ContactLocationMap from '@/components/ContactLocationMap';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dot } from '@/components/ui/dot';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Pill, PillGroup } from '@/components/ui/pill';
import { PageHeader as _PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { frequencyToBand, AMATEUR_BANDS } from '@/lib/bands';
import { AMATEUR_MODES, defaultRstForMode, isDbReportMode } from '@/lib/modes';
import {
  gridToLatLon,
  gridLocatorError,
  distanceKm,
  bearingDeg,
  compassPoint,
  kmToMiles,
  longPathBearingDeg,
  longPathKm,
  resolveOriginGrid,
} from '@/lib/grid';

void _PageHeader;

interface Station {
  id: number;
  callsign: string;
  station_name: string;
  is_default: boolean;
  // The station's own Maidenhead locator — the grid the QSO is actually
  // transmitted from, used as the origin for the distance/bearing readout so a
  // portable/POTA op isn't measured from their home account grid.
  grid_locator?: string;
}

interface PreviousContact {
  id: number;
  datetime: string;
  band: string;
  mode: string;
  frequency: number | string;
  rst_sent?: string;
  rst_received?: string;
  name?: string;
  qth?: string;
  notes?: string;
}

const MODES = AMATEUR_MODES;
const BAND_PILLS = AMATEUR_BANDS;

// QRZ XML license-class codes — used to give the chip a human-readable label.
const LICENSE_CLASS_LABELS: Record<string, string> = {
  E: 'Extra',
  A: 'Advanced',
  G: 'General',
  P: 'Tech Plus',
  T: 'Tech',
  N: 'Novice',
  C: 'Club',
};

function CallsignAvatar({
  image,
  fallback,
}: {
  image?: string;
  fallback: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = image && !errored;
  return (
    <div
      aria-hidden="true"
      className="w-16 h-16 sm:w-20 sm:h-20 rounded-[12px] overflow-hidden grid place-items-center text-[#051018] font-mono font-bold text-xl shrink-0"
      style={
        showImage
          ? undefined
          : {
              background:
                'linear-gradient(135deg, var(--accent), #7a9bff)',
            }
      }
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={image}
          src={image}
          alt=""
          onError={() => setErrored(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        fallback
      )}
    </div>
  );
}

function rstToBars(rst: string | undefined, mode: string): number {
  if (!rst) return 0;
  // Voice/CW RST values like 59, 599, 57 — readability is the first digit (1-5)
  // Digital values like -10 / +12 — map to 5 bars across -25..+10 dB
  const numeric = Number.parseInt(rst.replace(/[^-\d]/g, ''), 10);
  if (Number.isNaN(numeric)) return 0;
  // dB-report modes (the WSJT-X / weak-signal family, plus the keyboard PSK/RTTY
  // group) carry a "-10"-style SNR, not an RST — scale them on the dB axis.
  // Sourced from the canonical classifier so this stays in step with the report
  // the form pre-fills; a hard-coded list here previously omitted JS8/FST4/JT65/
  // JT9/Q65/MSK144/PSK63, whose "-10" default then rendered a wrong 1-bar meter.
  if (isDbReportMode(mode)) {
    const clamped = Math.min(10, Math.max(-25, numeric));
    return Math.round(((clamped + 25) / 35) * 5);
  }
  // Voice/CW: first digit 1-5
  const readability = Number.parseInt(String(Math.abs(numeric))[0], 10);
  if (Number.isNaN(readability)) return 0;
  return Math.min(5, Math.max(0, readability));
}

export default function NewContactPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [isLiveLogging, setIsLiveLogging] = useState(false);
  const [formData, setFormData] = useState({
    callsign: '',
    frequency: '',
    mode: 'SSB',
    band: '',
    datetime: new Date().toISOString().slice(0, 19),
    rst_sent: '59',
    rst_received: '59',
    name: '',
    qth: '',
    gridLocator: '',
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    power: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [lookupResult, setLookupResult] = useState<{
    found: boolean;
    name?: string;
    nickname?: string;
    aliases?: string;
    qth?: string;
    city?: string;
    state?: string;
    grid_locator?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    class?: string;
    lotw?: boolean;
    eqsl?: boolean;
    image?: string;
    qslmgr?: string;
    url?: string;
    error?: string;
  } | null>(null);

  const [previousContacts, setPreviousContacts] = useState<PreviousContact[]>([]);
  const [previousContactsLoading, setPreviousContactsLoading] = useState(false);
  const [previousContactsError, setPreviousContactsError] = useState('');
  const [currentUser, setCurrentUser] = useState<{
    id: number;
    email: string;
    name: string;
    callsign?: string;
    grid_locator?: string;
  } | null>(null);

  const router = useRouter();

  const fetchStations = useCallback(async () => {
    try {
      setStationsLoading(true);
      const response = await fetch('/api/stations');
      if (response.ok) {
        const data = await response.json();
        setStations(data.stations || []);
        const defaultStation = data.stations?.find((s: Station) => s.is_default);
        if (defaultStation) setSelectedStationId(defaultStation.id.toString());
      }
    } catch {
      /* noop */
    } finally {
      setStationsLoading(false);
    }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await fetch('/api/user');
      if (response.ok) setCurrentUser(await response.json());
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    fetchStations();
    fetchCurrentUser();
  }, [fetchStations, fetchCurrentUser]);

  // Live logging — tick datetime every second when toggled on
  useEffect(() => {
    if (!isLiveLogging) return;
    const tick = () =>
      setFormData((prev) => ({
        ...prev,
        datetime: new Date().toISOString().slice(0, 19),
      }));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isLiveLogging]);

  const handleCallsignLookup = useCallback(async () => {
    if (!formData.callsign.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const response = await fetch('/api/lookup/callsign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callsign: formData.callsign }),
      });
      const data = await response.json();
      if (response.ok) {
        setLookupResult(data);
        if (data.found) {
          // Replace lookup-derived fields outright. Falling back to `prev` here
          // would leave stale grid/coords/QTH on the form when the new callsign
          // resolves but doesn't carry one of those fields.
          setFormData((prev) => ({
            ...prev,
            name: data.name || '',
            qth: data.qth || '',
            gridLocator: data.grid_locator || '',
            latitude: data.latitude,
            longitude: data.longitude,
          }));
        }
      } else {
        setLookupResult({ found: false, error: data.error || 'Lookup failed' });
      }
    } catch {
      setLookupResult({ found: false, error: 'Network error during lookup' });
    } finally {
      setLookupLoading(false);
    }
  }, [formData.callsign]);

  // Keyboard shortcuts — Ctrl+Enter saves, Ctrl+L focuses callsign
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        document.querySelector('form')?.requestSubmit();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        document.getElementById('callsign')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchPreviousContacts = useCallback(async (callsign: string) => {
    if (!callsign.trim()) {
      setPreviousContacts([]);
      return;
    }
    setPreviousContactsLoading(true);
    setPreviousContactsError('');
    try {
      const response = await fetch(
        `/api/contacts/previous?callsign=${encodeURIComponent(callsign)}&limit=10`
      );
      if (response.status === 401) {
        setPreviousContacts([]);
        return;
      }
      const data = await response.json();
      if (response.ok) setPreviousContacts(data.contacts || []);
      else {
        setPreviousContactsError(data.error || 'Failed to fetch previous contacts');
        setPreviousContacts([]);
      }
    } catch {
      setPreviousContactsError('Network error while fetching previous contacts');
      setPreviousContacts([]);
    } finally {
      setPreviousContactsLoading(false);
    }
  }, []);

  // Debounced callsign-driven side effects
  useEffect(() => {
    const id = setTimeout(() => fetchPreviousContacts(formData.callsign), 300);
    return () => clearTimeout(id);
  }, [formData.callsign, fetchPreviousContacts]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (formData.callsign.trim()) handleCallsignLookup();
      else setLookupResult(null);
    }, 300);
    return () => clearTimeout(id);
  }, [formData.callsign, handleCallsignLookup]);

  // Validators (preserved from previous implementation)
  const validateCallsign = (callsign: string): string | null => {
    if (!callsign.trim()) return null;
    return /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,3}[A-Z]$/i.test(callsign)
      ? null
      : 'Invalid callsign format';
  };
  // Delegates to the canonical validator in @/lib/grid so the logging form and
  // the stations API stay in lockstep and both accept 8-char extended locators.
  const validateGridLocator = (grid: string): string | null => gridLocatorError(grid);
  const validateFrequency = (frequency: string): string | null => {
    if (!frequency.trim()) return null;
    const freq = parseFloat(frequency);
    if (Number.isNaN(freq) || freq < 0.1 || freq > 300000)
      return 'Frequency must be between 0.1 and 300000 MHz';
    if (frequencyToBand(freq) === 'OTHER') return 'Frequency is outside amateur radio bands';
    return null;
  };

  const validateField = (name: string, value: string) => {
    let err: string | null = null;
    if (name === 'callsign') err = validateCallsign(value);
    else if (name === 'gridLocator') err = validateGridLocator(value);
    else if (name === 'frequency') err = validateFrequency(value);
    setValidationErrors((prev) => ({ ...prev, [name]: err || '' }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'callsign') {
      // Reset lookup-derived state alongside the callsign so the path map and
      // grid input don't continue showing the previous operator's data while
      // the next lookup is in flight.
      setFormData((prev) => ({
        ...prev,
        callsign: value,
        name: '',
        qth: '',
        gridLocator: '',
        latitude: undefined,
        longitude: undefined,
      }));
      setLookupResult(null);
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    validateField(name, value);
  };

  const handleSelectMode = (value: string) => {
    const rst = defaultRstForMode(value);
    setFormData((prev) => ({ ...prev, mode: value, rst_sent: rst, rst_received: rst }));
  };

  const handleSelectBand = (value: string) => {
    setFormData((prev) => ({ ...prev, band: value }));
  };

  const handleFrequencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    validateField(name, value);
    if (name === 'frequency') {
      const freq = parseFloat(value);
      if (freq) {
        const band = frequencyToBand(freq);
        if (band !== 'OTHER') setFormData((prev) => ({ ...prev, band }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const errors: { [key: string]: string } = {};
    const callsignError = validateCallsign(formData.callsign);
    if (callsignError) errors.callsign = callsignError;
    const frequencyError = validateFrequency(formData.frequency);
    if (frequencyError) errors.frequency = frequencyError;
    const gridError = validateGridLocator(formData.gridLocator);
    if (gridError) errors.gridLocator = gridError;
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setError('Please fix the validation errors before submitting.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          station_id: selectedStationId ? parseInt(selectedStationId) : undefined,
          grid_locator: formData.gridLocator,
          latitude: formData.latitude,
          longitude: formData.longitude,
          distance: pathInfo ? Math.round(pathInfo.km) : undefined,
          frequency: parseFloat(formData.frequency),
          // Component-local state calls it `power`; the wire/DB field is the
          // ADIF-standard `tx_pwr` (watts). Previously sent as `power`, which no
          // column consumed — so the operator's power was silently dropped.
          tx_pwr: formData.power ? parseFloat(formData.power) : undefined,
          datetime: new Date(formData.datetime).toISOString(),
        }),
      });
      if (response.status === 401) {
        router.push('/login');
        return;
      }
      const data = await response.json();
      if (response.ok) router.push('/dashboard');
      else setError(data.error || 'Failed to create contact');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const sentBars = useMemo(
    () => rstToBars(formData.rst_sent, formData.mode),
    [formData.rst_sent, formData.mode]
  );
  const rcvdBars = useMemo(
    () => rstToBars(formData.rst_received, formData.mode),
    [formData.rst_received, formData.mode]
  );

  const utcStamp = useMemo(() => {
    const d = new Date(formData.datetime);
    if (Number.isNaN(d.getTime())) return '—';
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm} UTC`;
  }, [formData.datetime]);

  const station = stations.find((s) => s.id.toString() === selectedStationId);

  // Distance and bearing from the operator's transmitting grid to the contact —
  // the "how far, which way" readout hams expect while logging. The origin is
  // the *selected station's* grid (where the QSO is actually made) and only
  // falls back to the account home grid when the station has none, so a
  // portable/POTA op isn't measured from home. Prefers the contact's explicit
  // coordinates (from a QRZ lookup) and falls back to the grid square typed into
  // the form; renders nothing until both endpoints resolve, so a half-typed grid
  // never shows a bogus reading.
  const pathInfo = (() => {
    const originGrid = resolveOriginGrid(
      station?.grid_locator,
      currentUser?.grid_locator,
    );
    const from = originGrid ? gridToLatLon(originGrid) : null;
    const to =
      formData.latitude !== undefined && formData.longitude !== undefined
        ? { lat: formData.latitude, lon: formData.longitude }
        : formData.gridLocator
          ? gridToLatLon(formData.gridLocator)
          : null;
    if (!from || !to) return null;
    return {
      km: distanceKm(from.lat, from.lon, to.lat, to.lon),
      bearing: bearingDeg(from.lat, from.lon, to.lat, to.lon),
    };
  })();

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <PageHeader
          title="Log a contact"
          sub={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-fg-1">{utcStamp}</span>
              {station ? (
                <Chip>
                  <Dot tone="ok" live />
                  {station.callsign} · {station.station_name}
                </Chip>
              ) : null}
              <span className="text-fg-3">
                Auto-lookup enabled · LoTW upload on save
              </span>
            </span>
          }
          action={
            <span className="hidden md:flex items-center gap-2 text-sm text-fg-2">
              Press <Kbd>⏎</Kbd> to save · <Kbd>⎋</Kbd> to cancel
            </span>
          }
        />

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 grid-cols-1 xl:[grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* LEFT — form */}
            <div className="flex flex-col gap-5 min-w-0">
              {/* Callsign hero */}
              <Card
                className="p-5 sm:p-8 flex flex-col gap-5"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(77,208,255,0.04), transparent 60%), var(--card)',
                }}
              >
                <div className="flex items-center justify-between">
                  <Label htmlFor="callsign">Their callsign</Label>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[13px] text-fg-2">Live logging</span>
                    <Switch
                      checked={isLiveLogging}
                      onCheckedChange={setIsLiveLogging}
                    />
                  </div>
                </div>
                <div className="relative">
                  <input
                    id="callsign"
                    name="callsign"
                    required
                    value={formData.callsign}
                    onChange={handleChange}
                    placeholder="W1AW"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore=""
                    data-form-type="other"
                    className={cn(
                      'w-full bg-transparent border-0 border-b-2 border-line-hi text-fg font-mono text-[32px] sm:text-[56px] font-semibold tracking-[0.04em] py-3 sm:py-4 outline-none transition-colors uppercase placeholder:text-fg-3',
                      'focus:border-accent',
                      validationErrors.callsign ? 'border-bad' : ''
                    )}
                  />
                  {lookupLoading ? (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-fg-2" />
                  ) : null}
                </div>
                {validationErrors.callsign ? (
                  <p className="text-sm text-bad flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {validationErrors.callsign}
                  </p>
                ) : null}
                {lookupResult ? (
                  lookupResult.found ? (
                    <div
                      className="p-4 rounded-[14px] border border-accent-glow"
                      style={{
                        background:
                          'linear-gradient(180deg, var(--accent-soft), transparent), var(--bg-1)',
                      }}
                    >
                      <div className="flex gap-4 items-start">
                        <CallsignAvatar
                          image={lookupResult.image}
                          fallback={(lookupResult.name ?? formData.callsign)
                            .slice(0, 2)
                            .toUpperCase()}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="text-lg font-semibold truncate">
                                {lookupResult.name || formData.callsign.toUpperCase()}
                              </h3>
                              {lookupResult.nickname &&
                              lookupResult.nickname !== lookupResult.name ? (
                                <div className="text-[13px] text-fg-2 truncate">
                                  &ldquo;{lookupResult.nickname}&rdquo;
                                </div>
                              ) : null}
                            </div>
                            <Chip variant="ok" size="sm">
                              <Check className="h-3.5 w-3.5" />
                              Verified
                            </Chip>
                          </div>
                          {(lookupResult.city ||
                            lookupResult.state ||
                            lookupResult.country) ? (
                            <div className="flex items-start gap-1.5 text-[13px] text-fg-2 mt-1">
                              <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span className="truncate">
                                {[
                                  lookupResult.city,
                                  lookupResult.state,
                                  lookupResult.country,
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </span>
                            </div>
                          ) : null}
                          {lookupResult.grid_locator ? (
                            <div className="font-mono text-[13px] text-fg-1 mt-0.5">
                              Grid {lookupResult.grid_locator}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {lookupResult.class &&
                            LICENSE_CLASS_LABELS[lookupResult.class] ? (
                              <Chip size="sm" variant="accent">
                                {LICENSE_CLASS_LABELS[lookupResult.class]}
                              </Chip>
                            ) : null}
                            {lookupResult.lotw ? (
                              <Chip size="sm" variant="info">LoTW user</Chip>
                            ) : null}
                            {lookupResult.eqsl ? (
                              <Chip size="sm" variant="info">eQSL user</Chip>
                            ) : null}
                            {lookupResult.qslmgr ? (
                              <Chip size="sm">QSL: {lookupResult.qslmgr}</Chip>
                            ) : null}
                          </div>
                          <a
                            href={`https://www.qrz.com/db/${formData.callsign.toUpperCase()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline mt-2"
                          >
                            View on QRZ
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-warn">
                      <AlertCircle className="h-4 w-4" />
                      {lookupResult.error || 'Callsign not found'}
                    </div>
                  )
                ) : null}
              </Card>

              {/* Band & Mode */}
              <Card className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[17px] font-semibold">Band &amp; Mode</h3>
                  {formData.frequency ? (
                    <Chip>
                      <Dot tone="ok" live />
                      {formData.frequency} MHz
                    </Chip>
                  ) : null}
                </div>

                <Label className="mb-2.5 block">Band</Label>
                <PillGroup className="mb-5">
                  {BAND_PILLS.map((b) => (
                    <Pill
                      key={b}
                      active={formData.band === b}
                      onClick={() => handleSelectBand(b)}
                    >
                      {b.toLowerCase()}
                    </Pill>
                  ))}
                </PillGroup>

                <Label className="mb-2.5 block">Mode</Label>
                <PillGroup className="mb-5">
                  {MODES.map((m) => (
                    <Pill
                      key={m}
                      active={formData.mode === m}
                      onClick={() => handleSelectMode(m)}
                    >
                      {m}
                    </Pill>
                  ))}
                </PillGroup>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="frequency">Frequency (MHz)</Label>
                    <Input
                      id="frequency"
                      name="frequency"
                      type="number"
                      step="0.001"
                      mono
                      size="lg"
                      required
                      value={formData.frequency}
                      onChange={handleFrequencyChange}
                      placeholder="14.205"
                      className={validationErrors.frequency ? 'border-bad' : ''}
                    />
                    {validationErrors.frequency ? (
                      <p className="text-sm text-bad flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {validationErrors.frequency}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="power">Power (W)</Label>
                    <Input
                      id="power"
                      name="power"
                      type="number"
                      mono
                      size="lg"
                      min={0}
                      value={formData.power}
                      onChange={handleChange}
                      placeholder="100"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="datetime">Date · time</Label>
                    <Input
                      id="datetime"
                      name="datetime"
                      type="datetime-local"
                      mono
                      size="lg"
                      step={isLiveLogging ? 1 : undefined}
                      required
                      disabled={isLiveLogging}
                      value={formData.datetime}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </Card>

              {/* Signal report & details */}
              <Card className="p-4 sm:p-6">
                <h3 className="text-[17px] font-semibold mb-4">
                  Signal report &amp; details
                </h3>
                <div className="flex gap-4 mb-5">
                  <div className="flex-1 px-4 py-3.5 rounded-[12px] bg-bg-1 border border-line-hi text-center">
                    <div className="text-[12px] uppercase tracking-[0.08em] text-fg-2">
                      RST sent
                    </div>
                    <input
                      name="rst_sent"
                      value={formData.rst_sent}
                      onChange={handleChange}
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore=""
                      data-form-type="other"
                      className="w-full bg-transparent border-0 outline-none text-center text-fg font-mono text-[28px] font-semibold mt-1"
                    />
                    <div className="flex justify-center gap-1 mt-2">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className={`block w-1.5 h-3.5 rounded-[1px] ${
                            i < sentBars
                              ? 'bg-accent opacity-100'
                              : 'bg-fg-3 opacity-40'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 px-4 py-3.5 rounded-[12px] bg-bg-1 border border-line-hi text-center">
                    <div className="text-[12px] uppercase tracking-[0.08em] text-fg-2">
                      RST received
                    </div>
                    <input
                      name="rst_received"
                      value={formData.rst_received}
                      onChange={handleChange}
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore=""
                      data-form-type="other"
                      className="w-full bg-transparent border-0 outline-none text-center text-fg font-mono text-[28px] font-semibold mt-1"
                    />
                    <div className="flex justify-center gap-1 mt-2">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className={`block w-1.5 h-3.5 rounded-[1px] ${
                            i < rcvdBars
                              ? 'bg-accent opacity-100'
                              : 'bg-fg-3 opacity-40'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 flex flex-col gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Operator's name"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="gridLocator">Grid square</Label>
                    <Input
                      id="gridLocator"
                      name="gridLocator"
                      mono
                      value={formData.gridLocator}
                      onChange={handleChange}
                      placeholder="FN31pr"
                      className={
                        validationErrors.gridLocator ? 'border-bad' : ''
                      }
                    />
                    {validationErrors.gridLocator ? (
                      <p className="text-sm text-bad flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {validationErrors.gridLocator}
                      </p>
                    ) : null}
                  </div>
                  <div className="md:col-span-2 flex flex-col gap-2">
                    <Label htmlFor="qth">QTH</Label>
                    <Input
                      id="qth"
                      name="qth"
                      value={formData.qth}
                      onChange={handleChange}
                      placeholder="Munich, Germany"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="station">Station</Label>
                    {stations.length > 0 ? (
                      <Select
                        value={selectedStationId}
                        onValueChange={setSelectedStationId}
                      >
                        <SelectTrigger id="station">
                          <SelectValue placeholder="Pick a station">
                            <span className="flex items-center gap-2">
                              <Radio className="h-4 w-4 text-accent" />
                              {station?.callsign ?? 'Pick a station'}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {stations.map((s) => (
                            <SelectItem key={s.id} value={s.id.toString()}>
                              {s.station_name}{' '}
                              <span className="text-fg-2 font-mono ml-2">
                                {s.callsign}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Button asChild variant="secondary" size="sm">
                        <Link href="/stations/new">
                          <Radio className="h-4 w-4" />
                          Add a station first
                        </Link>
                      </Button>
                    )}
                  </div>
                  <div className="md:col-span-3 flex flex-col gap-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      rows={2}
                      value={formData.notes}
                      onChange={handleChange}
                      placeholder="Anything you want to remember about this contact…"
                    />
                  </div>
                </div>
              </Card>

              {error ? (
                <div className="bg-bad/10 border border-bad/25 text-bad px-4 py-3 rounded-[10px] text-sm">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 pt-1">
                <Button asChild variant="secondary" className="w-full sm:w-auto">
                  <Link href="/dashboard">Cancel</Link>
                </Button>
                <div className="hidden sm:block sm:flex-1" />
                <Button type="submit" size="lg" disabled={isLoading} className="w-full sm:w-auto">
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Plus />
                      Save QSO
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* RIGHT — sidebar */}
            <div className="flex flex-col gap-5 min-w-0">
              <Card className="overflow-hidden p-0">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>Path</CardTitle>
                      <CardDescription>
                        {currentUser?.callsign && formData.callsign
                          ? `${currentUser.callsign} → ${formData.callsign}`
                          : 'Map will populate when location data is available'}
                      </CardDescription>
                    </div>
                    {lookupResult?.country ? (
                      <Chip>{lookupResult.country}</Chip>
                    ) : null}
                  </div>
                </CardHeader>
                <div className="p-4">
                  <ContactLocationMap
                    contact={{
                      callsign: formData.callsign,
                      name: formData.name,
                      qth: formData.qth,
                      grid_locator: formData.gridLocator,
                      latitude: formData.latitude,
                      longitude: formData.longitude,
                      country: lookupResult?.country,
                    }}
                    user={currentUser}
                    height="240px"
                  />
                  {pathInfo ? (
                    <dl className="mt-4 grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          Distance
                        </dt>
                        <dd className="font-mono text-lg font-semibold tabular-nums">
                          {Math.round(pathInfo.km).toLocaleString()} km
                          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                            {Math.round(kmToMiles(pathInfo.km)).toLocaleString()} mi
                          </span>
                        </dd>
                        <div className="font-mono text-xs text-muted-foreground tabular-nums">
                          LP {Math.round(longPathKm(pathInfo.km)).toLocaleString()} km
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          Bearing
                        </dt>
                        <dd className="font-mono text-lg font-semibold tabular-nums">
                          {Math.round(pathInfo.bearing)}°
                          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                            {compassPoint(pathInfo.bearing)}
                          </span>
                        </dd>
                        <div className="font-mono text-xs text-muted-foreground tabular-nums">
                          LP {Math.round(longPathBearingDeg(pathInfo.bearing))}°{' '}
                          {compassPoint(longPathBearingDeg(pathInfo.bearing))}
                        </div>
                      </div>
                    </dl>
                  ) : null}
                </div>
              </Card>

              <Card className="overflow-hidden p-0">
                <CardHeader>
                  <CardTitle>Previous contacts</CardTitle>
                  <CardDescription>
                    {formData.callsign
                      ? `${previousContacts.length} prior QSO${previousContacts.length === 1 ? '' : 's'} with ${formData.callsign}`
                      : 'Type a callsign to look it up'}
                  </CardDescription>
                </CardHeader>
                <PreviousContacts
                  contacts={previousContacts}
                  loading={previousContactsLoading}
                  error={previousContactsError}
                  callsign={formData.callsign}
                />
              </Card>

              <Card className="p-6">
                <h3 className="text-[16px] font-semibold mb-3.5">
                  This QSO will…
                </h3>
                <div className="flex flex-col gap-3 text-[14px]">
                  <div className="flex items-start gap-2.5">
                    <Dot tone="ok" className="mt-1.5" />
                    <span>Save to your logbook on this device.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Dot tone={station ? 'ok' : 'muted'} className="mt-1.5" />
                    <span>
                      {station
                        ? `Be logged under station ${station.callsign}.`
                        : 'Need a station before LoTW/QRZ sync can fire.'}
                    </span>
                  </div>
                  {previousContacts.length > 0 && formData.callsign ? (
                    <div className="flex items-start gap-2.5">
                      <Dot tone="info" className="mt-1.5" />
                      <span>
                        Be your <strong>#{previousContacts.length + 1}</strong>{' '}
                        QSO with this operator.
                      </span>
                    </div>
                  ) : null}
                  {lookupResult?.country ? (
                    <div className="flex items-start gap-2.5">
                      <Dot tone="accent" className="mt-1.5" />
                      <span>
                        Count toward DXCC for{' '}
                        <strong>{lookupResult.country}</strong>.
                      </span>
                    </div>
                  ) : null}
                </div>
              </Card>

              {!stationsLoading && stations.length === 0 ? (
                <div className="bg-warn/10 border border-warn/20 rounded-[12px] p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-warn shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-fg mb-1">
                      No station configured
                    </h3>
                    <p className="text-sm text-fg-2 mb-3">
                      You need at least one station before logging contacts.
                    </p>
                    <Button asChild size="sm" variant="secondary">
                      <Link href="/stations/new">
                        <Radio className="h-4 w-4" />
                        Add your first station
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
