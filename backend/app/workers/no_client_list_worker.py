import os
import socket

from rq.worker import Worker


class NoClientListWorker(Worker):
    def __init__(self, *args, **kwargs):
        kwargs["prepare_for_work"] = False
        super().__init__(*args, **kwargs)
        self.hostname = socket.gethostname()
        self.pid = os.getpid()

