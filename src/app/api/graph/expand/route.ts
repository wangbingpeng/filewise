import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { graphNodes, graphEdges } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";

export async function GET(request: NextRequest) {
  ensureDbInitialized();
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const depth = parseInt(request.nextUrl.searchParams.get("depth") || "1");

  if (!nodeId) {
    return NextResponse.json({ error: "nodeId 不能为空" }, { status: 400 });
  }

  // Get the node
  const [node] = await db.select().from(graphNodes).where(eq(graphNodes.id, nodeId));
  if (!node) {
    return NextResponse.json({ error: "节点不存在" }, { status: 404 });
  }

  // Get edges connected to this node
  const edges = await db.select().from(graphEdges)
    .where(or(eq(graphEdges.sourceNodeId, nodeId), eq(graphEdges.targetNodeId, nodeId)));

  // Get neighboring node IDs
  const neighborIds = new Set<string>();
  for (const edge of edges) {
    neighborIds.add(edge.sourceNodeId);
    neighborIds.add(edge.targetNodeId);
  }
  neighborIds.delete(nodeId);

  // Get neighbor nodes
  const neighbors = [];
  for (const nid of neighborIds) {
    const [n] = await db.select().from(graphNodes).where(eq(graphNodes.id, nid));
    if (n) neighbors.push(n);
  }

  return NextResponse.json({
    nodes: [node, ...neighbors],
    edges,
  });
}
