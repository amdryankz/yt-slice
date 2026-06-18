import Redis from 'ioredis';
import { connection } from './queue';

// @ts-ignore
export const redisPublisher = new Redis(connection);

// Subscriber client
// @ts-ignore
export const redisSubscriber = new Redis(connection);
