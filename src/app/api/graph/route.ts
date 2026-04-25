import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/db/init";
import { graphNodes, graphEdges } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  ensureDbInitialized();
  const params = request.nextUrl.searchParams;
  const entityType = params.get("entityType");
  const limit = parseInt(params.get("limit") || "200");

  let nodes;
  if (entityType) {
    nodes = await db.select().from(graphNodes)
      .where(eq(graphNodes.entityType, entityType))
      .orderBy(desc(graphNodes.mentionCount))
      .limit(limit);
  } else {
    nodes = await db.select().from(graphNodes)
      .orderBy(desc(graphNodes.mentionCount))
      .limit(limit);
  }

  if (nodes.length === 0) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  const nodeIds = nodes.map((n) => n.id);
  const edges = await db.select().from(graphEdges)
    .where(inArray(graphEdges.sourceNodeId, nodeIds));

  // Filter edges to only include those where both nodes are in the result
  const nodeIdSet = new Set(nodeIds);
  const filteredEdges = edges.filter(
    (e) => nodeIdSet.has(e.sourceNodeId) && nodeIdSet.has(e.targetNodeId)
  );

  return NextResponse.json({ nodes, edges: filteredEdges });
}
