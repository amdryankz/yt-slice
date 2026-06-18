import Redis from 'ioredis';
import { connection } from './queue';

// @ts-ignore
export const redisPublisher = new Redis(connection);
redisPublisher.on('error', (err) => console.error('[Redis Publisher] Error:', err.message));

// Subscriber client
// @ts-ignore
export const redisSubscriber = new Redis(connection);
redisSubscriber.on('error', (err) => console.error('[Redis Subscriber] Error:', err.message));
