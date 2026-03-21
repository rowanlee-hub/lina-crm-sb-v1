'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  X, Plus, MessageCircle, Filter, Clock, List, Layout,
  Trash2, Calendar, TagIcon, UserPlus, UserMinus, Send,
  Save, Check, Zap, Edit2,
} from 'lucide-react';

import { TriggerNode, ActionNode, WaitNode, ConditionNode } from './workflow-nodes';
import { stepsToNodesAndEdges, positionsFromNodes, type StepData, type WorkflowData } from '@/lib/workflow-canvas-utils';

// ─── Types ──────────────────────────────────────────────────────────

export interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  trigger_value: string;
  is_active: boolean;
  step_count: number;
  active_enrollments: number;
}

export interface Step extends StepData {
  day_name?: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_COLORS: Record<number, string> = {
  0: 'bg-red-100 text-red-700',
  1: 'bg-orange-100 text-orange-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-emerald-100 text-emerald-700',
  4: 'bg-blue-100 text-blue-700',
  5: 'bg-violet-100 text-violet-700',
  6: 'bg-pink-100 text-pink-700',
};

const NODE_TYPES = {
  triggerNode: TriggerNode,
  actionNode: ActionNode,
  waitNode: WaitNode,
  conditionNode: ConditionNode,
};

// ─── Main Component ─────────────────────────────────────────────────

interface WorkflowBuilderProps {
  workflow: Workflow;
  initialSteps: Step[];
  onBack: () => void;
}

export default function WorkflowBuilder({ workflow, initialSteps, onBack }: WorkflowBuilderProps) {
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [viewMode, setViewMode] = useState<'canvas' | 'list'>('canvas');

  // Workflow-level editable state
  const [wfName, setWfName] = useState(workflow.name);
  const [wfTriggerType, setWfTriggerType] = useState(workflow.trigger_type);
  const [wfTriggerValue, setWfTriggerValue] = useState(workflow.trigger_value || '');
  const [wfIsActive, setWfIsActive] = useState(workflow.is_active);
  const [savingWf, setSavingWf] = useState(false);
  const [savedWf, setSavedWf] = useState(false);

  // Track unsaved changes
  const isDirty =
    wfName !== workflow.name ||
    wfTriggerType !== workflow.trigger_type ||
    wfTriggerValue !== (workflow.trigger_value || '') ||
    wfIsActive !== workflow.is_active;

  // Unsaved changes confirm dialog
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Trigger edit panel
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

  // React Flow state
  const wfForCanvas = useMemo(
    () => ({ ...workflow, name: wfName, trigger_type: wfTriggerType, trigger_value: wfTriggerValue }),
    [workflow, wfName, wfTriggerType, wfTriggerValue]
  );

  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => stepsToNodesAndEdges(steps, wfForCanvas),
    // Only compute on mount — we manage nodes/edges via state after that
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  // Debounced position save
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Recompute nodes/edges when steps or workflow metadata change
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = stepsToNodesAndEdges(steps, wfForCanvas);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [steps, wfForCanvas, setNodes, setEdges]);

  // Load all workflows for enroll/remove dropdown
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

