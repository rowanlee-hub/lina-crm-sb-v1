'use client';

import React, { useState, useEffect } from 'react';
import {
  X, Plus, MessageCircle, Filter, Clock, GitMerge,
  Trash2, Save, Check, Zap, Edit2,
  ChevronDown, ArrowDown, Activity, RefreshCw,
  CheckCircle2, XCircle, Clock3, AlertCircle,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

export interface WorkflowTrigger {
  type: string;
  value: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  trigger_value: string;
  triggers?: WorkflowTrigger[];
  is_active: boolean;
  step_count: number;
  active_enrollments: number;
}

export interface Step {
  id: string;
  workflow_id: string;
  parent_id?: string | null;
  branch_type?: string;
  node_type: 'ACTION' | 'CONDITION' | 'WAIT' | 'START' | 'ROUTER';
  step_order: number;
  action_type?: string;
  message_template?: string;
  action_value?: string;
  wait_config?: { amount: number; unit: string };
  condition_config?: { field: string; operator: string; value: string };
  schedule_config?: { scheduled_at: string };
  router_config?: { mode: 'first_match' | 'all_match' };
  filter_config?: { rules: { field: string; operator: string; value: string }[]; logic: 'AND' | 'OR' };
  day_of_week?: number;
  send_time?: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { id: 'TAG_ADDED', label: 'Tag Added' },
  { id: 'TAG_REMOVED', label: 'Tag Removed' },
  { id: 'USER_FOLLOW', label: 'User Follow' },
  { id: 'KEYWORD_RECEIVED', label: 'Keyword Received' },
  { id: 'MANUAL', label: 'Manual' },
];

// ─── Trigger Row Sub-component ──────────────────────────────────────

function TriggerRow({
  type, value, onTypeChange, onValueChange, onRemove, isPrimary,
}: {
  type: string;
  value: string;
  onTypeChange: (t: string) => void;
  onValueChange: (v: string) => void;
  onRemove: (() => void) | null;
  isPrimary: boolean;
}) {
  const needsValue = type === 'TAG_ADDED' || type === 'TAG_REMOVED' || type === 'KEYWORD_RECEIVED';
  return (
    <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
      <div className="flex-1 space-y-2">
        <select
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
        >
          {TRIGGER_OPTIONS.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        {needsValue && (
          <input
            type="text"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={type === 'KEYWORD_RECEIVED' ? 'e.g. register' : 'e.g. Interested'}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
          />
        )}
      </div>
      {!isPrimary && onRemove && (
        <button onClick={onRemove} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors mt-1">
          <X className="w-4 h-4" />
        </button>
      )}
      {isPrimary && (
        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest mt-2 flex-shrink-0">Primary</span>
      )}
    </div>
  );
}

// ─── Step Card (vertical flow) ──────────────────────────────────────

function StepCard({ step, onClick, onDelete }: { step: Step; onClick: () => void; onDelete: () => void }) {
  const isAction = step.node_type === 'ACTION' || !step.node_type;
  const isCondition = step.node_type === 'CONDITION';
  const isWait = step.node_type === 'WAIT';
  const isRouter = step.node_type === 'ROUTER';

  const iconBg = isRouter ? 'bg-purple-100' : isCondition ? 'bg-amber-100' : isWait ? 'bg-indigo-100' : 'bg-blue-100';
  const iconColor = isRouter ? 'text-purple-600' : isCondition ? 'text-amber-600' : isWait ? 'text-indigo-600' : 'text-blue-600';
  const borderColor = isRouter ? 'border-purple-200 hover:border-purple-300' : isCondition ? 'border-amber-200 hover:border-amber-300' : isWait ? 'border-indigo-200 hover:border-indigo-300' : 'border-blue-200 hover:border-blue-300';

  let title = '';
  let subtitle = '';

  if (isAction) {
    if (step.action_type === 'SEND_MESSAGE') {
      title = 'Send Message';
      subtitle = step.message_template ? `"${step.message_template.slice(0, 60)}${(step.message_template.length || 0) > 60 ? '...' : ''}"` : '';
    } else if (step.action_type === 'SCHEDULE_MESSAGE') {
      title = 'Schedule Message';
      subtitle = step.message_template ? `"${step.message_template.slice(0, 60)}..."` : '';
    } else if (step.action_type === 'ADD_TAG') {
      title = 'Add Tag';
      subtitle = step.action_value || '';
    } else if (step.action_type === 'REMOVE_TAG') {
      title = 'Remove Tag';
      subtitle = step.action_value || '';
    } else if (step.action_type === 'ENROLL_WORKFLOW') {
      title = 'Enroll in Workflow';
      subtitle = step.action_value || '';
    } else if (step.action_type === 'REMOVE_FROM_WORKFLOW') {
      title = 'Remove from Workflow';
      subtitle = step.action_value || '';
    }
  } else if (isCondition) {
    const cf = step.condition_config;
    const fieldLabel = cf?.field?.replace(/_/g, ' ') || '?';
    const op = cf?.operator || '==';
    const opLabels: Record<string, string> = { '==': '=', '!=': '≠', 'contains': 'contains', 'not_contains': 'not contains', 'exists': 'exists', 'not_exists': 'not exists', 'has_tag': 'has tag', 'not_has_tag': 'not has tag', 'starts_with': 'starts with', 'ends_with': 'ends with', '>': '>', '<': '<' };
    title = `If ${fieldLabel}`;
    subtitle = `${opLabels[op] || op}${cf?.value ? ` "${cf.value}"` : ''}`;
  } else if (isWait) {
    title = 'Wait';
    subtitle = `${step.wait_config?.amount || 1} ${step.wait_config?.unit || 'days'}`;
  } else if (isRouter) {
    title = 'Router';
    subtitle = step.router_config?.mode === 'all_match' ? 'All matching branches' : 'First matching branch';
  }

  const Icon = isRouter ? GitMerge : isCondition ? Filter : isWait ? Clock : MessageCircle;

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white rounded-2xl border-2 ${borderColor} p-4 cursor-pointer hover:shadow-lg transition-all`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              {step.node_type}
            </span>
            {step.branch_type && step.branch_type !== 'DEFAULT' && (
              <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                step.branch_type === 'YES' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
              }`}>
                {step.branch_type}
              </span>
            )}
          </div>
          <h4 className="text-sm font-bold text-slate-900 mt-0.5">{title}</h4>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1 truncate">{subtitle}</p>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Add Step Button (between cards) ────────────────────────────────

function AddStepButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-0.5 h-6 bg-slate-200" />
      <button
        onClick={onClick}
        className="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
      >
        <Plus className="w-4 h-4" />
      </button>
      <div className="w-0.5 h-6 bg-slate-200" />
    </div>
  );
}


// ─── Main Component ─────────────────────────────────────────────────

interface WorkflowBuilderProps {
  workflow: Workflow;
  initialSteps: Step[];
  onBack: () => void;
}

