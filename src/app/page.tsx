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

function CRMDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"contacts" | "inbox" | "marketing">("contacts");
  const [view, setView] = useState<"list" | "detail" | "add">("list");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [activeWebinarDate, setActiveWebinarDate] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [isDeduping, setIsDeduping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Fetch contacts on mount + real-time subscriptions
  useEffect(() => {
    fetchContacts();
    fetch('/api/settings?key=active_webinar_date').then(r => r.json()).then(d => { if (d.value) setActiveWebinarDate(d.value); }).catch(() => {});

    // Real-time: watch contacts table for any changes
    const contactChannel = supabase
      .channel('contacts_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, (payload) => {
        // New contact added — refetch to get full formatted data
        fetchContacts();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts' }, () => {
        // Full refetch ensures all fields (including line_id) are always current
        fetchContacts();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contacts' }, (payload) => {
        setContacts(prev => prev.filter(c => c.id !== payload.old.id));
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

  const fetchContacts = async () => {
    setIsLoading(true);
    setFetchError("");
    try {
      const response = await fetch(`${CONTACTS_API}?all=true`, { cache: 'no-store' });
      if (!response.ok) throw new Error("Failed to fetch data from Supabase backend");

      const data: Contact[] = await response.json();
      setContacts(data);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setFetchError("Failed to load contacts from the database. Please check your Supabase connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDedup = async () => {
    setIsDeduping(true);
    try {
      const res = await fetch('/api/contacts/deduplicate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchContacts();
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
    const tabParam = searchParams.get('tab') as "contacts" | "inbox" | "marketing" | null;
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
          fetchContacts();
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
      {activeTab !== 'marketing' && (
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
                      : <span className="font-bold">{contacts.length}</span>} contacts
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
              (activeTab === 'inbox' ? contacts.filter(c => c.lineId) : filteredContacts).map(contact => {
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
                          </>}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )}))
            }
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
                <span className="text-sm font-bold text-slate-700">Sheet View — {filteredContacts.length} contacts</span>
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

            {/* Sheet table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm border-collapse min-w-[1100px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                    {[
                      { key: 'name',         label: 'Name',         w: '160px' },
                      { key: 'email',        label: 'Email',        w: '200px' },
                      { key: 'phone',        label: 'Phone',        w: '140px' },
                      { key: 'tags',         label: 'Tags',         w: '220px' },
                      { key: 'status',       label: 'Status',       w: '110px' },
                      { key: 'notes',        label: 'Notes',        w: '220px' },
                      { key: 'lineId',       label: 'LINE ID',      w: '150px' },
                    ].map(col => (
                      <th key={col.key} style={{ minWidth: col.w }} className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider border-l border-slate-100">{col.label}</th>
                    ))}
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider border-l border-slate-100 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((contact, idx) => {
                    const STATUSES = ['Lead', 'Nurturing', 'Customer', 'Closed'];
                    const renderCell = (field: string, displayValue: string) => {
                      const cellKey = `${contact.id}:${field}`;
                      const isEditing = editingCell?.contactId === contact.id && editingCell?.field === field;
                      const isSaving = savingCell === cellKey;

                      if (isSaving) {
                        return <span className="text-slate-400 italic text-xs">Saving…</span>;
                      }
                      if (isEditing) {
                        if (field === 'status') {
                          return (
                            <select
                              autoFocus
                              value={cellDraft}
                              onChange={e => setCellDraft(e.target.value)}
                              onBlur={() => saveCell(contact, field, cellDraft)}
                              className="w-full text-xs border border-blue-400 rounded px-1.5 py-1 outline-none bg-white"
                            >
                              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          );
                        }
                        if (field === 'notes') {
                          return (
                            <textarea
                              autoFocus
                              value={cellDraft}
                              onChange={e => setCellDraft(e.target.value)}
                              onBlur={() => saveCell(contact, field, cellDraft)}
                              rows={3}
                              className="w-full text-xs border border-blue-400 rounded px-1.5 py-1 outline-none resize-none bg-white"
                            />
                          );
                        }
                        return (
                          <input
                            autoFocus
                            type="text"
                            value={cellDraft}
                            onChange={e => setCellDraft(e.target.value)}
                            onBlur={() => saveCell(contact, field, cellDraft)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (e.key === 'Escape') { setEditingCell(null); } }}
                            className="w-full text-xs border border-blue-400 rounded px-1.5 py-1 outline-none bg-white"
                          />
                        );
                      }
                      return (
                        <span
                          onClick={() => { setEditingCell({ contactId: contact.id, field }); setCellDraft(displayValue); }}
                          className="block w-full min-h-[22px] cursor-text hover:bg-blue-50 rounded px-1 py-0.5 truncate text-xs text-slate-700"
                          title={displayValue || 'Click to edit'}
                        >
                          {displayValue || <span className="text-slate-300 italic">—</span>}
                        </span>
                      );
                    };

                    return (
                      <tr key={contact.id} className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                        <td className="px-3 py-2 text-[10px] text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-2 py-1.5 border-l border-slate-100 font-medium">{renderCell('name', contact.name)}</td>
                        <td className="px-2 py-1.5 border-l border-slate-100">{renderCell('email', contact.email)}</td>
                        <td className="px-2 py-1.5 border-l border-slate-100">{renderCell('phone', contact.phone)}</td>
                        <td className="px-2 py-1.5 border-l border-slate-100">
                          {renderCell('tags', (contact.tags || []).join(', '))}
                        </td>
                        <td className="px-2 py-1.5 border-l border-slate-100">
                          {editingCell?.contactId === contact.id && editingCell?.field === 'status' ? renderCell('status', contact.status) : (
                            <span
                              onClick={() => { setEditingCell({ contactId: contact.id, field: 'status' }); setCellDraft(contact.status || 'Lead'); }}
                              className={`inline-block cursor-pointer px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                contact.status === 'Customer' ? 'bg-emerald-100 text-emerald-700' :
                                contact.status === 'Closed' ? 'bg-slate-200 text-slate-500' :
                                contact.status === 'Nurturing' ? 'bg-blue-100 text-blue-700' :
                                'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {contact.status || 'Lead'}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 border-l border-slate-100 max-w-[220px]">{renderCell('notes', contact.notes || '')}</td>
                        <td className="px-2 py-1.5 border-l border-slate-100">
                          <span className="text-xs text-slate-400 font-mono truncate block">{contact.lineId ? `${contact.lineId.substring(0, 12)}…` : <span className="text-slate-200 italic">—</span>}</span>
                        </td>
                        <td className="px-2 py-1.5 border-l border-slate-100">
                          <button onClick={() => handleContactClick(contact.id)} className="text-[10px] text-blue-500 hover:text-blue-700 font-bold" title="Open detail">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
  contactData: Contact;
  onBack: () => void;
  onSaveSuccess: (updatedContact: Contact) => void;
  isNew: boolean;
  allContacts: Contact[];
  onSwitchContact: (id: string) => void;
}

function ContactDetailView({ contactData, onBack, onSaveSuccess, isNew, allContacts, onSwitchContact }: ContactDetailViewProps) {
  const safeContactData: Contact = {
      ...contactData,
      tags: contactData.tags || [],
      webinar: contactData.webinar || { link: "", dateTime: "" },
      status: contactData.status || "Lead",
      history: contactData.history || []
  };
  const [contact, setContact] = useState<Contact>(safeContactData);
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
    // Also reset form state if contactData changes (switched contact via search)
    setContact({
        ...contactData,
        tags: contactData.tags || [],
        webinar: contactData.webinar || { link: "", dateTime: "" },
        status: contactData.status || "Lead",
        history: contactData.history || []
    });
    setLineMessageText("");
    setMessageFeedback({ type: "", text: "" });
    // Fetch webinar enrollment for this contact
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
    }
  }, [contactData]);

  useEffect(() => {
    const isDifferent = JSON.stringify(safeContactData) !== JSON.stringify(contact);
    if (isNew) {
      setHasUnsavedChanges(contact.name?.trim().length > 0 || isDifferent);
    } else {
      setHasUnsavedChanges(isDifferent);
    }
  }, [contact, safeContactData, isNew]);

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

                <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-2">Contact Details</h3>

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
            <p className="text-[15px] leading-relaxed break-words">{text}</p>
          </div>
          <span className="text-[10px] text-white/60 mt-1 ml-1">{time}</span>
        </div>
      );
    } else {
      items.push(
        <div key={i} className="flex flex-col items-end w-full">
          <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-md break-words border ${isAuto ? 'bg-amber-500 text-white border-amber-600' : 'bg-[#06c755] text-white border-[#05b54d]'}`}>
            <p className="text-[15px] leading-relaxed">{text}{isAuto && <Bell className="inline w-3 h-3 ml-1.5 opacity-70" />}</p>
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

         <div className="p-4 bg-[#e8eef2] border-t border-slate-300 flex items-end space-x-3 shrink-0">
            <textarea
             value={lineMessageText}
             onChange={(e) => setLineMessageText(e.target.value)}
             onKeyDown={(e) => {
               if (e.key === 'Enter' && !e.shiftKey) {
                 e.preventDefault();
                 handleSendLineMessage();
               }
             }}
             placeholder="Type a message..."
             className="flex-1 bg-white border border-slate-300 rounded-3xl px-5 py-3 text-[15px] shadow-inner focus:ring-2 focus:ring-emerald-500 outline-none resize-none max-h-32 min-h-[48px]"
             disabled={isSendingMessage}
             rows={1}
             style={{ height: lineMessageText ? 'auto' : '48px' }}
           />
           <button
             onClick={handleSendLineMessage}
             disabled={!lineMessageText.trim() || isSendingMessage}
             className="w-12 h-12 shrink-0 bg-[#06c755] hover:bg-[#05b54d] text-white rounded-full shadow-md transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed group"
           >
             {isSendingMessage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1 pr-1 group-enabled:group-hover:translate-x-0.5 transition-transform" />}
           </button>
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

               {(activeContact.webinar?.link || activeContact.webinar?.dateTime) && (
                  <div className="space-y-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                     <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center">
                        <Calendar className="w-3.5 h-3.5 mr-1" /> Webinar
                     </h3>
                     {activeContact.webinar.dateTime && (
                        <p className="text-sm font-medium text-blue-900 border-l-2 border-blue-400 pl-2">
                           {new Date(activeContact.webinar.dateTime).toLocaleDateString([], {weekday: 'short', month: 'long', day: 'numeric', year: 'numeric'})}
                        </p>
                     )}
                     {activeContact.webinar.link && (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => copyToClipboard(activeContact.webinar.link, 'webinar')} className="flex-1 flex items-center justify-center space-x-1.5 text-xs font-bold bg-white border border-blue-200 py-1.5 px-3 rounded-lg text-blue-700 shadow-sm hover:shadow transition-all">
                            {copiedField === 'webinar' ? <><Check className="w-3.5 h-3.5" /> <span>Copied!</span></> : <><LinkIcon className="w-3.5 h-3.5" /> <span>Copy Link</span></>}
                          </button>
                          <a href={activeContact.webinar.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-all shadow-sm">
                            Open
                          </a>
                        </div>
                     )}
                  </div>
               )}

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

               <div className="space-y-3 border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                     <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Webinar Stats
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">Attended Webinar</span>
                    <button 
                      onClick={() => {
                        const updated = { ...activeContact, attended: !activeContact.attended };
                        onUpdateContact(updated);
                        handleUpdateContactField(updated);
                      }}
                      className={`w-10 h-5 rounded-full p-0.5 transition-colors ${activeContact.attended ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${activeContact.attended ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">Product Purchased</span>
                    <button 
                      onClick={() => {
                        const updated = { ...activeContact, purchased: !activeContact.purchased };
                        onUpdateContact(updated);
                        handleUpdateContactField(updated);
                      }}
                      className={`w-10 h-5 rounded-full p-0.5 transition-colors ${activeContact.purchased ? 'bg-blue-600' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${activeContact.purchased ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
               </div>

               {/* Scheduled Messages Block */}
               <div className="space-y-3 border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                     <Bell className="w-3.5 h-3.5 mr-1" /> Schedule Message
                  </h3>
                  <textarea
                     value={scheduleMessage}
                     onChange={e => setScheduleMessage(e.target.value)}
                     placeholder="Type your scheduled message..."
                     rows={2}
                     className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                  />
                  <input
                     type="datetime-local"
                     value={scheduleDateTime}
                     onChange={e => setScheduleDateTime(e.target.value)}
                     className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  {scheduleSuccess && <p className="text-xs text-emerald-600 font-semibold">{scheduleSuccess}</p>}
                  <button
                     onClick={handleScheduleMessage}
                     disabled={!scheduleMessage.trim() || !scheduleDateTime || isScheduling}
                     className="w-full flex items-center justify-center space-x-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 px-3 rounded-lg disabled:opacity-50 transition-colors"
                  >
                     {isScheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                     <span>Schedule Send</span>
                  </button>

                  {loadingReminders ? (
                     <p className="text-xs text-slate-400">Loading...</p>
                  ) : scheduledReminders.filter(r => r.status === 'pending').length > 0 ? (
                     <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-400 font-semibold uppercase">Queued</p>
                        {scheduledReminders.filter(r => r.status === 'pending').map(r => (
                           <div key={r.id} className="flex items-start justify-between bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                              <div className="flex-1 min-w-0 mr-2">
                                 <p className="text-xs text-slate-700 font-medium truncate">{r.message}</p>
                                 <p className="text-[10px] text-slate-400">{new Date(r.scheduled_time).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</p>
                              </div>
                              <button onClick={() => handleDeleteReminder(r.id)} className="text-red-400 hover:text-red-600 shrink-0">
                                 <X className="w-3.5 h-3.5" />
                              </button>
                           </div>
                        ))}
                     </div>
                  ) : null}
               </div>
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

// ─── VISUAL CANVAS COMPONENTS ───────────────────────────────────────────────

function VisualCanvas({ steps, onSelectNode, onAddNode }: { steps: Step[], onSelectNode: (s: Step) => void, onAddNode: (parentId: string, branch?: string) => void }) {
  // Simple recursive tree builder
  const renderNode = (step: Step, depth = 0) => {
    const children = steps.filter(s => s.parent_id === step.id);
    
    return (
      <div key={step.id} className="flex flex-col items-center">
        {/* Node Card */}
        <div 
          onClick={() => onSelectNode(step)}
          className={`w-48 p-4 rounded-xl border-2 transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm ${
            step.node_type === 'CONDITION' ? 'bg-amber-50 border-amber-200' :
            step.node_type === 'WAIT' ? 'bg-indigo-50 border-indigo-200' :
            'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center space-x-2 mb-2">
            {step.node_type === 'CONDITION' ? <Filter className="w-3.5 h-3.5 text-amber-600" /> :
             step.node_type === 'WAIT' ? <Clock className="w-3.5 h-3.5 text-indigo-600" /> :
             <MessageCircle className="w-3.5 h-3.5 text-blue-600" />}
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{step.node_type}</span>
          </div>
          <p className="text-xs font-bold text-slate-800 line-clamp-2">
            {step.node_type === 'CONDITION' ? `If ${step.condition_config?.field || '...'}` :
             step.node_type === 'WAIT' ? `Wait ${step.wait_config?.amount || '...'} ${step.wait_config?.unit || ''}` :
             step.action_type === 'SEND_MESSAGE' ? step.message_template : `Add Tag: ${step.action_value}`}
          </p>
        </div>

        {/* Children Branches */}
        {children.length > 0 && (
          <div className="flex flex-col items-center mt-8 relative">
            {/* Connection Line */}
            <div className="absolute top-[-32px] w-0.5 h-8 bg-slate-200" />
            
            <div className="flex space-x-12">
              {children.map(child => (
                <div key={child.id} className="flex flex-col items-center">
                  {child.branch_type && child.branch_type !== 'DEFAULT' && (
                    <span className={`text-[9px] font-black uppercase mb-2 px-1.5 py-0.5 rounded ${child.branch_type === 'YES' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {child.branch_type}
                    </span>
                  )}
                  {renderNode(child, depth + 1)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Button (if no children or ACTION node) */}
        {children.length === 0 && (
          <button 
            onClick={(e) => { e.stopPropagation(); onAddNode(step.id); }}
            className="mt-4 w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all z-10"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  const triggerNode = steps.find(s => s.node_type === 'START' || !s.parent_id);

  return (
    <div className="w-full h-full min-h-[500px] flex justify-center py-10 overflow-x-auto">
      <div className="flex flex-col items-center">
        {/* Trigger Header */}
        <div className="w-56 p-4 bg-slate-900 rounded-2xl shadow-xl flex items-center space-x-3 mb-8 border border-slate-800">
           <div className="p-2 bg-blue-600 rounded-lg text-white"><ArrowLeft className="w-5 h-5 rotate-90" /></div>
           <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trigger</p>
              <p className="text-sm font-bold text-white">New Lead Added</p>
           </div>
        </div>
        
        {/* Draw Tree */}
        {triggerNode ? renderNode(triggerNode) : (
          <button 
            onClick={() => onAddNode('')} 
            className="w-48 p-8 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-all bg-white"
          >
            <Plus className="w-8 h-8 mb-2" />
            <span className="text-xs font-bold">Add First Step</span>
          </button>
        )}
      </div>
    </div>
  );
}

function AutomationsView({ initialSub }: { initialSub?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<'workflows' | 'rules' | 'broadcast' | 'templates' | 'tags' | 'webinar'>(
    (initialSub as any) || 'workflows'
  );

  const navigate = (sub: string) => {
    setTab(sub as any);
    router.push(`/?tab=marketing&sub=${sub}`);
  };

  const [viewMode, setViewMode] = useState<'list' | 'canvas'>('list');
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
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);

  // Create workflow form
  const [showWfForm, setShowWfForm] = useState(false);
  const [wfName, setWfName] = useState('');
  const [wfDesc, setWfDesc] = useState('');
  const [wfTrigger, setWfTrigger] = useState('TAG_ADDED');
  const [wfTriggerVal, setWfTriggerVal] = useState('');

  // Add step form (Phase 8 compatible)
  const [showStepForm, setShowStepForm] = useState(false);
  const [newParentId, setNewParentId] = useState<string | undefined>();
  const [newBranchType, setNewBranchType] = useState<'YES' | 'NO' | 'DEFAULT'>('DEFAULT');
  const [stepNodeType, setStepNodeType] = useState<Step['node_type']>('ACTION');
  
  const [stepDay, setStepDay] = useState(5); // Friday
  const [stepTime, setStepTime] = useState('09:00');
  const [stepAction, setStepAction] = useState('SEND_MESSAGE');
  const [stepMessage, setStepMessage] = useState('');
  const [stepTagVal, setStepTagVal] = useState('');
  
  // Wait/Condition config
  const [waitAmount, setWaitAmount] = useState(1);
  const [waitUnit, setWaitUnit] = useState('days');
  const [condField, setCondField] = useState('attended');
  const [condOp, setCondOp] = useState('==');
  const [condVal, setCondVal] = useState('true');

  // Simple automation form
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleTriggerType, setRuleTriggerType] = useState('TAG_ADDED');
  const [ruleTriggerVal, setRuleTriggerVal] = useState('');
  const [ruleActionType, setRuleActionType] = useState('SEND_MESSAGE');
  const [ruleActionVal, setRuleActionVal] = useState('');
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
    if (Array.isArray(data) && data.length > 0) setViewMode('canvas');
  };

  const createWorkflow = async () => {
    if (!wfName.trim()) return;
    const res = await fetch('/api/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: wfName, description: wfDesc, trigger_type: wfTrigger, trigger_value: wfTriggerVal }) });
    const data = await res.json();
    if (data.success) { setWorkflows([{ ...data.workflow, step_count: 0, active_enrollments: 0 }, ...workflows]); setShowWfForm(false); setWfName(''); setWfDesc(''); setWfTriggerVal(''); }
  };

  const deleteWorkflow = async (id: string) => {
    await fetch(`/api/workflows?id=${id}`, { method: 'DELETE' });
    setWorkflows(prev => prev.filter(w => w.id !== id));
    if (selectedWf?.id === id) { setSelectedWf(null); setSteps([]); }
  };

  const toggleWorkflow = async (id: string, current: boolean) => {
    await fetch('/api/workflows', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: !current }) });
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, is_active: !current } : w));
  };

  const addStep = async () => {
    if (!selectedWf) return;
    
    // Auto-calculate order based on siblings
    const siblings = steps.filter(s => s.parent_id === newParentId);
    const order = siblings.length + 1;

    const payload: any = { 
      workflow_id: selectedWf.id, 
      parent_id: newParentId,
      branch_type: newBranchType,
      node_type: stepNodeType,
      step_order: order,
      action_type: stepAction, 
      message_template: stepAction === 'SEND_MESSAGE' ? stepMessage : '', 
      action_value: stepAction !== 'SEND_MESSAGE' ? stepTagVal : '' 
    };

    if (stepNodeType === 'WAIT') {
      payload.wait_config = { amount: waitAmount, unit: waitUnit };
    } else if (stepNodeType === 'CONDITION') {
      payload.condition_config = { field: condField, operator: condOp, value: condVal };
    } else if (stepNodeType === 'ACTION') {
      // Keep legacy day/time for now if needed, though hidden in canvas
      payload.day_of_week = stepDay;
      payload.send_time = stepTime;
    }

    const res = await fetch('/api/workflows/steps', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(payload) 
    });
    const data = await res.json();
    if (data.success) { 
      setSteps([...steps, { ...data.step, day_name: stepDay !== undefined ? DAY_NAMES[stepDay] : undefined }]); 
      setShowStepForm(false); 
      setStepMessage(''); 
      setStepTagVal(''); 
      setNewParentId(undefined);
      setNewBranchType('DEFAULT');
    }
  };

  const deleteStep = async (id: string) => {
    await fetch(`/api/workflows/steps?id=${id}`, { method: 'DELETE' });
    setSteps(prev => prev.filter(s => s.id !== id));
  };

  const createRule = async () => {
    if (!ruleName.trim()) return;
    const res = await fetch('/api/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: ruleName, trigger_type: ruleTriggerType, trigger_value: ruleTriggerVal, action_type: ruleActionType, action_value: ruleActionVal, is_active: true }) });
    const data = await res.json();
    if (data.success) { setAutomations([data.automation, ...automations]); setShowRuleForm(false); setRuleName(''); setRuleTriggerVal(''); setRuleActionVal(''); }
  };

  const deleteRule = async (id: string) => {
    await fetch(`/api/automations?id=${id}`, { method: 'DELETE' });
    setAutomations(prev => prev.filter(a => a.id !== id));
  };

  const toggleRule = async (id: string, current: boolean) => {
    await fetch('/api/automations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: !current }) });
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, is_active: !current } : a));
  };
  const createTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateContent.trim()) return;
    setIsSavingTemplate(true);
    try {
      const res = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTemplateName.trim(), content: newTemplateContent.trim() }) });
      const data = await res.json();
      if (data.success) {
        setAvailableTemplates(prev => [data.template, ...prev]);
        setNewTemplateName('');
        setNewTemplateContent('');
        setPreviewTemplate('');
      }
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const saveEditTemplate = async () => {
    if (!editingTemplate) return;
    setIsSavingTemplate(true);
    try {
      await fetch('/api/templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingTemplate.id, name: editingTemplate.name, content: editingTemplate.content }) });
      setAvailableTemplates(prev => prev.map(t => t.id === editingTemplate.id ? { ...t, ...editingTemplate } : t));
      setEditingTemplate(null);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
    setAvailableTemplates(prev => prev.filter(t => t.id !== id));
    if (editingTemplate?.id === id) setEditingTemplate(null);
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
    return (
      <div className="flex-1 w-full h-full bg-slate-50 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center space-x-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <button onClick={() => { setSelectedWf(null); setSteps([]); setViewMode('list'); }} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><X className="w-5 h-5 text-slate-400" /></button>
            <div className="flex-1">
              <h1 className="text-2xl font-extrabold text-slate-900">{selectedWf.name}</h1>
              <div className="flex items-center space-x-3 mt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Trigger: {selectedWf.trigger_type}</span>
                <span className="w-1 h-1 bg-slate-300 rounded-full" />
                <span className="text-[10px] font-bold text-blue-500 uppercase">{selectedWf.trigger_value}</span>
              </div>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-xl">
               <button onClick={() => setViewMode('canvas')} className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-2 transition-all ${viewMode === 'canvas' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                 <Layout className="w-3.5 h-3.5" /><span>Canvas</span>
               </button>
               <button onClick={() => setViewMode('list')} className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-2 transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                 <List className="w-3.5 h-3.5" /><span>List</span>
               </button>
            </div>
          </div>

          {/* Workflow Content */}
          <div className="bg-white rounded-3xl border border-slate-200 min-h-[600px] overflow-hidden shadow-sm relative">
             {viewMode === 'canvas' ? (
                <VisualCanvas 
                  steps={steps} 
                  onSelectNode={(s) => { setSelectedStep(s); /* open edit mode */ }}
                  onAddNode={(parentId) => { setNewParentId(parentId); setStepNodeType('ACTION'); setShowStepForm(true); }}
                />
             ) : (
                <div className="p-8 max-w-2xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                       <h2 className="text-lg font-bold text-slate-900">Timeline List</h2>
                       <button onClick={() => { setNewParentId(steps[steps.length-1]?.id); setStepNodeType('ACTION'); setShowStepForm(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center space-x-2">
                          <Plus className="w-4 h-4" /><span>Add End Step</span>
                       </button>
                    </div>

                    {steps.length === 0 ? (
                      <div className="text-center py-20 border-2 border-dashed border-slate-100 rounded-3xl">
                        <p className="text-slate-400 font-medium">No steps yet. Use the Canvas or Add Step to begin.</p>
                      </div>
                    ) : (
                      <div className="space-y-0 relative">
                        <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-slate-100" />
                        {steps.map((step, i) => (
                           <div key={step.id} className="relative flex items-start space-x-4 py-4 group">
                             <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 z-10 font-bold text-xs ring-4 ring-white ${step.day_of_week !== undefined ? DAY_COLORS[step.day_of_week] : 'bg-slate-100 text-slate-600'}`}>
                                <span className="text-[10px] font-extrabold">{step.day_of_week !== undefined ? DAY_NAMES[step.day_of_week] : 'Node'}</span>
                                <span className="text-[9px] opacity-70">{step.send_time || 'Next'}</span>
                             </div>
                             <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 p-5 group-hover:bg-white group-hover:border-blue-100 group-hover:shadow-lg transition-all">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-black text-slate-400 uppercase tracking-widest">{step.node_type}</span>
                                    <h4 className="text-sm font-bold text-slate-900">
                                      {step.node_type === 'ACTION' ? (step.action_type === 'SEND_MESSAGE' ? 'Send Message' : `Add Tag: ${step.action_value}`) : 
                                       step.node_type === 'CONDITION' ? `Condition: ${step.condition_config?.field}` : `Wait: ${step.wait_config?.amount} ${step.wait_config?.unit}`}
                                    </h4>
                                  </div>
                                  <button onClick={() => deleteStep(step.id)} className="p-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                                {step.message_template && <p className="mt-2 text-xs text-slate-500 italic line-clamp-2">"{step.message_template}"</p>}
                             </div>
                           </div>
                        ))}
                      </div>
                    )}
                </div>
             )}
          </div>
        </div>

        {/* Step Form Modal Overlay */}
        {showStepForm && (
          <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                   <h3 className="font-bold text-lg">Add Workspace Node</h3>
                   <button onClick={() => setShowStepForm(false)} className="p-2 hover:bg-slate-800 rounded-xl transition-all"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-8 space-y-6">
                   {/* Node Type Selector */}
                   <div className="grid grid-cols-3 gap-3">
                      {[
                        { id:'ACTION', icon:MessageCircle, label:'Action', color:'blue' },
                        { id:'CONDITION', icon:Filter, label:'If / Else', color:'amber' },
                        { id:'WAIT', icon:Clock, label:'Wait', color:'indigo' }
                      ].map(type => (
                        <button key={type.id} onClick={() => setStepNodeType(type.id as any)} className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${stepNodeType === type.id ? `border-${type.color}-500 bg-${type.color}-50` : 'border-slate-100 bg-slate-50 grayscale opacity-60'}`}>
                           <type.icon className={`w-6 h-6 mb-2 ${stepNodeType === type.id ? `text-${type.color}-600` : 'text-slate-400'}`} />
                           <span className={`text-[10px] font-black uppercase tracking-widest ${stepNodeType === type.id ? `text-${type.color}-700` : 'text-slate-500'}`}>{type.label}</span>
                        </button>
                      ))}
                   </div>

                   {/* Conditional Branching Header (if child of Condition) */}
                   {steps.find(s => s.id === newParentId)?.node_type === 'CONDITION' && (
                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Select Branch Path</label>
                        <div className="flex space-x-2">
                           <button onClick={() => setNewBranchType('YES')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${newBranchType === 'YES' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>YES Path</button>
                           <button onClick={() => setNewBranchType('NO')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${newBranchType === 'NO' ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>NO Path</button>
                        </div>
                      </div>
                   )}

                   <div className="space-y-4">
                      {stepNodeType === 'ACTION' && (
                        <>
                          <div className="flex space-x-2">
                            {DAY_NAMES.map((name, i) => (
                              <button key={name} onClick={() => setStepDay(i)} className={`flex-1 py-2 text-[10px] font-bold rounded-lg border transition-all ${stepDay === i ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}>{name}</button>
                            ))}
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Time (24h)</label>
                            <input type="time" value={stepTime} onChange={e => setStepTime(e.target.value)} className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Action</label>
                            <select value={stepAction} onChange={e => setStepAction(e.target.value)} className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500">
                               <option value="SEND_MESSAGE">Send LINE Message</option>
                               <option value="ADD_TAG">Add Tag</option>
                               <option value="REMOVE_TAG">Remove Tag</option>
                            </select>
                          </div>
                          {stepAction === 'SEND_MESSAGE' ? (
                            <div>
                               <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Message Template</label>
                               <textarea value={stepMessage} onChange={e => setStepMessage(e.target.value)} placeholder="Hello {{name}}..." rows={4} className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-blue-500" />
                            </div>
                          ) : (
                            <div>
                               <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tag Name</label>
                               <input type="text" value={stepTagVal} onChange={e => setStepTagVal(e.target.value)} placeholder="Interested" className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500" />
                            </div>
                          )}
                        </>
                      )}

                      {stepNodeType === 'WAIT' && (
                        <div className="flex space-x-4">
                           <div className="flex-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Amount</label>
                              <input type="number" value={waitAmount} onChange={e => setWaitAmount(parseInt(e.target.value))} className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500" />
                           </div>
                           <div className="flex-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Unit</label>
                              <select value={waitUnit} onChange={e => setWaitUnit(e.target.value)} className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500">
                                 <option value="minutes">Minutes</option>
                                 <option value="hours">Hours</option>
                                 <option value="days">Days</option>
                              </select>
                           </div>
                        </div>
                      )}

                      {stepNodeType === 'CONDITION' && (
                        <div className="space-y-4">
                           <p className="text-xs text-slate-400 italic">Contacts will split based on this condition.</p>
                           <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Field</label>
                              <select value={condField} onChange={e => setCondField(e.target.value)} className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500">
                                 <option value="attended">Attended Webinar</option>
                                 <option value="purchased">Product Purchased</option>
                                 <option value="tags">Has Tag</option>
                              </select>
                           </div>
                           <div className="flex space-x-2">
                              <input type="text" readOnly value={condOp} className="w-16 bg-slate-100 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-center" />
                              <input type="text" value={condVal} onChange={e => setCondVal(e.target.value)} placeholder="true" className="flex-1 bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500" />
                           </div>
                        </div>
                      )}
                   </div>

                   <div className="pt-4">
                      <button onClick={addStep} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all">Create Node</button>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    );
  }

  // ─── MAIN MARKETING VIEW ─────────────────────────────────
  return (
    <div className="flex-1 w-full h-full bg-slate-50 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Marketing & Automation</h1>
          <p className="text-slate-500 font-medium">Build workflows and IFTTT rules for your LINE leads.</p>
        </header>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          <button onClick={() => navigate('workflows')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'workflows' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Workflows ({workflows.length})
          </button>
          <button onClick={() => navigate('rules')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'rules' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Quick Rules ({automations.length})
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
            <div className="flex justify-end">
              <button onClick={() => setShowWfForm(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center space-x-2">
                <Plus className="w-5 h-5" /><span>Create Workflow</span>
              </button>
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
                      <option value="USER_FOLLOW">When User Follows</option>
                      <option value="MANUAL">Manual Enrollment</option>
                    </select>
                    <input type="text" value={wfTriggerVal} onChange={e => setWfTriggerVal(e.target.value)} placeholder={wfTrigger === 'USER_FOLLOW' ? 'FOLLOW' : 'Tag Name'} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button onClick={() => setShowWfForm(false)} className="px-5 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                  <button onClick={createWorkflow} disabled={!wfName} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50">Create</button>
                </div>
              </div>
            )}

            {workflows.length > 0 ? workflows.map(wf => (
              <div key={wf.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group" onClick={() => loadSteps(wf)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-violet-500 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md">{wf.step_count}</div>
                    <div>
                      <h3 className="font-bold text-slate-900">{wf.name}</h3>
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
            )) : (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center space-y-4">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-400 mx-auto"><RefreshCw className="w-10 h-10 opacity-40" /></div>
                <h3 className="text-lg font-bold text-slate-900">No Workflows Yet</h3>
                <p className="text-slate-500 max-w-sm mx-auto">Create your first multi-step workflow to automate webinar reminders.</p>
                <button onClick={() => setShowWfForm(true)} className="mt-2 px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800">Get Started</button>
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
        {/* ─── QUICK RULES TAB (IFTTT) ───────────────────── */}
        {tab === 'rules' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setShowRuleForm(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center space-x-2">
                <Plus className="w-5 h-5" /><span>Create Rule</span>
              </button>
            </div>

            {showRuleForm && (
              <div className="bg-white border-2 border-blue-100 rounded-2xl p-5 space-y-4 shadow-lg">
                <h3 className="font-bold text-slate-900">New Quick Rule (Instant action)</h3>
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
                  <button onClick={() => setShowRuleForm(false)} className="px-5 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                  <button onClick={createRule} disabled={!ruleName || !ruleTriggerVal || (ruleActionType !== 'ENROLL_WEBINAR' && !ruleActionVal)} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50">Save Rule</button>
                </div>
              </div>
            )}

            {automations.length > 0 ? automations.map(auto => (
              <div key={auto.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600"><RefreshCw className="w-5 h-5" /></div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{auto.name}</h3>
                    <div className="flex items-center space-x-2 text-xs mt-0.5">
                      <span className="text-slate-400">IF</span>
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-bold text-[10px] uppercase">{auto.trigger_type?.replace('_',' ')}</span>
                      <span className="font-extrabold text-slate-800">{auto.trigger_value}</span>
                      <span className="text-slate-400">→</span>
                      <span className="px-1.5 py-0.5 bg-blue-100 rounded text-blue-600 font-bold text-[10px] uppercase">{auto.action_type === 'ENROLL_WEBINAR' ? 'Enroll Webinar Seq' : auto.action_type?.replace('_',' ')}</span>
                      {auto.action_value && <span className="text-slate-500 truncate max-w-[120px]">{auto.action_value}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3" >
                  <div onClick={() => toggleRule(auto.id, auto.is_active)} className={`w-10 h-5 rounded-full p-0.5 cursor-pointer transition-colors ${auto.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${auto.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                  <button onClick={() => deleteRule(auto.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
                </div>
              </div>
            )) : (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center space-y-3">
                <p className="text-slate-500">No quick rules yet. These are instant single-action automations.</p>
                <button onClick={() => setShowRuleForm(true)} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800">Create First Rule</button>
              </div>
            )}
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
                        if (!res.ok || data.success === false) { alert(`Save failed: ${data.error || res.statusText}`); return; }
                        setWbStepForm(false); setWbEditingStep(null);
                        fetchWebinarData();
                      } catch (e: any) { alert(`Save error: ${e.message}`); }
                      setWbSaving(false);
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

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-slate-400">Loading…</div>}>
      <CRMDashboard />
    </Suspense>
  );
}
