from redis import Redis

from app.workers.no_client_list_worker import NoClientListWorker


def test_no_client_list_worker_sets_pid_and_hostname():
    worker = NoClientListWorker(["default"], connection=Redis.from_url("redis://localhost:6379/0"))
    assert worker.pid is not None
    assert worker.hostname is not None