export default function WorkflowBuilder({ workflow, initialSteps, onBack }: WorkflowBuilderProps) {
  const [steps, setSteps] = useState<Step[]>(initialSteps);

  // Workflow-level editable state
  const [wfName, setWfName] = useState(workflow.name);
  const [wfTriggerType, setWfTriggerType] = useState(workflow.trigger_type);
  const [wfTriggerValue, setWfTriggerValue] = useState(workflow.trigger_value || '');
  const [wfIsActive, setWfIsActive] = useState(workflow.is_active);
  const [savingWf, setSavingWf] = useState(false);
  const [savedWf, setSavedWf] = useState(false);

  // Extra triggers
  const [extraTriggers, setExtraTriggers] = useState<WorkflowTrigger[]>(workflow.triggers || []);

  // Track unsaved changes
  const isDirty =
    wfName !== workflow.name ||
    wfTriggerType !== workflow.trigger_type ||
    wfTriggerValue !== (workflow.trigger_value || '') ||
    wfIsActive !== workflow.is_active ||
    JSON.stringify(extraTriggers) !== JSON.stringify(workflow.triggers || []);

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [showTriggerForm, setShowTriggerForm] = useState(false);
  const [viewTab, setViewTab] = useState<'flow' | 'logs'>('flow');

  // Execution logs
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Step form state
  const [showStepForm, setShowStepForm] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [newParentId, setNewParentId] = useState<string | undefined>();
  const [newBranchType, setNewBranchType] = useState<'YES' | 'NO' | 'DEFAULT'>('DEFAULT');
  const [stepNodeType, setStepNodeType] = useState<'ACTION' | 'CONDITION' | 'WAIT'>('ACTION');
  const [stepAction, setStepAction] = useState('SEND_MESSAGE');
  const [stepMessage, setStepMessage] = useState('');
  const [stepTagVal, setStepTagVal] = useState('');
  const [waitAmount, setWaitAmount] = useState(1);
  const [waitUnit, setWaitUnit] = useState('days');
  const [condField, setCondField] = useState('attended');
  const [condOp, setCondOp] = useState('==');
  const [condVal, setCondVal] = useState('true');
  const [scheduleAt, setScheduleAt] = useState('');
  const [targetWorkflowId, setTargetWorkflowId] = useState('');
  const [routerMode, setRouterMode] = useState<'first_match' | 'all_match'>('first_match');
  const [filterRules, setFilterRules] = useState<{ field: string; operator: string; value: string }[]>([]);
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND');
  const [showFilterEditor, setShowFilterEditor] = useState(false);
  const [filterEditStepId, setFilterEditStepId] = useState<string | null>(null);
  const [allWorkflows, setAllWorkflows] = useState<{ id: string; name: string }[]>([]);

  // Load other workflows for enroll/remove dropdown
  useEffect(() => {
    fetch('/api/workflows')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAllWorkflows(data.filter((w: Workflow) => w.id !== workflow.id).map((w: Workflow) => ({ id: w.id, name: w.name })));
        }
      })
      .catch(() => {});
  }, [workflow.id]);

  // Load logs when switching to logs tab
  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/workflows/logs?workflowId=${workflow.id}`);
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (viewTab === 'logs') fetchLogs();
  }, [viewTab]);

  // ─── Form helpers ───────────────────────────────────────────────

  function resetFormFields() {
    setStepAction('SEND_MESSAGE');
    setStepMessage('');
    setStepTagVal('');
    setWaitAmount(1);
    setWaitUnit('days');
    setCondField('attended');
    setCondOp('==');
    setCondVal('true');
    setScheduleAt('');
    setTargetWorkflowId('');
    setRouterMode('first_match');
    setFilterRules([]);
    setFilterLogic('AND');
  }

  function openEditForm(step: Step) {
    setEditingStep(step);
    setStepNodeType(step.node_type as 'ACTION' | 'CONDITION' | 'WAIT' | 'ROUTER');
    setStepAction(step.action_type || 'SEND_MESSAGE');
    setStepMessage(step.message_template || '');
    setStepTagVal(step.action_value || '');
    if (step.wait_config) {
      setWaitAmount(step.wait_config.amount || 1);
      setWaitUnit(step.wait_config.unit || 'days');
    }
    if (step.condition_config) {
      setCondField(step.condition_config.field || 'attended');
      setCondOp(step.condition_config.operator || '==');
      setCondVal(step.condition_config.value || 'true');
    }
    if (step.schedule_config) {
      setScheduleAt(step.schedule_config.scheduled_at || '');
    }
    if (step.action_type === 'ENROLL_WORKFLOW' || step.action_type === 'REMOVE_FROM_WORKFLOW') {
      setTargetWorkflowId(step.action_value || '');
    }
    if (step.router_config) {
      setRouterMode(step.router_config.mode || 'first_match');
    }
    if (step.filter_config) {
      setFilterRules(step.filter_config.rules || []);
      setFilterLogic(step.filter_config.logic || 'AND');
    } else {
      setFilterRules([]);
      setFilterLogic('AND');
    }
    setShowStepForm(true);
  }

  function openFilterEditor(step: Step) {
    setFilterEditStepId(step.id);
    setFilterRules(step.filter_config?.rules || []);
    setFilterLogic(step.filter_config?.logic || 'AND');
    setShowFilterEditor(true);
  }

  async function saveFilterForStep() {
    if (!filterEditStepId) return;
    const fc = filterRules.length > 0 ? { rules: filterRules, logic: filterLogic } : null;
    try {
      const res = await fetch('/api/workflows/steps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: filterEditStepId, filter_config: fc }),
      });
      const data = await res.json();
      if (data.success) {
        setSteps(prev => prev.map(s => s.id === filterEditStepId ? { ...s, filter_config: fc } as Step : s));
      }
    } catch {}
    setShowFilterEditor(false);
    setFilterEditStepId(null);
  }

  function openAddForm(afterStepId?: string) {
    setNewParentId(afterStepId);
    setNewBranchType('DEFAULT');
    setStepNodeType('ACTION');
    resetFormFields();
    setEditingStep(null);
    setShowStepForm(true);
  }

  // ─── Create / Update step ──────────────────────────────────────

  const saveStep = async () => {
    const isEditing = !!editingStep;

    const payload: Record<string, unknown> = {
      workflow_id: workflow.id,
      node_type: stepNodeType,
    };

    if (!isEditing) {
      payload.parent_id = newParentId || null;
      payload.branch_type = newBranchType;
      const siblings = steps.filter((s) => s.parent_id === (newParentId || null));
      payload.step_order = siblings.length + 1;
    }

    if (stepNodeType === 'ACTION') {
      payload.action_type = stepAction;
      if (stepAction === 'SEND_MESSAGE') {
        payload.message_template = stepMessage;
        payload.action_value = '';
      } else if (stepAction === 'SCHEDULE_MESSAGE') {
        payload.message_template = stepMessage;
        payload.action_value = '';
        payload.schedule_config = { scheduled_at: scheduleAt };
      } else if (stepAction === 'ADD_TAG' || stepAction === 'REMOVE_TAG') {
        payload.action_value = stepTagVal;
        payload.message_template = '';
      } else if (stepAction === 'ENROLL_WORKFLOW' || stepAction === 'REMOVE_FROM_WORKFLOW') {
        payload.action_value = targetWorkflowId;
        payload.message_template = '';
      }
    } else if (stepNodeType === 'WAIT') {
      payload.wait_config = { amount: waitAmount, unit: waitUnit };
    } else if (stepNodeType === 'CONDITION') {
      payload.condition_config = { field: condField, operator: condOp, value: condVal };
    } else if (stepNodeType === 'ROUTER') {
      payload.router_config = { mode: routerMode };
    }

    // Attach filter_config if this step is a direct child of a ROUTER
    const parentStep = steps.find(s => s.id === (editingStep?.parent_id || newParentId));
    if (parentStep?.node_type === 'ROUTER' && filterRules.length > 0) {
      payload.filter_config = { rules: filterRules, logic: filterLogic };
    } else if (parentStep?.node_type === 'ROUTER' && filterRules.length === 0) {
      payload.filter_config = null;
    }

    try {
      if (isEditing) {
        const res = await fetch('/api/workflows/steps', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingStep.id, ...payload }),
        });
        const data = await res.json();
        if (data.success) {
          setSteps((prev) => prev.map((s) => (s.id === editingStep.id ? { ...s, ...payload } as Step : s)));
        } else {
          alert(`Failed: ${data.error || 'Unknown error'}`);
          return;
        }
      } else {
        const res = await fetch('/api/workflows/steps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setSteps((prev) => [...prev, data.step as Step]);
        } else {
          alert(`Failed: ${data.error || 'Unknown error'}`);
          return;
        }
      }
      setShowStepForm(false);
      setEditingStep(null);
      resetFormFields();
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  // ─── Save workflow metadata ──────────────────────────────────────

  const saveWorkflow = async () => {
    setSavingWf(true);
    try {
      const res = await fetch('/api/workflows', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: workflow.id,
          name: wfName,
          trigger_type: wfTriggerType,
          trigger_value: wfTriggerValue,
          triggers: extraTriggers,
          is_active: wfIsActive,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(`Failed to save: ${data.error || 'Unknown error'}`);
        return;
      }
      setSavedWf(true);
      setTimeout(() => setSavedWf(false), 2000);
      setShowTriggerForm(false);
    } catch (e) {
      alert(`Error saving: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSavingWf(false);
    }
  };

  // ─── Delete step ────────────────────────────────────────────────

  const deleteStep = async (id: string) => {
    if (!confirm('Delete this step? This cannot be undone.')) return;
    await fetch(`/api/workflows/steps?id=${id}`, { method: 'DELETE' });
    setSteps((prev) => prev.filter((s) => s.id !== id));
    if (editingStep?.id === id) {
      setShowStepForm(false);
      setEditingStep(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="flex-1 w-full h-full bg-slate-50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button
            onClick={() => isDirty ? setShowUnsavedDialog(true) : onBack()}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all flex-shrink-0"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
          <input
            value={wfName}
            onChange={(e) => setWfName(e.target.value)}
            className="flex-1 min-w-0 text-lg font-extrabold text-slate-900 bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-blue-400 outline-none transition-all"
          />
          {isDirty && (
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex-shrink-0">Unsaved</span>
          )}
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <button
            onClick={() => setShowTriggerForm(true)}
            className="flex items-center gap-2 group"
          >
            <Zap className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="text-[11px] font-bold text-slate-500 uppercase group-hover:text-blue-600 transition-colors">
              {wfTriggerType?.replace(/_/g, ' ')}
            </span>
            {wfTriggerValue && (
              <span className="text-[11px] font-bold text-blue-500 truncate max-w-[160px]">{wfTriggerValue}</span>
            )}
            <Edit2 className="w-3 h-3 text-slate-300 group-hover:text-blue-400 transition-colors" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 p-0.5 rounded-lg">
              <button
                onClick={() => setViewTab('flow')}
                className={`px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewTab === 'flow' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Flow
              </button>
              <button
                onClick={() => setViewTab('logs')}
                className={`px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewTab === 'logs' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                <Activity className="w-3 h-3" />
                Logs
              </button>
            </div>
            <button
              onClick={saveWorkflow}
              disabled={savingWf}
              className={`px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                savedWf
                  ? 'bg-emerald-500 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {savedWf ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{savedWf ? 'Saved' : savingWf ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Vertical Flow */}
      {viewTab === 'flow' && <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto py-8 px-4">

          {/* Trigger Card */}
          <div
            onClick={() => setShowTriggerForm(true)}
            className="bg-slate-900 text-white rounded-2xl p-4 cursor-pointer hover:bg-slate-800 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Trigger</span>
                <h4 className="text-sm font-bold mt-0.5">
                  {wfTriggerType?.replace(/_/g, ' ')}
                  {wfTriggerValue && <span className="text-blue-300 ml-2">{wfTriggerValue}</span>}
                </h4>
                {extraTriggers.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">+{extraTriggers.length} more trigger{extraTriggers.length > 1 ? 's' : ''}</p>
                )}
              </div>
              <Edit2 className="w-4 h-4 text-slate-500" />
            </div>
          </div>

          {/* Add first step */}
          <AddStepButton onClick={() => openAddForm(undefined)} />

          {/* Steps — recursive tree with YES/NO split */}
          {(() => {
            const childMap = new Map<string | null, Step[]>();
            for (const s of steps) {
              const key = s.parent_id || null;
              if (!childMap.has(key)) childMap.set(key, []);
              childMap.get(key)!.push(s);
            }
            for (const [, children] of childMap) {
              children.sort((a, b) => a.step_order - b.step_order);
            }

            // Make.com style: filter label helper
            function filterLabel(fc: Step['filter_config']): string {
              if (!fc || !fc.rules || fc.rules.length === 0) return '';
              const opLabels: Record<string, string> = { '==': 'is', '!=': 'is not', 'contains': 'contains', 'not_contains': 'doesn\'t contain', 'exists': 'exists', 'not_exists': 'is empty', 'has_tag': 'has tag', 'not_has_tag': 'doesn\'t have tag', 'starts_with': 'starts with', 'ends_with': 'ends with', '>': '>', '<': '<' };
              return fc.rules.map(r => {
                const op = opLabels[r.operator] || r.operator;
                return ['exists', 'not_exists'].includes(r.operator) ? `${r.field} ${op}` : `${r.field} ${op} "${r.value}"`;
              }).join(fc.logic === 'OR' ? ' OR ' : ' AND ');
            }

            // Make.com style: filter line between router and module
            function FilterLine({ step, color, label }: { step: Step | null; color: string; label: string }) {
              const hasFilter = step?.filter_config && step.filter_config.rules.length > 0;
              const summary = step ? filterLabel(step.filter_config) : '';
              return (
                <div className="flex flex-col items-center my-1">
                  <div className={`w-0.5 h-3 ${color}`} />
                  <button
                    onClick={() => step && openFilterEditor(step)}
                    className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-left max-w-full ${
                      hasFilter
                        ? 'bg-purple-50 border-purple-300 hover:border-purple-400 hover:shadow-sm'
                        : 'bg-white border-dashed border-slate-300 hover:border-purple-400 hover:bg-purple-50'
                    }`}
                  >
                    <Filter className={`w-3 h-3 flex-shrink-0 ${hasFilter ? 'text-purple-500' : 'text-slate-300 group-hover:text-purple-400'}`} />
                    {hasFilter ? (
                      <span className="text-[10px] font-bold text-purple-700 truncate">{summary}</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 group-hover:text-purple-500 italic">Set up a filter</span>
                    )}
                  </button>
                  <div className="text-[8px] font-bold text-slate-400 mt-0.5">{label}</div>
                  <div className={`w-0.5 h-3 ${color}`} />
                </div>
              );
            }

            function renderBranch(parentId: string | null): React.ReactNode {
              const children = childMap.get(parentId) || [];
              if (children.length === 0) return null;
              return children.map((step) => {
                const isCondition = step.node_type === 'CONDITION';
                const isRouter = step.node_type === 'ROUTER';

                return (
                  <div key={step.id}>
                    <StepCard
                      step={step}
                      onClick={() => openEditForm(step)}
                      onDelete={() => deleteStep(step.id)}
                    />

                    {/* Condition → YES / NO split */}
                    {isCondition && (() => {
                      const yesChildren = childMap.get(step.id)?.filter((c) => c.branch_type === 'YES') || [];
                      const noChildren = childMap.get(step.id)?.filter((c) => c.branch_type === 'NO') || [];
                      return (
                        <div className="mt-1">
                          <div className="flex items-start gap-3">
                            {/* YES */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col items-center">
                                <div className="w-0.5 h-4 bg-emerald-300" />
                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 uppercase tracking-widest">YES</span>
                                <div className="w-0.5 h-4 bg-emerald-300" />
                              </div>
                              <div className="border-2 border-emerald-200 rounded-2xl p-3 bg-emerald-50/30">
                                {yesChildren.map((child) => (
                                  <div key={child.id}>
                                    <StepCard step={child} onClick={() => openEditForm(child)} onDelete={() => deleteStep(child.id)} />
                                    {renderBranch(child.id)}
                                    <AddStepButton onClick={() => { setNewBranchType('YES'); openAddForm(step.id); }} />
                                  </div>
                                ))}
                                {yesChildren.length === 0 && (
                                  <div className="flex flex-col items-center py-3">
                                    <button onClick={() => { setNewBranchType('YES'); openAddForm(step.id); }} className="w-7 h-7 rounded-full border-2 border-dashed border-emerald-300 flex items-center justify-center text-emerald-400 hover:border-emerald-500 hover:text-emerald-600 transition-all"><Plus className="w-3.5 h-3.5" /></button>
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* NO */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col items-center">
                                <div className="w-0.5 h-4 bg-red-300" />
                                <span className="text-[9px] font-black text-red-600 bg-red-50 border border-red-200 rounded-full px-3 py-1 uppercase tracking-widest">NO</span>
                                <div className="w-0.5 h-4 bg-red-300" />
                              </div>
                              <div className="border-2 border-red-200 rounded-2xl p-3 bg-red-50/30">
                                {noChildren.map((child) => (
                                  <div key={child.id}>
                                    <StepCard step={child} onClick={() => openEditForm(child)} onDelete={() => deleteStep(child.id)} />
                                    {renderBranch(child.id)}
                                    <AddStepButton onClick={() => { setNewBranchType('NO'); openAddForm(step.id); }} />
                                  </div>
                                ))}
                                {noChildren.length === 0 && (
                                  <div className="flex flex-col items-center py-3">
                                    <button onClick={() => { setNewBranchType('NO'); openAddForm(step.id); }} className="w-7 h-7 rounded-full border-2 border-dashed border-red-300 flex items-center justify-center text-red-400 hover:border-red-500 hover:text-red-600 transition-all"><Plus className="w-3.5 h-3.5" /></button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Router → Make.com style routes with filter lines */}
                    {isRouter && (() => {
                      const allChildren = childMap.get(step.id) || [];
                      const branchChildren = allChildren.filter(c => c.branch_type?.startsWith('BRANCH_')).sort((a, b) => a.step_order - b.step_order);
                      const fallbackChildren = allChildren.filter(c => c.branch_type === 'FALLBACK');
                      const branchTypes = [...new Set(branchChildren.map(c => c.branch_type!))];
                      const nextBranchIdx = branchTypes.length;
                      const routeColors = ['bg-purple-300', 'bg-blue-300', 'bg-emerald-300', 'bg-amber-300', 'bg-rose-300'];

                      return (
                        <div className="mt-2 space-y-0">
                          {/* Routes stacked vertically — each route is: filter line → steps */}
                          {branchTypes.map((bt, idx) => {
                            const stepsInBranch = branchChildren.filter(c => c.branch_type === bt);
                            const firstStep = stepsInBranch[0];
                            const lineColor = routeColors[idx % routeColors.length];
                            return (
                              <div key={bt} className="relative pl-6 border-l-2 border-purple-200 ml-4">
                                {/* Route number badge */}
                                <div className="absolute -left-3 top-3 w-6 h-6 rounded-full bg-purple-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                                  {idx + 1}
                                </div>
                                {/* Filter line (Make.com style — clickable wrench/filter) */}
                                <FilterLine step={firstStep || null} color={lineColor} label={`Route ${idx + 1}`} />
                                {/* Steps in this route */}
                                <div className="space-y-0 pb-3">
                                  {stepsInBranch.map((child) => (
                                    <div key={child.id}>
                                      <StepCard step={child} onClick={() => openEditForm(child)} onDelete={() => deleteStep(child.id)} />
                                      {renderBranch(child.id)}
                                      <AddStepButton onClick={() => { setNewBranchType(bt); openAddForm(step.id); }} />
                                    </div>
                                  ))}
                                  {stepsInBranch.length === 0 && (
                                    <div className="flex items-center gap-2 py-2">
                                      <button onClick={() => { setNewBranchType(bt); openAddForm(step.id); }} className="w-7 h-7 rounded-full border-2 border-dashed border-purple-300 flex items-center justify-center text-purple-400 hover:border-purple-500 hover:text-purple-600 transition-all"><Plus className="w-3.5 h-3.5" /></button>
                                      <span className="text-[10px] text-slate-400">Add module</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Fallback route */}
                          <div className="relative pl-6 border-l-2 border-slate-200 ml-4">
                            <div className="absolute -left-3 top-3 w-6 h-6 rounded-full bg-slate-400 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
                              FB
                            </div>
                            <div className="flex flex-col items-start my-1">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 mt-1">
                                <Filter className="w-3 h-3 text-slate-400" />
                                <span className="text-[10px] text-slate-500 italic">Fallback — runs if no route matches</span>
                              </div>
                            </div>
                            <div className="space-y-0 pb-3">
                              {fallbackChildren.map((child) => (
                                <div key={child.id}>
                                  <StepCard step={child} onClick={() => openEditForm(child)} onDelete={() => deleteStep(child.id)} />
                                  {renderBranch(child.id)}
                                  <AddStepButton onClick={() => { setNewBranchType('FALLBACK'); openAddForm(step.id); }} />
                                </div>
                              ))}
                              {fallbackChildren.length === 0 && (
                                <div className="flex items-center gap-2 py-2">
                                  <button onClick={() => { setNewBranchType('FALLBACK'); openAddForm(step.id); }} className="w-7 h-7 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-slate-500 hover:text-slate-600 transition-all"><Plus className="w-3.5 h-3.5" /></button>
                                  <span className="text-[10px] text-slate-400">Add module</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Add new route */}
                          <div className="pl-6 ml-4 pb-2">
                            <button
                              onClick={() => { setNewBranchType(`BRANCH_${nextBranchIdx}`); openAddForm(step.id); }}
                              className="flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-purple-200 rounded-xl text-xs font-bold text-purple-400 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-all"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Route
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Non-condition, non-router → default children */}
                    {!isCondition && !isRouter && (
                      <>
                        <AddStepButton onClick={() => openAddForm(step.id)} />
                        {renderBranch(step.id)}
                      </>
                    )}
                  </div>
                );
              });
            }

            const rootChildren = childMap.get(null) || [];
            if (rootChildren.length === 0) {
              return (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Plus className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-slate-400 font-bold text-sm">No steps yet</p>
                  <p className="text-slate-300 text-xs mt-1">Click the + button above to add your first step</p>
                </div>
              );
            }
            return renderBranch(null);
          })()}
        </div>
      </div>}

      {/* Execution Logs */}
      {viewTab === 'logs' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto py-6 px-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-slate-900">Execution History</h2>
              <button
                onClick={fetchLogs}
                disabled={logsLoading}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 rounded-lg flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className={`w-3 h-3 ${logsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {logsLoading && logs.length === 0 && (
              <div className="text-center py-16">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-300 mx-auto" />
                <p className="text-sm text-slate-400 mt-3">Loading logs...</p>
              </div>
            )}

            {!logsLoading && logs.length === 0 && (
              <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-3xl">
                <Activity className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-slate-400 font-bold text-sm mt-3">No executions yet</p>
                <p className="text-slate-300 text-xs mt-1">Trigger this workflow to see execution logs here</p>
              </div>
            )}

            {logs.map((enrollment: any) => (
              <div key={enrollment.id} className="mb-4 bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {/* Enrollment header */}
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      enrollment.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                      enrollment.status === 'completed' ? 'bg-blue-500' :
                      'bg-slate-300'
                    }`} />
                    <span className="text-sm font-bold text-slate-900">{enrollment.contact_name}</span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                      enrollment.status === 'active' ? 'bg-emerald-100 text-emerald-600' :
                      enrollment.status === 'completed' ? 'bg-blue-100 text-blue-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {enrollment.status}
                    </span>
                    {!enrollment.contact_line_id && (
                      <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">No LINE ID</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {enrollment.started_at ? new Date(enrollment.started_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }) : ''}
                  </span>
                </div>

                {/* Step logs */}
                {enrollment.steps && enrollment.steps.length > 0 ? (
                  <div className="divide-y divide-slate-50">
                    {enrollment.steps.map((step: any) => (
                      <div key={step.id} className="px-4 py-2.5 flex items-center gap-3">
                        {step.status === 'sent' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : step.status === 'failed' ? (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        ) : step.status === 'cancelled' ? (
                          <XCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        ) : (
                          <Clock3 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              {step.action_type || step.step_type}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              step.status === 'sent' ? 'bg-emerald-50 text-emerald-600' :
                              step.status === 'failed' ? 'bg-red-50 text-red-600' :
                              step.status === 'queued' ? 'bg-amber-50 text-amber-600' :
                              'bg-slate-50 text-slate-500'
                            }`}>
                              {step.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5 truncate">{step.description}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {step.executed_at
                            ? new Date(step.executed_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' })
                            : step.scheduled_at
                            ? `Sched: ${new Date(step.scheduled_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' })}`
                            : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-xs text-slate-400 italic">No step executions recorded</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Unsaved Changes Dialog ────────────────────────────── */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
                <Save className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">Unsaved Changes</h3>
              <p className="text-sm text-slate-500">You have unsaved changes to this workflow. Do you want to save before leaving?</p>
            </div>
            <div className="space-y-2">
              <button
                onClick={async () => { await saveWorkflow(); setShowUnsavedDialog(false); onBack(); }}
                className="w-full py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all"
              >
                Save & Exit
              </button>
              <button
                onClick={() => { setShowUnsavedDialog(false); onBack(); }}
                className="w-full py-3 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-all"
              >
                Discard Changes
              </button>
              <button
                onClick={() => setShowUnsavedDialog(false)}
                className="w-full py-3 text-slate-500 font-bold hover:text-slate-700 transition-all"
              >
                Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Trigger Edit Modal ────────────────────────────────── */}
      {showTriggerForm && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-bold text-lg">Edit Trigger</h3>
              </div>
              <button onClick={() => setShowTriggerForm(false)} className="p-2 hover:bg-slate-800 rounded-xl transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Workflow Name</label>
                <input
                  type="text"
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Triggers <span className="text-blue-500">(any match fires the workflow)</span></label>
                <div className="space-y-2">
                  <TriggerRow
                    type={wfTriggerType}
                    value={wfTriggerValue}
                    onTypeChange={(t) => { setWfTriggerType(t); if (t === 'USER_FOLLOW' || t === 'MANUAL') setWfTriggerValue(''); }}
                    onValueChange={setWfTriggerValue}
                    onRemove={null}
                    isPrimary
                  />
                  {extraTriggers.map((t, i) => (
                    <TriggerRow
                      key={i}
                      type={t.type}
                      value={t.value}
                      onTypeChange={(newType) => {
                        const updated = [...extraTriggers];
                        updated[i] = { type: newType, value: newType === 'USER_FOLLOW' || newType === 'MANUAL' ? '' : updated[i].value };
                        setExtraTriggers(updated);
                      }}
                      onValueChange={(newVal) => {
                        const updated = [...extraTriggers];
                        updated[i] = { ...updated[i], value: newVal };
                        setExtraTriggers(updated);
                      }}
                      onRemove={() => setExtraTriggers(prev => prev.filter((_, idx) => idx !== i))}
                      isPrimary={false}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setExtraTriggers(prev => [...prev, { type: 'TAG_ADDED', value: '' }])}
                  className="mt-2 w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Another Trigger
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-slate-700">Active</p>
                  <p className="text-[11px] text-slate-400">Workflow will process enrollments when active</p>
                </div>
                <button
                  onClick={() => setWfIsActive((v) => !v)}
                  className={`w-12 h-6 rounded-full transition-all relative ${wfIsActive ? 'bg-blue-500' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${wfIsActive ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              <button
                onClick={saveWorkflow}
                disabled={savingWf}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all"
              >
                {savingWf ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Step Form Modal ───────────────────────────────────── */}
      {showStepForm && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">{editingStep ? 'Edit Step' : 'Add Step'}</h3>
              <button
                onClick={() => { setShowStepForm(false); setEditingStep(null); }}
                className="p-2 hover:bg-slate-800 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Node Type Selector */}
              {!editingStep && (
                <div className="grid grid-cols-4 gap-3">
                  {([
                    { id: 'ACTION', icon: MessageCircle, label: 'Action', color: 'blue' },
                    { id: 'CONDITION', icon: Filter, label: 'If / Else', color: 'amber' },
                    { id: 'ROUTER', icon: GitMerge, label: 'Router', color: 'purple' },
                    { id: 'WAIT', icon: Clock, label: 'Wait', color: 'indigo' },
                  ] as const).map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setStepNodeType(type.id)}
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                        stepNodeType === type.id
                          ? `border-${type.color}-500 bg-${type.color}-50`
                          : 'border-slate-100 bg-slate-50 grayscale opacity-60'
                      }`}
                    >
                      <type.icon
                        className={`w-6 h-6 mb-2 ${stepNodeType === type.id ? `text-${type.color}-600` : 'text-slate-400'}`}
                      />
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest ${
                          stepNodeType === type.id ? `text-${type.color}-700` : 'text-slate-500'
                        }`}
                      >
                        {type.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Branch selector for condition children */}
              {!editingStep && steps.find((s) => s.id === newParentId)?.node_type === 'CONDITION' && (
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Select Branch Path</label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setNewBranchType('YES')}
                      className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${
                        newBranchType === 'YES'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                          : 'bg-slate-50 border-slate-100 text-slate-400'
                      }`}
                    >
                      YES Path
                    </button>
                    <button
                      onClick={() => setNewBranchType('NO')}
                      className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${
                        newBranchType === 'NO'
                          ? 'bg-rose-50 border-rose-500 text-rose-700'
                          : 'bg-slate-50 border-slate-100 text-slate-400'
                      }`}
                    >
                      NO Path
                    </button>
                  </div>
                </div>
              )}

              {/* Router branch filter — shows when parent is ROUTER */}
              {(() => {
                const parentIsRouter = editingStep
                  ? steps.find(s => s.id === editingStep.parent_id)?.node_type === 'ROUTER'
                  : steps.find(s => s.id === newParentId)?.node_type === 'ROUTER';
                const branchLabel = newBranchType === 'FALLBACK' ? 'Fallback' : newBranchType?.replace('_', ' ');
                if (!parentIsRouter) return null;
                return (
                  <div className="space-y-3">
                    <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                      <p className="text-xs font-bold text-purple-700">
                        Route: <span className="uppercase">{branchLabel}</span>
                      </p>
                    </div>
                    {newBranchType !== 'FALLBACK' && (
                      <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Take this route if...</label>
                          {filterRules.length > 1 && (
                            <select
                              value={filterLogic}
                              onChange={(e) => setFilterLogic(e.target.value as 'AND' | 'OR')}
                              className="text-[10px] font-bold bg-white border border-purple-200 rounded-lg px-2 py-1 text-purple-600"
                            >
                              <option value="AND">ALL rules match (AND)</option>
                              <option value="OR">ANY rule matches (OR)</option>
                            </select>
                          )}
                        </div>
                        {filterRules.map((rule, ri) => (
                          <div key={ri} className="flex items-start gap-2">
                            <div className="flex-1 space-y-2">
                              <select
                                value={rule.field}
                                onChange={(e) => { const r = [...filterRules]; r[ri] = { ...r[ri], field: e.target.value }; setFilterRules(r); }}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-purple-500 outline-none"
                              >
                                <optgroup label="Contact">
                                  <option value="name">Name</option>
                                  <option value="email">Email</option>
                                  <option value="phone">Phone</option>
                                  <option value="status">Status</option>
                                  <option value="tags">Tags</option>
                                  <option value="notes">Notes</option>
                                  <option value="line_id">LINE ID</option>
                                  <option value="attended">Attended</option>
                                  <option value="purchased">Purchased</option>
                                </optgroup>
                                <optgroup label="Webinar">
                                  <option value="webinar_upcoming">Webinar is Upcoming</option>
                                  <option value="webinar_link">Webinar Link</option>
                                  <option value="webinar_date">Webinar Date</option>
                                </optgroup>
                              </select>
                              <div className="flex gap-2">
                                <select
                                  value={rule.operator}
                                  onChange={(e) => { const r = [...filterRules]; r[ri] = { ...r[ri], operator: e.target.value }; setFilterRules(r); }}
                                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-purple-500 outline-none"
                                >
                                  {rule.field === 'tags' ? (
                                    <>
                                      <option value="has_tag">Has tag</option>
                                      <option value="not_has_tag">Does not have tag</option>
                                      <option value="exists">Has any tags</option>
                                      <option value="not_exists">Has no tags</option>
                                    </>
                                  ) : ['attended', 'purchased'].includes(rule.field) ? (
                                    <option value="==">Equals</option>
                                  ) : (
                                    <>
                                      <option value="==">Equals</option>
                                      <option value="!=">Does not equal</option>
                                      <option value="contains">Contains</option>
                                      <option value="not_contains">Does not contain</option>
                                      <option value="exists">Exists (has value)</option>
                                      <option value="not_exists">Does not exist (empty)</option>
                                      <option value="starts_with">Starts with</option>
                                      <option value="ends_with">Ends with</option>
                                    </>
                                  )}
                                </select>
                                {!['exists', 'not_exists'].includes(rule.operator) && rule.field !== 'webinar_upcoming' && (
                                  ['attended', 'purchased'].includes(rule.field) ? (
                                    <select
                                      value={rule.value}
                                      onChange={(e) => { const r = [...filterRules]; r[ri] = { ...r[ri], value: e.target.value }; setFilterRules(r); }}
                                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-purple-500 outline-none"
                                    >
                                      <option value="true">True</option>
                                      <option value="false">False</option>
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={rule.value}
                                      onChange={(e) => { const r = [...filterRules]; r[ri] = { ...r[ri], value: e.target.value }; setFilterRules(r); }}
                                      placeholder="value..."
                                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-purple-500 outline-none"
                                    />
                                  )
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => setFilterRules(prev => prev.filter((_, i) => i !== ri))}
                              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors mt-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {filterRules.length === 0 && (
                          <p className="text-[10px] text-purple-400 italic">No filter — this route will always run. Add a rule to make it conditional.</p>
                        )}
                        <button
                          onClick={() => setFilterRules(prev => [...prev, { field: 'tags', operator: 'has_tag', value: '' }])}
                          className="w-full py-2 border-2 border-dashed border-purple-200 rounded-xl text-[10px] font-bold text-purple-400 hover:border-purple-400 hover:text-purple-600 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3 h-3" />
                          Add Filter Rule
                        </button>
                      </div>
                    )}
                    {newBranchType === 'FALLBACK' && (
                      <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 italic">
                        Fallback route runs when no other branch matches. No filter needed.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ACTION Config */}
              {stepNodeType === 'ACTION' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Action</label>
                    <select
                      value={stepAction}
                      onChange={(e) => setStepAction(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                      <option value="SEND_MESSAGE">Send LINE Message</option>
                      <option value="ADD_TAG">Add Tag</option>
                      <option value="REMOVE_TAG">Remove Tag</option>
                      <option value="SCHEDULE_MESSAGE">Schedule Message</option>
                      <option value="ENROLL_WORKFLOW">Enroll in Workflow</option>
                      <option value="REMOVE_FROM_WORKFLOW">Remove from Workflow</option>
                    </select>
                  </div>
                  {(stepAction === 'SEND_MESSAGE' || stepAction === 'SCHEDULE_MESSAGE') && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Message Template</label>
                      <textarea
                        value={stepMessage}
                        onChange={(e) => setStepMessage(e.target.value)}
                        placeholder="Hello {{name}}..."
                        rows={4}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Variables: {'{{name}}'}, {'{{email}}'}, {'{{phone}}'}, {'{{tags}}'}, {'{{webinar_link}}'}, {'{{webinar_date}}'}
                        <br />Media: [image:URL] or [video:URL] or [video:URL|PREVIEW_URL]
                      </p>
                    </div>
                  )}
                  {stepAction === 'SCHEDULE_MESSAGE' && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Send At (Date & Time)</label>
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  )}
                  {(stepAction === 'ADD_TAG' || stepAction === 'REMOVE_TAG') && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tag Name</label>
                      <input
                        type="text"
                        value={stepTagVal}
                        onChange={(e) => setStepTagVal(e.target.value)}
                        placeholder="Interested"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  )}
                  {(stepAction === 'ENROLL_WORKFLOW' || stepAction === 'REMOVE_FROM_WORKFLOW') && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Target Workflow</label>
                      <select
                        value={targetWorkflowId}
                        onChange={(e) => setTargetWorkflowId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                      >
                        <option value="">-- Select Workflow --</option>
                        {allWorkflows.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* WAIT Config */}
              {stepNodeType === 'WAIT' && (
                <div className="space-y-4">
                  <div className="flex space-x-4">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Amount</label>
                      <input
                        type="number"
                        min={1}
                        value={waitAmount}
                        onChange={(e) => setWaitAmount(parseInt(e.target.value) || 1)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Unit</label>
                      <select
                        value={waitUnit}
                        onChange={(e) => setWaitUnit(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                      >
                        <option value="seconds">Seconds</option>
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 italic">
                    Note: Waits are processed every 15 minutes by the cron. Waits under 15 minutes may have slight delay.
                  </p>
                </div>
              )}

              {/* CONDITION Config — Make.com-style filter */}
              {stepNodeType === 'CONDITION' && (() => {
                const FIELD_OPTIONS = [
                  { value: 'webinar_upcoming', label: 'Webinar is Upcoming', group: 'Webinar' },
                  { value: 'webinar_link', label: 'Webinar Link', group: 'Webinar' },
                  { value: 'webinar_date', label: 'Webinar Date', group: 'Webinar' },
                  { value: 'attended', label: 'Attended Webinar', group: 'Webinar' },
                  { value: 'purchased', label: 'Product Purchased', group: 'Contact' },
                  { value: 'tags', label: 'Tags', group: 'Contact' },
                  { value: 'status', label: 'Status', group: 'Contact' },
                  { value: 'name', label: 'Name', group: 'Contact' },
                  { value: 'email', label: 'Email', group: 'Contact' },
                  { value: 'phone', label: 'Phone', group: 'Contact' },
                  { value: 'notes', label: 'Notes', group: 'Contact' },
                  { value: 'line_id', label: 'LINE ID', group: 'Contact' },
                ];
                const isSpecialField = condField === 'webinar_upcoming';
                const isTagField = condField === 'tags';
                const isBoolField = ['attended', 'purchased'].includes(condField);
                const OPERATOR_OPTIONS = isTagField
                  ? [
                      { value: 'has_tag', label: 'Has tag' },
                      { value: 'not_has_tag', label: 'Does not have tag' },
                      { value: 'exists', label: 'Has any tags' },
                      { value: 'not_exists', label: 'Has no tags' },
                    ]
                  : isBoolField
                  ? [
                      { value: '==', label: 'Equals' },
                    ]
                  : [
                      { value: '==', label: 'Equals' },
                      { value: '!=', label: 'Does not equal' },
                      { value: 'contains', label: 'Contains' },
                      { value: 'not_contains', label: 'Does not contain' },
                      { value: 'exists', label: 'Exists (has value)' },
                      { value: 'not_exists', label: 'Does not exist (empty)' },
                      { value: 'starts_with', label: 'Starts with' },
                      { value: 'ends_with', label: 'Ends with' },
                    ];
                const hideValue = ['exists', 'not_exists'].includes(condOp) || isSpecialField;
                return (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-400 italic">Contacts will split into YES / NO paths based on this filter.</p>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Field</label>
                        <select
                          value={condField}
                          onChange={(e) => {
                            const f = e.target.value;
                            setCondField(f);
                            if (f === 'webinar_upcoming') { setCondOp('=='); setCondVal(''); }
                            else if (f === 'tags') { setCondOp('has_tag'); setCondVal(''); }
                            else if (['attended', 'purchased'].includes(f)) { setCondOp('=='); setCondVal('true'); }
                            else { setCondOp('=='); setCondVal(''); }
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                        >
                          {['Webinar', 'Contact'].map((group) => (
                            <optgroup key={group} label={group}>
                              {FIELD_OPTIONS.filter((f) => f.group === group).map((f) => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      {!isSpecialField && (
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Operator</label>
                          <select
                            value={condOp}
                            onChange={(e) => setCondOp(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                          >
                            {OPERATOR_OPTIONS.map((op) => (
                              <option key={op.value} value={op.value}>{op.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {!hideValue && (
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Value</label>
                          {isBoolField ? (
                            <select
                              value={condVal}
                              onChange={(e) => setCondVal(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                            >
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={condVal}
                              onChange={(e) => setCondVal(e.target.value)}
                              placeholder={isTagField ? 'e.g. Interested' : 'e.g. active'}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                          )}
                        </div>
                      )}
                    </div>
                    {isSpecialField && (
                      <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
                        <strong>YES</strong> = contact has a webinar link AND the webinar date is today or in the future<br />
                        <strong>NO</strong> = no link, no date, or date has passed (expired)
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ROUTER Config */}
              {stepNodeType === 'ROUTER' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 italic">Router evaluates branch filters in order. Add branches after creating the router.</p>
                  <div className="p-4 bg-purple-50 rounded-2xl border border-purple-200 space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Mode</label>
                      <select
                        value={routerMode}
                        onChange={(e) => setRouterMode(e.target.value as 'first_match' | 'all_match')}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-purple-500 outline-none"
                      >
                        <option value="first_match">First Match — stops at first passing branch</option>
                        <option value="all_match">All Match — runs every passing branch</option>
                      </select>
                    </div>
                    <div className="p-3 bg-white rounded-xl text-xs text-purple-700">
                      <strong>First Match:</strong> evaluates branches top-to-bottom, first passing filter wins.<br />
                      <strong>All Match:</strong> every branch whose filter passes will execute.<br />
                      <strong>Fallback:</strong> runs only if no other branch matches.
                    </div>
                  </div>
                </div>
              )}

              {/* Save / Delete buttons */}
              <div className="pt-4 space-y-3">
                <button
                  onClick={saveStep}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all"
                >
                  {editingStep ? 'Update Step' : 'Create Step'}
                </button>
                {editingStep && (
                  <button
                    onClick={() => deleteStep(editingStep.id)}
                    className="w-full py-3 bg-red-50 text-red-600 rounded-2xl font-bold text-sm hover:bg-red-100 transition-all"
                  >
                    Delete Step
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Set up a filter (Make.com style modal) ────────────── */}
      {showFilterEditor && (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            {/* Header — Make.com uses a clean minimal header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Set up a filter</h3>
              <button onClick={() => { setShowFilterEditor(false); setFilterEditStepId(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Label — like Make.com's label field */}
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1.5">Label</label>
                <p className="text-[11px] text-slate-400 mb-2">The label appears on the route line in the flow.</p>
              </div>

              {/* Condition section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-slate-500">Condition</label>
                  {filterRules.length > 1 && (
                    <select
                      value={filterLogic}
                      onChange={(e) => setFilterLogic(e.target.value as 'AND' | 'OR')}
                      className="text-[10px] font-bold bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-600"
                    >
                      <option value="AND">AND — all must match</option>
                      <option value="OR">OR — any can match</option>
                    </select>
                  )}
                </div>

                {/* Condition rows — Make.com style: field | operator | value in a row */}
                <div className="space-y-3">
                  {filterRules.map((rule, ri) => (
                    <div key={ri} className="space-y-2">
                      {ri > 0 && (
                        <div className="flex justify-center">
                          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{filterLogic}</span>
                        </div>
                      )}
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                        {/* Row 1: Field */}
                        <select
                          value={rule.field}
                          onChange={(e) => { const r = [...filterRules]; r[ri] = { ...r[ri], field: e.target.value }; setFilterRules(r); }}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-purple-500 outline-none"
                        >
                          <optgroup label="Contact">
                            <option value="name">Name</option>
                            <option value="email">Email</option>
                            <option value="phone">Phone</option>
                            <option value="status">Status</option>
                            <option value="tags">Tags</option>
                            <option value="notes">Notes</option>
                            <option value="line_id">LINE ID</option>
                            <option value="attended">Attended</option>
                            <option value="purchased">Purchased</option>
                          </optgroup>
                          <optgroup label="Webinar">
                            <option value="webinar_upcoming">Webinar is Upcoming</option>
                            <option value="webinar_link">Webinar Link</option>
                            <option value="webinar_date">Webinar Date</option>
                          </optgroup>
                        </select>
                        {/* Row 2: Operator + Value side by side */}
                        <div className="flex gap-2">
                          <select
                            value={rule.operator}
                            onChange={(e) => { const r = [...filterRules]; r[ri] = { ...r[ri], operator: e.target.value }; setFilterRules(r); }}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-purple-500 outline-none"
                          >
                            {rule.field === 'tags' ? (
                              <>
                                <option value="has_tag">Has tag</option>
                                <option value="not_has_tag">Does not have tag</option>
                                <option value="exists">Has any tags</option>
                                <option value="not_exists">Has no tags</option>
                              </>
                            ) : ['attended', 'purchased'].includes(rule.field) ? (
                              <option value="==">Equal to</option>
                            ) : (
                              <>
                                <option value="==">Equal to</option>
                                <option value="!=">Not equal to</option>
                                <option value="contains">Contains</option>
                                <option value="not_contains">Does not contain</option>
                                <option value="exists">Exists</option>
                                <option value="not_exists">Does not exist</option>
                                <option value="starts_with">Starts with</option>
                                <option value="ends_with">Ends with</option>
                              </>
                            )}
                          </select>
                          {!['exists', 'not_exists'].includes(rule.operator) && rule.field !== 'webinar_upcoming' && (
                            ['attended', 'purchased'].includes(rule.field) ? (
                              <select
                                value={rule.value}
                                onChange={(e) => { const r = [...filterRules]; r[ri] = { ...r[ri], value: e.target.value }; setFilterRules(r); }}
                                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-purple-500 outline-none"
                              >
                                <option value="true">True</option>
                                <option value="false">False</option>
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={rule.value}
                                onChange={(e) => { const r = [...filterRules]; r[ri] = { ...r[ri], value: e.target.value }; setFilterRules(r); }}
                                placeholder="Enter value..."
                                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-purple-500 outline-none"
                              />
                            )
                          )}
                          <button onClick={() => setFilterRules(prev => prev.filter((_, i) => i !== ri))} className="p-2 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add condition — Make.com shows "Add AND condition" / "Add OR condition" */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => { setFilterLogic('AND'); setFilterRules(prev => [...prev, { field: 'tags', operator: 'has_tag', value: '' }]); }}
                    className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:text-purple-600 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-lg transition-all"
                  >
                    + Add AND condition
                  </button>
                  <button
                    onClick={() => { setFilterLogic('OR'); setFilterRules(prev => [...prev, { field: 'tags', operator: 'has_tag', value: '' }]); }}
                    className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:text-purple-600 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-lg transition-all"
                  >
                    + Add OR condition
                  </button>
                </div>

                {filterRules.length === 0 && (
                  <p className="text-xs text-slate-400 italic text-center mt-3">No conditions set — this route will always run.</p>
                )}
              </div>
            </div>

            {/* Footer — OK button like Make.com */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={saveFilterForStep}
                className="px-8 py-2.5 bg-purple-600 text-white rounded-lg font-bold text-sm hover:bg-purple-700 transition-all shadow-sm"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
