"""
단가표 통합 관리 시스템 - Worker 메인
Redis Queue Worker 실행 + Job 타입별 디스패치
"""

import os
import json
from redis import Redis
from rq import Worker, Queue, Connection

from tasks.excel_parser import parse_hq_excel, parse_partner_excel
from tasks.voucher_parser import parse_voucher_excel

# 환경 변수
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


def dispatch_job(job_data_str: str):
    """
    Redis Queue에서 받은 메시지를 Job 타입별로 디스패치
    기존: job_id만 push (단가표 도메인)
    정산: {"job_id": ..., "job_type": ..., "file_path": ...} 형태
    """
    try:
        # 정산 도메인: JSON 형태
        data = json.loads(job_data_str)
        job_id = data["job_id"]
        job_type = data.get("job_type", "")

        if job_type in ("voucher_sales_excel", "voucher_purchase_excel"):
            return parse_voucher_excel(job_id)
        elif job_type == "hq_excel":
            return parse_hq_excel(job_id)
        elif job_type in ("partner_excel", "partner_image"):
            return parse_partner_excel(job_id)
        else:
            # 알 수 없는 타입 → hq_excel fallback
            return parse_hq_excel(job_id)
    except (json.JSONDecodeError, KeyError):
        # 기존 단가표 도메인: job_id만 push된 경우
        return parse_hq_excel(job_data_str)


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
