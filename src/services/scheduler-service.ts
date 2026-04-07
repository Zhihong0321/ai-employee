import { Repository } from "../database/repository.js";
import { AgentService } from "./agent-service.js";
import { AgentRunner } from "../agent/runner.js";
import { DebugService } from "../debug/debug-service.js";

export class SchedulerService {
  private intervalHandle?: NodeJS.Timeout;

  constructor(
    private readonly repository: Repository,
    private readonly agentService: AgentService,
    private readonly debugService?: DebugService,
    private readonly agentRunner?: AgentRunner
  ) {}

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = setInterval(() => {
      void this.poll();
    }, 15_000);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  async poll(): Promise<void> {
    const jobs = await this.repository.fetchDueJobs();
    for (const job of jobs) {
      const runId = this.debugService?.createRunId("scheduler");
      const claimed = await this.repository.markJobRunning(Number(job.id));
      if (!claimed) {
        continue;
      }

      try {
        await this.debugService?.log({
          runId,
          schedulerJobId: Number(job.id),
          taskId: Number(job.source_task_id) || null,
          stage: "scheduler",
          summary: "Scheduler claimed due job",
          payload: {
            jobType: job.job_type,
            status: job.status
          },
          requiredMode: "debug_basic"
        });

        if (job.job_type === "reminder") {
          await this.agentService.executeScheduledReminder(job);
        }

        if (job.job_type === "task-follow-up" && this.agentRunner && job.source_task_id) {
          await this.agentRunner.handleWakeup(Number(job.source_task_id), "scheduled_follow_up");
        }

        if (job.source_task_id) {
          await this.repository.addTaskEvent(Number(job.source_task_id), "SCHEDULER_JOB_COMPLETED", {
            schedulerJobId: Number(job.id),
            jobType: job.job_type,
            runAt: job.run_at
          });
        }

        await this.repository.markJobCompleted(Number(job.id));
        await this.debugService?.log({
          runId,
          schedulerJobId: Number(job.id),
          taskId: Number(job.source_task_id) || null,
          stage: "scheduler",
          summary: "Scheduler completed job",
          payload: {
            jobType: job.job_type
          },
          requiredMode: "debug_basic"
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown scheduler error";
        await this.repository.markJobFailed(Number(job.id), message, {
          handoffSummary: `Scheduler job ${job.job_type} failed: ${message}`
        });
        if (job.source_task_id) {
          await this.repository.addTaskEvent(Number(job.source_task_id), "SCHEDULER_JOB_FAILED", {
            schedulerJobId: Number(job.id),
            jobType: job.job_type,
            error: message
          });
        }
        await this.debugService?.log({
          runId,
          schedulerJobId: Number(job.id),
          taskId: Number(job.source_task_id) || null,
          stage: "scheduler",
          summary: "Scheduler job failed",
          payload: {
            jobType: job.job_type,
            error: message
          },
          severity: "error",
          force: true
        });
      }
    }
  }
}
