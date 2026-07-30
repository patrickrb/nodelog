'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search, Filter, Download, RotateCcw, ArrowLeft, Table as TableIcon, Map, X, Upload } from 'lucide-react';
import EditContactDialog from '@/components/EditContactDialog';
import Pagination from '@/components/Pagination';
import Navbar from '@/components/Navbar';
import LotwSyncIndicator from '@/components/LotwSyncIndicator';
import QRZSyncIndicator from '@/components/QRZSyncIndicator';
import DynamicContactMap from '@/components/DynamicContactMap';
import { useUser } from '@/contexts/UserContext';
import { AMATEUR_BANDS } from '@/lib/bands';
import { AMATEUR_MODES } from '@/lib/modes';

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
  // LoTW fields
  lotw_qsl_rcvd?: string;
  lotw_qsl_sent?: string;
  qsl_lotw?: boolean;
  qsl_lotw_date?: string;
  lotw_match_status?: 'confirmed' | 'partial' | 'mismatch' | null;
  // QRZ QSL fields
  qrz_qsl_sent?: string; // Y, N, R, Q or null
  qrz_qsl_rcvd?: string; // Y, N, R, Q or null
  qrz_qsl_sent_date?: string;
  qrz_qsl_rcvd_date?: string;
}

interface SearchFilters {
  callsign: string;
  name: string;
  qth: string;
  notes: string;
  mode: string;
  band: string;
  gridLocator: string;
  startDate: string;
  endDate: string;
  quickFilter: string;
  qslStatus: string;
  dxcc: string;
}

