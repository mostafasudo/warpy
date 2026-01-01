import rq.group as group
import rq.suspension as suspension
import rq.worker_registration as worker_registration
from rq.job import Job
from rq.queue import Queue
from rq.worker import Worker

from app.workers.rq_keyspace import configure_rq_keyspace


def test_configure_rq_keyspace_patches_core_rq_keys():
    configure_rq_keyspace()

    assert Queue.redis_queue_namespace_prefix.startswith("{warpy}")
    assert Queue.redis_queues_keys.startswith("{warpy}")

    assert Job.redis_job_namespace_prefix.startswith("{warpy}")

    assert Worker.redis_worker_namespace_prefix.startswith("{warpy}")
    assert Worker.redis_workers_keys.startswith("{warpy}")

    assert worker_registration.WORKERS_BY_QUEUE_KEY.startswith("{warpy}")
    assert worker_registration.REDIS_WORKER_KEYS.startswith("{warpy}")

    assert suspension.WORKERS_SUSPENDED.startswith("{warpy}")

    assert group.Group.REDIS_GROUP_NAME_PREFIX.startswith("{warpy}")
    assert group.Group.REDIS_GROUP_KEY.startswith("{warpy}")
