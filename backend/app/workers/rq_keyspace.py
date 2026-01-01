"""
RQ runs multi-key Redis pipelines/transactions (worker registration, registries, etc).
ElastiCache Serverless / Redis Cluster rejects multi-key ops when keys hash to different slots.

This module patches RQ's internal key prefixes to include a Redis Cluster hash-tag (default `{warpy}`)
so all RQ keys land in the same slot and those pipelines succeed. Call this before creating any
`rq.Queue` / `rq.Worker` / `rq.Job` objects. Configure via `RQ_REDIS_HASH_TAG`.
"""

import os


def configure_rq_keyspace() -> None:
    hash_tag = os.getenv("RQ_REDIS_HASH_TAG", "warpy").strip()
    prefix = f"{{{hash_tag}}}"

    from rq.job import Job
    from rq.queue import Queue
    from rq.worker import Worker
    import rq.command as command
    import rq.executions as executions
    import rq.group as group
    import rq.registry as registry
    import rq.results as results
    import rq.scheduler as scheduler
    import rq.suspension as suspension
    import rq.worker_registration as worker_registration

    if Queue.redis_queue_namespace_prefix.startswith("{"):
        return

    Queue.redis_queue_namespace_prefix = prefix + Queue.redis_queue_namespace_prefix
    Queue.redis_queues_keys = prefix + Queue.redis_queues_keys

    Job.redis_job_namespace_prefix = prefix + Job.redis_job_namespace_prefix

    Worker.redis_worker_namespace_prefix = prefix + Worker.redis_worker_namespace_prefix
    Worker.redis_workers_keys = prefix + Worker.redis_workers_keys

    worker_registration.WORKERS_BY_QUEUE_KEY = prefix + worker_registration.WORKERS_BY_QUEUE_KEY
    worker_registration.REDIS_WORKER_KEYS = prefix + worker_registration.REDIS_WORKER_KEYS

    registry.BaseRegistry.key_template = prefix + registry.BaseRegistry.key_template
    registry.StartedJobRegistry.key_template = prefix + registry.StartedJobRegistry.key_template
    registry.FinishedJobRegistry.key_template = prefix + registry.FinishedJobRegistry.key_template
    registry.FailedJobRegistry.key_template = prefix + registry.FailedJobRegistry.key_template
    registry.DeferredJobRegistry.key_template = prefix + registry.DeferredJobRegistry.key_template
    registry.ScheduledJobRegistry.key_template = prefix + registry.ScheduledJobRegistry.key_template
    registry.CanceledJobRegistry.key_template = prefix + registry.CanceledJobRegistry.key_template

    scheduler.SCHEDULER_KEY_TEMPLATE = prefix + scheduler.SCHEDULER_KEY_TEMPLATE
    scheduler.SCHEDULER_LOCKING_KEY_TEMPLATE = prefix + scheduler.SCHEDULER_LOCKING_KEY_TEMPLATE

    command.PUBSUB_CHANNEL_TEMPLATE = prefix + command.PUBSUB_CHANNEL_TEMPLATE

    suspension.WORKERS_SUSPENDED = prefix + suspension.WORKERS_SUSPENDED

    group.Group.REDIS_GROUP_NAME_PREFIX = prefix + group.Group.REDIS_GROUP_NAME_PREFIX
    group.Group.REDIS_GROUP_KEY = prefix + group.Group.REDIS_GROUP_KEY

    def execution_key(self) -> str:
        return f"{prefix}rq:execution:{self.composite_key}"

    setattr(executions.Execution, "key", property(execution_key))
    executions.ExecutionRegistry.key_template = prefix + executions.ExecutionRegistry.key_template

    def result_get_key(job_id: str) -> str:
        return f"{prefix}rq:results:{job_id}"

    setattr(results, "get_key", result_get_key)
    setattr(results.Result, "get_key", classmethod(lambda cls, job_id: result_get_key(job_id)))
