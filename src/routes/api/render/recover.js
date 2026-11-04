import { createFileRoute } from "@tanstack/react-router";
import { requireUserRoute } from "@/lib/auth-middleware";
import { recoverRenderJobs } from "@/lib/render-queue.server";
export const Route=createFileRoute("/api/render/recover")({server:{middleware:[requireUserRoute],handlers:{POST:async({context})=>Response.json(await recoverRenderJobs(context.getBase44().asServiceRole))}}});
