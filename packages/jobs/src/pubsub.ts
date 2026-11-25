import Redis from 'ioredis';
import { connection } from './queue';

// @ts-ignore
export const redisPublisher = new Redis(connection);
redisPublisher.on('error', (err) => console.error('[Redis Publisher] Error:', err.message));

export async function notifyPodcastChanged(podcastId: string) {
  await redisPublisher.publish(`podcast_events_${podcastId}`, JSON.stringify({ type: 'REFRESH_CLIPS' }))
    .catch((error) => console.warn(`Could not notify clients for podcast ${podcastId}:`, error));
}

// Subscriber client
// @ts-ignore
export const redisSubscriber = new Redis(connection);
redisSubscriber.on('error', (err) => console.error('[Redis Subscriber] Error:', err.message));
