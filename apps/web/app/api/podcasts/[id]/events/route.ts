import { NextResponse } from 'next/server';
import Redis from 'ioredis';
import { connection } from '@workspace/jobs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = `podcast_events_${id}`;

  // Create a dedicated subscriber for this SSE connection
  const subscriber = new Redis(connection);
  subscriber.on('error', (err) => {
    console.error(`[ioredis SSE] Error in podcast ${id}:`, err.message);
  });
  await subscriber.subscribe(channel);

  const stream = new ReadableStream({
    start(controller) {
      // Listen for messages on the Redis channel
      subscriber.on('message', (chan, message) => {
        if (req.signal.aborted) return;
        if (chan === channel) {
          try {
            // Encode the message in SSE format
            controller.enqueue(new TextEncoder().encode(`data: ${message}\n\n`));
          } catch (e) {
            // Ignore closed stream errors
          }
        }
      });
      
      // Send a heartbeat ping every 30 seconds to keep the connection alive
      const interval = setInterval(() => {
        if (req.signal.aborted) return;
        try {
          controller.enqueue(new TextEncoder().encode(': ping\n\n'));
        } catch(e) {}
      }, 30000);

      // Handle client disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        subscriber.unsubscribe(channel);
        subscriber.quit();
      });
    },
    cancel() {
      subscriber.unsubscribe(channel);
      subscriber.quit();
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
