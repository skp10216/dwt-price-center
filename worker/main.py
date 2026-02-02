"""
단가표 통합 관리 시스템 - Worker 메인
Redis Queue Worker 실행
"""

import os
from redis import Redis
from rq import Worker, Queue, Connection

# 환경 변수
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


def main():
    """Worker 실행"""
    redis_conn = Redis.from_url(REDIS_URL)
    
    with Connection(redis_conn):
        worker = Worker(
            queues=[Queue("high"), Queue("default"), Queue("low")],
            connection=redis_conn,
        )
        worker.work()


if __name__ == "__main__":
    main()
