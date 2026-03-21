'use client';

import React, { useState, useEffect } from 'react';
import {
  X, Plus, MessageCircle, Filter, Clock,
  Trash2, Save, Check, Zap, Edit2,
  ChevronDown, ArrowDown,
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
  branch_type?: 'YES' | 'NO' | 'DEFAULT';
  node_type: 'ACTION' | 'CONDITION' | 'WAIT' | 'START';
  step_order: number;
  action_type?: string;
  message_template?: string;
  action_value?: string;
  wait_config?: { amount: number; unit: string };
  condition_config?: { field: string; operator: string; value: string };
  schedule_config?: { scheduled_at: string };
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

  const iconBg = isCondition ? 'bg-amber-100' : isWait ? 'bg-indigo-100' : 'bg-blue-100';
  const iconColor = isCondition ? 'text-amber-600' : isWait ? 'text-indigo-600' : 'text-blue-600';
  const borderColor = isCondition ? 'border-amber-200 hover:border-amber-300' : isWait ? 'border-indigo-200 hover:border-indigo-300' : 'border-blue-200 hover:border-blue-300';

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
    title = `If ${step.condition_config?.field || '?'}`;
    subtitle = `${step.condition_config?.operator || '=='} ${step.condition_config?.value || '?'}`;
  } else if (isWait) {
    title = 'Wait';
    subtitle = `${step.wait_config?.amount || 1} ${step.wait_config?.unit || 'days'}`;
  }

  const Icon = isCondition ? Filter : isWait ? Clock : MessageCircle;

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

// ─── Build ordered step list from tree ──────────────────────────────

function buildOrderedList(steps: Step[]): Step[] {
  // Build a flat ordered list by walking the parent→child tree
  const childMap = new Map<string | null, Step[]>();
  for (const s of steps) {
    const key = s.parent_id || null;
    if (!childMap.has(key)) childMap.set(key, []);
    childMap.get(key)!.push(s);
  }
  // Sort children by step_order
  for (const [, children] of childMap) {
    children.sort((a, b) => a.step_order - b.step_order);
  }

  const result: Step[] = [];
  function walk(parentId: string | null) {
    const children = childMap.get(parentId) || [];
    for (const child of children) {
      result.push(child);
      walk(child.id);
    }
  }
  walk(null);
  return result;
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
  const [condOp] = useState('==');
  const [condVal, setCondVal] = useState('true');
  const [scheduleAt, setScheduleAt] = useState('');
  const [targetWorkflowId, setTargetWorkflowId] = useState('');
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

  // ─── Form helpers ───────────────────────────────────────────────

  function resetFormFields() {
    setStepAction('SEND_MESSAGE');
    setStepMessage('');
    setStepTagVal('');
    setWaitAmount(1);
    setWaitUnit('days');
    setCondField('attended');
    setCondVal('true');
    setScheduleAt('');
    setTargetWorkflowId('');
  }

  function openEditForm(step: Step) {
    setEditingStep(step);
    setStepNodeType(step.node_type as 'ACTION' | 'CONDITION' | 'WAIT');
    setStepAction(step.action_type || 'SEND_MESSAGE');
    setStepMessage(step.message_template || '');
    setStepTagVal(step.action_value || '');
    if (step.wait_config) {
      setWaitAmount(step.wait_config.amount || 1);
      setWaitUnit(step.wait_config.unit || 'days');
    }
    if (step.condition_config) {
      setCondField(step.condition_config.field || 'attended');
      setCondVal(step.condition_config.value || 'true');
    }
    if (step.schedule_config) {
      setScheduleAt(step.schedule_config.scheduled_at || '');
    }
    if (step.action_type === 'ENROLL_WORKFLOW' || step.action_type === 'REMOVE_FROM_WORKFLOW') {
      setTargetWorkflowId(step.action_value || '');
    }
    setShowStepForm(true);
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

  // ─── Ordered steps for vertical display ─────────────────────────

  const orderedSteps = buildOrderedList(steps);

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

      {/* Vertical Flow */}
      <div className="flex-1 overflow-y-auto">
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

          {/* Steps */}
          {orderedSteps.map((step, idx) => (
            <div key={step.id}>
              <StepCard
                step={step}
                onClick={() => openEditForm(step)}
                onDelete={() => deleteStep(step.id)}
              />
              <AddStepButton onClick={() => openAddForm(step.id)} />
            </div>
          ))}

          {/* Empty state */}
          {orderedSteps.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Plus className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-slate-400 font-bold text-sm">No steps yet</p>
              <p className="text-slate-300 text-xs mt-1">Click the + button above to add your first step</p>
            </div>
          )}
        </div>
      </div>

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
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { id: 'ACTION', icon: MessageCircle, label: 'Action', color: 'blue' },
                    { id: 'CONDITION', icon: Filter, label: 'If / Else', color: 'amber' },
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

              {/* CONDITION Config */}
              {stepNodeType === 'CONDITION' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 italic">Contacts will split into YES/NO paths based on this condition.</p>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Field</label>
                    <select
                      value={condField}
                      onChange={(e) => setCondField(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                      <option value="attended">Attended Webinar</option>
                      <option value="purchased">Product Purchased</option>
                      <option value="tags">Has Tag</option>
                      <option value="status">Status</option>
                    </select>
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={condOp}
                      className="w-16 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-center"
                    />
                    <input
                      type="text"
                      value={condVal}
                      onChange={(e) => setCondVal(e.target.value)}
                      placeholder="true"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                    />
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
    </div>
  );
}
