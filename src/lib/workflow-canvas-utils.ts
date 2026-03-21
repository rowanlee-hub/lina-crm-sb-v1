import { type Node, type Edge, MarkerType } from '@xyflow/react';

// ─── Types ──────────────────────────────────────────────────────────

export interface StepData {
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
  position_x?: number;
  position_y?: number;
}

export interface WorkflowData {
  id: string;
  name: string;
  trigger_type: string;
  trigger_value: string;
}

// ─── Convert DB steps → React Flow nodes + edges ────────────────────

export function stepsToNodesAndEdges(
  steps: StepData[],
  workflow: WorkflowData
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Check if we need auto-layout (all positions are 0 or undefined)
  const needsLayout = steps.every(
    (s) => !s.position_x && !s.position_y
  );

  // Trigger node (synthetic)
  nodes.push({
    id: 'trigger',
    type: 'triggerNode',
    position: { x: 250, y: 0 },
    data: {
      trigger_type: workflow.trigger_type,
      trigger_value: workflow.trigger_value,
    },
    draggable: true,
    deletable: false,
  });

  // Map each step to a node
  for (const step of steps) {
    const nodeType =
      step.node_type === 'CONDITION'
        ? 'conditionNode'
        : step.node_type === 'WAIT'
        ? 'waitNode'
        : 'actionNode';

    nodes.push({
      id: step.id,
      type: nodeType,
      position: {
        x: step.position_x || 0,
        y: step.position_y || 0,
      },
      data: { step },
      draggable: true,
    });
  }

  // Build edges from parent_id relationships
  for (const step of steps) {
    const sourceId = step.parent_id || 'trigger';

    // Determine source handle for condition branches
    let sourceHandle: string | undefined;
    if (step.branch_type === 'YES') sourceHandle = 'yes';
    else if (step.branch_type === 'NO') sourceHandle = 'no';

    const isConditionBranch =
      step.branch_type === 'YES' || step.branch_type === 'NO';

    edges.push({
      id: `e-${sourceId}-${step.id}`,
      source: sourceId,
      target: step.id,
      sourceHandle: sourceHandle || 'default',
      targetHandle: 'target',
      type: 'smoothstep',
      animated: false,
      label: isConditionBranch ? step.branch_type : undefined,
      labelStyle: {
        fontWeight: 700,
        fontSize: 11,
      },
      style: {
        stroke: step.branch_type === 'YES'
          ? '#10b981'
          : step.branch_type === 'NO'
          ? '#ef4444'
          : '#94a3b8',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: step.branch_type === 'YES'
          ? '#10b981'
          : step.branch_type === 'NO'
          ? '#ef4444'
          : '#94a3b8',
      },
    });
  }

  // Auto-layout if needed
  if (needsLayout && steps.length > 0) {
    autoLayout(nodes, steps);
  }

  return { nodes, edges };
}

// ─── Auto-layout: BFS top-down tree ─────────────────────────────────

function autoLayout(nodes: Node[], steps: StepData[]) {
  const NODE_WIDTH = 220;
  const VERTICAL_GAP = 150;
  const HORIZONTAL_GAP = 260;

  // Build children map
  const childrenMap = new Map<string, StepData[]>();
  const rootSteps: StepData[] = [];

  for (const step of steps) {
    const parentKey = step.parent_id || 'trigger';
    if (!step.parent_id) {
      rootSteps.push(step);
    }
    const existing = childrenMap.get(parentKey) || [];
    existing.push(step);
    childrenMap.set(parentKey, existing);
  }

  // Sort children by step_order
  for (const [, children] of childrenMap) {
    children.sort((a, b) => a.step_order - b.step_order);
  }

  // BFS to assign positions
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  function layoutSubtree(nodeId: string, x: number, y: number): { width: number } {
    const node = nodeMap.get(nodeId);
    if (node) {
      node.position = { x, y };
    }

    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      return { width: NODE_WIDTH };
    }

    // Calculate total width needed
    const childWidths: number[] = [];
    for (const child of children) {
      const result = layoutSubtree(child.id, 0, y + VERTICAL_GAP);
      childWidths.push(result.width);
    }

    const totalWidth = childWidths.reduce((sum, w) => sum + w, 0) + (children.length - 1) * 40;
    let startX = x + NODE_WIDTH / 2 - totalWidth / 2;

    for (let i = 0; i < children.length; i++) {
      const childNode = nodeMap.get(children[i].id);
      if (childNode) {
        childNode.position = {
          x: startX + childWidths[i] / 2 - NODE_WIDTH / 2,
          y: y + VERTICAL_GAP,
        };
        // Re-layout to fix nested positions
        layoutSubtree(children[i].id, childNode.position.x, childNode.position.y);
      }
      startX += childWidths[i] + 40;
    }

    return { width: Math.max(totalWidth, NODE_WIDTH) };
  }

  // Start from trigger
  const triggerNode = nodeMap.get('trigger');
  if (triggerNode) {
    const rootChildren = childrenMap.get('trigger') || rootSteps.map(s => s);
    // For trigger with children, center it
    layoutSubtree('trigger', 250, 0);

    // Adjust trigger to center above its children
    if (rootChildren.length > 0) {
      const firstChild = nodeMap.get(rootChildren[0].id);
      const lastChild = nodeMap.get(rootChildren[rootChildren.length - 1].id);
      if (firstChild && lastChild) {
        triggerNode.position.x =
          (firstChild.position.x + lastChild.position.x) / 2;
      }
    }
  }
}

// ─── Extract positions from React Flow nodes ────────────────────────

export function positionsFromNodes(
  nodes: Node[]
): { id: string; position_x: number; position_y: number }[] {
  return nodes
    .filter((n) => n.id !== 'trigger')
    .map((n) => ({
      id: n.id,
      position_x: Math.round(n.position.x),
      position_y: Math.round(n.position.y),
    }));
}
