import { createFileRoute } from "@tanstack/react-router";
import { requireUserRoute } from "@/lib/auth-middleware";
import { watchBatchCore } from "@/lib/studio.server";

// Шаг недельной разведки: один автор за вызов, чтобы не упереться в лимит времени.
// Вызывается расписанием (как админ) и кнопкой «Проверить всех сейчас».
export const Route = createFileRoute("/api/watch/tick")({
  server: {
    middleware: [requireUserRoute],
    handlers: {
      POST: async ({ context }) => {
        if (context.user?.role !== "admin") {
          return Response.json({ error: "Только для владельца студии" }, { status: 403 });
        }
        try {
          const result = await watchBatchCore(context.getBase44().asServiceRole, { scheduled: true });
          return Response.json(result);
        } catch (error) {
          return Response.json({ error: String(error?.message || error).slice(0, 300) }, { status: 400 });
        }
      },
    },
  },
});
