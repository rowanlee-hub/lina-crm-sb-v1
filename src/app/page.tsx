"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User, Users, Mail, Phone, MessageCircle, Tag as TagIcon, Clock,
  Calendar, Link as LinkIcon, CheckCircle2,
  Save, RefreshCw, Plus, Search, ChevronRight, ArrowLeft,
  Copy, Check, X, Filter, Loader2, AlertCircle, History,
  Send, Lock, Bell, Layout, List, Trash2, Megaphone, Pencil,
  Table2, Upload, GitMerge, UserPlus, Zap, Inbox
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import WorkflowBuilder from "@/components/WorkflowBuilder";

// ============================================================================
// BACKEND URLS
// ============================================================================
const INTERNAL_API_URL = "/api/line/send";
const CONTACTS_API = "/api/contacts"; 

const SECTION_ICONS = {
  inbox: MessageCircle,
  contacts: User,
  marketing: RefreshCw,
  settings: History
};

interface HistoryItem {
  id?: string;
  date?: string;
  action: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  lineId: string;
  tags: string[];
  status: string;
  webinar: {
    link: string;
    dateTime: string;
  };
  notes?: string;
  ghl_contact_id?: string;
  uid?: string;
  attended?: boolean;
  purchased?: boolean;
  follow_up_at?: string | null;
  follow_up_note?: string;
  history?: HistoryItem[];
}

const getAllUniqueTags = (contacts: Contact[]): string[] => {
  const tagsSet = new Set<string>();
  contacts.forEach(c => {
    if (c.tags) c.tags.forEach(t => tagsSet.add(t));
  });
  return Array.from(tagsSet).sort();
};

