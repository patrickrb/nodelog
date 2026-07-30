'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Plus, Search } from 'lucide-react';

import Navbar from '@/components/Navbar';
import DynamicContactMap from '@/components/DynamicContactMap';
import EditContactDialog from '@/components/EditContactDialog';
import DXpeditionWidget from '@/components/DXpeditionWidget';
import QslMatrix from '@/components/QslMatrix';
import Pagination from '@/components/Pagination';
import QuickLogCard from '@/components/QuickLogCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dot } from '@/components/ui/dot';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Kbd } from '@/components/ui/kbd';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUser } from '@/contexts/UserContext';

interface Contact {
  id: number;
  station_id?: number;
  callsign: string;
  frequency: number;
  mode: string;
  band: string;
  datetime: string;
  rst_sent?: string;
  rst_received?: string;
  name?: string;
  qth?: string;
  grid_locator?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  confirmed?: boolean;
  lotw_qsl_rcvd?: string;
  lotw_qsl_sent?: string;
  qsl_lotw?: boolean;
  qsl_lotw_date?: string;
  lotw_match_status?: 'confirmed' | 'partial' | 'mismatch' | null;
  qrz_qsl_sent?: string;
  qrz_qsl_rcvd?: string;
  qrz_qsl_sent_date?: string;
  qrz_qsl_rcvd_date?: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface DashboardStats {
  total: number;
  dxcc: number;
  confirmed: number;
  last30: number;
}

const BAND_ORDER = ['160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m', '2m'] as const;
const BAND_FREQ_LABEL: Record<string, string> = {
  '160m': '1.8',
  '80m': '3.5',
  '60m': '5.3',
  '40m': '7.0',
  '30m': '10.1',
  '20m': '14.0',
  '17m': '18.1',
  '15m': '21.0',
  '12m': '24.9',
  '10m': '28.0',
  '6m': '50',
  '2m': '144',
};

const BAND_RANGES = [
  { value: '24h' as const, label: '24h' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
  { value: 'all' as const, label: 'all' },
];

type BandRange = (typeof BAND_RANGES)[number]['value'];

const TABLE_FILTERS = [
  { value: 'all' as const, label: 'All' },
  { value: '20m' as const, label: '20m' },
  { value: 'SSB' as const, label: 'SSB' },
  { value: 'FT8' as const, label: 'FT8' },
];

type TableFilter = (typeof TABLE_FILTERS)[number]['value'];

function greeting(now = new Date()) {
  const h = now.getUTCHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(date: string) {
  const ms = Date.now() - new Date(date).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatUtc(date: string) {
  const d = new Date(date);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function MobileCardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3 py-1 text-[14px]">
      <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-fg-2">
        {label}
      </span>
      <span className="text-fg text-right">{children}</span>
    </div>
  );
}

export default function DashboardPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [bandActivity, setBandActivity] = useState<Record<string, number>>({});
  const [bandRange, setBandRange] = useState<BandRange>('24h');
  const [tableFilter, setTableFilter] = useState<TableFilter>('all');
  const [tableSearch, setTableSearch] = useState('');
  const { user } = useUser();
  const router = useRouter();

  const fetchContacts = useCallback(
    async (page = pagination.page, limit = pagination.limit) => {
      try {
        setLoading(true);
        const response = await fetch(`/api/contacts?page=${page}&limit=${limit}`);
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        const data = await response.json();
        if (response.ok) {
          setContacts(data.contacts || []);
          setPagination({
            page: data.pagination.page,
            limit: data.pagination.limit,
            total: data.pagination.total,
            pages: data.pagination.pages,
          });
        } else {
          setError(data.error || 'Failed to fetch contacts');
        }
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
        setInitialLoading(false);
      }
    },
    [pagination.page, pagination.limit, router]
  );

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/stats');
      if (response.ok) {
        setStats(await response.json());
      }
    } catch (e) {
      console.error('Error fetching dashboard stats:', e);
    }
  }, []);

  const fetchBandActivity = useCallback(async (range: BandRange) => {
    try {
      const response = await fetch(`/api/contacts/band-activity?range=${range}`);
      if (response.ok) {
        const data = await response.json();
        setBandActivity(data.activity ?? {});
      }
    } catch (e) {
      console.error('Error fetching band activity:', e);
    }
  }, []);

  useEffect(() => {
    fetchContacts(1, 20);
    fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchBandActivity(bandRange);
  }, [bandRange, fetchBandActivity]);

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (tableFilter !== 'all') {
      list = list.filter(
        (c) => c.band === tableFilter || c.mode === tableFilter
      );
    }
    if (tableSearch.trim()) {
      const q = tableSearch.trim().toLowerCase();
      list = list.filter((c) =>
        `${c.callsign} ${c.name ?? ''} ${c.qth ?? ''} ${c.grid_locator ?? ''} ${c.frequency}`
          .toLowerCase()
          .includes(q)
      );
    }
    return list;
  }, [contacts, tableFilter, tableSearch]);

  const maxBandCount = useMemo(
    () => Math.max(1, ...Object.values(bandActivity)),
    [bandActivity]
  );

  const activityBars = (count: number) => {
    if (count <= 0) return 0;
    const ratio = count / maxBandCount;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  };

  const handleContactClick = (contact: Contact) => {
    setSelectedContact(contact);
    setIsEditDialogOpen(true);
  };
  const handleContactSave = (updatedContact: Contact) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === updatedContact.id ? updatedContact : c))
    );
  };
  const handleContactDelete = (id: number) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setPagination((prev) => ({ ...prev, total: prev.total - 1 }));
  };
  const handleDialogClose = () => {
    setIsEditDialogOpen(false);
    setSelectedContact(null);
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-fg-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  const greetName = user?.name?.split(' ')[0] ?? 'operator';
  const userCallsign = user?.callsign;

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <PageHeader
          title={
            <>
              {greeting()},{' '}
              <span className="text-accent">{greetName}</span>.
            </>
          }
          sub={
            <>
              {pagination.total.toLocaleString()} QSOs logged
              {userCallsign ? <> · operating as <span className="font-mono">{userCallsign}</span></> : null}
            </>
          }
          action={
            <Button asChild size="lg">
              <Link href="/new-contact">
                <Plus />
                Log new QSO
              </Link>
            </Button>
          }
        />

        {/* Stat grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total QSOs"
            value={(stats?.total ?? pagination.total).toLocaleString()}
            delta={stats?.last30 ? `↑ ${stats.last30.toLocaleString()} last 30 days` : undefined}
          />
          <StatCard
            label="DXCC Worked"
            value={(stats?.dxcc ?? 0).toLocaleString()}
            fraction="340"
            delta="entities confirmed"
            deltaTone="muted"
          />
          <StatCard
            label="QSL Confirmed"
            value={(stats?.confirmed ?? 0).toLocaleString()}
            delta="via LoTW & QRZ"
            deltaTone="muted"
          />
          <StatCard
            label="Last 30 Days"
            value={(stats?.last30 ?? 0).toLocaleString()}
            delta="contacts logged"
            deltaTone="muted"
          />
        </div>

        {/* Map + Quick Log */}
        <div className="grid gap-5 mb-6 grid-cols-1 lg:[grid-template-columns:minmax(0,1.55fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden p-0">
            {error && (
              <div className="bg-bad/10 border-b border-bad/20 text-bad px-4 py-3 text-sm">
                {error}
              </div>
            )}
            <div className="relative h-[320px] sm:h-[460px]">
              <DynamicContactMap contacts={contacts} user={user} height="100%" />
              <div className="absolute top-4 left-4 flex flex-wrap gap-2 z-[400]">
                <Chip>
                  <Dot tone="ok" live />
                  Worldmap
                </Chip>
                {stats?.last30 ? (
                  <Chip>Last 30 days · {stats.last30.toLocaleString()}</Chip>
                ) : null}
              </div>
            </div>
          </Card>

          <QuickLogCard
            onSaved={() => {
              fetchContacts(1, pagination.limit);
              fetchStats();
            }}
          />
        </div>

        {/* Band activity */}
        <Card className="px-5 py-4 mb-6">
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <div className="text-[17px] font-semibold">Band activity</div>
              <div className="text-sm text-fg-2">
                Contacts per band, last {bandRange === 'all' ? 'all-time' : bandRange}
              </div>
            </div>
            <SegmentedControl
              options={BAND_RANGES}
              value={bandRange}
              onChange={setBandRange}
            />
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:flex gap-1.5 p-2.5 sm:p-3 bg-bg-1 border border-line rounded-[12px]">
            {BAND_ORDER.map((band) => {
              const count = bandActivity[band] ?? 0;
              const filled = activityBars(count);
              const isActive = filled > 0;
              return (
                <div
                  key={band}
                  className={[
                    'md:flex-1 text-center px-2 py-3 rounded-[8px] border font-mono text-[13px] transition-colors cursor-default',
                    isActive
                      ? 'border-accent bg-accent-soft text-accent-hi'
                      : 'border-transparent bg-white/[0.015] text-fg-2 hover:bg-white/[0.04] hover:text-fg',
                  ].join(' ')}
                  title={`${count} contact${count === 1 ? '' : 's'}`}
                >
                  <div>{band}</div>
                  <div className="text-[11px] opacity-60">{BAND_FREQ_LABEL[band]}</div>
                  <div className="mt-1 flex justify-center gap-0.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`block w-1 h-2 rounded-[1px] ${
                          i < filled ? 'bg-accent opacity-100' : 'bg-fg-3 opacity-40'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Log + DXpeditions */}
        <div className="grid gap-5 grid-cols-1 lg:[grid-template-columns:minmax(0,1fr)_340px]">
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 border-b border-line">
              <div className="flex-1 min-w-0 basis-full sm:basis-auto flex items-center gap-2.5 px-3.5 py-2 bg-bg-1 border border-line-hi rounded-[10px]">
                <Search className="h-4 w-4 text-fg-2 shrink-0" />
                <input
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Search callsign, name, grid, frequency…"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore=""
                  data-form-type="other"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-fg text-[15px] placeholder:text-fg-3"
                />
                <Kbd>/</Kbd>
              </div>
              <SegmentedControl
                options={TABLE_FILTERS}
                value={tableFilter}
                onChange={setTableFilter}
              />
            </div>

            {pagination.total === 0 ? (
              <div className="text-center py-12">
                <p className="text-fg-2">
                  No contacts logged yet.{' '}
                  <Link href="/new-contact" className="text-accent hover:underline">
                    Add your first.
                  </Link>
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: classic table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Callsign</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead>Band / Mode</TableHead>
                        <TableHead>Freq</TableHead>
                        <TableHead>RST</TableHead>
                        <TableHead>Operator</TableHead>
                        <TableHead>QSL · LoTW / QRZ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-10">
                            <div className="flex items-center justify-center gap-2 text-fg-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading contacts…
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredContacts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-10 text-fg-2">
                            No contacts match those filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredContacts.map((contact) => (
                          <TableRow
                            key={contact.id}
                            className="cursor-pointer"
                            onClick={() => handleContactClick(contact)}
                          >
                            <TableCell>
                              <span className="font-mono font-semibold text-fg text-[16px]">
                                {contact.callsign}
                              </span>
                            </TableCell>
                            <TableCell>
                              {formatUtc(contact.datetime)}
                              <br />
                              <span className="text-[13px] text-fg-2">
                                {formatRelativeTime(contact.datetime)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1.5 flex-wrap">
                                <Chip size="sm">{contact.band}</Chip>
                                <Chip size="sm">{contact.mode}</Chip>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-fg-1">
                                {contact.frequency}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-fg-1">
                                {contact.rst_sent ?? '-'} / {contact.rst_received ?? '-'}
                              </span>
                            </TableCell>
                            <TableCell>
                              {contact.name ?? '—'}
                              {contact.qth ? (
                                <span className="text-[13px] text-fg-2"> · {contact.qth}</span>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <QslMatrix
                                lotw_qsl_sent={contact.lotw_qsl_sent}
                                lotw_qsl_rcvd={contact.lotw_qsl_rcvd}
                                qsl_lotw={contact.qsl_lotw}
                                qsl_lotw_date={contact.qsl_lotw_date}
                                lotw_match_status={contact.lotw_match_status}
                                qrz_qsl_sent={contact.qrz_qsl_sent}
                                qrz_qsl_sent_date={contact.qrz_qsl_sent_date}
                                qrz_qsl_rcvd={contact.qrz_qsl_rcvd}
                                qrz_qsl_rcvd_date={contact.qrz_qsl_rcvd_date}
                                contact_id={contact.id}
                                station_id={contact.station_id}
                                onStatusChange={() => fetchContacts()}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: stacked QSO cards */}
                <div className="md:hidden flex flex-col gap-2.5 p-3">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-fg-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading contacts…
                    </div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="text-center py-10 text-fg-2">
                      No contacts match those filters.
                    </div>
                  ) : (
                    filteredContacts.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => handleContactClick(contact)}
                        className="rounded-xl border border-line bg-bg-1 p-3.5 text-left cursor-pointer hover:border-line-hi transition-colors"
                      >
                        <div className="pb-2.5 mb-2 border-b border-line flex justify-between items-center gap-3">
                          <span className="font-mono font-semibold text-fg text-lg">
                            {contact.callsign}
                          </span>
                          <QslMatrix
                            lotw_qsl_sent={contact.lotw_qsl_sent}
                            lotw_qsl_rcvd={contact.lotw_qsl_rcvd}
                            qsl_lotw={contact.qsl_lotw}
                            qsl_lotw_date={contact.qsl_lotw_date}
                            lotw_match_status={contact.lotw_match_status}
                            qrz_qsl_sent={contact.qrz_qsl_sent}
                            qrz_qsl_sent_date={contact.qrz_qsl_sent_date}
                            qrz_qsl_rcvd={contact.qrz_qsl_rcvd}
                            qrz_qsl_rcvd_date={contact.qrz_qsl_rcvd_date}
                            contact_id={contact.id}
                            station_id={contact.station_id}
                            onStatusChange={() => fetchContacts()}
                          />
                        </div>
                        <MobileCardRow label="When">
                          <span>
                            {formatUtc(contact.datetime)}{' '}
                            <span className="text-fg-2">· {formatRelativeTime(contact.datetime)}</span>
                          </span>
                        </MobileCardRow>
                        <MobileCardRow label="Band / Mode">
                          <span className="flex gap-1.5 flex-wrap justify-end">
                            <Chip size="sm">{contact.band}</Chip>
                            <Chip size="sm">{contact.mode}</Chip>
                          </span>
                        </MobileCardRow>
                        <MobileCardRow label="Freq">
                          <span className="font-mono text-fg-1">{contact.frequency}</span>
                        </MobileCardRow>
                        <MobileCardRow label="RST">
                          <span className="font-mono text-fg-1">
                            {contact.rst_sent ?? '-'} / {contact.rst_received ?? '-'}
                          </span>
                        </MobileCardRow>
                        <MobileCardRow label="Operator">
                          <span className="text-right">
                            {contact.name ?? '—'}
                            {contact.qth ? (
                              <span className="text-[13px] text-fg-2"> · {contact.qth}</span>
                            ) : null}
                          </span>
                        </MobileCardRow>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {pagination.pages > 1 && (
              <div className="border-t border-line">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.pages}
                  pageSize={pagination.limit}
                  totalItems={pagination.total}
                  onPageChange={(p) => fetchContacts(p, pagination.limit)}
                  onPageSizeChange={(l) => fetchContacts(1, l)}
                  pageSizeOptions={[10, 20, 50, 100]}
                />
              </div>
            )}
            {pagination.total > 0 && pagination.pages <= 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-line text-sm">
                <span className="text-fg-2">
                  Showing {filteredContacts.length} of {pagination.total} contacts
                </span>
                <Link href="/search" className="text-accent hover:underline">
                  View full log →
                </Link>
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-5">
            <DXpeditionWidget limit={6} />
          </div>
        </div>
      </main>

      <EditContactDialog
        contact={selectedContact}
        isOpen={isEditDialogOpen}
        onClose={handleDialogClose}
        onSave={handleContactSave}
        onDelete={handleContactDelete}
      />
    </div>
  );
}
