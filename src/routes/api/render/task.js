import { createFileRoute } from "@tanstack/react-router";
import { requireUserRoute } from "@/lib/auth-middleware";
import { processRenderTask } from "@/lib/render-queue.server";
export const Route = createFileRoute("/api/render/task")({ server: {
  middleware: [requireUserRoute], handlers: { POST: async ({ request, context }) => {
    if (context.user.role !== "admin") return Response.json({ error: "Только для фоновой очереди" }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (typeof body.task_id !== "string" || body.task_id.length > 100) return Response.json({ error: "Неверная задача" }, { status: 400 });
    return Response.json(await processRenderTask(context.getBase44().asServiceRole, body.task_id));
  } },
} });
