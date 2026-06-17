import Redis from 'ioredis';
import { connection } from './queue';

// Publisher client
export const redisPublisher = new Redis(connection);

// Subscriber client
// Note: A subscriber client shouldn't be used for anything else other than subscribing/unsubscribing.
export const redisSubscriber = new Redis(connection);
