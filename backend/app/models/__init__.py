"""
단가표 통합 관리 시스템 - SQLAlchemy 모델
모든 모델을 여기서 import하여 Alembic 마이그레이션에서 인식할 수 있도록 함
"""

from app.models.user import User
from app.models.ssot_model import SSOTModel
from app.models.grade import Grade
from app.models.grade_price import GradePrice
from app.models.deduction import DeductionItem, DeductionLevel
from app.models.branch import Branch
from app.models.partner import Partner, UserPartnerFavorite
from app.models.partner_price import PartnerPrice, PartnerMapping
from app.models.user_list import UserList, UserListItem, UserFavorite
from app.models.upload_job import UploadJob
from app.models.audit_log import AuditLog
from app.models.compare_list import CompareListModel
from app.models.hq_price_apply import HQPriceApply, HQPriceApplyLock

# 정산 도메인 모델
from app.models.counterparty import Counterparty, CounterpartyAlias, UserCounterpartyFavorite
from app.models.voucher import Voucher
from app.models.receipt import Receipt
from app.models.payment import Payment
from app.models.voucher_change import VoucherChangeRequest
from app.models.upload_template import UploadTemplate

# 정산 도메인 - 입출금/배분/상계/은행임포트/기간마감
from app.models.counterparty_transaction import CounterpartyTransaction
from app.models.transaction_allocation import TransactionAllocation
from app.models.netting_record import NettingRecord, NettingVoucherLink
from app.models.bank_import import BankImportJob, BankImportLine
from app.models.period_lock import PeriodLock

__all__ = [
    "User",
    "SSOTModel",
    "Grade",
    "GradePrice",
    "DeductionItem",
    "DeductionLevel",
    "Branch",
    "Partner",
    "UserPartnerFavorite",
    "PartnerPrice",
    "PartnerMapping",
    "UserList",
    "UserListItem",
    "UserFavorite",
    "UploadJob",
    "AuditLog",
    "CompareListModel",
    "HQPriceApply",
    "HQPriceApplyLock",
    # 정산 도메인
    "Counterparty",
    "CounterpartyAlias",
    "UserCounterpartyFavorite",
    "Voucher",
    "Receipt",
    "Payment",
    "VoucherChangeRequest",
    "UploadTemplate",
    # 입출금/배분/상계/은행임포트/기간마감
    "CounterpartyTransaction",
    "TransactionAllocation",
    "NettingRecord",
    "NettingVoucherLink",
    "BankImportJob",
    "BankImportLine",
    "PeriodLock",
]
