/** Background worker: `npm run worker` (needs REDIS_URL, USE_QUEUE=1 on the app). Processes extraction jobs and runs the reminder scheduler every minute. */
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { getHandler } from "@/lib/queue";
import "@/services/documents"; // registers handlers
import { runReminders } from "@/services/reminders";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });

new Worker(
  "gsms",
  async (job) => {
    if (job.name === "reminders") return runReminders(new Date());
    const h = getHandler(job.name);
    if (!h) throw new Error(`Unknown job ${job.name}`);
    await h(job.data);
  },
  { connection, concurrency: 4 },
).on("failed", (j, e) => console.error("job failed", j?.name, e.message));

const q = new Queue("gsms", { connection });
void q.add("reminders", {}, { repeat: { every: 60_000 }, jobId: "reminders-every-minute", removeOnComplete: 10, removeOnFail: 50 });
console.log("Raudah worker running: extraction jobs + reminder scheduler (every 60 s)");
