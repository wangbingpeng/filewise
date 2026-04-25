export interface GraphNode {
  id: string;
  name: string;
  entityType: EntityType;
  description: string | null;
  properties: Record<string, unknown> | null;
  mentionCount: number;
}

export type EntityType = "person" | "organization" | "technology" | "concept" | "location" | "event";

export const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  person: "#4A90D9",
  organization: "#9B59B6",
  technology: "#2ECC71",
  concept: "#F39C12",
  location: "#E74C3C",
  event: "#1ABC9C",
};

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: "人物",
  organization: "组织",
  technology: "技术",
  concept: "概念",
  location: "地点",
  event: "事件",
};

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: string;
  weight: number;
  sourceFileId: string | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
