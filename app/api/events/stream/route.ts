import { getWorkspaceRuntime } from "@/runtime/workspace-runtime";
import { errorResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const runtime = getWorkspaceRuntime();
    runtime.getState();

    const encoder = new TextEncoder();
    const params = new URL(request.url).searchParams;
    const explicitCursor = params.get("after") ?? request.headers.get("last-event-id");
    let lastId = explicitCursor === null ? (runtime.getEvents(1)[0]?.id ?? 0) : Number(explicitCursor);
    if (!Number.isFinite(lastId)) lastId = runtime.getEvents(1)[0]?.id ?? 0;

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;

        const send = (chunk: string) => {
          if (!closed) controller.enqueue(encoder.encode(chunk));
        };

        const pushEvents = () => {
          const nextEvents = runtime.getEventsAfter(lastId, 50);
          for (const event of nextEvents) {
            lastId = Math.max(lastId, event.id);
            send(`id: ${event.id}\n`);
            send("event: workspace-event\n");
            send(`data: ${JSON.stringify(event)}\n\n`);
          }
        };

        send(": connected\n\n");
        pushEvents();
        const interval = setInterval(() => {
          send(": heartbeat\n\n");
          pushEvents();
        }, 2_000);

        request.signal.addEventListener("abort", () => {
          closed = true;
          clearInterval(interval);
          controller.close();
        }, { once: true });
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache, no-transform",
        "connection": "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
