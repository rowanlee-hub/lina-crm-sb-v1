'use client';

import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Zap, MessageCircle, Tag as TagIcon, Clock, Filter,
  GitMerge, UserPlus, UserMinus, Calendar, Send,
} from 'lucide-react';

// ─── Trigger Node ───────────────────────────────────────────────────

export function TriggerNode({ data }: NodeProps) {
  const triggerType = (data as Record<string, unknown>).trigger_type as string;
  const triggerValue = (data as Record<string, unknown>).trigger_value as string;

  const triggerLabels: Record<string, string> = {
    TAG_ADDED: 'Tag Added',
    TAG_REMOVED: 'Tag Removed',
    USER_FOLLOW: 'User Follow',
    KEYWORD_RECEIVED: 'Keyword Received',
    MANUAL: 'Manual',
  };

  return (
    <div className="w-52 bg-slate-900 rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 flex items-center space-x-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trigger</p>
          <p className="text-sm font-bold text-white truncate">
            {triggerLabels[triggerType] || triggerType}
          </p>
          {triggerValue && triggerValue !== 'FOLLOW' && (
            <p className="text-xs text-blue-300 truncate">{triggerValue}</p>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  );
}

// ─── Action Node ────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  SEND_MESSAGE: { icon: MessageCircle, label: 'Send Message', color: 'text-blue-600', bg: 'bg-blue-100' },
  ADD_TAG: { icon: TagIcon, label: 'Add Tag', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  REMOVE_TAG: { icon: TagIcon, label: 'Remove Tag', color: 'text-red-600', bg: 'bg-red-100' },
  ENROLL_WORKFLOW: { icon: UserPlus, label: 'Enroll Workflow', color: 'text-violet-600', bg: 'bg-violet-100' },
  REMOVE_FROM_WORKFLOW: { icon: UserMinus, label: 'Remove from Workflow', color: 'text-orange-600', bg: 'bg-orange-100' },
  SCHEDULE_MESSAGE: { icon: Calendar, label: 'Schedule Message', color: 'text-indigo-600', bg: 'bg-indigo-100' },
};

export function ActionNode({ data, selected }: NodeProps) {
  const step = (data as Record<string, unknown>).step as Record<string, unknown>;
  const actionType = (step?.action_type as string) || 'SEND_MESSAGE';
  const config = ACTION_CONFIG[actionType] || ACTION_CONFIG.SEND_MESSAGE;
  const Icon = config.icon;

  const preview =
    actionType === 'SEND_MESSAGE' || actionType === 'SCHEDULE_MESSAGE'
      ? ((step?.message_template as string) || '').slice(0, 60)
      : actionType === 'ADD_TAG' || actionType === 'REMOVE_TAG'
      ? (step?.action_value as string) || ''
      : actionType === 'ENROLL_WORKFLOW' || actionType === 'REMOVE_FROM_WORKFLOW'
      ? 'Workflow'
      : '';

  return (
    <div className={`w-52 bg-white rounded-xl border-2 shadow-sm transition-all ${selected ? 'border-blue-500 shadow-blue-100' : 'border-slate-200 hover:border-slate-300'}`}>
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
      />
      <div className="px-4 py-3">
        <div className="flex items-center space-x-2 mb-1.5">
          <div className={`w-6 h-6 ${config.bg} rounded-md flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-3.5 h-3.5 ${config.color}`} />
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{config.label}</span>
        </div>
        {preview && (
          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{preview}</p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  );
}

// ─── Wait Node ──────────────────────────────────────────────────────

export function WaitNode({ data, selected }: NodeProps) {
  const step = (data as Record<string, unknown>).step as Record<string, unknown>;
  const waitConfig = step?.wait_config as { amount?: number; unit?: string } | undefined;
  const amount = waitConfig?.amount || 0;
  const unit = waitConfig?.unit || 'days';

  return (
    <div className={`w-52 bg-indigo-50 rounded-xl border-2 shadow-sm transition-all ${selected ? 'border-indigo-500 shadow-indigo-100' : 'border-indigo-200 hover:border-indigo-300'}`}>
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
      />
      <div className="px-4 py-3">
        <div className="flex items-center space-x-2 mb-1">
          <div className="w-6 h-6 bg-indigo-200 rounded-md flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-tight">Wait</span>
        </div>
        <p className="text-sm font-bold text-indigo-800">
          {amount} {unit}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white"
      />
    </div>
  );
}

// ─── Condition Node ─────────────────────────────────────────────────

export function ConditionNode({ data, selected }: NodeProps) {
  const step = (data as Record<string, unknown>).step as Record<string, unknown>;
  const condConfig = step?.condition_config as { field?: string; operator?: string; value?: string } | undefined;

  return (
    <div className={`w-52 bg-amber-50 rounded-xl border-2 shadow-sm transition-all ${selected ? 'border-amber-500 shadow-amber-100' : 'border-amber-200 hover:border-amber-300'}`}>
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
      />
      <div className="px-4 py-3">
        <div className="flex items-center space-x-2 mb-1">
          <div className="w-6 h-6 bg-amber-200 rounded-md flex items-center justify-center">
            <Filter className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-tight">Condition</span>
        </div>
        <p className="text-sm font-bold text-amber-800">
          If {condConfig?.field || '...'} {condConfig?.operator || '=='} {condConfig?.value || '...'}
        </p>
      </div>
      {/* YES handle (left) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white"
        style={{ left: '30%' }}
      />
      {/* NO handle (right) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
        style={{ left: '70%' }}
      />
    </div>
  );
}
