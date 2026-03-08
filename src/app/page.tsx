"use client";

import React, { useState, useEffect } from "react";
import { 
  User, Mail, Phone, MessageCircle, Tag as TagIcon, 
  Calendar, Link as LinkIcon, CheckCircle2, 
  Save, RefreshCw, Plus, Search, ChevronRight, ArrowLeft,
  Copy, Check, X, Filter, Loader2, AlertCircle, History,
  Send, Lock
} from "lucide-react";

// ============================================================================
// BACKEND URLS
// ============================================================================
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyI7QLJ8E39oZJ8DuCxoCU1qf8HNxs5_tdYA5RbH8SHTNl9tk-CPxnjnWL0XdeUt9IaLw/exec";
const INTERNAL_API_URL = "/api/line/send";

const getAllUniqueTags = (contacts: any[]) => {
  const tagsSet = new Set();
  contacts.forEach(c => (c.tags || []).forEach((t: any) => tagsSet.add(t)));
  return Array.from(tagsSet).sort() as string[];
};

export default function CRMDashboard() {
  const [activeTab, setActiveTab] = useState("contacts"); // 'contacts' | 'conversations'
  const [view, setView] = useState("list"); // 'list' | 'detail' | 'add'
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  
  // API States
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Filtering state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState("All");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // Fetch contacts on mount
  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setIsLoading(true);
    setFetchError("");
    try {
      if (!SCRIPT_URL || SCRIPT_URL.includes("YOUR_GOOGLE_APPS_SCRIPT")) {
        setFetchError("Please set your SCRIPT_URL to fetch real data.");
        setIsLoading(false);
        return;
      }
      
      const response = await fetch(SCRIPT_URL);
      if (!response.ok) throw new Error("Failed to fetch data");
      
      const data = await response.json();
      setContacts(data);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setFetchError("Failed to load contacts from Google Sheets. Please check your URL.");
    } finally {
      setIsLoading(false);
    }
  };

  const uniqueTags = ["All", ...getAllUniqueTags(contacts)];

  // Apply filters
  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = 
      contact.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.lineId?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTag = selectedTagFilter === "All" || contact.tags?.includes(selectedTagFilter);
    
    return matchesSearch && matchesTag;
  });

  const handleContactClick = (id: string) => {
    setSelectedContactId(id);
    setView("detail");
  };

  const handleBackToList = () => {
    setView("list");
    setSelectedContactId("");
  };

  const handleAddClick = () => {
    setSelectedContactId("");
    setView("add");
  };

  const isNew = view === "add";
  const activeContact = isNew 
    ? {
        id: "",
        name: "",
        email: "",
        phone: "",
        lineId: "",
        tags: [],
        status: "Lead",
        webinar: { link: "", dateTime: "" },
        history: []
      }
    : (contacts.find(c => c.id === selectedContactId) || {});

  // Render Main Layout
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-slate-800">
      {/* Top Nav (GoHighLevel Style) */}
      <div className="bg-[#1e2330] px-6 py-3 flex items-center justify-between shrink-0 shadow-sm z-30">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-inner">
            <span className="text-white font-bold text-lg">Z</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Zenith CRM</span>
        </div>
        <div className="flex space-x-2 bg-[#2d3343] p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab("contacts")} 
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeTab === 'contacts' ? 'bg-blue-600 shadow-sm text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}
          >
            Contacts
          </button>
          <button 
            onClick={() => setActiveTab("conversations")} 
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeTab === 'conversations' ? 'bg-blue-600 shadow-sm text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}
          >
            Conversations
          </button>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center border border-slate-600">
          <User className="w-5 h-5 text-slate-300" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === "contacts" ? (
           view === "list" ? (
             <div className="flex-1 w-full flex flex-col items-center p-4 sm:p-6 lg:p-8 overflow-y-auto">
               <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 flex flex-col min-h-[calc(100vh-8rem)]">
                 <div className="h-2 w-full bg-gradient-to-r from-blue-700 to-blue-500 shrink-0"></div>
                 <div className="p-6 sm:p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 bg-white shrink-0">
                   <div>
                     <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contacts List</h1>
                     <p className="text-sm text-slate-500 font-medium">Manage all your synced contacts ({filteredContacts.length})</p>
                   </div>
                   
                   <div className="flex w-full sm:w-auto items-center space-x-3 h-10">
                     <div className="relative flex-1 sm:w-64 h-full">
                       <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                       <input 
                         type="text" 
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                         className="w-full h-full pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                         placeholder="Search contacts..."
                       />
                     </div>

                     <div className="relative h-full">
                       <button 
                         onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                         className="h-full px-4 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium transition-all flex items-center space-x-2"
                       >
                         <Filter className="w-4 h-4 text-slate-500" />
                         <span>{selectedTagFilter === "All" ? "Filter by Tag" : selectedTagFilter}</span>
                       </button>

                       {isFilterDropdownOpen && (
                         <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-100 shadow-xl rounded-xl z-20 py-1 overflow-hidden">
                           {uniqueTags.map(tag => (
                             <button
                               key={tag}
                               onClick={() => {
                                 setSelectedTagFilter(tag);
                                 setIsFilterDropdownOpen(false);
                               }}
                               className={`w-full text-left px-4 py-2 text-sm transition-colors ${selectedTagFilter === tag ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
                             >
                               {tag}
                             </button>
                           ))}
                         </div>
                       )}
                     </div>

                     <button 
                       onClick={handleAddClick}
                       className="h-full px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all flex items-center space-x-1"
                     >
                       <Plus className="w-4 h-4" />
                       <span className="hidden sm:inline">Add</span>
                     </button>
                   </div>
                 </div>

                 <div className="flex-1 overflow-y-auto bg-slate-50 p-6 sm:p-8">
                   {isLoading ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <p className="text-sm font-medium">Loading contacts from Google Sheets...</p>
                      </div>
                   ) : fetchError ? (
                      <div className="text-center py-12 text-red-500 bg-red-50 rounded-xl border border-red-200 p-8 max-w-lg mx-auto">
                        <AlertCircle className="h-10 w-10 mx-auto text-red-500 mb-3" />
                        <h3 className="font-bold text-lg mb-2">Connection Error</h3>
                        <p className="text-sm">{fetchError}</p>
                        <button onClick={fetchContacts} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Try Again</button>
                      </div>
                   ) : (
                       <div className="space-y-3">
                         {filteredContacts.length === 0 ? (
                           <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200">
                             <User className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                             <p>{searchQuery || selectedTagFilter !== "All" ? "No contacts found matching your criteria" : "Your contact list is empty. Add a new contact!"}</p>
                             {(searchQuery || selectedTagFilter !== "All") && (
                                <button 
                                  onClick={() => {setSearchQuery(""); setSelectedTagFilter("All");}}
                                  className="mt-3 text-sm text-blue-600 font-medium hover:underline"
                                >
                                  Clear Filters
                                </button>
                             )}
                           </div>
                         ) : (
                           filteredContacts.map(contact => (
                             <div 
                               key={contact.id} 
                               onClick={() => handleContactClick(contact.id)}
                               className="group bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex items-center justify-between"
                             >
                               <div className="flex items-center space-x-4">
                                 <div className="h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-700 font-bold text-lg group-hover:bg-blue-100 transition-colors shrink-0">
                                   {contact.name ? contact.name.charAt(0).toUpperCase() : "?"}
                                 </div>
                                 
                                 <div>
                                   <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{contact.name || "Unnamed"}</h3>
                                   <div className="flex flex-col sm:flex-row sm:items-center text-xs text-slate-500 mt-1 sm:space-x-3 space-y-1 sm:space-y-0">
                                     <span className="flex items-center"><Mail className="w-3 h-3 mr-1 shrink-0" /> {contact.email || "No Email"}</span>
                                     <span className="flex items-center text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 w-fit">
                                        {contact.lineId || "No LINE ID"}
                                     </span>
                                   </div>
                                 </div>
                               </div>

                               <div className="flex items-center space-x-6">
                                 <div className="hidden md:flex flex-wrap gap-1 justify-end max-w-[200px]">
                                   {(contact.tags || []).slice(0, 2).map((tag: string, i: number) => (
                                      <span key={i} className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                        {tag}
                                      </span>
                                   ))}
                                   {(contact.tags || []).length > 2 && (
                                     <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">+{(contact.tags || []).length - 2}</span>
                                   )}
                                 </div>
                                 <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                               </div>
                             </div>
                           ))
                         )}
                       </div>
                   )}
                 </div>
               </div>
             </div>
           ) : (
             <div className="flex-1 w-full overflow-y-auto">
                <ContactDetailView 
                  contactData={activeContact} 
                  onBack={handleBackToList}
                  isNew={isNew}
                  scriptUrl={SCRIPT_URL}
                  allContacts={contacts}
                  onSwitchContact={handleContactClick}
                  onSaveSuccess={(updatedContact: any) => {
                    const existsIndex = contacts.findIndex(c => c.id === updatedContact.id);
                    if (existsIndex > -1) {
                      const newContacts = [...contacts];
                      newContacts[existsIndex] = updatedContact;
                      setContacts(newContacts);
                    } else {
                      setContacts([updatedContact, ...contacts]);
                    }
                    setSelectedContactId(updatedContact.id);
                    setView("detail");
                  }}
                />
             </div>
           )
        ) : (
          <ConversationsView 
            contacts={contacts}
            scriptUrl={SCRIPT_URL}
            onUpdateContact={(updatedContact: any) => {
              const existsIndex = contacts.findIndex(c => c.id === updatedContact.id);
              if (existsIndex > -1) {
                const newContacts = [...contacts];
                newContacts[existsIndex] = updatedContact;
                setContacts(newContacts);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Single Contact Detail View Component
// ----------------------------------------------------------------------------
function ContactDetailView({ contactData, onBack, onSaveSuccess, isNew, scriptUrl, allContacts, onSwitchContact }: any) {
  const safeContactData = {
      ...contactData,
      tags: contactData.tags || [],
      webinar: contactData.webinar || { link: "", dateTime: "" },
      status: contactData.status || "Lead",
      history: contactData.history || []
  }
  const [contact, setContact] = useState(safeContactData);
  const [newTag, setNewTag] = useState("");
  
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
  const [messageFeedback, setMessageFeedback] = useState({ type: "", text: "" });

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
  }, [contactData]);

  useEffect(() => {
    const isDifferent = JSON.stringify(safeContactData) !== JSON.stringify(contact);
    if (isNew) {
      setHasUnsavedChanges(contact.name?.trim().length > 0 || isDifferent);
    } else {
      setHasUnsavedChanges(isDifferent);
    }
  }, [contact, safeContactData, isNew]);

  const handleAddTag = () => {
    if (newTag.trim() && !contact.tags.includes(newTag.trim())) {
      setContact({...contact, tags: [...contact.tags, newTag.trim()]});
      setNewTag("");
    }
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

  const handleSaveAndSync = async (contactPayload = contact) => {
    if (scriptUrl.includes("YOUR_GOOGLE_APPS_SCRIPT")) {
        setSaveError("Please set your SCRIPT_URL to save data.");
        return;
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const payload = { ...contactPayload };
      const response = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (result.success) {
         setHasUnsavedChanges(false);
         const savedContact = { 
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
      setSaveError("Failed to save. Please make sure your Google Apps Script is deployed properly.");
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
        const newHistoryConfig = [{
            date: new Date().toISOString(),
            action: `Chat: ${lineMessageText}`
        }, ...(contact.history || [])];
        
        const updatedContact = { ...contact, history: newHistoryConfig };
        
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

  const matchedContacts = contactSearchQuery.trim() === "" ? [] : allContacts.filter((c: any) => 
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
              <p className="text-sm text-slate-500 mb-6">You have modified this contact's details. Are you sure you want to discard your changes and go back?</p>
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
                           matchedContacts.map((mc: any) => (
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

                  <div className="flex space-x-2 pt-2">
                    <input 
                      type="text" 
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="Add New Tag..."
                    />
                    <button 
                      onClick={handleAddTag}
                      className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

              </div>

              <div className="space-y-6 flex flex-col h-full items-stretch">
                
                <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    <div>
                      <h4 className="text-sm font-bold text-emerald-800 tracking-wide">{contact.status.toUpperCase()} STATUS</h4>
                      <p className="text-xs text-emerald-600">Synced from external sheet</p>
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
                           <button 
                             onClick={() => copyToClipboard(contact.webinar.link, 'webinarLink')}
                             className="text-xs flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors"
                             title="Copy to clipboard"
                           >
                             {copiedField === 'webinarLink' ? (
                               <><Check className="w-3 h-3 mr-1 text-emerald-500" /> Copied!</>
                             ) : (
                               <><Copy className="w-3 h-3 mr-1" /> Copy Link</>
                             )}
                           </button>
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
                      <label className="text-xs font-medium text-slate-500">Scheduled Date</label>
                      <div className="relative group">
                        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <input 
                          type="date" 
                          value={contact.webinar.dateTime}
                          onChange={(e) => setContact({...contact, webinar: {...contact.webinar, dateTime: e.target.value}})}
                          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all hover:border-slate-300 bg-slate-50 focus:bg-white custom-calendar"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* --- LINE Chatroom UI --- */}
                {!isNew && (
                  <div className="p-0 border border-slate-200 rounded-xl bg-[#84A1C4] flex-1 flex flex-col shadow-inner min-h-[400px] overflow-hidden">
                    {/* Chat Header */}
                    <div className="px-4 py-3 bg-[#333a4d] flex items-center justify-between shadow-sm z-10">
                      <div className="flex items-center space-x-2">
                        <MessageCircle className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-sm font-semibold text-white tracking-wider">LINE Chat</h3>
                      </div>
                      <div className="text-xs text-slate-300 bg-slate-800 px-2 py-1 rounded">
                         End-to-End Encrypted
                      </div>
                    </div>

                    {/* Chat Messages Area */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-4 flex flex-col pt-4">
                       {contact.history && contact.history.length > 0 ? (
                          contact.history.slice().reverse().map((histItem: any, i: number) => {
                             // Determine if message is outgoing (from CRM to User) or incoming (from User to CRM)
                             // We'll use the action text for now to distinguish logic vs chat.
                             const isChatMessage = histItem.action.startsWith("Chat: ");
                             const isIncomingMessage = histItem.action.startsWith("Received: ");
                             
                             if (!isChatMessage && !isIncomingMessage) {
                               // System Log (Centered)
                               return (
                                 <div key={i} className="flex justify-center w-full my-2">
                                   <div className="bg-black/20 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] text-white/90 font-medium">
                                     {histItem.action} • {new Date(histItem.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                   </div>
                                 </div>
                               );
                             }

                             const messageText = histItem.action.replace("Chat: ", "").replace("Received: ", "");
                             
                             if (isChatMessage) {
                               // Outgoing Message (Right Side, Green Bubble)
                               return (
                                 <div key={i} className="flex flex-col items-end w-full">
                                    <div className="bg-[#06c755] text-white px-4 py-2 rounded-2xl rounded-tr-sm shadow-sm max-w-[85%] break-words">
                                      <p className="text-sm">{messageText}</p>
                                    </div>
                                    <span className="text-[10px] text-slate-200 mt-1 drop-shadow-sm">{new Date(histItem.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                 </div>
                               );
                             } else {
                               // Incoming Message (Left Side, White Bubble)
                               return (
                                 <div key={i} className="flex flex-col items-start w-full">
                                    <div className="flex items-end space-x-2">
                                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                        <User className="w-4 h-4 text-slate-400" />
                                      </div>
                                      <div className="bg-white text-slate-800 px-4 py-2 rounded-2xl rounded-tl-sm shadow-sm max-w-[85%] break-words">
                                        <p className="text-sm">{messageText}</p>
                                      </div>
                                    </div>
                                    <span className="text-[10px] text-slate-200 mt-1 drop-shadow-sm ml-8">{new Date(histItem.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                 </div>
                               );
                             }
                          })
                       ) : (
                          <div className="text-sm text-white/70 italic flex flex-col items-center h-full justify-center opacity-80 pb-4">
                             <MessageCircle className="w-12 h-12 mb-2 opacity-50" />
                             No conversation history yet.
                          </div>
                       )}
                    </div>

                    {/* Chat Input Area */}
                    <div className="p-3 bg-white border-t border-slate-200 flex items-end space-x-2">
                       <textarea
                        value={lineMessageText}
                        onChange={(e) => setLineMessageText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if(contact.lineId && lineMessageText.trim() && !isSendingMessage) {
                               handleSendLineMessage();
                            }
                          }
                        }}
                        placeholder="Type a message..."
                        className="flex-1 bg-slate-100 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none max-h-32 min-h-[44px]"
                        disabled={!contact.lineId || isSendingMessage}
                        rows={1}
                        style={{ height: lineMessageText ? 'auto' : '44px' }}
                      />
                      <button
                        onClick={handleSendLineMessage}
                        disabled={!contact.lineId || !lineMessageText.trim() || isSendingMessage}
                        className="w-11 h-11 shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed group"
                      >
                        {isSendingMessage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1 pr-1 group-enabled:group-hover:translate-x-0.5 transition-transform" />}
                      </button>
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
function ConversationsView({ contacts, scriptUrl, onUpdateContact }: any) {
  const [selectedContactId, setSelectedContactId] = useState("");
  const [lineMessageText, setLineMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState({ type: "", text: "" });
  const [copiedField, setCopiedField] = useState("");

  const activeContact = contacts.find((c: any) => c.id === selectedContactId) || null;

  // Sorting contacts by latest history date (simple approximation)
  const sortedContacts = [...contacts].filter(c => c.lineId).sort((a, b) => {
     const dateA = a.history?.[0]?.date ? new Date(a.history[0].date).getTime() : 0;
     const dateB = b.history?.[0]?.date ? new Date(b.history[0].date).getTime() : 0;
     return dateB - dateA;
  });

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
        
        // Optimistic update in UI & trigger background save
        const newHistoryConfig = [{
            date: new Date().toISOString(),
            action: `Chat: ${lineMessageText}`
        }, ...(activeContact.history || [])];
        
        const updatedContact = { ...activeContact, history: newHistoryConfig };
        onUpdateContact(updatedContact);

        // Quietly background sync
        if (scriptUrl && !scriptUrl.includes("YOUR_GOOGLE_APPS_SCRIPT")) {
            fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: JSON.stringify(updatedContact)
            }).catch(e => console.error("Background sync failed:", e));
        }

      } else {
        setMessageFeedback({ type: "error", text: data.error || "Failed to push message." });
        setTimeout(() => setMessageFeedback({ type: "", text: "" }), 3000);
      }
    } catch (error) {
       console.error("API Route Error:", error);
       setMessageFeedback({ type: "error", text: "Connection error." });
       setTimeout(() => setMessageFeedback({ type: "", text: "" }), 3000);
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

  return (
    <div className="flex-1 w-full h-full flex bg-white outline-none overflow-hidden">
      {/* PANE 1: Left Inbox List */}
      <div className="w-80 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
         <div className="p-4 border-b border-slate-200 bg-white">
            <h2 className="text-lg font-bold text-slate-900">Inbox</h2>
            <p className="text-xs text-slate-500 font-medium">Recent Conversations</p>
         </div>
         <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sortedContacts.map((c: any) => (
               <button 
                 key={c.id}
                 onClick={() => { setSelectedContactId(c.id); setMessageFeedback({type:"", text:""}); }}
                 className={`w-full text-left p-3 rounded-xl transition-all border ${selectedContactId === c.id ? 'bg-white shadow-sm border-blue-200' : 'bg-transparent border-transparent hover:bg-slate-100'}`}
               >
                 <div className="flex items-center space-x-3">
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold shrink-0 ${selectedContactId === c.id ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
                     {c.name ? c.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                   </div>
                   <div className="flex-1 min-w-0">
                     <div className="flex justify-between items-center mb-0.5">
                        <p className={`text-sm font-bold truncate ${selectedContactId === c.id ? 'text-blue-700' : 'text-slate-900'}`}>{c.name || "Unnamed"}</p>
                        <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">
                           {c.history?.[0]?.date ? new Date(c.history[0].date).toLocaleDateString([], {month:'short', day:'numeric'}) : ''}
                        </span>
                     </div>
                     <p className="text-xs text-slate-500 truncate">
                        {c.history?.[0]?.action ? c.history[0].action.replace("Chat: ", "You: ").replace("Received: ", "") : 'No messages yet'}
                     </p>
                   </div>
                 </div>
               </button>
            ))}
            {sortedContacts.length === 0 && (
               <div className="text-sm border text-slate-500 p-8 text-center rounded-xl bg-slate-100 mt-4 mx-2">
                  <MessageCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  No contacts found with a connected LINE ID.
               </div>
            )}
         </div>
      </div>

      {/* PANE 2: Middle Chat Area */}
      <div className="flex-1 flex flex-col bg-[#84A1C4] relative min-w-[400px]">
         {activeContact ? (
            <>
               <div className="px-6 py-4 bg-[#333a4d] flex items-center justify-between shadow-sm z-10 shrink-0">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-inner">
                      {activeContact.name ? activeContact.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white tracking-wide">{activeContact.name || activeContact.lineId}</h3>
                        <p className="text-xs text-emerald-300 font-medium">LINE Connected</p>
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

               <div className="flex-1 p-6 overflow-y-auto space-y-6 flex flex-col pt-6">
                  {activeContact.history && activeContact.history.length > 0 ? (
                     activeContact.history.slice().reverse().map((histItem: any, i: number) => {
                        const isChatMessage = histItem.action.startsWith("Chat: ");
                        const isIncomingMessage = histItem.action.startsWith("Received: ");
                        
                        if (!isChatMessage && !isIncomingMessage) {
                          return (
                            <div key={i} className="flex justify-center w-full my-4 drop-shadow-sm">
                              <div className="bg-black/25 backdrop-blur-md px-4 py-1.5 rounded-full text-[11px] text-white/95 font-medium border border-white/10">
                                {histItem.action} • {new Date(histItem.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </div>
                            </div>
                          );
                        }

                        const messageText = histItem.action.replace("Chat: ", "").replace("Received: ", "");
                        
                        if (isChatMessage) {
                          return (
                            <div key={i} className="flex flex-col items-end w-full animate-in slide-in-from-right-2">
                               <div className="bg-[#06c755] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-md max-w-[80%] break-words border border-[#05b54d]">
                                 <p className="text-[15px] leading-relaxed">{messageText}</p>
                               </div>
                               <span className="text-[11px] text-slate-100 mt-1.5 drop-shadow-md font-medium">{new Date(histItem.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                          );
                        } else {
                          return (
                            <div key={i} className="flex flex-col items-start w-full animate-in slide-in-from-left-2">
                               <div className="flex items-end space-x-2">
                                 <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center shrink-0 overflow-hidden shadow-sm border border-slate-400">
                                   <User className="w-4 h-4 text-slate-500" />
                                 </div>
                                 <div className="bg-white text-slate-800 px-4 py-2.5 rounded-2xl rounded-tl-sm shadow-md max-w-[80%] break-words">
                                   <p className="text-[15px] leading-relaxed">{messageText}</p>
                                 </div>
                               </div>
                               <span className="text-[11px] text-slate-100 mt-1.5 drop-shadow-md font-medium ml-9">{new Date(histItem.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                          );
                        }
                     })
                  ) : (
                     <div className="text-sm text-white/70 italic flex flex-col items-center h-full justify-center opacity-80 pb-4">
                        <MessageCircle className="w-16 h-16 mb-4 opacity-40 text-white" />
                        No conversation history yet. Send a message to start!
                     </div>
                  )}
               </div>

               <div className="p-4 bg-[#e8eef2] border-t border-slate-300 flex items-end space-x-3 shrink-0">
                  <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center shrink-0 cursor-not-allowed hidden sm:flex border border-slate-200">
                     <Plus className="w-5 h-5 text-slate-400" />
                  </div>
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
            </>
         ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 flex-col bg-slate-50 w-full">
               <div className="w-24 h-24 bg-white rounded-full shadow-sm flex items-center justify-center mb-6">
                 <MessageCircle className="w-10 h-10 text-emerald-400 opacity-60" />
               </div>
               <h3 className="text-xl font-bold text-slate-800 mb-2">Your Messages</h3>
               <p className="text-sm font-medium max-w-xs text-center">Select a conversation from the left inbox to start chatting with your leads.</p>
            </div>
         )}
      </div>

      {/* PANE 3: Right Details Panel */}
      <div className="w-80 lg:w-96 border-l border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden">
         {activeContact ? (
            <div className="flex-1 overflow-y-auto w-full">
               <div className="p-6 border-b border-slate-100 flex flex-col items-center bg-slate-50 text-center">
                  <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-3xl shadow-inner mb-4">
                     {activeContact.name ? activeContact.name.charAt(0).toUpperCase() : <User className="w-8 h-8" />}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">{activeContact.name || "Unnamed"}</h2>
                  <p className="text-sm text-slate-500 font-medium mb-3">{activeContact.email || "No email provided"}</p>
                  
                  <div className="flex items-center space-x-2">
                     <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${
                        activeContact.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        activeContact.status === 'Lead' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-slate-100 text-slate-700 border-slate-200'
                     }`}>
                        {activeContact.status}
                     </span>
                  </div>
               </div>

               <div className="p-6 space-y-6">
                  {/* Contact Info Block */}
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

                  {/* Tags Block */}
                  <div className="space-y-3">
                     <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                        <TagIcon className="w-3.5 h-3.5 mr-1" /> Tags
                     </h3>
                     <div className="flex flex-wrap gap-1.5">
                        {activeContact.tags && activeContact.tags.length > 0 ? (
                           activeContact.tags.map((tag: string, i: number) => (
                              <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-semibold border border-slate-200">
                                 {tag}
                              </span>
                           ))
                        ) : (
                           <span className="text-xs text-slate-400 italic">No tags</span>
                        )}
                     </div>
                  </div>

                  {/* Webinar Block */}
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
                           <button 
                             onClick={() => copyToClipboard(activeContact.webinar.link, 'webinar')}
                             className="w-full mt-2 flex items-center justify-center space-x-1.5 text-xs font-bold bg-white border border-blue-200 py-1.5 px-3 rounded-lg text-blue-700 shadow-sm hover:shadow transition-all"
                           >
                             {copiedField === 'webinar' ? (
                                <><Check className="w-3.5 h-3.5" /> <span>Link Copied!</span></>
                             ) : (
                                <><LinkIcon className="w-3.5 h-3.5" /> <span>Copy Link</span></>
                             )}
                           </button>
                        )}
                     </div>
                  )}

                  <div className="pt-6 border-t border-slate-100 flex justify-center">
                     <p className="text-xs text-slate-400 font-medium">Switch to <strong className="text-slate-600">Contacts View</strong> to edit details.</p>
                  </div>
               </div>
            </div>
         ) : (
            <div className="text-sm text-slate-400 text-center flex flex-col items-center justify-center h-full bg-slate-50/50">
               <User className="w-12 h-12 mb-3 opacity-20" />
               Details will appear here
            </div>
         )}
      </div>
    </div>
  )
}
