/**
 * Background jobs. With USE_QUEUE=1 + REDIS_URL, jobs go to BullMQ and are processed by `npm run worker`.
 * Otherwise (dev/tests) they run inline so the app works with no Redis.
 */
type Handler = (data: any) => Promise<void>;
const handlers = new Map<string, Handler>();
export const registerJob = (name: string, h: Handler) => handlers.set(name, h);
const queued = () => process.env.USE_QUEUE === "1" && !!process.env.REDIS_URL;

export async function enqueue(name: string, data: unknown): Promise<void> {
  if (queued()) {
    const { Queue } = await import("bullmq");
    const { default: IORedis } = await import("ioredis");
    const q = new Queue("gsms", { connection: new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }) });
    await q.add(name, data, { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000 });
    await q.close();
    return;
  }
  const h = handlers.get(name);
  if (!h) throw new Error(`No handler for job ${name}`);
  await h(data);
}
export const getHandler = (name: string) => handlers.get(name);
