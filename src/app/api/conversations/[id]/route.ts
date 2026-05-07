import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.mode) {
    if (!["agent", "human"].includes(body.mode)) {
      return Response.json({ error: "Invalid mode" }, { status: 400 });
    }
    updates.mode = body.mode;
  }
  if (typeof body.unread_count === "number") {
    updates.unread_count = body.unread_count;
  }
  if (body.markRead === true) {
    updates.unread_count = 0;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No updates" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}
