import { spawn } from "node:child_process";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Verify authenticated session
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { brief, mode = "default" } = await req.json();

  const args = ["distill.py", id, "--mode", mode];
  if (brief) args.push("--brief", brief);

  // Project root is one level above web/
  const projectRoot = path.resolve(process.cwd(), "..");

  const proc = spawn("python3", args, {
    cwd: projectRoot,
    env: { ...process.env },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      proc.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(encoder.encode(chunk.toString()));
      });
      proc.stderr.on("data", (chunk: Buffer) => {
        controller.enqueue(encoder.encode(`[progress] ${chunk.toString()}`));
      });
      proc.on("close", (code) => {
        if (code !== 0) {
          controller.enqueue(
            encoder.encode(`[error] distill.py exited with code ${code}`),
          );
        }
        controller.close();
      });
      proc.on("error", (err) => {
        controller.enqueue(encoder.encode(`[error] ${err.message}`));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