// Sheet row component — extracted for virtual scroll performance
const SheetRow = React.memo(function SheetRow({ contact, idx, editingCell, setEditingCell, cellDraft, setCellDraft, savingCell, saveCell, sheetCopied, setSheetCopied, onOpen }: {
  contact: Contact; idx: number;
  editingCell: { contactId: string; field: string } | null; setEditingCell: (v: { contactId: string; field: string } | null) => void;
  cellDraft: string; setCellDraft: (v: string) => void;
  savingCell: string | null; saveCell: (c: Contact, f: string, v: string) => void;
  sheetCopied: string | null; setSheetCopied: (v: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const STATUSES = ['Lead', 'Nurturing', 'Customer', 'Closed'];

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setSheetCopied(key);
    setTimeout(() => setSheetCopied(null), 1500);
  };

  const renderCell = (field: string, displayValue: string) => {
    const cellKey = `${contact.id}:${field}`;
    const isEditing = editingCell?.contactId === contact.id && editingCell?.field === field;
    const isSaving = savingCell === cellKey;
    const isCopied = sheetCopied === cellKey;

    if (isSaving) return <span className="text-slate-400 italic text-xs">Saving…</span>;
    if (isEditing) {
      if (field === 'status') {
        return (
          <select autoFocus value={cellDraft} onChange={e => setCellDraft(e.target.value)} onBlur={() => saveCell(contact, field, cellDraft)} className="w-full text-xs border border-blue-400 rounded px-1.5 py-1 outline-none bg-white">
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      }
      if (field === 'notes') {
        return <textarea autoFocus value={cellDraft} onChange={e => setCellDraft(e.target.value)} onBlur={() => saveCell(contact, field, cellDraft)} rows={3} className="w-full text-xs border border-blue-400 rounded px-1.5 py-1 outline-none resize-none bg-white" />;
      }
      return (
        <input autoFocus type="text" value={cellDraft} onChange={e => setCellDraft(e.target.value)} onBlur={() => saveCell(contact, field, cellDraft)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null); }}
          className="w-full text-xs border border-blue-400 rounded px-1.5 py-1 outline-none bg-white" />
      );
    }
    return (
      <div className="group/cell flex items-center gap-1 w-full min-h-[22px]">
        <span onClick={() => { setEditingCell({ contactId: contact.id, field }); setCellDraft(displayValue); }}
          className="flex-1 cursor-text hover:bg-blue-50 rounded px-1 py-0.5 truncate text-xs text-slate-700 min-w-0" title={displayValue || 'Click to edit'}>
          {displayValue || <span className="text-slate-300 italic">—</span>}
        </span>
        {displayValue && (
          <button onClick={(e) => { e.stopPropagation(); copyToClipboard(displayValue, cellKey); }}
            className={`shrink-0 p-0.5 rounded transition-all ${isCopied ? 'text-green-500' : 'text-slate-300 opacity-0 group-hover/cell:opacity-100 hover:text-blue-500'}`} title="Copy">
            {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        )}
      </div>
    );
  };

  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`} style={{ height: 37 }}>
      <td className="px-3 py-2 text-[10px] text-slate-400 font-mono">{idx + 1}</td>
      <td className="px-2 py-1.5 border-l border-slate-100 font-medium">{renderCell('name', contact.name)}</td>
      <td className="px-2 py-1.5 border-l border-slate-100">{renderCell('email', contact.email)}</td>
      <td className="px-2 py-1.5 border-l border-slate-100">{renderCell('phone', contact.phone)}</td>
      <td className="px-2 py-1.5 border-l border-slate-100">{renderCell('tags', (contact.tags || []).join(', '))}</td>
      <td className="px-2 py-1.5 border-l border-slate-100">
        {editingCell?.contactId === contact.id && editingCell?.field === 'status' ? renderCell('status', contact.status) : (
          <span onClick={() => { setEditingCell({ contactId: contact.id, field: 'status' }); setCellDraft(contact.status || 'Lead'); }}
            className={`inline-block cursor-pointer px-2 py-0.5 rounded-full text-[10px] font-bold ${
              contact.status === 'Customer' ? 'bg-emerald-100 text-emerald-700' :
              contact.status === 'Closed' ? 'bg-slate-200 text-slate-500' :
              contact.status === 'Nurturing' ? 'bg-blue-100 text-blue-700' :
              'bg-amber-100 text-amber-700'
            }`}>
            {contact.status || 'Lead'}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 border-l border-slate-100 max-w-[200px]">{renderCell('webinarLink', contact.webinar?.link || '')}</td>
      <td className="px-2 py-1.5 border-l border-slate-100 max-w-[220px]">{renderCell('notes', contact.notes || '')}</td>
      <td className="px-2 py-1.5 border-l border-slate-100">
        <div className="group/cell flex items-center gap-1">
          <span className="text-xs text-slate-400 font-mono truncate">{contact.lineId ? `${contact.lineId.substring(0, 12)}…` : <span className="text-slate-200 italic">—</span>}</span>
          {contact.lineId && (
            <button onClick={() => copyToClipboard(contact.lineId, `${contact.id}:lineId`)}
              className={`shrink-0 p-0.5 rounded transition-all ${sheetCopied === `${contact.id}:lineId` ? 'text-green-500' : 'text-slate-300 opacity-0 group-hover/cell:opacity-100 hover:text-blue-500'}`} title="Copy LINE ID">
              {sheetCopied === `${contact.id}:lineId` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 border-l border-slate-100">
        <button onClick={() => onOpen(contact.id)} className="text-[10px] text-blue-500 hover:text-blue-700 font-bold" title="Open detail">
          <ChevronRight className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
});

function CRMDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"contacts" | "inbox" | "marketing" | "link">("contacts");
  const [view, setView] = useState<"list" | "detail" | "add">("list");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [activeWebinarDate, setActiveWebinarDate] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [isDeduping, setIsDeduping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pagination state
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const PAGE_SIZE = 100;

  // API States
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Filtering state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [lineOnlyFilter, setLineOnlyFilter] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterLine, setFilterLine] = useState<'any' | 'linked' | 'unlinked' | 'none'>('any');
  const [filterAttended, setFilterAttended] = useState<'any' | 'yes' | 'no'>('any');
  const [filterPurchased, setFilterPurchased] = useState<'any' | 'yes' | 'no'>('any');
  const [filterWebinar, setFilterWebinar] = useState<'any' | 'upcoming' | 'past' | 'none'>('any');
  const [sheetMode, setSheetMode] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('lina_inbox_seen') || '{}'); } catch { return {}; }
  });
  const [editingCell, setEditingCell] = useState<{ contactId: string; field: string } | null>(null);
  const [cellDraft, setCellDraft] = useState('');
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [sheetCopied, setSheetCopied] = useState<string | null>(null);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const [sheetScrollTop, setSheetScrollTop] = useState(0);

  // Fetch contacts on mount + real-time subscriptions
  useEffect(() => {
    fetchContacts(1);
    fetch('/api/settings?key=active_webinar_date').then(r => r.json()).then(d => { if (d.value) setActiveWebinarDate(d.value); }).catch(() => {});

    // Real-time: watch contacts table for changes — update in-place instead of full refetch
    const contactChannel = supabase
      .channel('contacts_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, (payload) => {
        const n = payload.new as any;
        const newContact: Contact = {
          id: n.id, name: n.name || '', email: n.email || '', phone: n.phone || '',
          lineId: n.line_id || '', tags: n.tags || [], status: n.status || 'Lead',
          webinar: { link: n.webinar_link || '', dateTime: n.webinar_date || '' },
          notes: n.notes || '', ghl_contact_id: n.ghl_contact_id || '', uid: n.uid || '',
          attended: n.attended || false, purchased: n.purchased || false,
          follow_up_note: n.follow_up_note || '', history: [],
        };
        setContacts(prev => {
          if (prev.some(c => c.id === n.id)) return prev;
          return [newContact, ...prev];
        });
        setContactsTotal(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts' }, (payload) => {
        const n = payload.new as any;
        setContacts(prev => prev.map(c => {
          if (c.id !== n.id) return c;
          return {
            ...c, name: n.name || '', email: n.email || '', phone: n.phone || '',
            lineId: n.line_id || '', tags: n.tags || [], status: n.status || 'Lead',
            webinar: { link: n.webinar_link || '', dateTime: n.webinar_date || '' },
            notes: n.notes || '', ghl_contact_id: n.ghl_contact_id || '', uid: n.uid || '',
            attended: n.attended || false, purchased: n.purchased || false,
            follow_up_note: n.follow_up_note || '',
          };
        }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contacts' }, (payload) => {
        setContacts(prev => prev.filter(c => c.id !== payload.old.id));
        setContactsTotal(prev => Math.max(0, prev - 1));
      })
      .subscribe();

    // Real-time: watch contact_history for new events
    const historyChannel = supabase
      .channel('history_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_history' }, (payload) => {
        const newEntry = payload.new as any;
        setContacts(prev => prev.map(c => {
          if (c.id !== newEntry.contact_id) return c;
          const newHistItem: HistoryItem = { id: newEntry.id, date: newEntry.created_at, action: newEntry.action };
          return { ...c, history: [newHistItem, ...(c.history || [])] };
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(contactChannel);
      supabase.removeChannel(historyChannel);
    };
  }, []);

  const fetchContacts = async (page: number, append = false) => {
    if (page === 1) setIsLoading(true);
    else setIsLoadingMore(true);
    setFetchError("");
    try {
      const response = await fetch(`${CONTACTS_API}?page=${page}&limit=${PAGE_SIZE}`, { cache: 'no-store' });
      if (!response.ok) throw new Error("Failed to fetch data from Supabase backend");

      const result = await response.json();
      const data: Contact[] = result.data;
      setContactsTotal(result.total);
      setContactsPage(page);
      if (append) {
        setContacts(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const newOnes = data.filter(c => !existingIds.has(c.id));
          return [...prev, ...newOnes];
        });
      } else {
        setContacts(data);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setFetchError("Failed to load contacts from the database. Please check your Supabase connection.");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadMoreContacts = () => {
    if (contacts.length < contactsTotal && !isLoadingMore) {
      fetchContacts(contactsPage + 1, true);
    }
  };

  // Search: query the DB instead of filtering loaded contacts
  const [isSearching, setIsSearching] = useState(false);
  useEffect(() => {
    if (!searchQuery) {
      // Restore normal paginated list when search is cleared
      fetchContacts(1);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${CONTACTS_API}?search=${encodeURIComponent(searchQuery)}&limit=200`);
        const result = await res.json();
        setContacts(result.data || []);
        setContactsTotal(result.total || 0);
        setContactsPage(1);
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setIsSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleDedup = async () => {
    setIsDeduping(true);
    try {
      const res = await fetch('/api/contacts/deduplicate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchContacts(1);
      } else {
        alert(`Dedup failed: ${data.error}`);
      }
    } catch {
      alert('Dedup request failed');
    }
    setIsDeduping(false);
  };

  const saveCell = async (contact: Contact, field: string, value: string) => {
    const key = `${contact.id}:${field}`;
    setSavingCell(key);
    let updatedContact: Contact;
    if (field === 'tags') {
      const tags = value.split(',').map((t: string) => t.trim()).filter(Boolean);
      updatedContact = { ...contact, tags };
    } else if (field === 'notes') {
      updatedContact = { ...contact, notes: value };
    } else if (field === 'webinarLink') {
      updatedContact = { ...contact, webinar: { ...contact.webinar, link: value } };
    } else {
      updatedContact = { ...contact, [field]: value };
    }
    try {
      const resp = await fetch(CONTACTS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedContact),
      });
      const result = await resp.json();
      if (result.success) {
        setContacts(prev => prev.map(c => c.id === contact.id ? updatedContact : c));
      }
    } finally {
      setSavingCell(null);
      setEditingCell(null);
    }
  };

  const uniqueTags = ["All", ...getAllUniqueTags(contacts)];

  const activeFilterCount = [
    filterStatus.length > 0,
    filterLine !== 'any',
    filterAttended !== 'any',
    filterPurchased !== 'any',
    filterWebinar !== 'any',
    lineOnlyFilter,
    filterTags.length > 0,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilterStatus([]);
    setFilterLine('any');
    setFilterAttended('any');
    setFilterPurchased('any');
    setFilterWebinar('any');
    setLineOnlyFilter(false);
    setFilterTags([]);
    setSearchQuery('');
  };

  // Apply filters
  const filteredContacts = contacts.filter(contact => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      contact.name?.toLowerCase().includes(q) ||
      contact.email?.toLowerCase().includes(q) ||
      contact.phone?.toLowerCase().includes(q) ||
      contact.lineId?.toLowerCase().includes(q) ||
      contact.tags?.some(t => t.toLowerCase().includes(q));

    const matchesTag = filterTags.length === 0 || filterTags.some(t => contact.tags?.includes(t));
    const matchesLineOnly = !lineOnlyFilter || (contact.lineId && !contact.email && !contact.ghl_contact_id);

    const matchesStatus = filterStatus.length === 0 || filterStatus.includes(contact.status || 'Lead');

    const matchesLine =
      filterLine === 'any' ? true :
      filterLine === 'linked' ? (!!contact.lineId && !!(contact.email || contact.ghl_contact_id)) :
      filterLine === 'unlinked' ? (!!contact.lineId && !contact.email && !contact.ghl_contact_id) :
      !contact.lineId;

    const matchesAttended =
      filterAttended === 'any' ? true :
      filterAttended === 'yes' ? !!contact.attended :
      !contact.attended;

    const matchesPurchased =
      filterPurchased === 'any' ? true :
      filterPurchased === 'yes' ? !!contact.purchased :
      !contact.purchased;

    const contactWebinarDate = contact.webinar?.dateTime?.substring(0, 10);
    const activeDate = activeWebinarDate?.substring(0, 10);
    const matchesWebinar =
      filterWebinar === 'any' ? true :
      filterWebinar === 'upcoming' ? (!!contactWebinarDate && contactWebinarDate === activeDate) :
      filterWebinar === 'past' ? (!!contactWebinarDate && contactWebinarDate !== activeDate) :
      !contactWebinarDate;

    return matchesSearch && matchesTag && matchesLineOnly && matchesStatus && matchesLine && matchesAttended && matchesPurchased && matchesWebinar;
  });

  // Deep-link: restore full app state from URL on load/navigation
  useEffect(() => {
    const tabParam = searchParams.get('tab') as "contacts" | "inbox" | "marketing" | "link" | null;
    const idParam = searchParams.get('id');

    if (tabParam) setActiveTab(tabParam);

    if (idParam && contacts.length > 0) {
      const match = contacts.find(c => c.id === idParam);
      if (match) {
        setSelectedContactId(idParam);
        setView("detail");
      }
    }
  }, [searchParams, contacts]);

  const handleContactClick = (id: string) => {
    setSelectedContactId(id);
    setView("detail");
    router.push(`/?tab=${activeTab}&id=${id}`);
    // Mark as seen for inbox unread tracking
    const updated = { ...lastSeenAt, [id]: new Date().toISOString() };
    setLastSeenAt(updated);
    try { localStorage.setItem('lina_inbox_seen', JSON.stringify(updated)); } catch {}
  };

  const goToInbox = (id: string) => {
    setSelectedContactId(id);
    setActiveTab('inbox');
    router.push(`/?tab=inbox&id=${id}`);
    const updated = { ...lastSeenAt, [id]: new Date().toISOString() };
    setLastSeenAt(updated);
    try { localStorage.setItem('lina_inbox_seen', JSON.stringify(updated)); } catch {}
  };

  const handleBackToList = () => {
    setView("list");
    setSelectedContactId(null);
    router.push('/?tab=contacts');
  };

  const handleAddClick = () => {
    setSelectedContactId(null);
    setView("add");
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const parsedContacts = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj: any = {};
        headers.forEach((h, i) => {
          if (h === 'link' || h === 'datetime') {
            if (!obj.webinar) obj.webinar = {};
            obj.webinar[h] = values[i];
          } else {
            obj[h] = values[i];
          }
        });
        return obj;
      });

      try {
        const res = await fetch('/api/contacts/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: parsedContacts })
        });
        const data = await res.json();
        if (data.success) {
          alert(`Import successful: ${data.results.updated} updated, ${data.results.created} created.`);
          fetchContacts(1);
        } else {
          alert(`Import failed: ${data.error}`);
        }
      } catch (err) {
        console.error(err);
        alert('Import error.');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const isNew = view === "add";
  const activeContact: Contact = isNew
    ? {
        id: "",
        name: "",
        email: "",
        phone: "",
        lineId: "",
        tags: [],
        status: "Lead",
        webinar: { link: "", dateTime: "" },
        notes: "",
        ghl_contact_id: "",
        attended: false,
        purchased: false,
        history: []
      }
    : (contacts.find(c => c.id === selectedContactId) || {
        id: "",
        name: "",
        email: "",
        phone: "",
        lineId: "",
        tags: [],
        status: "Lead",
        webinar: { link: "", dateTime: "" },
        notes: "",
        ghl_contact_id: "",
        attended: false,
        purchased: false,
        history: []
      });

  // Render Main Layout
  // Helper for rendering icons
  const SectionIcon = ({ type, className }: { type: keyof typeof SECTION_ICONS, className?: string }) => {
    const Icon = SECTION_ICONS[type];
    return <Icon className={className} />;
  };

  // Render Main Layout (GHL 3-Pane Style)
  return (
    <div className="h-screen w-full bg-slate-50 flex overflow-hidden font-sans text-slate-800">
      
      {/* PANE 0: Left Navigation Sidebar */}
      <aside className="w-[80px] bg-[#1e2330] flex flex-col items-center py-5 shrink-0 border-r border-slate-700/30 z-40">
        {/* Logo */}
        <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 cursor-pointer transition-transform mb-6">
          <span className="text-white font-black text-lg tracking-tight">Lina</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col items-center gap-1 w-full px-2">
          {[
            { tab: 'contacts' as const,  Icon: Users,          label: 'Contacts',   path: '/?tab=contacts'  },
            { tab: 'inbox' as const,     Icon: Inbox,          label: 'Inbox',      path: '/?tab=inbox'     },
            { tab: 'marketing' as const, Icon: Zap,            label: 'Automation', path: '/?tab=marketing' },
            { tab: 'link' as const,      Icon: GitMerge,       label: 'Link IDs',   path: '/?tab=link'      },
          ].map(({ tab, Icon, label, path }) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setView('list'); router.push(path); }}
              className={`w-full flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all ${
                activeTab === tab
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wider leading-none">{label}</span>
            </button>
          ))}
        </nav>

        {/* Profile */}
        <div className="flex flex-col items-center gap-1 mt-2">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 transition-colors cursor-pointer">
            <User className="w-4 h-4" />
          </div>
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">You</span>
        </div>
      </aside>

      {/* PANE 1: Master List Pane (Middle-Left) */}
      {activeTab !== 'marketing' && activeTab !== 'link' && (
        <main className={`w-full max-w-[360px] bg-white border-r border-slate-200 flex flex-col shrink-0 z-30 shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)] relative overflow-hidden ${sheetMode && activeTab === 'contacts' ? 'hidden' : ''}`}>
          <div className="border-b border-slate-100 flex flex-col bg-white/50 backdrop-blur-sm sticky top-0 z-20">
            {/* Title + count */}
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {activeTab === 'inbox' ? 'Conversations' : 'Contacts'}
                </h1>
                {activeTab === 'contacts' && !isLoading && (
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {filteredContacts.length !== contacts.length
                      ? <><span className="text-blue-600 font-bold">{filteredContacts.length}</span> of {contacts.length}</>
                      : <span className="font-bold">{contacts.length}</span>}
                    {contactsTotal > contacts.length && <> / {contactsTotal}</>} contacts
                  </p>
                )}
              </div>
            </div>

            {/* Action toolbar */}
            {activeTab === 'contacts' && (
              <div className="px-3 pb-3 flex items-center gap-1.5">
                {/* Add Contact */}
                <button
                  onClick={handleAddClick}
                  className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="text-[9px] font-bold uppercase tracking-wide">Add</span>
                </button>

                {/* Import CSV */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="text-[9px] font-bold uppercase tracking-wide">Import</span>
                </button>

                {/* Merge Duplicates */}
                <button
                  onClick={handleDedup}
                  disabled={isDeduping}
                  className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-orange-100 hover:text-orange-600 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isDeduping ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                  <span className="text-[9px] font-bold uppercase tracking-wide">Merge Dupes</span>
                </button>

                {/* Sheet View */}
                <button
                  onClick={() => setSheetMode(m => !m)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl active:scale-95 transition-all ${sheetMode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600'}`}
                >
                  <Table2 className="w-4 h-4" />
                  <span className="text-[9px] font-bold uppercase tracking-wide">Sheet</span>
                </button>

                <input ref={fileInputRef} type="file" onChange={handleCsvImport} accept=".csv" className="hidden" />
              </div>
            )}

            {/* Search */}
            <div className="px-3 pb-3 relative group">
              <Search className="absolute left-6 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-100/80 border border-transparent focus:bg-white focus:border-blue-200 focus:ring-4 focus:ring-blue-500/5 rounded-xl text-sm outline-none transition-all placeholder:text-slate-400"
                placeholder={`Search ${activeTab}...`}
              />
            </div>
            {activeTab === 'contacts' && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFilterDrawer(true)}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 rounded-lg border transition-all ${activeFilterCount > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  <Filter className="w-3 h-3" />
                  Filters {activeFilterCount > 0 && <span className="bg-white/25 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full ml-0.5">{activeFilterCount}</span>}
                </button>
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="px-2.5 py-1.5 text-xs font-bold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-all">
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 space-y-3 opacity-50">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Syncing CRM...</p>
              </div>
            ) : (
              (activeTab === 'inbox'
                ? contacts.filter(c => c.lineId).sort((a, b) => {
                    const aDate = a.history?.[0]?.date ?? a.id;
                    const bDate = b.history?.[0]?.date ?? b.id;
                    return aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
                  })
                : filteredContacts
              ).map(contact => {
                const lastMsg = contact.history?.[0];
                const lastSeen = lastSeenAt[contact.id];
                const hasUnread = activeTab === 'inbox' && lastMsg?.date &&
                  lastMsg.action.startsWith('Received:') &&
                  (!lastSeen || new Date(lastMsg.date) > new Date(lastSeen)) &&
                  selectedContactId !== contact.id;
                return (
                <button
                  key={contact.id}
                  onClick={() => handleContactClick(contact.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all border group relative ${selectedContactId === contact.id ? 'bg-blue-50/80 border-blue-200 shadow-sm' : hasUnread ? 'bg-emerald-50/60 border-emerald-100' : 'bg-transparent border-transparent hover:bg-slate-50'}`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative shrink-0">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${selectedContactId === contact.id ? 'bg-blue-600 text-white scale-105' : 'bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600'}`}>
                        {contact.name ? contact.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                      </div>
                      {hasUnread && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <p className={`text-sm truncate ${selectedContactId === contact.id ? 'text-blue-700 font-bold' : hasUnread ? 'text-slate-900 font-extrabold' : 'text-slate-900 font-bold'}`}>
                          {contact.name || "Unnamed"}
                        </p>
                        {lastMsg?.date && (
                          <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">
                            {new Date(lastMsg.date).toLocaleDateString([], {month:'short', day:'numeric'})}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <p className={`text-xs truncate font-medium flex-1 ${hasUnread ? 'text-slate-800' : 'text-slate-500'}`}>
                          {activeTab === 'inbox'
                            ? (lastMsg?.action?.startsWith('Received:') ? lastMsg.action.replace('Received: ', '') : lastMsg?.action?.replace('Chat: ', 'You: ') || 'No messages')
                            : (contact.email || contact.lineId || 'No info')}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {activeTab === 'inbox' ? null : <>
                            {contact.lineId && (
                              (contact.email || contact.ghl_contact_id)
                                ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">LINKED</span>
                                : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">LINE ONLY</span>
                            )}
                            {contact.webinar?.dateTime && activeWebinarDate && (
                              contact.webinar.dateTime.substring(0, 10) === activeWebinarDate.substring(0, 10)
                                ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">UPCOMING</span>
                                : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500">PAST</span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); if (contact.lineId) goToInbox(contact.id); }}
                              title={contact.lineId ? 'Open LINE chat' : 'No LINE ID'}
                              className={`opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 p-1 rounded-full ${contact.lineId ? 'text-[#06c755] hover:bg-emerald-50' : 'text-slate-300 cursor-not-allowed'}`}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          </>}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )}))
            }
            {/* Load More button */}
            {activeTab === 'contacts' && !isLoading && contacts.length < contactsTotal && (
              <button
                onClick={loadMoreContacts}
                disabled={isLoadingMore}
                className="w-full py-3 mt-2 rounded-xl text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isLoadingMore ? 'Loading...' : `Load More (${contacts.length} of ${contactsTotal})`}
              </button>
            )}
          </div>

          {/* ── FILTER DRAWER (scoped inside PANE 1) ─────────────────── */}
          {showFilterDrawer && (
            <div className="absolute inset-0 bg-black/20 z-40" onClick={() => setShowFilterDrawer(false)} />
          )}
          <div className={`absolute inset-y-0 left-0 w-full bg-white z-50 flex flex-col transition-transform duration-300 ease-in-out ${showFilterDrawer ? 'translate-x-0' : '-translate-x-full'}`}>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="font-extrabold text-slate-900 text-base">Filters</h2>
                {activeFilterCount > 0 && <p className="text-[10px] text-blue-600 font-bold">{activeFilterCount} active filter{activeFilterCount > 1 ? 's' : ''}</p>}
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="text-xs text-red-500 font-bold hover:text-red-700 transition-colors">Clear all</button>
                )}
                <button onClick={() => setShowFilterDrawer(false)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
              {/* Status */}
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px] mb-2">Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Lead', 'Nurturing', 'Customer', 'Closed'].map(s => (
                    <button key={s}
                      onClick={() => setFilterStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${filterStatus.includes(s) ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'}`}
                    >{s}</button>
                  ))}
                </div>
              </div>
              {/* LINE Status */}
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px] mb-2">LINE Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {[['any','Any'],['linked','Linked'],['unlinked','LINE Only'],['none','No LINE']].map(([v, l]) => (
                    <button key={v}
                      onClick={() => setFilterLine(v as typeof filterLine)}
                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${filterLine === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'}`}
                    >{l}</button>
                  ))}
                </div>
              </div>
              {/* Webinar */}
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px] mb-2">Webinar</p>
                <div className="flex flex-wrap gap-1.5">
                  {[['any','Any'],['upcoming','Upcoming'],['past','Past'],['none','None']].map(([v, l]) => (
                    <button key={v}
                      onClick={() => setFilterWebinar(v as typeof filterWebinar)}
                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${filterWebinar === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'}`}
                    >{l}</button>
                  ))}
                </div>
              </div>
              {/* Attended */}
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px] mb-2">Attended</p>
                <div className="flex gap-1.5">
                  {[['any','Any'],['yes','Yes'],['no','No']].map(([v, l]) => (
                    <button key={v}
                      onClick={() => setFilterAttended(v as typeof filterAttended)}
                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${filterAttended === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'}`}
                    >{l}</button>
                  ))}
                </div>
              </div>
              {/* Purchased */}
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px] mb-2">Purchased</p>
                <div className="flex gap-1.5">
                  {[['any','Any'],['yes','Yes'],['no','No']].map(([v, l]) => (
                    <button key={v}
                      onClick={() => setFilterPurchased(v as typeof filterPurchased)}
                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${filterPurchased === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'}`}
                    >{l}</button>
                  ))}
                </div>
              </div>
              {/* Tags — multi-select */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Tags</p>
                  {filterTags.length > 0 && (
                    <button onClick={() => setFilterTags([])} className="text-[10px] text-red-400 font-bold hover:text-red-600">Clear</button>
                  )}
                </div>
                {filterTags.length > 0 && (
                  <p className="text-[10px] text-slate-400 mb-2">Contacts with <span className="font-bold text-blue-600">any</span> selected tag</p>
                )}
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {getAllUniqueTags(contacts).map(tag => (
                    <button key={tag}
                      onClick={() => setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${filterTags.includes(tag) ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'}`}
                    >{tag}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer footer */}
            <div className="px-5 py-4 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setShowFilterDrawer(false)}
                className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
              >
                Show {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>

        </main>
      )}

      {/* PANE 2 & 3: Active Workspace (Flexible) */}
      <section className="flex-1 bg-white flex flex-col overflow-hidden relative">
        {activeTab === 'contacts' && sheetMode ? (
          /* ── SHEET VIEW ──────────────────────────────────────────── */
          <div className="flex flex-col h-full">
            {/* Sheet toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={() => setSheetMode(false)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all" title="Back to list view">
                  <List className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-slate-700">Sheet View — {filteredContacts.length}{contactsTotal > contacts.length ? ` / ${contactsTotal}` : ''} contacts</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative group">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search…" className="pl-8 pr-3 py-1.5 text-xs bg-slate-100 border border-transparent focus:bg-white focus:border-blue-200 rounded-lg outline-none" />
                </div>
                <button
                  onClick={() => setShowFilterDrawer(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${activeFilterCount > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'}`}
                >
                  <Filter className="w-3 h-3" />
                  Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
                </button>
              </div>
            </div>

            {/* Sheet table — virtualized */}
            <div className="flex-1 overflow-auto" ref={sheetScrollRef} onScroll={() => {
              if (sheetScrollRef.current) {
                const st = sheetScrollRef.current.scrollTop;
                if (Math.abs(st - sheetScrollTop) > 10) setSheetScrollTop(st);
              }
            }}>
              <table className="w-full text-sm border-collapse min-w-[1300px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                    {[
                      { key: 'name',         label: 'Name',         w: '160px' },
                      { key: 'email',        label: 'Email',        w: '200px' },
                      { key: 'phone',        label: 'Phone',        w: '140px' },
                      { key: 'tags',         label: 'Tags',         w: '220px' },
                      { key: 'status',       label: 'Status',       w: '110px' },
                      { key: 'webinarLink',  label: 'Webinar Link', w: '200px' },
                      { key: 'notes',        label: 'Notes',        w: '220px' },
                      { key: 'lineId',       label: 'LINE ID',      w: '150px' },
                    ].map(col => (
                      <th key={col.key} style={{ minWidth: col.w }} className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider border-l border-slate-100">{col.label}</th>
                    ))}
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider border-l border-slate-100 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Virtual scroll spacer — top */}
                  {(() => {
                    const ROW_H = 37;
                    const BUFFER = 20;
                    const containerH = sheetScrollRef.current?.clientHeight || 800;
                    const startIdx = Math.max(0, Math.floor(sheetScrollTop / ROW_H) - BUFFER);
                    const visibleCount = Math.ceil(containerH / ROW_H) + BUFFER * 2;
                    const endIdx = Math.min(filteredContacts.length, startIdx + visibleCount);
                    const topPad = startIdx * ROW_H;
                    const bottomPad = Math.max(0, (filteredContacts.length - endIdx) * ROW_H);
                    const visibleSlice = filteredContacts.slice(startIdx, endIdx);
                    return (
                      <>
                        {topPad > 0 && <tr style={{ height: topPad }}><td colSpan={10} /></tr>}
                        {visibleSlice.map((contact, i) => {
                          const idx = startIdx + i;
                          return (<SheetRow key={contact.id} contact={contact} idx={idx} editingCell={editingCell} setEditingCell={setEditingCell} cellDraft={cellDraft} setCellDraft={setCellDraft} savingCell={savingCell} saveCell={saveCell} sheetCopied={sheetCopied} setSheetCopied={setSheetCopied} onOpen={handleContactClick} />);
                        })}
                        {bottomPad > 0 && <tr style={{ height: bottomPad }}><td colSpan={10} /></tr>}
                      </>
                    );
                  })()}
                </tbody>
              </table>
              {/* Load More in sheet view */}
              {contacts.length < contactsTotal && (
                <div className="flex justify-center py-4">
                  <button
                    onClick={loadMoreContacts}
                    disabled={isLoadingMore}
                    className="px-6 py-2 rounded-lg text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isLoadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {isLoadingMore ? 'Loading...' : `Load More (${contacts.length} of ${contactsTotal})`}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'link' ? (
          <LineMatchView />
        ) : activeTab === 'marketing' ? (
          <AutomationsView initialSub={searchParams.get('sub') ?? undefined} />
        ) : !selectedContactId && view === 'list' ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white space-y-6">
             <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200 animate-pulse">
                <SectionIcon type={activeTab} className="w-10 h-10 text-slate-300" />
             </div>
             <div>
                <h3 className="text-xl font-bold text-slate-900">No {activeTab === 'inbox' ? 'Conversation' : 'Contact'} Selected</h3>
                <p className="text-slate-500 mt-2 max-w-xs mx-auto text-sm leading-relaxed">Select someone from the list on the left to view details and start chatting.</p>
             </div>
             <button onClick={handleAddClick} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>Add New Contact</span>
             </button>
          </div>
        ) : (
          <div className="flex-1 w-full h-full">
            {activeTab === 'inbox' && selectedContactId ? (
               <ConversationsView 
                 contacts={contacts}
                 selectedId={selectedContactId}
                 onUpdateContact={(updatedContact: Contact) => {
                   setContacts(prev => prev.map(c => c.id === updatedContact.id ? updatedContact : c));
                 }}
               />
            ) : (
               <ContactDetailView
                 contactData={activeContact}
                 onBack={() => setView('list')}
                 isNew={isNew}
                 allContacts={contacts}
                 onSwitchContact={handleContactClick}
                 onGoToInbox={goToInbox}
                 onSaveSuccess={(updatedContact: Contact) => {
                   // Use functional update to always read latest state (avoids stale closure duplicates)
                   setContacts(prev => {
                     const existsIndex = prev.findIndex(c => c.id === updatedContact.id);
                     if (existsIndex > -1) {
                       const next = [...prev];
                       next[existsIndex] = updatedContact;
                       return next;
                     }
                     return [updatedContact, ...prev];
                   });
                   setSelectedContactId(updatedContact.id);
                   setView("detail");
                 }}
               />
            )}
          </div>
        )}
      </section>

    </div>
  );
}

// ----------------------------------------------------------------------------
// Single Contact Detail View Component
// ----------------------------------------------------------------------------
interface ContactDetailViewProps {
  onGoToInbox?: (id: string) => void;
  contactData: Contact;
  onBack: () => void;
  onSaveSuccess: (updatedContact: Contact) => void;
  isNew: boolean;
  allContacts: Contact[];
  onSwitchContact: (id: string) => void;
}

function ContactDetailView({ contactData, onBack, onSaveSuccess, isNew, allContacts, onSwitchContact, onGoToInbox }: ContactDetailViewProps) {
  const makeSafe = (d: Contact): Contact => ({
    ...d,
    tags: d.tags || [],
    webinar: d.webinar || { link: "", dateTime: "" },
    status: d.status || "Lead",
    history: d.history || []
  });
  const originalDataRef = useRef<Contact>(makeSafe(contactData));
  const [contact, setContact] = useState<Contact>(makeSafe(contactData));
  const [newTag, setNewTag] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Array<{name: string; colour: string}>>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(isNew);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [copiedField, setCopiedField] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // LINE Messaging States
  const [lineMessageText, setLineMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<{ type: string; text: string }>({ type: "", text: "" });
  const [wbEnrollment, setWbEnrollment] = useState<any>(null);
  const [wbMessages, setWbMessages] = useState<any[]>([]);
  const [webinarDateOptions, setWebinarDateOptions] = useState<{ label: string; value: string }[]>([]);

  // Automation management states
  const [wfEnrollments, setWfEnrollments] = useState<any[]>([]);
  const [allWorkflows, setAllWorkflows] = useState<any[]>([]);
  const [wfEnrolling, setWfEnrolling] = useState(false);
  const [wfRemoving, setWfRemoving] = useState<string | null>(null);
  const [wbRemoving, setWbRemoving] = useState(false);

  // Load tag definitions for autocomplete
  useEffect(() => {
    fetch('/api/tags').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setTagSuggestions(data);
    }).catch(() => {});
  }, []);

  // Load webinar date options (upcoming + previous Wednesday)
  useEffect(() => {
    fetch('/api/settings?key=active_webinar_date')
      .then(r => r.json())
      .then(data => {
        if (data.value) {
          const upcoming = new Date(data.value);
          const prev = new Date(data.value);
          prev.setDate(prev.getDate() - 7);
          const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const fmtLabel = (d: Date) => d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
          setWebinarDateOptions([
            { label: `Upcoming — ${fmtLabel(upcoming)}`, value: fmt(upcoming) },
            { label: `Previous — ${fmtLabel(prev)}`, value: fmt(prev) },
          ]);
        }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    // Reset form state only when switching to a different contact (ID change)
    const safe = makeSafe(contactData);
    originalDataRef.current = safe;
    setContact(safe);
    setLineMessageText("");
    setMessageFeedback({ type: "", text: "" });
    // Fetch enrollments for this contact
    if (contactData.id && !isNew) {
      fetch(`/api/webinar-sequence/enrollments?contact_id=${contactData.id}`)
        .then(r => r.json())
        .then(data => {
          const enrollment = Array.isArray(data) ? data.find((e: any) => e.contact_id === contactData.id) : null;
          setWbEnrollment(enrollment ?? null);
        }).catch(() => {});
      fetch(`/api/webinar-sequence/messages?contact_id=${contactData.id}`)
        .then(r => r.json())
        .then(data => setWbMessages(Array.isArray(data) ? data : []))
        .catch(() => {});
      fetch(`/api/workflows/enrollments?contact_id=${contactData.id}`)
        .then(r => r.json())
        .then(data => setWfEnrollments(Array.isArray(data) ? data : []))
        .catch(() => {});
      fetch('/api/workflows')
        .then(r => r.json())
        .then(data => setAllWorkflows(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactData.id]);

  useEffect(() => {
    const isDifferent = JSON.stringify(originalDataRef.current) !== JSON.stringify(contact);
    if (isNew) {
      setHasUnsavedChanges(contact.name?.trim().length > 0 || isDifferent);
    } else {
      setHasUnsavedChanges(isDifferent);
    }
  }, [contact, isNew]);

  const handleAddTag = (tagValue?: string) => {
    const tag = (tagValue || newTag).trim();
    if (tag && !contact.tags.includes(tag)) {
      setContact({...contact, tags: [...contact.tags, tag]});
      // Auto upsert in definitions
      fetch('/api/tags', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: tag }) }).catch(() => {});
      setTagSuggestions(prev => prev.some(s => s.name === tag) ? prev : [...prev, { name: tag, colour: '#3B82F6' }]);
    }
    setNewTag("");
    setShowTagSuggestions(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setContact({
      ...contact,
      tags: contact.tags.filter((tag: string) => tag !== tagToRemove)
    });
  };

  const attemptBack = () => {
    if (hasUnsavedChanges) {
      setShowConfirmModal(true);
    } else {
      onBack();
    }
  };

  const handleSaveAndSync = async (contactPayload: Contact = contact) => {
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const payload = { ...contactPayload };
      const response = await fetch(CONTACTS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
         setHasUnsavedChanges(false);
         const savedContact: Contact = {
            ...contactPayload,
            id: result.id || contactPayload.id,
            history: result.history || contactPayload.history
         };
         setSaveSuccess(result.message || "Saved successfully!");
         onSaveSuccess(savedContact);
         setContact(savedContact); // Sync local state
         originalDataRef.current = makeSafe(savedContact); // Update baseline so form is clean
         setTimeout(() => setSaveSuccess(""), 4000);
      } else {
         throw new Error(result.error || "Save operation failed.");
      }
    } catch (error) {
      console.error("Save Error:", error);
      setSaveError(`Failed to save: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };


  // Handle sending a custom LINE message via Make.com
  const handleSendLineMessage = async () => {
    if (!contact.lineId) {
      setMessageFeedback({ type: "error", text: "Contact requires a LINE ID to send messages." });
      return;
    }
    if (!lineMessageText.trim()) {
      setMessageFeedback({ type: "error", text: "Message cannot be empty." });
      return;
    }

    setIsSendingMessage(true);
    setMessageFeedback({ type: "", text: "" });

    try {
      const response = await fetch(INTERNAL_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineId: contact.lineId,
          message: lineMessageText
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessageFeedback({ type: "success", text: "Delivered via LINE API!" });
        setLineMessageText("");

        // Auto-save a history event for the sent message
        const newHistoryConfig: HistoryItem[] = [{
            date: new Date().toISOString(),
            action: `Chat: ${lineMessageText}`
        }, ...(contact.history || [])];

        const updatedContact: Contact = { ...contact, history: newHistoryConfig };

        // Save quietly in background
        handleSaveAndSync(updatedContact);

        setTimeout(() => setMessageFeedback({ type: "", text: "" }), 5000);
      } else {
        setMessageFeedback({ type: "error", text: data.error || "Failed to push message." });
      }

    } catch (error) {
       console.error("API Route Error:", error);
       setMessageFeedback({ type: "error", text: "Connection error reaching internal API route." });
    } finally {
      setIsSendingMessage(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(""), 2000);
  };

  const copyIcon = (text: string, field: string) => (
      <button
         onClick={() => copyToClipboard(text, field)}
         title="Copy"
         disabled={!text}
         className={`ml-2 p-1 rounded transition-colors ${!text ? 'opacity-0' : 'hover:bg-slate-200 opacity-100'} ${copiedField === field ? 'text-emerald-500' : 'text-slate-400'}`}
      >
        {copiedField === field ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
  );

  const matchedContacts = contactSearchQuery.trim() === "" ? [] : allContacts.filter((c: Contact) =>
     c.id !== contact.id && (
     c.name?.toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
     c.email?.toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
     c.lineId?.toLowerCase().includes(contactSearchQuery.toLowerCase())
  )).slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans text-slate-800">

      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Unsaved Changes</h3>
              <p className="text-sm text-slate-500 mb-6">You have modified this contact&apos;s details. Are you sure you want to discard your changes and go back?</p>
              <div className="flex space-x-3">
                 <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                 >
                   Keep Editing
                 </button>
                 <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    onBack();
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors border border-transparent shadow-sm"
                 >
                   Discard Changes
                 </button>
              </div>
           </div>
        </div>
      )}

      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col border border-gray-100 relative max-h-[90vh]">
        <div className="h-2 w-full bg-gradient-to-r from-blue-700 to-blue-500 shrink-0"></div>

        <div className="flex-1 overflow-y-auto">

          <div className="px-6 sm:px-8 py-4 border-b border-slate-100 bg-white sticky top-0 z-20 flex items-center justify-between">
            <button
              onClick={attemptBack}
              disabled={isSaving}
              className="flex items-center text-sm font-semibold text-slate-500 hover:text-blue-600 transition-colors group disabled:opacity-50 shrink-0"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5 group-hover:-translate-x-1 transition-transform" />
              Back to List {hasUnsavedChanges && <span className="ml-2 w-2 h-2 rounded-full bg-orange-400"></span>}
            </button>

            {/* Quick Switcher / Search */}
            {!isNew && (
                <div className="relative w-full max-w-xs mx-4 hidden sm:block">
                  <Search className="absolute left-3 top-2 h-4 w-4 text-slate-300" />
                  <input
                    type="text"
                    value={contactSearchQuery}
                    onChange={(e) => {
                       setContactSearchQuery(e.target.value);
                       setIsSearchOpen(true);
                    }}
                    onFocus={() => setIsSearchOpen(true)}
                    className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="Fast switch to another contact..."
                  />
                  {isSearchOpen && contactSearchQuery && (
                     <div className="absolute top-full mt-2 w-full bg-white border border-slate-100 shadow-xl rounded-xl overflow-hidden">
                        {matchedContacts.length > 0 ? (
                           matchedContacts.map((mc: Contact) => (
                              <button
                                key={mc.id}
                                onClick={() => {
                                  if (hasUnsavedChanges) {
                                     alert("Save your changes first before switching contacts.");
                                  } else {
                                     setContactSearchQuery("");
                                     setIsSearchOpen(false);
                                     onSwitchContact(mc.id);
                                  }
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                              >
                                <p className="text-sm font-bold text-slate-800">{mc.name || "Unnamed"}</p>
                                <p className="text-xs text-slate-500 truncate">{mc.email || mc.lineId}</p>
                              </button>
                           ))
                        ) : (
                           <div className="p-4 text-xs text-slate-500 text-center">No matches found</div>
                        )}
                     </div>
                  )}
                </div>
            )}

            <div className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${isNew ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'} border ${isNew ? 'border-blue-200' : 'border-slate-200'}`}>
              {isNew ? "New Contact" : `ID: ${contact.id.split("-")[0]}`}
            </div>
          </div>

          <div className="p-6 sm:p-8" onClick={() => setIsSearchOpen(false)}>
            {saveError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center">
                 <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
                 {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center font-medium animate-in slide-in-from-top-4">
                 <CheckCircle2 className="w-5 h-5 mr-2 shrink-0 text-emerald-500" />
                 {saveSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              <div className="space-y-8">

                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-2xl shrink-0 shadow-inner">
                    {contact.name ? contact.name.charAt(0).toUpperCase() : <User className="w-6 h-6 text-blue-400" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center">
                      <h1 className="text-2xl font-bold tracking-tight text-slate-900 truncate">{contact.name || "Unnamed"}</h1>
                      {!isNew && copyIcon(contact.name, 'nameHeader')}
                    </div>
                    <p className="text-sm text-slate-500 font-medium">{isNew ? "Create a New Contact" : "Single Contact View"}</p>
                  </div>
                </div>

                {/* ── Contact Details ───────────────────────────────────── */}
                <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Contact Details</h3>
                    {!isNew && contact.ghl_contact_id && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                        <RefreshCw className="w-3 h-3" /> GHL synced
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="relative flex items-center group">
                      <div className="relative flex-1">
                        <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={contact.name}
                          onChange={(e) => setContact({...contact, name: e.target.value})}
                          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all hover:border-slate-300"
                          placeholder="Full Name"
                        />
                      </div>
                      {copyIcon(contact.name, 'name')}
                    </div>

                    <div className="relative flex items-center group">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="email"
                          value={contact.email}
                          onChange={(e) => setContact({...contact, email: e.target.value})}
                          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all hover:border-slate-300"
                          placeholder="Email Address"
                        />
                      </div>
                      {copyIcon(contact.email, 'email')}
                    </div>

                    <div className="relative flex items-center group">
                      <div className="relative flex-1">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="tel"
                          value={contact.phone}
                          onChange={(e) => setContact({...contact, phone: e.target.value})}
                          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all hover:border-slate-300"
                          placeholder="Phone Number"
                        />
                      </div>
                      {copyIcon(contact.phone, 'phone')}
                    </div>

                    <div className="relative pt-2 flex items-center group">
                      <div className="relative flex-1">
                        <label className="absolute -top-1 left-3 bg-slate-50 px-1 text-xs font-semibold text-emerald-600 z-10">LINE User ID</label>
                        <MessageCircle className="absolute left-3 top-5 h-5 w-5 text-emerald-500" />
                        <input
                          type="text"
                          value={contact.lineId}
                          onChange={(e) => setContact({...contact, lineId: e.target.value})}
                          className="w-full pl-10 pr-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all hover:border-emerald-300"
                          placeholder="@line_id"
                        />
                      </div>
                      {copyIcon(contact.lineId, 'lineId')}
                      <button
                        onClick={() => contact.lineId && onGoToInbox && onGoToInbox(contact.id)}
                        disabled={!contact.lineId}
                        title={contact.lineId ? 'Open LINE chat' : 'No LINE ID linked'}
                        className={`ml-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${contact.lineId ? 'bg-[#06c755] text-white hover:bg-[#05b54d] shadow-sm' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Chat
                      </button>
                    </div>

                    <div className="relative flex items-center group">
                      <div className="relative flex-1">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={contact.uid || ''}
                          onChange={(e) => setContact({...contact, uid: e.target.value})}
                          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all hover:border-slate-300"
                          placeholder="UID (e.g. student ID)"
                        />
                      </div>
                      {copyIcon(contact.uid || '', 'uid')}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center">
                      <TagIcon className="w-4 h-4 mr-2 text-slate-500" /> Tags
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {contact.tags.map((tag: string, idx: number) => (
                      <span key={idx} className="group inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm transition-all hover:bg-emerald-200">
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1.5 p-0.5 rounded-full hover:bg-emerald-300 transition-colors"
                        >
                          <X className="w-3 h-3 text-emerald-800" />
                        </button>
                      </span>
                    ))}
                    {contact.tags.length === 0 && (
                      <span className="text-sm text-slate-400 italic">No tags</span>
                    )}
                  </div>

                  <div className="relative pt-2">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => { setNewTag(e.target.value); setShowTagSuggestions(true); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } if (e.key === 'Escape') setShowTagSuggestions(false); }}
                        onFocus={() => setShowTagSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                        className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        placeholder="Type or pick a tag..."
                      />
                      <button
                        onClick={() => handleAddTag()}
                        className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors border border-slate-200"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                    {showTagSuggestions && (
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-44 overflow-y-auto">
                        {tagSuggestions
                          .filter(s => s.name.toLowerCase().includes(newTag.toLowerCase()) && !contact.tags.includes(s.name))
                          .map((s, i) => (
                            <button key={i} onMouseDown={() => handleAddTag(s.name)} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center space-x-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.colour }} />
                              <span>{s.name}</span>
                            </button>
                          ))
                        }
                        {tagSuggestions.filter(s => s.name.toLowerCase().includes(newTag.toLowerCase()) && !contact.tags.includes(s.name)).length === 0 && newTag && (
                          <div className="px-4 py-2 text-xs text-slate-400 italic">Press Enter to create &ldquo;{newTag}&rdquo;</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <div className="space-y-6 flex flex-col h-full items-stretch">

                <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    <div>
                      <h4 className="text-sm font-bold text-emerald-800 tracking-wide">{contact.status.toUpperCase()} STATUS</h4>
                      {contact.ghl_contact_id ? (
                        <p className="text-xs text-emerald-600 flex items-center"><RefreshCw className="w-3 h-3 mr-1"/>Synced with GoHighLevel</p>
                      ) : (
                        <p className="text-xs text-slate-400">No GHL link</p>
                      )}
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-white rounded-full border border-emerald-200 shadow-sm relative group overflow-hidden cursor-pointer">
                    <select
                       value={contact.status}
                       onChange={(e) => setContact({...contact, status: e.target.value})}
                       className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    >
                       <option value="Lead">Lead</option>
                       <option value="Active">Active</option>
                       <option value="Inactive">Inactive</option>
                    </select>
                    <span className="text-xs font-bold text-emerald-600 pointer-events-none group-hover:text-emerald-800">{contact.status} ▾</span>
                  </div>
                </div>

                <div className="p-5 border border-slate-200 rounded-xl bg-white shadow-sm transition-shadow">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2 flex justify-between">
                    Webinar Setup
                  </h3>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                         <label className="text-xs font-medium text-slate-500">Webinar Link</label>
                         {contact.webinar.link && (
                           <div className="flex items-center gap-2">
                             <button
                               onClick={() => copyToClipboard(contact.webinar.link, 'webinarLink')}
                               className="text-xs flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors"
                             >
                               {copiedField === 'webinarLink' ? (
                                 <><Check className="w-3 h-3 mr-1 text-emerald-500" /> Copied!</>
                               ) : (
                                 <><Copy className="w-3 h-3 mr-1" /> Copy</>
                               )}
                             </button>
                             <a href={contact.webinar.link} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors">
                               <LinkIcon className="w-3 h-3 mr-1" /> Open
                             </a>
                           </div>
                         )}
                      </div>
                      <div className="relative group">
                        <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <input
                          type="url"
                          value={contact.webinar.link}
                          onChange={(e) => setContact({...contact, webinar: {...contact.webinar, link: e.target.value}})}
                          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-blue-600 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all hover:border-slate-300 bg-slate-50 focus:bg-white"
                          placeholder="e.g. https://zoom.us/j/1234..."
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Webinar Date</label>
                      <select
                        value={contact.webinar.dateTime ? contact.webinar.dateTime.substring(0, 10) : ''}
                        onChange={(e) => setContact({...contact, webinar: {...contact.webinar, dateTime: e.target.value}})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-slate-50"
                      >
                        <option value="">— Not assigned —</option>
                        {webinarDateOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                        {/* Show current date as option if it doesn't match upcoming/previous */}
                        {contact.webinar.dateTime && !webinarDateOptions.some(opt => opt.value === contact.webinar.dateTime.substring(0, 10)) && (() => {
                          const d = new Date(contact.webinar.dateTime);
                          const label = `Current — ${d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`;
                          return <option value={contact.webinar.dateTime.substring(0, 10)}>{label}</option>;
                        })()}
                      </select>
                    </div>
                  </div>
                </div>

                {/* --- Notes Section --- */}
                {!isNew && (
                  <div className="p-5 border border-slate-200 rounded-xl bg-white shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3 border-b border-slate-100 pb-2 flex items-center">
                      <Bell className="w-4 h-4 mr-2 text-slate-400" />Notes
                    </h3>
                    <textarea
                      rows={3}
                      value={contact.follow_up_note || ''}
                      onChange={(e) => setContact({...contact, follow_up_note: e.target.value})}
                      placeholder="Add internal notes about this contact..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all resize-none"
                    />
                  </div>
                )}

                {/* --- Webinar Sequence Status --- */}
                {!isNew && (wbEnrollment || wbMessages.length > 0) && (
                  <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        <h3 className="text-sm font-semibold text-slate-700 tracking-wide">Webinar Sequence</h3>
                      </div>
                      {wbEnrollment && (() => {
                        const wDate = new Date(wbEnrollment.webinar_date);
                        const isPast = wDate < new Date();
                        return (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isPast ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {isPast ? 'Past webinar' : 'Upcoming webinar'} · {wDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="divide-y divide-slate-50">
                      {wbMessages.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-slate-400">No sequence messages scheduled.</p>
                      ) : (
                        wbMessages.map((msg: any) => {
                          const statusColor = msg.status === 'sent' ? 'text-emerald-600 bg-emerald-50' : msg.status === 'failed' ? 'text-red-500 bg-red-50' : msg.status === 'skipped' ? 'text-slate-400 bg-slate-100' : 'text-blue-600 bg-blue-50';
                          return (
                            <div key={msg.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-600 line-clamp-2">{msg.message_preview || msg.step_message || '—'}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{new Date(msg.scheduled_at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${statusColor}`}>{msg.status}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* --- Automations Management --- */}
                {!isNew && (
                  <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Zap className="w-4 h-4 text-purple-500" />
                        <h3 className="text-sm font-semibold text-slate-700 tracking-wide">Automations</h3>
                      </div>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Workflow Enrollments */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Workflows</p>
                        {wfEnrollments.filter((e: any) => e.status === 'active').length === 0 ? (
                          <p className="text-xs text-slate-400 italic mb-2">No active workflows</p>
                        ) : (
                          <div className="space-y-1.5 mb-2">
                            {wfEnrollments.filter((e: any) => e.status === 'active').map((e: any) => (
                              <div key={e.id} className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Zap className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                  <span className="text-xs font-semibold text-slate-700 truncate">{e.workflows?.name || 'Unknown'}</span>
                                  <span className="text-[9px] font-bold text-purple-600 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded-full shrink-0">Active</span>
                                </div>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Remove "${e.workflows?.name}" from this contact?`)) return;
                                    setWfRemoving(e.id);
                                    try {
                                      const res = await fetch(`/api/workflows/enrollments?id=${e.id}`, { method: 'DELETE' });
                                      const data = await res.json();
                                      if (data.success) {
                                        setWfEnrollments(prev => prev.map((en: any) => en.id === e.id ? { ...en, status: 'completed' } : en));
                                      } else { alert(data.error || 'Failed to remove'); }
                                    } catch { alert('Failed to remove'); }
                                    finally { setWfRemoving(null); }
                                  }}
                                  disabled={wfRemoving === e.id}
                                  className="text-[10px] font-bold text-red-500 hover:text-red-700 disabled:opacity-50 shrink-0 ml-2"
                                >
                                  {wfRemoving === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Add workflow dropdown */}
                        {(() => {
                          const activeIds = wfEnrollments.filter((e: any) => e.status === 'active').map((e: any) => e.workflow_id);
                          const available = allWorkflows.filter((w: any) => w.is_active && !activeIds.includes(w.id));
                          if (available.length === 0) return null;
                          return (
                            <div className="flex items-center gap-2">
                              <select
                                id="wf-add-select"
                                className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-1 focus:ring-purple-300 outline-none"
                                defaultValue=""
                              >
                                <option value="" disabled>Add workflow…</option>
                                {available.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                              </select>
                              <button
                                disabled={wfEnrolling}
                                onClick={async () => {
                                  const sel = (document.getElementById('wf-add-select') as HTMLSelectElement);
                                  const wfId = sel?.value;
                                  if (!wfId) return;
                                  setWfEnrolling(true);
                                  try {
                                    const res = await fetch('/api/workflows/enrollments', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ contact_id: contactData.id, workflow_id: wfId }),
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                      // Refetch enrollments
                                      const r2 = await fetch(`/api/workflows/enrollments?contact_id=${contactData.id}`);
                                      const d2 = await r2.json();
                                      setWfEnrollments(Array.isArray(d2) ? d2 : []);
                                      sel.value = '';
                                    } else { alert(data.error || 'Failed to enroll'); }
                                  } catch { alert('Failed to enroll'); }
                                  finally { setWfEnrolling(false); }
                                }}
                                className="px-2.5 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
                              >
                                {wfEnrolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                Add
                              </button>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Webinar Sequence Enrollment */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Webinar Sequence</p>
                        {wbEnrollment && wbEnrollment.status === 'active' ? (
                          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="text-xs font-semibold text-slate-700">
                                Webinar {new Date(wbEnrollment.webinar_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              <span className="text-[9px] font-bold text-blue-600 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded-full shrink-0">Active</span>
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm('Remove this contact from the webinar sequence?')) return;
                                setWbRemoving(true);
                                try {
                                  const res = await fetch(`/api/webinar-sequence/enrollments?id=${wbEnrollment.id}`, { method: 'DELETE' });
                                  const data = await res.json();
                                  if (data.success) {
                                    setWbEnrollment({ ...wbEnrollment, status: 'cancelled' });
                                    setWbMessages(prev => prev.map((m: any) => m.status === 'pending' ? { ...m, status: 'skipped' } : m));
                                  } else { alert(data.error || 'Failed to remove'); }
                                } catch { alert('Failed to remove'); }
                                finally { setWbRemoving(false); }
                              }}
                              disabled={wbRemoving}
                              className="text-[10px] font-bold text-red-500 hover:text-red-700 disabled:opacity-50 shrink-0 ml-2"
                            >
                              {wbRemoving ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Not enrolled in webinar sequence</p>
                        )}
                      </div>

                      {/* Completed/past enrollments summary */}
                      {wfEnrollments.filter((e: any) => e.status !== 'active').length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Past Workflows</p>
                          <div className="space-y-1">
                            {wfEnrollments.filter((e: any) => e.status !== 'active').map((e: any) => (
                              <div key={e.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
                                <Zap className="w-3 h-3 text-slate-300 shrink-0" />
                                <span className="text-xs text-slate-500 truncate">{e.workflows?.name || 'Unknown'}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${e.status === 'completed' ? 'text-green-600 bg-green-50 border border-green-100' : 'text-slate-400 bg-slate-100 border border-slate-200'}`}>
                                  {e.status === 'completed' ? 'Completed' : e.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* --- Activity History --- */}
                {!isNew && (
                  <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <History className="w-4 h-4 text-slate-500" />
                        <h3 className="text-sm font-semibold text-slate-700 tracking-wide">Activity History</h3>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{contact.history?.length || 0} events</span>
                    </div>
                    <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
                      {contact.history && contact.history.length > 0 ? (
                        contact.history.map((histItem: HistoryItem, i: number) => {
                          const isGHL = histItem.action.startsWith('GHL');
                          const isTag = histItem.action.toLowerCase().includes('tag');
                          const isChat = histItem.action.startsWith('Chat:') || histItem.action.startsWith('Received:');
                          const isFollowUp = histItem.action.includes('Follow-Up');
                          const isEmail = histItem.action.includes('Email Matched');

                          const dotColor = isGHL ? 'bg-violet-400' : isTag ? 'bg-blue-400' : isChat ? 'bg-emerald-400' : isFollowUp ? 'bg-orange-400' : isEmail ? 'bg-pink-400' : 'bg-slate-300';
                          const label = isGHL ? 'GHL' : isTag ? 'Tag' : isChat ? 'Message' : isFollowUp ? 'Follow-Up' : isEmail ? 'Email' : 'Event';
                          const labelColor = isGHL ? 'bg-violet-50 text-violet-600 border-violet-100' : isTag ? 'bg-blue-50 text-blue-600 border-blue-100' : isChat ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : isFollowUp ? 'bg-orange-50 text-orange-600 border-orange-100' : isEmail ? 'bg-pink-50 text-pink-600 border-pink-100' : 'bg-slate-50 text-slate-500 border-slate-100';

                          return (
                            <div key={i} className="flex items-start space-x-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                              <div className="flex flex-col items-center shrink-0 mt-1">
                                <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                                {i < (contact.history?.length || 0) - 1 && <div className="w-px h-full bg-slate-100 mt-1 min-h-[16px]" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2 mb-0.5">
                                  <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${labelColor}`}>{label}</span>
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {histItem.date ? new Date(histItem.date).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-700 font-medium break-words">{histItem.action}</p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-12 text-center text-slate-400">
                          <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No activity yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-200 mt-auto shrink-0 flex flex-col sm:flex-row items-center gap-4 justify-end z-20">
          <button
           onClick={attemptBack}
           disabled={isSaving}
           className="w-full sm:w-auto px-6 py-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-200 order-2 sm:order-1 disabled:opacity-50"
          >
             <span>Cancel</span>
          </button>

          <button
            onClick={() => handleSaveAndSync(contact)}
            disabled={!hasUnsavedChanges || isSaving}
            className={`w-full sm:w-auto px-8 py-3 rounded-xl font-semibold shadow-md flex items-center justify-center space-x-2 transition-all order-1 sm:order-2
              ${hasUnsavedChanges && !isSaving
                ? 'bg-blue-600 hover:bg-blue-700 text-white transform hover:-translate-y-0.5 hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:ring-blue-600'
                : 'bg-blue-100 text-blue-400 cursor-not-allowed border border-blue-200'
              }`}
          >
            {isSaving ? (
                <><Loader2 className="w-5 h-5 text-white animate-spin" /><span className="text-base text-white tracking-wide">Syncing...</span></>
            ) : (
                <><Save className={`w-5 h-5 ${hasUnsavedChanges ? 'text-white' : 'text-blue-300'}`} />
                <span className="text-base tracking-wide">{isNew ? "Create Contact" : "Save and Sync Data"}</span></>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Conversations 3-Pane View Component
// ----------------------------------------------------------------------------
function MessageList({ history }: { history: HistoryItem[] }) {
  const sorted = history.slice().reverse();
  let lastDateLabel = '';
  const items: React.ReactNode[] = [];

  sorted.forEach((histItem, i) => {
    const rawAction = histItem.action;
    const isIncoming = rawAction.startsWith('Received: ');
    const isAuto = rawAction.includes('[Scheduled]') || rawAction.includes('[Auto]');
    const isManual = rawAction.startsWith('Chat: ') && !isAuto;
    const time = histItem.date ? new Date(histItem.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const dateLabel = histItem.date ? new Date(histItem.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '';

    if (dateLabel && dateLabel !== lastDateLabel) {
      lastDateLabel = dateLabel;
      items.push(
        <div key={`date-${i}`} className="flex justify-center my-3">
          <span className="bg-black/20 backdrop-blur-sm text-white/80 text-[10px] font-semibold px-3 py-1 rounded-full">{dateLabel}</span>
        </div>
      );
    }

    if (!isIncoming && !isAuto && !isManual) {
      items.push(
        <div key={i} className="flex justify-center my-1">
          <div className="bg-black/20 px-3 py-1 rounded-full text-[10px] text-white/70 font-medium">{rawAction}{time ? ` · ${time}` : ''}</div>
        </div>
      );
      return;
    }

    const text = rawAction.replace('Chat: ', '').replace('Received: ', '').replace('[Scheduled] ', '').replace('[Auto] ', '');

    if (isIncoming) {
      items.push(
        <div key={i} className="flex flex-col items-start w-full">
          <div className="max-w-[78%] bg-white text-slate-800 px-4 py-2.5 rounded-2xl rounded-tl-sm shadow-sm border border-slate-200">
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{text}</p>
          </div>
          <span className="text-[10px] text-white/60 mt-1 ml-1">{time}</span>
        </div>
      );
    } else {
      items.push(
        <div key={i} className="flex flex-col items-end w-full">
          <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-md break-words border ${isAuto ? 'bg-amber-500 text-white border-amber-600' : 'bg-[#06c755] text-white border-[#05b54d]'}`}>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{text}{isAuto && <Bell className="inline w-3 h-3 ml-1.5 opacity-70" />}</p>
          </div>
          <div className="flex items-center gap-1.5 mt-1 mr-1">
            <span className="text-[10px] text-white/60">{time}</span>
            {isAuto && <span className="text-[9px] font-bold text-amber-300 uppercase tracking-tight">Auto</span>}
          </div>
        </div>
      );
    }
  });

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/60 pb-8">
        <MessageCircle className="w-14 h-14 mb-3 opacity-30" />
        <p className="text-sm">No messages yet. Say hello!</p>
      </div>
    );
  }
  return <>{items}</>;
}

interface ConversationsViewProps {
  contacts: Contact[];
  selectedId: string;
  onUpdateContact: (updatedContact: Contact) => void;
}
function ConversationsView({ contacts, selectedId, onUpdateContact }: ConversationsViewProps) {
  const [lineMessageText, setLineMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<{ type: string; text: string }>({ type: "", text: "" });
  const [copiedField, setCopiedField] = useState("");
  const [newTag, setNewTag] = useState("");
  const [isSavingTag, setIsSavingTag] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState("");
  const [scheduledReminders, setScheduledReminders] = useState<{ id: string; message: string; scheduled_time: string; status: string; }[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [inboxTemplates, setInboxTemplates] = useState<Array<{ id: string; name: string; content: string }>>([]);
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeContact: Contact = contacts.find((c: Contact) => c.id === selectedId) || contacts[0];
  const lastHistoryCountRef = useRef(activeContact?.history?.length || 0);

  // REAL-TIME: Listen for new messages instantly
  useEffect(() => {
    if (!activeContact?.id) return;
    
    const channel = supabase
      .channel(`contact_history_${activeContact.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contact_history',
          filter: `contact_id=eq.${activeContact.id}`,
        },
        (payload) => {
          const newHistoryItem = payload.new as HistoryItem;
          
          // Sound trigger for incoming messages
          if (newHistoryItem.action.startsWith('Received:')) {
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVoGAACAgICAgICAgICAgICBgYKCg4OEhIWFhoaHh4iIiImJiouLjIyNjY6Oj5CQkZGSk5OUlZWWl5eYmZqam5ydnZ6fn6ChoaKjpKSlpqanqKmpqqusra2ur7CwsbKztLS1tre3uLm6u7y8vb6/wMDBwsPExcXGx8jJysrLzM3Oz9DR0dLT1NXW1tfY2drb3N3e3+Dh4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f7/');
              audio.volume = 0.5;
              audio.play().catch(() => {});
            } catch {}
          }

          // Update parent state
          onUpdateContact({
            ...activeContact,
            history: [newHistoryItem, ...(activeContact.history || [])]
          });
          lastHistoryCountRef.current = (activeContact.history?.length || 0) + 1;
        }
      )
      .subscribe();

    setIsLive(true);
    return () => {
      supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, [activeContact?.id, activeContact, onUpdateContact]);

  // Auto-scroll to bottom when messages change or contact switches
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeContact?.history?.length, activeContact?.id]);

  // Fetch reminders when active contact changes
  useEffect(() => {
    if (!activeContact?.id) return;
    lastHistoryCountRef.current = activeContact?.history?.length || 0;
    setLoadingReminders(true);
    fetch(`/api/reminders?contactId=${activeContact.id}`)
      .then(r => r.json())
      .then(data => setScheduledReminders(Array.isArray(data) ? data : []))
      .catch(e => console.error(e))
      .finally(() => setLoadingReminders(false));
  }, [activeContact?.id]);

  // Load templates once
  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setInboxTemplates(data);
    }).catch(() => {});
  }, []);

  const handleSendLineMessage = async () => {
    if (!activeContact?.lineId || !lineMessageText.trim()) return;

    setIsSendingMessage(true);
    setMessageFeedback({ type: "", text: "" });

    try {
      const response = await fetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId: activeContact.lineId, message: lineMessageText })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setLineMessageText("");
        const newHistoryConfig: HistoryItem[] = [{
            date: new Date().toISOString(),
            action: `Chat: ${lineMessageText}`
        }, ...(activeContact.history || [])];

        const updatedContact: Contact = { ...activeContact, history: newHistoryConfig };
        onUpdateContact(updatedContact);
        fetch(CONTACTS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedContact)
        }).catch(e => console.error("Background sync failed:", e));
      } else {
        setMessageFeedback({ type: "error", text: data.error || "Failed to push message." });
        setTimeout(() => setMessageFeedback({ type: "", text: "" }), 3000);
      }
    } catch (error) {
       console.error("API Error:", error);
       setMessageFeedback({ type: "error", text: "Connection error." });
       setTimeout(() => setMessageFeedback({ type: "", text: "" }), 3000);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleAddTag = async (tag: string) => {
    if (!tag.trim() || activeContact.tags.includes(tag.trim())) return;
    setIsSavingTag(true);
    const updatedContact = { ...activeContact, tags: [...(activeContact.tags || []), tag.trim()] };
    try {
      const resp = await fetch(CONTACTS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedContact)
      });
      if (resp.ok) {
        onUpdateContact(updatedContact);
        setNewTag("");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingTag(false);
    }
  };

  const handleUpdateContactField = async (updatedContact: Contact) => {
    try {
      await fetch(CONTACTS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedContact)
      });
    } catch (e) {
      console.error("Field sync failed:", e);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    setIsSavingTag(true);
    const updatedContact = { ...activeContact, tags: (activeContact.tags || []).filter(t => t !== tagToRemove) };
    try {
       const resp = await fetch(CONTACTS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedContact)
      });
      if (resp.ok) {
        onUpdateContact(updatedContact);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingTag(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(""), 2000);
  };

  const handleScheduleMessage = async () => {
    if (!activeContact?.id || !scheduleMessage.trim() || !scheduleDateTime) return;
    setIsScheduling(true);
    try {
      const resp = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: activeContact.id, message: scheduleMessage, scheduledTime: new Date(scheduleDateTime).toISOString() })
      });
      const data = await resp.json();
      if (data.success) {
        setScheduledReminders(prev => [...prev, data.reminder]);
        setScheduleMessage("");
        setScheduleDateTime("");
        setScheduleSuccess("✅ Scheduled!");
        setTimeout(() => setScheduleSuccess(""), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsScheduling(false);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    await fetch(`/api/reminders?id=${id}`, { method: 'DELETE' });
    setScheduledReminders(prev => prev.filter(r => r.id !== id));
  };

  if (!activeContact) return null;

  return (
    <div className="flex-1 w-full h-full flex bg-white outline-none overflow-hidden">
      <div className="flex-1 flex flex-col bg-[#84A1C4] relative min-w-[400px] border-r border-slate-200">
         <div className="px-6 py-4 bg-[#333a4d] flex items-center justify-between shadow-sm z-10 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-inner">
                  {activeContact.name ? activeContact.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                </div>
                {activeContact.lineId && <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#06c755] rounded-full border-2 border-[#333a4d]" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">{activeContact.name || activeContact.lineId}</h3>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-emerald-300 font-medium">LINE</p>
                  {isLive && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block" />
                      Live
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-300 bg-slate-800 px-3 py-1 rounded-full border border-slate-700 flex items-center shadow-inner">
                <Lock className="w-3 h-3 mr-1.5 opacity-70" /> Encrypted
            </div>
         </div>

         {messageFeedback.text && (
            <div className={`absolute top-20 left-1/2 transform -translate-x-1/2 z-20 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all ${messageFeedback.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
               {messageFeedback.text}
            </div>
         )}

         <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-1">
            <MessageList history={activeContact.history || []} />
            <div ref={messagesEndRef} />
         </div>

         <div className="bg-[#e8eef2] border-t border-slate-300 shrink-0 p-3 space-y-2">
           <textarea
             value={lineMessageText}
             onChange={(e) => setLineMessageText(e.target.value)}
             placeholder="Type a message... (Enter for new line)"
             className="w-full bg-white border border-slate-300 rounded-2xl px-4 py-3 text-[15px] shadow-inner focus:ring-2 focus:ring-emerald-500 outline-none resize-none min-h-[96px] max-h-56 overflow-y-auto"
             disabled={isSendingMessage}
             rows={4}
           />
           <div className="flex items-center justify-between">
             <span className="text-[11px] text-slate-400">Enter = new line</span>
             <button
               onClick={handleSendLineMessage}
               disabled={!lineMessageText.trim() || isSendingMessage}
               className="flex items-center gap-2 px-5 py-2 bg-[#06c755] hover:bg-[#05b54d] text-white text-sm font-bold rounded-full shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {isSendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
               {isSendingMessage ? 'Sending…' : 'Send'}
             </button>
           </div>
         </div>
      </div>

      {/* PANE 3: Right Details Panel */}
      <aside className="w-80 lg:w-96 border-l border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden">
         <div className="flex-1 overflow-y-auto w-full">
            <div className="p-6 border-b border-slate-100 flex flex-col items-center bg-slate-50 text-center">
               <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-3xl shadow-inner mb-4">
                  {activeContact.name ? activeContact.name.charAt(0).toUpperCase() : <User className="w-8 h-8" />}
               </div>
               <h2 className="text-lg font-bold text-slate-900">{activeContact.name || "Unnamed"}</h2>
               <p className="text-sm text-slate-500 font-medium mb-3">{activeContact.email || "No email provided"}</p>
               <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${activeContact.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : activeContact.status === 'Lead' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                  {activeContact.status}
               </span>
            </div>

            <div className="p-6 space-y-6">
               <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Info</h3>
                  <div className="flex items-center space-x-3 text-sm">
                     <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                     <span className="text-slate-700 font-medium flex-1">{activeContact.phone || "N/A"}</span>
                     {activeContact.phone && (
                        <button onClick={() => copyToClipboard(activeContact.phone, 'phone')} className="text-slate-400 hover:text-blue-500">
                           {copiedField === 'phone' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                     )}
                  </div>
                  <div className="flex items-center space-x-3 text-sm">
                     <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                     <span className="text-emerald-700 font-medium flex-1 truncate">{activeContact.lineId}</span>
                     {activeContact.lineId && (
                        <button onClick={() => copyToClipboard(activeContact.lineId, 'line')} className="text-slate-400 hover:text-blue-500">
                           {copiedField === 'line' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                     )}
                  </div>
               </div>

               <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                     <TagIcon className="w-3.5 h-3.5 mr-1" /> Tags
                  </h3>
                  <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                     {activeContact.tags && activeContact.tags.length > 0 ? (
                        activeContact.tags.map((tag: string, i: number) => (
                           <span key={i} className="group px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold border border-blue-200 flex items-center animate-in zoom-in-50">
                              {tag}
                              <button onClick={() => handleRemoveTag(tag)} className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500">
                                <X className="w-3 h-3" />
                              </button>
                           </span>
                        ))
                     ) : (
                        <span className="text-xs text-slate-400 italic">No tags applied</span>
                     )}
                  </div>
                  <div className="flex mt-2">
                    <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddTag(newTag)} placeholder="Add tag..." className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none"/>
                    <button onClick={() => handleAddTag(newTag)} disabled={!newTag.trim() || isSavingTag} className="ml-2 w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {isSavingTag ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </button>
                  </div>
               </div>

               <div className="space-y-3 border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                     <History className="w-3.5 h-3.5 mr-1" /> Sales Notes
                  </h3>
                  <textarea
                     value={activeContact.notes || ""}
                     onChange={e => onUpdateContact({ ...activeContact, notes: e.target.value })}
                     onBlur={() => handleUpdateContactField(activeContact)}
                     placeholder="Add internal notes about this lead..."
                     rows={3}
                     className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                  />
               </div>

               {/* Templates quick-copy */}
               {inboxTemplates.length > 0 && (
                 <div className="space-y-2 border-t border-slate-100 pt-5">
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                     <span className="flex items-center"><Layout className="w-3.5 h-3.5 mr-1" /> Templates</span>
                     <span className="text-[10px] font-normal normal-case">Click to copy</span>
                   </h3>
                   <div className="space-y-1.5">
                     {inboxTemplates.map((tpl) => (
                       <button
                         key={tpl.id}
                         onClick={() => {
                           navigator.clipboard.writeText(tpl.content).then(() => {
                             setCopiedTemplateId(tpl.id);
                             setTimeout(() => setCopiedTemplateId(null), 2000);
                           });
                         }}
                         className="w-full text-left px-3 py-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg transition-colors group flex items-start gap-2"
                       >
                         <div className="flex-1 min-w-0">
                           <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-700">{tpl.name}</p>
                           <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{tpl.content}</p>
                         </div>
                         <span className={`shrink-0 mt-0.5 transition-all ${copiedTemplateId === tpl.id ? 'text-emerald-500' : 'text-slate-300 group-hover:text-blue-400'}`}>
                           {copiedTemplateId === tpl.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                         </span>
                       </button>
                     ))}
                   </div>
                 </div>
               )}
            </div>
         </div>
      </aside>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Marketing & Automations View — Workflow Builder
// ----------------------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_COLORS: Record<number, string> = { 0:'bg-red-100 text-red-700', 1:'bg-orange-100 text-orange-700', 2:'bg-amber-100 text-amber-700', 3:'bg-emerald-100 text-emerald-700', 4:'bg-blue-100 text-blue-700', 5:'bg-violet-100 text-violet-700', 6:'bg-pink-100 text-pink-700' };

interface Workflow { 
  id: string; 
  name: string; 
  description: string; 
  trigger_type: string; 
  trigger_value: string; 
  is_active: boolean; 
  step_count: number; 
  active_enrollments: number; 
}

interface Step { 
  id: string; 
  workflow_id: string; 
  step_order: number; 
  day_of_week?: number; 
  send_time?: string; 
  action_type: string; 
  message_template?: string; 
  action_value?: string; 
  day_name?: string;
  // Phase 8 additions
  node_type: 'ACTION' | 'CONDITION' | 'WAIT' | 'TRIGGER' | 'START';
  parent_id?: string;
  branch_type?: 'YES' | 'NO' | 'DEFAULT';
  condition_config?: any;
  wait_config?: any;
  position_x?: number;
  position_y?: number;
}
interface Automation { id: string; name: string; trigger_type: string; trigger_value: string; action_type: string; action_value: string; is_active: boolean; }

function AutomationsView({ initialSub }: { initialSub?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<'workflows' | 'broadcast' | 'templates' | 'tags' | 'webinar'>(
    (initialSub === 'rules' ? 'workflows' : initialSub as any) || 'workflows'
  );

  const navigate = (sub: string) => {
    setTab(sub as any);
    router.push(`/?tab=marketing&sub=${sub}`);
  };

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Template management state
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<{id:string;name:string;content:string}|null>(null);
  const [previewTemplate, setPreviewTemplate] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  // Tag management state
  const [newTagName, setNewTagName] = useState('');
  const [newTagColour, setNewTagColour] = useState('#3B82F6');
  const [isSavingTag, setIsSavingTagDef] = useState(false);

  // Workflow detail
  const [selectedWf, setSelectedWf] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);

  // Create workflow form
  const [showWfForm, setShowWfForm] = useState(false);
  const [wfName, setWfName] = useState('');
  const [wfDesc, setWfDesc] = useState('');
  const [wfTrigger, setWfTrigger] = useState('TAG_ADDED');
  const [wfTriggerVal, setWfTriggerVal] = useState('');


  // Simple automation form
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleTriggerType, setRuleTriggerType] = useState('TAG_ADDED');
  const [ruleTriggerVal, setRuleTriggerVal] = useState('');
  const [ruleActionType, setRuleActionType] = useState('SEND_MESSAGE');
  const [ruleActionVal, setRuleActionVal] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  // Broadcast form states
  const [broadcastTag, setBroadcastTag] = useState('');
  const [broadcastTemplate, setBroadcastTemplate] = useState('');
  const [broadcastSchedule, setBroadcastSchedule] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<{type:string, text:string} | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<any[]>([]);

  // Webinar sequence state
  const [wbSequence, setWbSequence] = useState<any>(null);
  const [wbEnrollments, setWbEnrollments] = useState<any[]>([]);
  const [wbStepForm, setWbStepForm] = useState(false);
  const [wbDaysBefore, setWbDaysBefore] = useState(6);
  const [wbSendHour, setWbSendHour] = useState(9);
  const [wbMessage, setWbMessage] = useState('');
  const [wbEditingStep, setWbEditingStep] = useState<any>(null);
  const [wbSaving, setWbSaving] = useState(false);
  const [wbTestLineId, setWbTestLineId] = useState('Uf8d4d01181381069f563e23504dc6dce');
  const [wbTestingStepId, setWbTestingStepId] = useState<string | null>(null);

  const fetchWebinarData = async () => {
    const [seq, enrolls] = await Promise.all([
      fetch('/api/webinar-sequence').then(r => r.json()).catch(() => null),
      fetch('/api/webinar-sequence/enrollments').then(r => r.json()).catch(() => []),
    ]);
    setWbSequence(seq?.id ? seq : null);
    setWbEnrollments(Array.isArray(enrolls) ? enrolls : []);
  };

  // Auto-fetch webinar data when tab is active
  useEffect(() => {
    if (tab === 'webinar') fetchWebinarData();
  }, [tab]);

  useEffect(() => {
    Promise.all([
      fetch('/api/workflows').then(r => r.json()).catch(() => []),
      fetch('/api/automations').then(r => r.json()).catch(() => []),
      fetch('/api/templates').then(r => r.json()).catch(() => []),
      fetch('/api/tags').then(r => r.json()).catch(() => []),
    ]).then(([wfData, autoData, templateData, tagData]) => {
      setWorkflows(Array.isArray(wfData) ? wfData : []);
      setAutomations(Array.isArray(autoData) ? autoData : []);
      setAvailableTemplates(Array.isArray(templateData) ? templateData : []);
      setAvailableTags(Array.isArray(tagData) ? tagData : []);
    }).finally(() => setIsLoading(false));
  }, []);

  const loadSteps = async (wf: Workflow) => {
    setSelectedWf(wf);
    setStepsLoading(true);
    const res = await fetch(`/api/workflows/steps?workflowId=${wf.id}`);
    const data = await res.json();
    setSteps(Array.isArray(data) ? data : []);
    setStepsLoading(false);
    // Steps loaded — WorkflowBuilder will handle view mode
  };

  const createWorkflow = async () => {
    if (!wfName.trim()) return;
    try {
      const res = await fetch('/api/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: wfName, description: wfDesc, trigger_type: wfTrigger, trigger_value: wfTriggerVal }) });
      const data = await res.json();
      if (data.success) { setWorkflows([{ ...data.workflow, step_count: 0, active_enrollments: 0 }, ...workflows]); setShowWfForm(false); setWfName(''); setWfDesc(''); setWfTriggerVal(''); }
      else { alert(`Failed: ${data.error || 'Unknown error'}`); }
    } catch (e: any) { alert(`Error: ${e.message}`); }
  };

  const deleteWorkflow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow? This cannot be undone.')) return;
    await fetch(`/api/workflows?id=${id}`, { method: 'DELETE' });
    setWorkflows(prev => prev.filter(w => w.id !== id));
    if (selectedWf?.id === id) { setSelectedWf(null); setSteps([]); }
  };

  const toggleWorkflow = async (id: string, current: boolean) => {
    await fetch('/api/workflows', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: !current }) });
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, is_active: !current } : w));
  };

  const createRule = async () => {
    if (!ruleName.trim()) return;
    try {
      const res = await fetch('/api/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: ruleName, trigger_type: ruleTriggerType, trigger_value: ruleTriggerVal, action_type: ruleActionType, action_value: ruleActionVal, is_active: true }) });
      const data = await res.json();
      if (data.success) { setAutomations([data.automation, ...automations]); setShowRuleForm(false); setRuleName(''); setRuleTriggerVal(''); setRuleActionVal(''); }
      else { alert(`Failed: ${data.error || 'Unknown error'}`); }
    } catch (e: any) { alert(`Error: ${e.message}`); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this automation rule? This cannot be undone.')) return;
    await fetch(`/api/automations?id=${id}`, { method: 'DELETE' });
    setAutomations(prev => prev.filter(a => a.id !== id));
  };

  const toggleRule = async (id: string, current: boolean) => {
    await fetch('/api/automations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: !current }) });
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, is_active: !current } : a));
  };

  const editRule = (auto: any) => {
    setEditingRuleId(auto.id);
    setRuleName(auto.name);
    setRuleTriggerType(auto.trigger_type);
    setRuleTriggerVal(auto.trigger_value);
    setRuleActionType(auto.action_type);
    setRuleActionVal(auto.action_value || '');
    setShowRuleForm(true);
  };

  const updateRule = async () => {
    if (!editingRuleId || !ruleName.trim()) return;
    try {
      const res = await fetch('/api/automations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingRuleId, name: ruleName, trigger_type: ruleTriggerType, trigger_value: ruleTriggerVal, action_type: ruleActionType, action_value: ruleActionType === 'ENROLL_WEBINAR' ? '' : ruleActionVal }) });
      const data = await res.json();
      if (data.success) {
        setAutomations(prev => prev.map(a => a.id === editingRuleId ? { ...a, name: ruleName, trigger_type: ruleTriggerType, trigger_value: ruleTriggerVal, action_type: ruleActionType, action_value: ruleActionType === 'ENROLL_WEBINAR' ? '' : ruleActionVal } : a));
        setShowRuleForm(false); setEditingRuleId(null); setRuleName(''); setRuleTriggerVal(''); setRuleActionVal(''); setRuleActionType('SEND_MESSAGE'); setRuleTriggerType('TAG_ADDED');
      } else { alert(`Failed: ${data.error || 'Unknown error'}`); }
    } catch (e: any) { alert(`Error: ${e.message}`); }
  };

  const cancelRuleForm = () => {
    setShowRuleForm(false); setEditingRuleId(null); setRuleName(''); setRuleTriggerVal(''); setRuleActionVal(''); setRuleActionType('SEND_MESSAGE'); setRuleTriggerType('TAG_ADDED');
  };

  const createTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateContent.trim()) return;
    setIsSavingTemplate(true);
    try {
      const res = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTemplateName.trim(), content: newTemplateContent.trim() }) });
      const data = await res.json();
      if (data.success && data.template) {
        setAvailableTemplates(prev => [data.template, ...prev]);
        setNewTemplateName('');
        setNewTemplateContent('');
        setPreviewTemplate('');
      } else {
        alert(`Failed to create template: ${data.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const saveEditTemplate = async () => {
    if (!editingTemplate) return;
    setIsSavingTemplate(true);
    try {
      const res = await fetch('/api/templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingTemplate.id, name: editingTemplate.name, content: editingTemplate.content }) });
      const data = await res.json();
      if (res.ok) {
        setAvailableTemplates(prev => prev.map(t => t.id === editingTemplate.id ? { ...t, ...editingTemplate } : t));
        setEditingTemplate(null);
      } else {
        alert(`Failed to save: ${data.error || res.statusText}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
      setAvailableTemplates(prev => prev.filter(t => t.id !== id));
      if (editingTemplate?.id === id) setEditingTemplate(null);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  const renderPreview = (content: string) => {
    return content
      .replace(/\{\{name\}\}/g, 'Ahmad Bin Ali')
      .replace(/\{\{email\}\}/g, 'ahmad@example.com')
      .replace(/\{\{phone\}\}/g, '+60123456789')
      .replace(/\{\{status\}\}/g, 'Lead')
      .replace(/\{\{tags\}\}/g, 'Hot Lead, VIP')
      .replace(/\{\{notes\}\}/g, 'Interested in package A')
      .replace(/\{\{follow_up_note\}\}/g, 'Call after demo')
      .replace(/\{\{webinar_link\}\}/g, 'https://zoom.us/j/123456')
      .replace(/\{\{webinar_date\}\}/g, 'Thursday, March 19, 2026');
  };

  const createTagDef = async () => {
    if (!newTagName.trim()) return;
    setIsSavingTagDef(true);
    try {
      const res = await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTagName.trim(), colour: newTagColour }) });
      const data = await res.json();
      if (data.success) {
        setAvailableTags(prev => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
        setNewTagName('');
        setNewTagColour('#3B82F6');
      }
    } finally {
      setIsSavingTagDef(false);
    }
  };

  const deleteTagDef = async (name: string) => {
    if (!confirm(`Delete tag "${name}"? It will be removed from all contacts.`)) return;
    await fetch(`/api/tags?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    setAvailableTags(prev => prev.filter(t => t.name !== name));
  };

  const runBroadcast = async () => {
    if (!broadcastTag || !broadcastTemplate) return;
    setIsBroadcasting(true);
    setBroadcastStatus(null);
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: broadcastTag,
          message: broadcastTemplate,
          scheduled_at: broadcastSchedule || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setBroadcastStatus({ type: 'success', text: `Broadcast queued for ${data.count} contacts.` });
        setBroadcastTemplate('');
        setBroadcastSchedule('');
      } else {
        throw new Error(data.error || 'Failed to send');
      }
    } catch (e: any) {
      setBroadcastStatus({ type: 'error', text: e.message });
    } finally {
      setIsBroadcasting(false);
    }
  };

  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  // ─── WORKFLOW DETAIL VIEW ────────────────────────────────
  if (selectedWf) {
    if (stepsLoading) {
      return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
    }
    return (
      <WorkflowBuilder
        workflow={selectedWf}
        initialSteps={steps as any}
        onBack={() => { setSelectedWf(null); setSteps([]); }}
      />
    );
  }

  // ─── MAIN MARKETING VIEW ─────────────────────────────────
  return (
    <div className="flex-1 w-full h-full bg-slate-50 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Marketing & Automation</h1>
          <p className="text-slate-500 font-medium">Build automations and workflows for your LINE leads.</p>
        </header>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          <button onClick={() => navigate('workflows')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'workflows' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Automations ({workflows.length + automations.length})
          </button>
          <button onClick={() => navigate('broadcast')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'broadcast' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Broadcast
          </button>
          <button onClick={() => navigate('templates')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'templates' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Templates ({availableTemplates.length})
          </button>
          <button onClick={() => navigate('tags')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'tags' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Tags ({availableTags.length})
          </button>
          <button onClick={() => { navigate('webinar'); fetchWebinarData(); }} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'webinar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Webinar Sequence
          </button>
        </div>

        {/* ─── WORKFLOWS TAB ─────────────────────────────── */}
        {tab === 'workflows' && (
          <div className="space-y-4">
            <div className="flex justify-end relative">
              <button onClick={() => setShowCreateMenu(!showCreateMenu)} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center space-x-2">
                <Plus className="w-5 h-5" /><span>Create Automation</span>
              </button>
              {showCreateMenu && (
                <>
                <div className="fixed inset-0 z-10" onClick={() => setShowCreateMenu(false)} />
                <div className="absolute right-0 top-12 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-64 overflow-hidden">
                  <button onClick={() => { setShowCreateMenu(false); setShowRuleForm(true); setEditingRuleId(null); setRuleName(''); setRuleTriggerType('TAG_ADDED'); setRuleTriggerVal(''); setRuleActionType('SEND_MESSAGE'); setRuleActionVal(''); }} className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-slate-50 transition-colors text-left">
                    <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center"><Zap className="w-4 h-4 text-amber-600" /></div>
                    <div><p className="text-sm font-bold text-slate-900">Quick Action</p><p className="text-xs text-slate-400">Instant single-step rule</p></div>
                  </button>
                  <button onClick={() => { setShowCreateMenu(false); setShowWfForm(true); }} className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-slate-50 transition-colors text-left border-t border-slate-100">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><GitMerge className="w-4 h-4 text-blue-600" /></div>
                    <div><p className="text-sm font-bold text-slate-900">Multi-step Workflow</p><p className="text-xs text-slate-400">Sequence with waits & conditions</p></div>
                  </button>
                </div>
                </>
              )}
            </div>

            {showWfForm && (
              <div className="bg-white border-2 border-blue-100 rounded-2xl p-5 space-y-4 shadow-lg">
                <h3 className="font-bold text-slate-900">New Workflow</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <input type="text" value={wfName} onChange={e => setWfName(e.target.value)} placeholder="Workflow name" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" value={wfDesc} onChange={e => setWfDesc(e.target.value)} placeholder="Description (optional)" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="space-y-3">
                    <select value={wfTrigger} onChange={e => setWfTrigger(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="TAG_ADDED">When Tag Added</option>
                      <option value="TAG_REMOVED">When Tag Removed</option>
                      <option value="USER_FOLLOW">When User Follows</option>
                      <option value="KEYWORD_RECEIVED">When Keyword Received</option>
                      <option value="MANUAL">Manual Enrollment</option>
                    </select>
                    <input type="text" value={wfTriggerVal} onChange={e => setWfTriggerVal(e.target.value)} placeholder={wfTrigger === 'USER_FOLLOW' ? 'FOLLOW' : wfTrigger === 'KEYWORD_RECEIVED' ? 'Keyword (e.g. interested)' : 'Tag Name'} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button onClick={() => setShowWfForm(false)} className="px-5 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                  <button onClick={createWorkflow} disabled={!wfName} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50">Create</button>
                </div>
              </div>
            )}

            {/* Quick Action form (inline) */}
            {showRuleForm && (
              <div className="bg-white border-2 border-amber-100 rounded-2xl p-5 space-y-4 shadow-lg">
                <h3 className="font-bold text-slate-900 flex items-center space-x-2"><Zap className="w-4 h-4 text-amber-500" /><span>{editingRuleId ? 'Edit Quick Action' : 'New Quick Action'}</span></h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <input type="text" value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="Rule name" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
                    <div className="grid grid-cols-2 gap-2">
                      <select value={ruleTriggerType} onChange={e => setRuleTriggerType(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="TAG_ADDED">Tag Added</option>
                        <option value="USER_FOLLOW">User Follow</option>
                        <option value="TAG_REMOVED">Tag Removed</option>
                      </select>
                      <input type="text" value={ruleTriggerVal} onChange={e => setRuleTriggerVal(e.target.value)} placeholder="Value" className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <select value={ruleActionType} onChange={e => setRuleActionType(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="SEND_MESSAGE">Send Message</option>
                      <option value="ADD_TAG">Add Tag</option>
                      <option value="REMOVE_TAG">Remove Tag</option>
                      <option value="ENROLL_WEBINAR">Enroll in Webinar Sequence</option>
                    </select>
                    {ruleActionType !== 'ENROLL_WEBINAR' && (
                      <textarea value={ruleActionVal} onChange={e => setRuleActionVal(e.target.value)} placeholder="Message or tag name" rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    )}
                    {ruleActionType === 'ENROLL_WEBINAR' && (
                      <p className="text-xs text-slate-400 px-1">Will enroll the contact in the webinar sequence based on their <strong>webinar_date</strong>.</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button onClick={cancelRuleForm} className="px-5 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                  <button onClick={editingRuleId ? updateRule : createRule} disabled={!ruleName || !ruleTriggerVal || (ruleActionType !== 'ENROLL_WEBINAR' && !ruleActionVal)} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50">{editingRuleId ? 'Update' : 'Save'}</button>
                </div>
              </div>
            )}

            {/* Unified automation list */}
            {(workflows.length + automations.length) > 0 ? (
              <div className="space-y-3">
                {/* Quick Action cards */}
                {automations.map(auto => (
                  <div key={`rule-${auto.id}`} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group" onClick={() => editRule(auto)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600"><Zap className="w-6 h-6" /></div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-bold text-slate-900">{auto.name}</h3>
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-[10px] font-bold uppercase">Instant</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs mt-1">
                            <span className="text-slate-400">IF</span>
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-bold text-[10px] uppercase">{auto.trigger_type?.replace('_',' ')}</span>
                            <span className="font-extrabold text-slate-800">{auto.trigger_value}</span>
                            <span className="text-slate-400">→</span>
                            <span className="px-1.5 py-0.5 bg-blue-100 rounded text-blue-600 font-bold text-[10px] uppercase">{auto.action_type === 'ENROLL_WEBINAR' ? 'Enroll Webinar' : auto.action_type?.replace('_',' ')}</span>
                            {auto.action_value && <span className="text-slate-500 truncate max-w-[120px]">{auto.action_value}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3" onClick={e => e.stopPropagation()}>
                        <div onClick={() => toggleRule(auto.id, auto.is_active)} className={`w-10 h-5 rounded-full p-0.5 cursor-pointer transition-colors ${auto.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${auto.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                        <button onClick={() => deleteRule(auto.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Workflow cards */}
                {workflows.map(wf => (
                  <div key={`wf-${wf.id}`} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group" onClick={() => loadSteps(wf)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-violet-500 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md">{wf.step_count}</div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-bold text-slate-900">{wf.name}</h3>
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold uppercase">Multi-step</span>
                          </div>
                          <div className="flex items-center space-x-3 text-xs mt-1">
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold uppercase">{wf.trigger_type?.replace('_',' ')}</span>
                            <span className="font-bold text-slate-600">{wf.trigger_value}</span>
                            <span className="text-slate-400">•</span>
                            <span className="text-emerald-600 font-bold">{wf.active_enrollments} active</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4" onClick={e => e.stopPropagation()}>
                        <div onClick={() => toggleWorkflow(wf.id, wf.is_active)} className={`w-12 h-6 rounded-full p-1 transition-colors cursor-pointer ${wf.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${wf.is_active ? 'translate-x-6' : 'translate-x-0'}`} />
                        </div>
                        <button onClick={() => deleteWorkflow(wf.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-5 h-5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center space-y-4">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-400 mx-auto"><Zap className="w-10 h-10 opacity-40" /></div>
                <h3 className="text-lg font-bold text-slate-900">No Automations Yet</h3>
                <p className="text-slate-500 max-w-sm mx-auto">Create your first automation to engage LINE leads automatically.</p>
                <button onClick={() => setShowCreateMenu(true)} className="mt-2 px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800">Get Started</button>
              </div>
            )}
          </div>
        )}

        {/* ─── BROADCAST TAB ─────────────────────────────── */}
        {tab === 'broadcast' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-6">
              <div className="space-y-2">
                <h3 className="text-xl font-extrabold text-slate-900 flex items-center">
                  <Megaphone className="w-6 h-6 mr-2 text-blue-600" /> Bulk Broadcast
                </h3>
                <p className="text-sm text-slate-500 font-medium italic">Send a personalized message to everyone with a specific tag.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">1. Select Target Tag</label>
                    <select 
                      value={broadcastTag} 
                      onChange={e => setBroadcastTag(e.target.value)} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    >
                      <option value="">-- Select a Tag --</option>
                      {availableTags.map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">2. Pick Template</label>
                    <div className="space-y-2">
                      <select 
                        value={broadcastTemplate} 
                        onChange={e => setBroadcastTemplate(e.target.value)} 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      >
                        <option value="">-- Select Template --</option>
                        {availableTemplates.map(t => (
                          <option key={t.id} value={t.content}>{t.name}</option>
                        ))}
                      </select>
                      <textarea 
                        value={broadcastTemplate} 
                        onChange={e => setBroadcastTemplate(e.target.value)} 
                        placeholder="Or type a custom message... use {{name}} for personalization."
                        rows={5}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">3. Scheduling (Optional)</label>
                    <input 
                      type="datetime-local" 
                      value={broadcastSchedule} 
                      onChange={e => setBroadcastSchedule(e.target.value)} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                    <p className="text-[10px] text-slate-400 font-medium">Leave blank to send immediately.</p>
                  </div>

                  <div className="pt-6">
                    {broadcastStatus && (
                      <div className={`mb-4 p-4 rounded-2xl text-sm font-bold flex items-center ${broadcastStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                        {broadcastStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5 mr-2" /> : <AlertCircle className="w-5 h-5 mr-2" />}
                        {broadcastStatus.text}
                      </div>
                    )}

                    <button 
                      onClick={runBroadcast}
                      disabled={!broadcastTag || !broadcastTemplate || isBroadcasting}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center justify-center space-x-2"
                    >
                      {isBroadcasting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                      <span>{broadcastSchedule ? 'Schedule Broadcast' : 'Send Broadcast Now'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* ─── TEMPLATES TAB ─────────────────────────────── */}
        {tab === 'templates' && (
          <div className="space-y-6">
            {/* Create / Edit Form */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="text-lg font-extrabold text-slate-900">
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editingTemplate ? editingTemplate.name : newTemplateName}
                    onChange={e => editingTemplate ? setEditingTemplate({...editingTemplate, name: e.target.value}) : setNewTemplateName(e.target.value)}
                    placeholder="Template name (e.g. Webinar Reminder)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <textarea
                    value={editingTemplate ? editingTemplate.content : newTemplateContent}
                    onChange={e => {
                      const val = e.target.value;
                      if (editingTemplate) setEditingTemplate({...editingTemplate, content: val});
                      else { setNewTemplateContent(val); setPreviewTemplate(val); }
                    }}
                    placeholder={"Hi {{name}}, your webinar is on {{webinar_date}}.\n\nLink: {{webinar_link}}\n\nAvailable: {{name}} {{email}} {{phone}} {{status}} {{tags}} {{notes}} {{webinar_link}} {{webinar_date}} {{follow_up_note}}"}
                    rows={7}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex space-x-3">
                    {editingTemplate ? (
                      <>
                        <button onClick={() => setEditingTemplate(null)} className="flex-1 py-2 text-slate-500 font-bold bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                        <button onClick={saveEditTemplate} disabled={isSavingTemplate || !editingTemplate.name || !editingTemplate.content} className="flex-1 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center space-x-2">
                          {isSavingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          <span>Save Changes</span>
                        </button>
                      </>
                    ) : (
                      <button onClick={createTemplate} disabled={isSavingTemplate || !newTemplateName || !newTemplateContent} className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center space-x-2">
                        {isSavingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        <span>Create Template</span>
                      </button>
                    )}
                  </div>
                </div>
                {/* Live Preview */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Preview (sample contact)</p>
                  <div className="bg-[#84A1C4] rounded-2xl p-4 min-h-[200px] flex flex-col justify-end">
                    <div className="flex justify-end">
                      <div className="bg-[#06c755] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-sm max-w-[90%] break-words">
                        <p className="text-sm whitespace-pre-wrap">
                          {renderPreview(editingTemplate ? editingTemplate.content : previewTemplate) || <span className="opacity-50 italic">Start typing to preview...</span>}
                        </p>
                      </div>
                    </div>
                    <span className="text-right text-[10px] text-white/60 mt-1">Sent now</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Available Variables — click to copy</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['{{name}}','{{email}}','{{phone}}','{{status}}','{{tags}}','{{notes}}','{{webinar_link}}','{{webinar_date}}','{{follow_up_note}}'].map(v => (
                        <button key={v} onClick={async () => { await navigator.clipboard.writeText(v); setCopiedVar(v); setTimeout(() => setCopiedVar(null), 1200); }}
                          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono border transition-all ${copiedVar === v ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'}`}>
                          {copiedVar === v ? <><Check className="w-2.5 h-2.5" />copied</> : v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Template List */}
            <div className="space-y-3">
              {availableTemplates.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                  <p className="text-slate-500">No templates yet. Create one above.</p>
                </div>
              ) : availableTemplates.map(t => (
                <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm group hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 mr-4">
                      <h4 className="font-bold text-slate-900">{t.name}</h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 whitespace-pre-wrap">{t.content}</p>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingTemplate({ id: t.id, name: t.name, content: t.content })} className="p-1.5 bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 rounded-lg transition-colors" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteTemplate(t.id)} className="p-1.5 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-lg transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAGS TAB ───────────────────────────────────── */}
        {tab === 'tags' && (
          <div className="space-y-6">
            {/* Create Tag Form */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <h3 className="text-lg font-extrabold text-slate-900 mb-4">Create Tag</h3>
              <div className="flex items-end space-x-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tag Name</label>
                  <input
                    type="text"
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createTagDef()}
                    placeholder="e.g. Hot Lead"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Color</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={newTagColour}
                      onChange={e => setNewTagColour(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-slate-50"
                    />
                    <span className="text-xs font-mono text-slate-500">{newTagColour}</span>
                  </div>
                </div>
                <button
                  onClick={createTagDef}
                  disabled={isSavingTag || !newTagName.trim()}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
                >
                  {isSavingTag ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* Tag List */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {availableTags.length === 0 ? (
                <div className="col-span-full bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                  <p className="text-slate-500">No tags defined yet.</p>
                </div>
              ) : availableTags.map((t: any) => (
                <div key={t.id || t.name} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between group hover:shadow-md transition-shadow">
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm shrink-0" style={{ backgroundColor: t.colour || '#3B82F6' }} />
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{t.name}</p>
                      <p className="text-[10px] font-mono text-slate-400">{t.colour || '#3B82F6'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteTagDef(t.name)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    title="Delete tag (removes from all contacts)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 text-center">Deleting a tag removes it from all contacts automatically.</p>
          </div>
        )}

        {/* ── WEBINAR SEQUENCE TAB ── */}
        {tab === 'webinar' && (
          <div className="space-y-6">

            {/* Test Panel */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center space-x-3">
              <Bell className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-700 mb-1">Test LINE User ID</p>
                <input
                  type="text"
                  value={wbTestLineId}
                  onChange={e => setWbTestLineId(e.target.value)}
                  className="w-full border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white font-mono"
                  placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
            </div>

            {/* Sequence Steps */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">Reminder Steps</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Messages sent based on days before the webinar. Supports: {'{{name}}'}, {'{{webinar_date}}'}, {'{{webinar_link}}'}</p>
                </div>
                <button onClick={() => { setWbStepForm(true); setWbEditingStep(null); setWbDaysBefore(6); setWbSendHour(9); setWbMessage(''); }}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
                  <Plus className="w-4 h-4" /><span>Add Step</span>
                </button>
              </div>

              {wbStepForm && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-700">{wbEditingStep ? 'Edit Step' : 'New Step'}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Days Before Webinar</label>
                      <select value={wbDaysBefore} onChange={e => setWbDaysBefore(Number(e.target.value))}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                        {[6,5,4,3,2,1,0].map(d => (
                          <option key={d} value={d}>{d === 0 ? 'D-0 (Day of webinar)' : `D-${d} (${d} day${d>1?'s':''} before)`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Send Time</label>
                      <select value={wbSendHour} onChange={e => setWbSendHour(Number(e.target.value))}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                        {Array.from({length:24},(_,i)=>i).map(h => (
                          <option key={h} value={h}>{String(h).padStart(2,'0')}:00 ({h<12?`${h===0?12:h}am`:`${h===12?12:h-12}pm`})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Message</label>
                    <textarea rows={5} value={wbMessage} onChange={e => setWbMessage(e.target.value)}
                      placeholder={"Hi {{name}}! 👋 Just a reminder — our webinar is on {{webinar_date}}.\n\nJoin here: {{webinar_link}}"}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none font-mono" />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {['{{name}}','{{webinar_link}}','{{webinar_date}}','{{email}}','{{phone}}','{{status}}','{{tags}}','{{notes}}','{{uid}}','{{follow_up_note}}'].map(v => (
                        <button key={v} onClick={async () => { await navigator.clipboard.writeText(v); setCopiedVar(v); setTimeout(() => setCopiedVar(null), 1200); }}
                          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono border transition-all ${copiedVar === v ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'}`}>
                          {copiedVar === v ? <><Check className="w-2.5 h-2.5" />copied</> : v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                    {/* Test before saving */}
                    <button
                      disabled={!wbMessage.trim() || wbTestingStepId === 'form'}
                      onClick={async () => {
                        if (!wbTestLineId.trim()) { alert('Set a LINE User ID in the test panel above first.'); return; }
                        if (!wbMessage.trim()) { alert('Write a message first.'); return; }
                        setWbTestingStepId('form');
                        try {
                          const res = await fetch('/api/line/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ lineId: wbTestLineId.trim(), message: wbMessage }),
                          });
                          const data = await res.json();
                          alert(data.success ? '✓ Test message sent to LINE!' : `Failed: ${data.error}`);
                        } catch { alert('Send error — check your LINE token.'); }
                        setWbTestingStepId(null);
                      }}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {wbTestingStepId === 'form' ? 'Sending…' : '▶ Test Send'}
                    </button>
                    <button disabled={wbSaving} onClick={async () => {
                      if (!wbMessage.trim()) { alert('Message cannot be empty.'); return; }
                      setWbSaving(true);
                      try {
                        // Always get a fresh sequence ID (handles null state from URL navigation)
                        let seqId = wbSequence?.id;
                        if (!seqId) {
                          const fresh = await fetch('/api/webinar-sequence').then(r => r.json()).catch(() => null);
                          seqId = fresh?.id;
                          if (fresh?.id) setWbSequence(fresh);
                        }
                        if (!seqId) { alert('Could not load sequence. Please refresh the page and try again.'); setWbSaving(false); return; }

                        const res = wbEditingStep
                          ? await fetch('/api/webinar-sequence', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: wbEditingStep.id, days_before: wbDaysBefore, send_hour: wbSendHour, message: wbMessage }) })
                          : await fetch('/api/webinar-sequence', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ sequence_id: seqId, days_before: wbDaysBefore, send_hour: wbSendHour, message: wbMessage }) });
                        const data = await res.json();
                        if (!res.ok || data.success === false) { alert(`Save failed: ${data.error || res.statusText}`); setWbSaving(false); return; }
                        setWbStepForm(false); setWbEditingStep(null);
                        fetchWebinarData();
                      } catch (e: any) { alert(`Save error: ${e.message}`); }
                      finally { setWbSaving(false); }
                    }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {wbSaving ? 'Saving…' : 'Save Step'}
                    </button>
                    <button onClick={() => { setWbStepForm(false); setWbEditingStep(null); }}
                      className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                  </div>
                </div>
              )}

              {/* Steps list */}
              {(wbSequence?.webinar_sequence_steps || []).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No steps yet. Add your first reminder step above.</p>
              ) : (
                <div className="space-y-2">
                  {(wbSequence?.webinar_sequence_steps || []).map((step: any) => (
                    <div key={step.id} className="flex items-start space-x-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex-shrink-0 w-16 text-center">
                        <span className="text-2xl font-black text-blue-600">D-{step.days_before}</span>
                        <p className="text-xs text-slate-400">{step.send_hour}:00</p>
                      </div>
                      <p className="flex-1 text-sm text-slate-700 whitespace-pre-wrap">{step.message}</p>
                      <div className="flex space-x-1 flex-shrink-0">
                        <button
                          disabled={wbTestingStepId === step.id}
                          onClick={async () => {
                            if (!wbTestLineId.trim()) { alert('Enter a LINE User ID in the test panel first.'); return; }
                            setWbTestingStepId(step.id);
                            try {
                              const res = await fetch('/api/line/send', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ lineId: wbTestLineId.trim(), message: step.message }),
                              });
                              const data = await res.json();
                              alert(data.success ? '✓ Test message sent!' : `Failed: ${data.error}`);
                            } catch { alert('Send error'); }
                            setWbTestingStepId(null);
                          }}
                          className="px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 disabled:opacity-50 flex-shrink-0"
                          title="Send this message to the test LINE user"
                        >
                          {wbTestingStepId === step.id ? '…' : 'Test'}
                        </button>
                        <button onClick={() => { setWbEditingStep(step); setWbDaysBefore(step.days_before); setWbSendHour(step.send_hour); setWbMessage(step.message); setWbStepForm(true); }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit step">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={async () => {
                          if (!confirm('Delete this step?')) return;
                          await fetch(`/api/webinar-sequence?id=${step.id}`, { method: 'DELETE' });
                          fetchWebinarData();
                        }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enrollments */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="font-bold text-slate-800">Active Enrollments ({wbEnrollments.filter((e:any) => e.status === 'active').length})</h3>
              {wbEnrollments.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No enrollments yet. They appear automatically when GHL sends a webinar date.</p>
              ) : (
                <div className="space-y-2">
                  {wbEnrollments.map((enroll: any) => {
                    const msgs = enroll.webinar_scheduled_messages || [];
                    const sent = msgs.filter((m: any) => m.status === 'sent').length;
                    const pending = msgs.filter((m: any) => m.status === 'pending').length;
                    const skipped = msgs.filter((m: any) => m.status === 'skipped').length;
                    const contact = enroll.contacts;
                    return (
                      <div key={enroll.id} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{contact?.name || contact?.email || 'Unknown'}</p>
                          <p className="text-xs text-slate-400">
                            Webinar: {new Date(enroll.webinar_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <div className="flex space-x-2 mt-1">
                            <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">{sent} sent</span>
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{pending} pending</span>
                            {skipped > 0 && <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{skipped} skipped</span>}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${enroll.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {enroll.status}
                        </span>
                        {enroll.status === 'active' && (
                          <button onClick={async () => {
                            if (!confirm('Cancel this enrollment? Pending messages will be skipped.')) return;
                            await fetch(`/api/webinar-sequence/enrollments?id=${enroll.id}`, { method: 'DELETE' });
                            fetchWebinarData();
                          }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}


      </div>
    </div>
  );
}

// ============================================================================
// LINE IMPORT VIEW — CSV import: line_id + optional email/name/webinar fields
// ============================================================================
type ImportRow = { line_id: string; email: string; display_name: string; webinar_date: string; webinar_link: string };
type RowResult = ImportRow & { status: 'created' | 'linked' | 'updated' | 'skipped' | 'already_had' };

function LineMatchView() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [dupCount, setDupCount] = useState(0);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [summary, setSummary] = useState<{ created: number; linked: number; updated: number; already_had: number; skipped: number } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [parseError, setParseError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const STATUS_LABEL: Record<RowResult['status'], string> = {
    created: 'Created',
    linked: 'LINE ID linked',
    updated: 'Updated',
    already_had: 'No change',
    skipped: 'Skipped',
  };
  const STATUS_COLOR: Record<RowResult['status'], string> = {
    created: 'text-blue-600 bg-blue-50',
    linked: 'text-green-600 bg-green-50',
    updated: 'text-teal-600 bg-teal-50',
    already_had: 'text-amber-600 bg-amber-50',
    skipped: 'text-slate-500 bg-slate-100',
  };

  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let cur = '', inQ = false;
    const cells: string[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else if ((ch === '\n' || ch === '\r') && !inQ) {
        cells.push(cur.trim()); cur = '';
        if (cells.some(c => c)) rows.push([...cells]);
        cells.length = 0;
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else { cur += ch; }
    }
    if (cur || cells.length) { cells.push(cur.trim()); if (cells.some(c => c)) rows.push(cells); }
    return rows;
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(''); setResults(null); setSummary(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const allRows = parseCSV(text);
      if (allRows.length < 2) { setParseError('File appears empty or has no data rows.'); return; }

      const header = allRows[0].map(h => h.toLowerCase().replace(/^"|"$/g, '').trim());
      const col = (names: string[]) => header.findIndex(h => names.includes(h));

      const lineIdIdx   = col(['user_id', 'userid', 'line_id', 'lineid', 'line id']);
      const emailIdx    = col(['email']);
      const nameIdx     = col(['display_name', 'displayname', 'display name', 'name']);
      const wDateIdx    = col(['webinar_date', 'webinardate', 'webinar date', 'date']);
      const wLinkIdx    = col(['webinar_link', 'webinarlink', 'webinar link', 'link']);

      if (lineIdIdx === -1) {
        setParseError(`Required column not found. Need one of: user_id, userid, line_id. Found: ${header.join(', ')}`);
        return;
      }

      const parsed: ImportRow[] = [];
      for (let i = 1; i < allRows.length; i++) {
        const c = allRows[i];
        const lineId = (c[lineIdIdx] || '').replace(/^"|"$/g, '').trim();
        if (!lineId) continue;
        parsed.push({
          line_id: lineId,
          email: emailIdx >= 0 ? (c[emailIdx] || '').replace(/^"|"$/g, '').trim().toLowerCase() : '',
          display_name: nameIdx >= 0 ? (c[nameIdx] || '').replace(/^"|"$/g, '').trim() : '',
          webinar_date: wDateIdx >= 0 ? (c[wDateIdx] || '').replace(/^"|"$/g, '').trim() : '',
          webinar_link: wLinkIdx >= 0 ? (c[wLinkIdx] || '').replace(/^"|"$/g, '').trim() : '',
        });
      }
      if (parsed.length === 0) { setParseError('No valid rows found (line_id column was empty for all rows).'); return; }

      // Deduplicate by line_id — keep last occurrence (most complete data)
      const seen = new Map<string, ImportRow>();
      for (const r of parsed) seen.set(r.line_id, r);
      const deduped = Array.from(seen.values());
      setDupCount(parsed.length - deduped.length);
      setRows(deduped);
      setPreview(deduped.slice(0, 5));
    };
    reader.readAsText(file);
  };

  const handleRun = async () => {
    if (rows.length === 0) return;
    setIsRunning(true); setResults(null); setSummary(null); setParseError('');

    const BATCH_SIZE = 50;
    const allResults: RowResult[] = [];
    const totals = { created: 0, linked: 0, updated: 0, already_had: 0, skipped: 0 };

    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        setProgress({ done: i, total: rows.length });

        const res = await fetch('/api/contacts/link-line-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch }),
        });
        const data = await res.json();

        if (!data.success) {
          // Log error but continue with remaining batches
          batch.forEach(r => allResults.push({ ...r, status: 'skipped' }));
          totals.skipped += batch.length;
          continue;
        }

        allResults.push(...data.results);
        totals.created += data.created || 0;
        totals.linked += data.linked || 0;
        totals.updated += data.updated || 0;
        totals.already_had += data.already_had || 0;
        totals.skipped += data.skipped || 0;
      }

      setProgress({ done: rows.length, total: rows.length });
      setResults(allResults);
      setSummary(totals);
    } catch (err: unknown) {
      if (allResults.length > 0) {
        // Partial success — show what we got
        setResults(allResults);
        setSummary(totals);
        setParseError(`Import partially completed (${allResults.length}/${rows.length}). ${err instanceof Error ? err.message : 'Network error on remaining batches.'}`);
      } else {
        setParseError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const reset = () => {
    setRows([]); setPreview([]); setDupCount(0); setResults(null); setSummary(null); setParseError(''); setProgress(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">LINE Contact Import</h2>
          <p className="text-slate-500 mt-1 text-sm leading-relaxed">
            Upload a CSV exported from LINE or your webinar platform. Contacts are matched by <strong>line_id (user_id)</strong> first, then by <strong>email</strong> if provided.
            New contacts are created for unmatched rows. Existing data is never overwritten — only blank fields are filled in.
          </p>
        </div>

        {/* Column guide */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Expected CSV columns</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { col: 'user_id / line_id', note: 'Required — LINE user ID', req: true },
              { col: 'email', note: 'Optional — used for matching', req: false },
              { col: 'display_name / name', note: 'Optional — stored as contact name', req: false },
              { col: 'webinar_date', note: 'Optional — format: 2026-03-25', req: false },
              { col: 'webinar_link', note: 'Optional — full URL', req: false },
            ].map(({ col, note, req }) => (
              <div key={col} className="flex items-start gap-2">
                <code className={`px-1.5 py-0.5 rounded text-xs font-mono shrink-0 ${req ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{col}</code>
                <span className="text-slate-400">{note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upload card */}
        {!results && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">Click to upload CSV</p>
              <p className="text-xs text-slate-400">Accepts .csv files — column order doesn't matter</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {preview.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{rows.length} unique rows loaded — preview (first 5)</p>
                  {dupCount > 0 && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                      <AlertCircle className="w-3 h-3" />
                      {dupCount} duplicate{dupCount > 1 ? 's' : ''} removed
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        {['LINE User ID', 'Email', 'Display Name', 'Webinar Date', 'Webinar Link'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-slate-400 font-semibold border-b border-slate-100 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="px-3 py-2 font-mono text-slate-600 max-w-[120px] truncate">{r.line_id}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">{r.email || <span className="text-slate-300 italic">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate">{r.display_name || <span className="text-slate-300 italic">—</span>}</td>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.webinar_date || <span className="text-slate-300 italic">—</span>}</td>
                          <td className="px-3 py-2 text-slate-400 max-w-[100px] truncate">{r.webinar_link || <span className="text-slate-300 italic">—</span>}</td>
                        </tr>
                      ))}
                      {rows.length > 5 && (
                        <tr><td colSpan={5} className="px-3 py-2 text-xs text-slate-400 italic">…and {rows.length - 5} more rows</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleRun}
                    disabled={isRunning}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition-all"
                  >
                    {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                    {isRunning && progress ? `Importing… ${progress.done}/${progress.total}` : isRunning ? 'Importing…' : `Import ${rows.length} rows`}
                  </button>
                  <button onClick={reset} className="px-4 py-2.5 border border-slate-200 text-slate-500 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all">
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {results && summary && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: 'Created', value: summary.created, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
                { label: 'ID Linked', value: summary.linked, color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
                { label: 'Updated', value: summary.updated, color: 'text-teal-600', bg: 'bg-teal-50 border-teal-100' },
                { label: 'No change', value: summary.already_had, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
                { label: 'Skipped', value: summary.skipped, color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-3 ${s.bg} flex flex-col items-center`}>
                  <span className={`text-2xl font-extrabold ${s.color}`}>{s.value}</span>
                  <span className="text-[10px] text-slate-500 font-semibold mt-0.5 text-center leading-tight">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Detail table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">All results ({results.length})</span>
                <button onClick={reset} className="text-xs text-blue-600 hover:underline font-semibold">Upload another</button>
              </div>
              <div className="overflow-auto max-h-[420px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-2 text-slate-400 font-semibold whitespace-nowrap">LINE User ID</th>
                      <th className="text-left px-4 py-2 text-slate-400 font-semibold">Email</th>
                      <th className="text-left px-4 py-2 text-slate-400 font-semibold">Name</th>
                      <th className="text-left px-4 py-2 text-slate-400 font-semibold whitespace-nowrap">Webinar Date</th>
                      <th className="text-left px-4 py-2 text-slate-400 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-mono text-slate-500 max-w-[110px] truncate">{r.line_id}</td>
                        <td className="px-4 py-2 text-slate-600 max-w-[140px] truncate">{r.email || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2 text-slate-600 max-w-[110px] truncate">{r.display_name || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{r.webinar_date || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-slate-400">Loading…</div>}>
      <CRMDashboard />
    </Suspense>
  );
}