interface DXCCEntity {
  adif: number;
  name: string;
  prefix: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// Mode options come from the canonical mode list (@/lib/modes) — the set of
// modes Nextlog can store. The previous hard-coded list knew only
// FT4/FT8/PSK31/MFSK among the digital modes, so a QSO whose mode was promoted
// from a WSJT-X / fldigi SUBMODE on import (JS8, FST4, JT65, Q65, PSK63, Olivia,
// Contestia, …) could never be filtered by mode. Matching is case-insensitive
// on the server (UPPER(mode) = UPPER($n)), so the uppercase values match stored data.
const MODES = AMATEUR_MODES;
// Band options come from the canonical band plan (@/lib/bands) — the same list
// the logging forms (new-contact, QuickLogCard) store — so every band an
// operator can log is also filterable here. The previous hard-coded lowercase
// list had drifted and silently omitted 2200M, 630M, 4M, 1.25M, 33CM and 13CM,
// making QSOs on those bands unsearchable. Matching is case-insensitive on the
// server (UPPER(band) = UPPER($n)), so the uppercase values match stored data.
const BANDS = AMATEUR_BANDS;

interface FilterChip {
  key: keyof SearchFilters;
  label: string;
  value: string;
  displayValue: string;
}

// Helper function to get active filters as chips
const getActiveFilterChips = (filters: SearchFilters, dxccEntities: DXCCEntity[]): FilterChip[] => {
  const chips: FilterChip[] = [];
  
  // Text-based filters
  if (filters.callsign.trim()) {
    chips.push({
      key: 'callsign',
      label: 'Callsign',
      value: filters.callsign,
      displayValue: filters.callsign
    });
  }
  
  if (filters.name.trim()) {
    chips.push({
      key: 'name',
      label: 'Name',
      value: filters.name,
      displayValue: filters.name
    });
  }
  
  if (filters.notes.trim()) {
    chips.push({
      key: 'notes',
      label: 'Notes',
      value: filters.notes,
      displayValue: filters.notes
    });
  }

  if (filters.qth.trim()) {
    chips.push({
      key: 'qth',
      label: 'QTH',
      value: filters.qth,
      displayValue: filters.qth
    });
  }
  
  if (filters.gridLocator.trim()) {
    chips.push({
      key: 'gridLocator',
      label: 'Grid',
      value: filters.gridLocator,
      displayValue: filters.gridLocator
    });
  }
  
  // Dropdown filters (exclude 'all' values)
  if (filters.mode !== 'all' && filters.mode.trim()) {
    chips.push({
      key: 'mode',
      label: 'Mode',
      value: filters.mode,
      displayValue: filters.mode
    });
  }
  
  if (filters.band !== 'all' && filters.band.trim()) {
    chips.push({
      key: 'band',
      label: 'Band',
      value: filters.band,
      displayValue: filters.band
    });
  }
  
  if (filters.qslStatus !== 'all' && filters.qslStatus.trim()) {
    const qslStatusLabels: Record<string, string> = {
      'confirmed': 'QSL Confirmed',
      'pending': 'QSL Pending',
      'not_confirmed': 'QSL Not Confirmed'
    };
    chips.push({
      key: 'qslStatus',
      label: 'QSL Status',
      value: filters.qslStatus,
      displayValue: qslStatusLabels[filters.qslStatus] || filters.qslStatus
    });
  }
  
  // DXCC filter
  if (filters.dxcc !== 'all' && filters.dxcc.trim()) {
    const dxccEntity = dxccEntities.find(entity => entity.adif.toString() === filters.dxcc);
    chips.push({
      key: 'dxcc',
      label: 'DXCC',
      value: filters.dxcc,
      displayValue: dxccEntity ? dxccEntity.name : filters.dxcc
    });
  }
  
  // Date filters
  if (filters.startDate.trim()) {
    chips.push({
      key: 'startDate',
      label: 'From',
      value: filters.startDate,
      displayValue: new Date(filters.startDate).toLocaleDateString()
    });
  }
  
  if (filters.endDate.trim()) {
    chips.push({
      key: 'endDate',
      label: 'To',
      value: filters.endDate,
      displayValue: new Date(filters.endDate).toLocaleDateString()
    });
  }
  
  // Quick filter
  if (filters.quickFilter.trim()) {
    const quickFilterLabels: Record<string, string> = {
      'today': 'Today',
      'week': 'This Week',
      'month': 'This Month',
      'year': 'This Year'
    };
    chips.push({
      key: 'quickFilter',
      label: 'Period',
      value: filters.quickFilter,
      displayValue: quickFilterLabels[filters.quickFilter] || filters.quickFilter
    });
  }
  
  return chips;
};

// FilterChips component to display active filters
const FilterChips = ({ chips, onRemoveFilter }: { 
  chips: FilterChip[], 
  onRemoveFilter: (key: keyof SearchFilters) => void 
}) => {
  if (chips.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {chips.map((chip) => (
        <Badge 
          key={chip.key} 
          variant="secondary" 
          className="flex items-center gap-1 pr-1 cursor-pointer hover:bg-secondary/80 border border-border"
          onClick={() => onRemoveFilter(chip.key)}
        >
          <span className="text-xs">
            <span className="font-medium">{chip.label}:</span> {chip.displayValue}
          </span>
          <X className="h-3 w-3 hover:bg-secondary-foreground/20 rounded-full p-0.5" />
        </Badge>
      ))}
    </div>
  );
};

export default function SearchPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [dxccEntities, setDxccEntities] = useState<DXCCEntity[]>([]);
  const [dxccLoading, setDxccLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'map'>('table');
  
  // QRZ sync state
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [syncingContacts, setSyncingContacts] = useState<Set<number>>(new Set());
  const [bulkSyncing, setBulkSyncing] = useState(false);
  
  const [filters, setFilters] = useState<SearchFilters>({
    callsign: '',
    name: '',
    qth: '',
    notes: '',
    mode: 'all',
    band: 'all',
    gridLocator: '',
    startDate: '',
    endDate: '',
    quickFilter: '',
    qslStatus: 'all',
    dxcc: 'all'
  });

  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  });

  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Fetch DXCC entities
  const fetchDxccEntities = useCallback(async () => {
    try {
      setDxccLoading(true);
      const response = await fetch('/api/dxcc');
      
      if (response.status === 401) {
        router.push('/login');
        return;
      }
      
      const data = await response.json();
      if (response.ok) {
        setDxccEntities(data.entities || []);
      } else {
        console.error('Failed to fetch DXCC entities:', data.error);
      }
    } catch (error) {
      console.error('Error fetching DXCC entities:', error);
    } finally {
      setDxccLoading(false);
    }
  }, [router]);

  const performSearch = useCallback(async (searchFilters: SearchFilters, page = 1) => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        ...Object.fromEntries(
          Object.entries(searchFilters).filter(([, value]) => value.trim() !== '')
        )
      });

      const response = await fetch(`/api/contacts/search?${params}`);

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
          pages: data.pagination.pages
        });
      } else {
        setError(data.error || 'Failed to search contacts');
      }
    } catch (error) {
      console.error('Search error:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, router]);

  // Debounced search function. Holds the timer in a ref so the callback's
  // identity stays stable across renders (otherwise React 19's compiler flags
  // it as un-memoizable because the state dep recreates it on every tick).
  const debouncedSearch = useCallback((searchFilters: SearchFilters, page = 1) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchFilters, page);
    }, 300);
  }, [performSearch]);

  // Load DXCC entities on mount
  useEffect(() => {
    fetchDxccEntities();
  }, [fetchDxccEntities]);

  // Handle URL parameters (e.g., from navbar search)
  useEffect(() => {
    const callsignParam = searchParams.get('callsign');
    if (callsignParam) {
      const newFilters = {
        ...filters,
        callsign: callsignParam
      };
      setFilters(newFilters);
      // Trigger search with the callsign
      debouncedSearch(newFilters, 1);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Convert DXCC entities to combobox options
  const dxccOptions = useMemo(() => {
    const options = dxccEntities.map((entity) => ({
      value: entity.adif.toString(),
      label: entity.name,
      secondary: entity.prefix
    }));

    // Add "All DXCC entities" option at the beginning
    return [
      { value: 'all', label: 'All DXCC entities', secondary: undefined },
      ...options
    ];
  }, [dxccEntities]);

  // Handle filter changes with debouncing
  const handleFilterChange = (key: keyof SearchFilters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    
    // Reset to page 1 when filters change
    debouncedSearch(newFilters, 1);
  };

  // Quick filter handlers
  const handleQuickFilter = (period: string) => {
    const now = new Date();
    let startDate = '';
    
    switch (period) {
      case 'today':
        startDate = now.toISOString().split('T')[0];
        break;
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDate = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDate = monthAgo.toISOString().split('T')[0];
        break;
      case 'year':
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        startDate = yearAgo.toISOString().split('T')[0];
        break;
      default:
        startDate = '';
    }
    
    const newFilters = { 
      ...filters, 
      quickFilter: period,
      startDate,
      endDate: period === 'today' ? startDate : ''
    };
    setFilters(newFilters);
    debouncedSearch(newFilters, 1);
  };

  // Clear all filters
  const clearAllFilters = () => {
    const emptyFilters: SearchFilters = {
      callsign: '',
      name: '',
      qth: '',
      notes: '',
      mode: 'all',
      band: 'all',
      gridLocator: '',
      startDate: '',
      endDate: '',
      quickFilter: '',
      qslStatus: 'all',
      dxcc: 'all'
    };
    setFilters(emptyFilters);
    setContacts([]);
    setPagination({ page: 1, limit: 20, total: 0, pages: 0 });
  };

  // Export search results
  const handleExport = async () => {
    try {
      setExportLoading(true);
      
      const params = new URLSearchParams({
        ...Object.fromEntries(
          Object.entries(filters).filter(([, value]) => value.trim() !== '')
        ),
        export: 'true'
      });

      const response = await fetch(`/api/contacts/search?${params}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition 
          ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
          : 'search-results.adi';
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to export search results');
      }
    } catch (error) {
      console.error('Export error:', error);
      setError('Export failed. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleContactClick = (contact: Contact) => {
    setSelectedContact(contact);
    setIsEditDialogOpen(true);
  };

  const handleContactSave = (updatedContact: Contact) => {
    setContacts(prevContacts => 
      prevContacts.map(contact => 
        contact.id === updatedContact.id ? updatedContact : contact
      )
    );
  };

  const handleContactDelete = (deletedContactId: number) => {
    setContacts(prevContacts => 
      prevContacts.filter(contact => contact.id !== deletedContactId)
    );
    // Update pagination total count
    setPagination(prev => ({
      ...prev,
      total: prev.total - 1
    }));
  };

  const handleDialogClose = () => {
    setIsEditDialogOpen(false);
    setSelectedContact(null);
  };

  // QRZ sync functions
  const handleContactSelection = (contactId: number, selected: boolean) => {
    const newSelected = new Set(selectedContacts);
    if (selected) {
      newSelected.add(contactId);
    } else {
      newSelected.delete(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedContacts(new Set(contacts.map(c => c.id)));
    } else {
      setSelectedContacts(new Set());
    }
  };

  const syncSingleContact = async (contactId: number) => {
    try {
      setSyncingContacts(prev => new Set(prev).add(contactId));
      
      const response = await fetch(`/api/contacts/${contactId}/qrz-sync`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        // Update the contact in the list with new sync status
        setContacts(prevContacts => 
          prevContacts.map(contact => 
            contact.id === contactId ? { ...contact, ...data.contact } : contact
          )
        );
      } else {
        setError(data.error || 'Failed to sync contact to QRZ');
      }
    } catch (error) {
      console.error('QRZ sync error:', error);
      setError('Failed to sync contact to QRZ');
    } finally {
      setSyncingContacts(prev => {
        const newSet = new Set(prev);
        newSet.delete(contactId);
        return newSet;
      });
    }
  };

  const syncSelectedContacts = async () => {
    if (selectedContacts.size === 0) return;
    
    try {
      setBulkSyncing(true);
      setError('');
      
      const response = await fetch('/api/contacts/qrz-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contactIds: Array.from(selectedContacts)
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Refresh the contacts; the sync indicators on each row reflect the
        // per-contact result. (No toast system yet; visual refresh is the feedback.)
        await performSearch(filters, pagination.page);
        setSelectedContacts(new Set());
      } else {
        setError(data.error || 'Failed to sync contacts to QRZ');
      }
    } catch (error) {
      console.error('Bulk QRZ sync error:', error);
      setError('Failed to sync contacts to QRZ');
    } finally {
      setBulkSyncing(false);
    }
  };

  const handlePageChange = (page: number) => {
    performSearch(filters, page);
  };

  const handlePageSizeChange = (limit: number) => {
    setPagination(prev => ({ ...prev, limit }));
    performSearch(filters, 1);
  };

  // Get active filter count for display
  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter(value => value.trim() !== '' && value !== 'all').length;
  }, [filters]);

  // Get active filter chips for display
  const activeFilterChips = useMemo(() => {
    return getActiveFilterChips(filters, dxccEntities);
  }, [filters, dxccEntities]);

  // Remove individual filter
  const removeFilter = (key: keyof SearchFilters) => {
    const newFilters = { ...filters };
    
    // Reset the specific filter to its default value
    switch (key) {
      case 'mode':
      case 'band':
      case 'qslStatus':
      case 'dxcc':
        newFilters[key] = 'all';
        break;
      case 'quickFilter':
        // When removing quick filter, also clear the auto-set date fields
        newFilters.quickFilter = '';
        if (filters.quickFilter === 'today') {
          newFilters.startDate = '';
          newFilters.endDate = '';
        } else if (filters.quickFilter) {
          newFilters.startDate = '';
        }
        break;
      default:
        newFilters[key] = '';
    }
    
    setFilters(newFilters);
    // Reset to page 1 when filters change
    debouncedSearch(newFilters, 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar 
        title="Search Contacts" 
        actions={
          <div className="flex items-center space-x-2">
            <Button variant="ghost" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
        }
      />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0 space-y-6">
          {/* Search Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-fg">Search Contacts</h1>
              <p className="text-fg-2">
                Find contacts using advanced filtering and search options
              </p>
            </div>
            {contacts.length > 0 && (
              <div className="flex items-center space-x-2">
                {selectedContacts.size > 0 && (
                  <>
                    <Button
                      onClick={syncSelectedContacts}
                      disabled={bulkSyncing}
                      variant="outline"
                      size="sm"
                    >
                      {bulkSyncing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Sync {selectedContacts.size} to QRZ
                    </Button>
                    <div className="text-sm text-fg-2">
                      {selectedContacts.size} contact{selectedContacts.size !== 1 ? 's' : ''} selected
                    </div>
                  </>
                )}
                <Button onClick={handleExport} disabled={exportLoading} variant="outline">
                  {exportLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Export Results
                </Button>
              </div>
            )}
          </div>

          {/* Search Filters */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CardTitle className="flex items-center">
                    <Search className="h-5 w-5 mr-2" />
                    Search Filters
                  </CardTitle>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary">{activeFilterCount} active</Badge>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    {showAdvancedFilters ? 'Hide' : 'Show'} Advanced
                  </Button>
                  {activeFilterCount > 0 && (
                    <Button variant="outline" size="sm" onClick={clearAllFilters}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>
                  )}
                </div>
              </div>
              {/* Active Filter Chips */}
              <FilterChips chips={activeFilterChips} onRemoveFilter={removeFilter} />
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Wrapping the filter fields in a <form> gives LastPass a form
                  context to bind to, so it respects data-lpignore on the
                  individual inputs and stops attaching its autofill icon.
                  Search is debounced on filter change, so the form has no
                  real submit action — Enter is suppressed via preventDefault. */}
              <form
                autoComplete="off"
                onSubmit={(e) => e.preventDefault()}
                className="space-y-6"
              >
              {/* Quick Filters */}
              <div className="space-y-2">
                <Label>Quick Filters</Label>
                <div className="flex flex-wrap gap-2">
                  {['today', 'week', 'month', 'year'].map(period => (
                    <Button
                      key={period}
                      variant={filters.quickFilter === period ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleQuickFilter(period)}
                    >
                      {period.charAt(0).toUpperCase() + period.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              <hr className="border-border" />

              {/* Basic Search Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="callsign">Callsign</Label>
                  <Input
                    id="callsign"
                    type="search"
                    placeholder="e.g., W1AW"
                    value={filters.callsign}
                    onChange={(e) => handleFilterChange('callsign', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="search"
                    placeholder="Operator name"
                    value={filters.name}
                    onChange={(e) => handleFilterChange('name', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qth">QTH</Label>
                  <Input
                    id="qth"
                    type="search"
                    placeholder="Location"
                    value={filters.qth}
                    onChange={(e) => handleFilterChange('qth', e.target.value)}
                  />
                </div>
              </div>

              {/* Mode and Band Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mode">Mode</Label>
                  <Select value={filters.mode} onValueChange={(value) => handleFilterChange('mode', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All modes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All modes</SelectItem>
                      {MODES.map(mode => (
                        <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="band">Band</Label>
                  <Select value={filters.band} onValueChange={(value) => handleFilterChange('band', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All bands" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All bands</SelectItem>
                      {BANDS.map(band => (
                        <SelectItem key={band} value={band}>{band}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Advanced Filters */}
              {showAdvancedFilters && (
                <>
                  <hr className="border-border" />
                  <div className="space-y-4">
                    <Label className="text-base font-medium">Advanced Filters</Label>

                    {/* Notes / Comments */}
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Input
                        id="notes"
                        placeholder="e.g., POTA K-1234, contest exchange, QSL note"
                        value={filters.notes}
                        onChange={(e) => handleFilterChange('notes', e.target.value)}
                      />
                    </div>

                    {/* Date Range */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startDate">Start Date</Label>
                        <Input
                          id="startDate"
                          type="date"
                          value={filters.startDate}
                          onChange={(e) => handleFilterChange('startDate', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="endDate">End Date</Label>
                        <Input
                          id="endDate"
                          type="date"
                          value={filters.endDate}
                          onChange={(e) => handleFilterChange('endDate', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Grid Locator and QSL Status */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="gridLocator">Grid Locator</Label>
                        <Input
                          id="gridLocator"
                          type="search"
                          placeholder="e.g., FN31pr"
                          value={filters.gridLocator}
                          onChange={(e) => handleFilterChange('gridLocator', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="qslStatus">QSL Status</Label>
                        <Select value={filters.qslStatus} onValueChange={(value) => handleFilterChange('qslStatus', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="All QSL status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All QSL status</SelectItem>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="not_confirmed">Not Confirmed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* DXCC Filter */}
                    <div className="space-y-2">
                      <Label htmlFor="dxcc">DXCC Entity</Label>
                      <Combobox
                        options={dxccOptions}
                        value={filters.dxcc}
                        onValueChange={(value) => handleFilterChange('dxcc', value)}
                        placeholder="Search DXCC entities..."
                        searchPlaceholder="Search countries, prefixes..."
                        emptyText="No DXCC entity found."
                        disabled={dxccLoading}
                      />
                      {dxccLoading && (
                        <div className="flex items-center space-x-2 text-sm text-fg-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Loading DXCC entities...</span>
                        </div>
                      )}
                      <p className="text-sm text-fg-2">
                        Filter contacts by DXCC entity (country/territory). Search by country name or prefix.
                      </p>
                    </div>
                  </div>
                </>
              )}
              </form>
            </CardContent>
          </Card>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Search Results */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Search Results</CardTitle>
                  <CardDescription>
                    {pagination.total > 0 
                      ? `Found ${pagination.total} contact${pagination.total === 1 ? '' : 's'}`
                      : 'No contacts found with current filters'
                    }
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  {/* View Mode Toggle */}
                  {contacts.length > 0 && (
                    <div className="flex items-center border rounded-md">
                      <Button
                        variant={viewMode === 'table' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('table')}
                        className="rounded-r-none"
                      >
                        <TableIcon className="h-4 w-4 mr-2" />
                        Table
                      </Button>
                      <Button
                        variant={viewMode === 'map' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('map')}
                        className="rounded-l-none"
                      >
                        <Map className="h-4 w-4 mr-2" />
                        Map
                      </Button>
                    </div>
                  )}
                  {loading && (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-fg-2">Searching...</span>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {pagination.total === 0 && !loading ? (
                <div className="text-center py-8">
                  <p className="text-fg-2">
                    {activeFilterCount === 0 
                      ? 'Enter search criteria above to find contacts.'
                      : 'No contacts match your search criteria. Try adjusting your filters.'
                    }
                  </p>
                </div>
              ) : viewMode === 'map' ? (
                <>
                  <div className="mb-4">
                    <DynamicContactMap 
                      contacts={contacts} 
                      user={user} 
                      height="500px"
                    />
                  </div>
                  <div className="text-sm text-fg-2">
                    <p>
                      🏠 Red markers show your QTH location • 📻 Blue markers show contact locations
                      {contacts.filter(c => (c.latitude && c.longitude) || c.grid_locator).length < contacts.length && (
                        <span className="block mt-1">
                          Note: Only contacts with location data (coordinates or grid locator) are displayed on the map.
                        </span>
                      )}
                    </p>
                  </div>
                  {pagination.pages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={pagination.page}
                        totalPages={pagination.pages}
                        pageSize={pagination.limit}
                        totalItems={pagination.total}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        pageSizeOptions={[10, 20, 50, 100]}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedContacts.size === contacts.length && contacts.length > 0}
                              onCheckedChange={handleSelectAll}
                              aria-label="Select all contacts"
                            />
                          </TableHead>
                          <TableHead>Callsign</TableHead>
                          <TableHead>Date/Time</TableHead>
                          <TableHead>Frequency</TableHead>
                          <TableHead>Mode</TableHead>
                          <TableHead>Band</TableHead>
                          <TableHead>RST</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>QTH</TableHead>
                          <TableHead>LoTW</TableHead>
                          <TableHead>QRZ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading && contacts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={11} className="text-center py-8">
                              <div className="flex items-center justify-center space-x-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Searching contacts...</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          contacts.map((contact) => (
                            <TableRow 
                              key={contact.id} 
                              className="hover:bg-muted/50 transition-colors"
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedContacts.has(contact.id)}
                                  onCheckedChange={(checked) => handleContactSelection(contact.id, checked as boolean)}
                                  aria-label={`Select contact ${contact.callsign}`}
                                />
                              </TableCell>
                              <TableCell 
                                className="font-medium cursor-pointer"
                                onClick={() => handleContactClick(contact)}
                              >
                                {contact.callsign}
                              </TableCell>
                              <TableCell onClick={() => handleContactClick(contact)} className="cursor-pointer">
                                {formatDate(contact.datetime)}
                              </TableCell>
                              <TableCell onClick={() => handleContactClick(contact)} className="cursor-pointer">
                                {contact.frequency} MHz
                              </TableCell>
                              <TableCell onClick={() => handleContactClick(contact)} className="cursor-pointer">
                                <Badge variant="secondary">{contact.mode}</Badge>
                              </TableCell>
                              <TableCell onClick={() => handleContactClick(contact)} className="cursor-pointer">
                                <Badge variant="outline">{contact.band}</Badge>
                              </TableCell>
                              <TableCell onClick={() => handleContactClick(contact)} className="cursor-pointer">
                                {contact.rst_sent}/{contact.rst_received}
                              </TableCell>
                              <TableCell onClick={() => handleContactClick(contact)} className="cursor-pointer">
                                {contact.name || '-'}
                              </TableCell>
                              <TableCell onClick={() => handleContactClick(contact)} className="cursor-pointer">
                                {contact.qth || '-'}
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <LotwSyncIndicator
                                  lotwQslSent={contact.lotw_qsl_sent}
                                  lotwQslRcvd={contact.lotw_qsl_rcvd}
                                  qslLotw={contact.qsl_lotw}
                                  qslLotwDate={contact.qsl_lotw_date}
                                  lotwMatchStatus={contact.lotw_match_status}
                                  contactId={contact.id}
                                  stationId={contact.station_id}
                                  onStatusChange={() => performSearch(filters, pagination.page)}
                                  size="sm"
                                />
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center space-x-1">
                                  <QRZSyncIndicator
                                    qrzQslSent={contact.qrz_qsl_sent}
                                    qrzQslSentDate={contact.qrz_qsl_sent_date}
                                    qrzQslRcvd={contact.qrz_qsl_rcvd}
                                    qrzQslRcvdDate={contact.qrz_qsl_rcvd_date}
                                    size="sm"
                                  />
                                  {contact.qrz_qsl_sent !== 'Y' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => syncSingleContact(contact.id)}
                                      disabled={syncingContacts.has(contact.id)}
                                      className="h-6 w-6 p-0"
                                    >
                                      {syncingContacts.has(contact.id) ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Upload className="h-3 w-3" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {pagination.pages > 1 && (
                    <Pagination
                      currentPage={pagination.page}
                      totalPages={pagination.pages}
                      pageSize={pagination.limit}
                      totalItems={pagination.total}
                      onPageChange={handlePageChange}
                      onPageSizeChange={handlePageSizeChange}
                      pageSizeOptions={[10, 20, 50, 100]}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
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