  // ─── Save positions after drag ──────────────────────────────────

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, __: Node, allNodes: Node[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const positions = positionsFromNodes(allNodes);
        if (positions.length === 0) return;
        try {
          await fetch('/api/workflows/steps', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positions }),
          });
        } catch (e) {
          console.error('Failed to save positions:', e);
        }
      }, 500);
    },
    []
  );

  // ─── Node click → open edit ─────────────────────────────────────

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.id === 'trigger') {
        setShowTriggerForm(true);
        return;
      }
      const step = (node.data as Record<string, unknown>).step as Step;
      if (step) {
        openEditForm(step);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps]
  );

  // ─── Add node from "+" context ──────────────────────────────────

  const handleAddNode = useCallback(
    (parentId: string, branch?: string) => {
      setNewParentId(parentId === 'trigger' ? undefined : parentId);
      setNewBranchType((branch as 'YES' | 'NO' | 'DEFAULT') || 'DEFAULT');
      setStepNodeType('ACTION');
      resetFormFields();
      setEditingStep(null);
      setShowStepForm(true);
    },
    []
  );

  // ─── Edge connect ───────────────────────────────────────────────

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const targetStep = steps.find((s) => s.id === connection.target);
      if (!targetStep) return;

      const branchType =
        connection.sourceHandle === 'yes'
          ? 'YES'
          : connection.sourceHandle === 'no'
          ? 'NO'
          : 'DEFAULT';

      const parentId = connection.source === 'trigger' ? null : connection.source;

      try {
        await fetch('/api/workflows/steps', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: targetStep.id, parent_id: parentId, branch_type: branchType }),
        });
        setSteps((prev) =>
          prev.map((s) =>
            s.id === targetStep.id
              ? { ...s, parent_id: parentId, branch_type: branchType as Step['branch_type'] }
              : s
          )
        );
      } catch (e) {
        console.error('Failed to connect:', e);
      }
    },
    [steps]
  );

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

  // ─── Create / Update step ──────────────────────────────────────

  const saveStep = async () => {
    const isEditing = !!editingStep;

    // Build payload
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
    if (!confirm('Are you sure you want to delete this node? This cannot be undone.')) return;
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
        {/* Row 1: Back + Name + Save */}
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
        {/* Row 2: Trigger info + View toggle */}
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
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('canvas')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'canvas' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Layout className="w-3.5 h-3.5" />
                <span>Canvas</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
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
              <span>{savedWf ? 'Saved' : savingWf ? 'Saving…' : 'Save'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Canvas / List */}
      <div className="flex-1 relative">
        {viewMode === 'canvas' ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeClick={handleNodeClick}
            onNodeDragStop={handleNodeDragStop}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            className="bg-slate-50"
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
            <Controls className="!bg-white !border-slate-200 !rounded-xl !shadow-lg" />
            <MiniMap
              className="!bg-white !border-slate-200 !rounded-xl !shadow-lg"
              nodeColor={(n) =>
                n.type === 'triggerNode'
                  ? '#1e293b'
                  : n.type === 'conditionNode'
                  ? '#f59e0b'
                  : n.type === 'waitNode'
                  ? '#6366f1'
                  : '#3b82f6'
              }
            />
          </ReactFlow>
        ) : (
          <div className="p-8 max-w-2xl mx-auto overflow-y-auto h-full">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-bold text-slate-900">Timeline List</h2>
              <button
                onClick={() => {
                  setNewParentId(steps[steps.length - 1]?.id);
                  setStepNodeType('ACTION');
                  resetFormFields();
                  setEditingStep(null);
                  setShowStepForm(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Step</span>
              </button>
            </div>
            {steps.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed border-slate-100 rounded-3xl">
                <p className="text-slate-400 font-medium">No steps yet. Switch to Canvas or click Add Step.</p>
              </div>
            ) : (
              <div className="space-y-0 relative">
                <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-slate-100" />
                {steps.map((step) => (
                  <div key={step.id} className="relative flex items-start space-x-4 py-4 group">
                    <div
                      className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 z-10 font-bold text-xs ring-4 ring-white ${
                        step.node_type === 'CONDITION'
                          ? 'bg-amber-100 text-amber-700'
                          : step.node_type === 'WAIT'
                          ? 'bg-indigo-100 text-indigo-700'
                          : step.day_of_week !== undefined
                          ? DAY_COLORS[step.day_of_week]
                          : 'bg-blue-100 text-blue-600'
                      }`}
                    >
                      <span className="text-[10px] font-extrabold">
                        {step.node_type === 'CONDITION'
                          ? 'IF'
                          : step.node_type === 'WAIT'
                          ? 'Wait'
                          : step.day_of_week !== undefined
                          ? DAY_NAMES[step.day_of_week]
                          : 'Act'}
                      </span>
                    </div>
                    <div
                      className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 p-5 group-hover:bg-white group-hover:border-blue-100 group-hover:shadow-lg transition-all cursor-pointer"
                      onClick={() => openEditForm(step)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {step.node_type}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900">
                            {step.node_type === 'ACTION'
                              ? step.action_type === 'SEND_MESSAGE'
                                ? 'Send Message'
                                : step.action_type === 'SCHEDULE_MESSAGE'
                                ? 'Schedule Message'
                                : step.action_type === 'ENROLL_WORKFLOW'
                                ? 'Enroll Workflow'
                                : step.action_type === 'REMOVE_FROM_WORKFLOW'
                                ? 'Remove from Workflow'
                                : `${step.action_type?.replace('_', ' ')}: ${step.action_value}`
                              : step.node_type === 'CONDITION'
                              ? `If ${step.condition_config?.field} ${step.condition_config?.operator} ${step.condition_config?.value}`
                              : `Wait ${step.wait_config?.amount} ${step.wait_config?.unit}`}
                          </h4>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteStep(step.id);
                          }}
                          className="p-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {step.message_template && (
                        <p className="mt-2 text-xs text-slate-500 italic line-clamp-2">
                          &quot;{step.message_template}&quot;
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Floating Add Button (canvas mode) */}
        {viewMode === 'canvas' && (
          <button
            onClick={() => {
              // Find leaf nodes (no children) — use last step as parent
              const childIds = new Set(steps.map((s) => s.parent_id).filter(Boolean));
              const leafStep = steps.filter((s) => !childIds.has(s.id)).pop();
              handleAddNode(leafStep?.id || 'trigger');
            }}
            className="absolute bottom-6 right-6 z-10 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-blue-500/25 hover:bg-blue-700 transition-all flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Node</span>
          </button>
        )}
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
                onClick={async () => {
                  await saveWorkflow();
                  setShowUnsavedDialog(false);
                  onBack();
                }}
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
              <button
                onClick={() => setShowTriggerForm(false)}
                className="p-2 hover:bg-slate-800 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 space-y-5">
              {/* Workflow name */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Workflow Name</label>
                <input
                  type="text"
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Trigger Type */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Trigger Type</label>
                <div className="grid grid-cols-1 gap-2">
                  {([
                    { id: 'TAG_ADDED', label: 'Tag Added', desc: 'When a tag is added to a contact' },
                    { id: 'TAG_REMOVED', label: 'Tag Removed', desc: 'When a tag is removed from a contact' },
                    { id: 'USER_FOLLOW', label: 'User Follow', desc: 'When someone follows your LINE account' },
                    { id: 'KEYWORD_RECEIVED', label: 'Keyword Received', desc: 'When a specific keyword is messaged' },
                    { id: 'MANUAL', label: 'Manual', desc: 'Triggered manually from contact page' },
                  ] as const).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setWfTriggerType(t.id);
                        if (t.id === 'USER_FOLLOW' || t.id === 'MANUAL') setWfTriggerValue('');
                      }}
                      className={`flex items-start space-x-3 p-3 rounded-xl border-2 text-left transition-all ${
                        wfTriggerType === t.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 transition-all ${
                        wfTriggerType === t.id ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                      }`} />
                      <div>
                        <p className={`text-sm font-bold ${wfTriggerType === t.id ? 'text-blue-700' : 'text-slate-700'}`}>{t.label}</p>
                        <p className="text-[11px] text-slate-400">{t.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Trigger Value (only for tag/keyword triggers) */}
              {(wfTriggerType === 'TAG_ADDED' || wfTriggerType === 'TAG_REMOVED' || wfTriggerType === 'KEYWORD_RECEIVED') && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    {wfTriggerType === 'KEYWORD_RECEIVED' ? 'Keyword' : 'Tag Name'}
                  </label>
                  <input
                    type="text"
                    value={wfTriggerValue}
                    onChange={(e) => setWfTriggerValue(e.target.value)}
                    placeholder={wfTriggerType === 'KEYWORD_RECEIVED' ? 'e.g. register' : 'e.g. Interested'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
              )}

              {/* Active toggle */}
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
                {savingWf ? 'Saving…' : 'Save Trigger'}
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
              <h3 className="font-bold text-lg">{editingStep ? 'Edit Node' : 'Add Node'}</h3>
              <button
                onClick={() => {
                  setShowStepForm(false);
                  setEditingStep(null);
                }}
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

              {/* Branch Path Selector (child of Condition) */}
              {!editingStep &&
                steps.find((s) => s.id === newParentId)?.node_type === 'CONDITION' && (
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                      Select Branch Path
                    </label>
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

              {/* ─── ACTION Config ─────────────────────────────── */}
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Message Template
                      </label>
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Send At (Date & Time)
                      </label>
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Target Workflow
                      </label>
                      <select
                        value={targetWorkflowId}
                        onChange={(e) => setTargetWorkflowId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                      >
                        <option value="">-- Select Workflow --</option>
                        {allWorkflows.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* ─── WAIT Config ───────────────────────────────── */}
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

              {/* ─── CONDITION Config ──────────────────────────── */}
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
                  {editingStep ? 'Update Node' : 'Create Node'}
                </button>
                {editingStep && (
                  <button
                    onClick={() => deleteStep(editingStep.id)}
                    className="w-full py-3 bg-red-50 text-red-600 rounded-2xl font-bold text-sm hover:bg-red-100 transition-all"
                  >
                    Delete Node
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
