"""
정산 관리 시스템 - Pydantic 스키마 (전체)
거래처, 전표, 입금, 송금, 변경요청, 업로드, 대시보드 등
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================================
# 거래처 (Counterparty)
# ============================================================================

class CounterpartyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="거래처명")
    code: Optional[str] = Field(None, max_length=50, description="거래처 코드")
    counterparty_type: str = Field("both", description="seller/buyer/both")
    contact_info: Optional[str] = None
    memo: Optional[str] = None
    branch_id: Optional[UUID] = Field(None, description="소속 지사 ID")


class CounterpartyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    code: Optional[str] = Field(None, max_length=50)
    counterparty_type: Optional[str] = None
    contact_info: Optional[str] = None
    memo: Optional[str] = None
    is_active: Optional[bool] = None
    branch_id: Optional[UUID] = Field(None, description="소속 지사 ID")


class CounterpartyAliasCreate(BaseModel):
    alias_name: str = Field(..., min_length=1, max_length=200, description="별칭(UPM 표기명)")


class CounterpartyAliasResponse(BaseModel):
    id: UUID
    counterparty_id: UUID
    alias_name: str
    created_at: datetime

    class Config:
        from_attributes = True


class CounterpartyResponse(BaseModel):
    id: UUID
    name: str
    code: Optional[str] = None
    counterparty_type: str
    contact_info: Optional[str] = None
    memo: Optional[str] = None
    is_active: bool
    is_favorite: bool = False  # API 레이어에서 주입
    branch_id: Optional[UUID] = None
    branch_name: Optional[str] = None  # API 레이어에서 주입
    created_at: datetime
    updated_at: datetime
    aliases: List[CounterpartyAliasResponse] = []

    class Config:
        from_attributes = True


class CounterpartySummary(BaseModel):
    """거래처 요약 (미수/미지급 포함)"""
    id: UUID
    name: str
    code: Optional[str] = None
    counterparty_type: str
    total_sales_amount: Decimal = Decimal("0")
    total_purchase_amount: Decimal = Decimal("0")
    total_receivable: Decimal = Decimal("0")  # 미수 합계
    total_payable: Decimal = Decimal("0")     # 미지급 합계
    voucher_count: int = 0


# ============================================================================
# 전표 (Voucher)
# ============================================================================

class VoucherCreate(BaseModel):
    """전표 수동 생성"""
    trade_date: date
    counterparty_id: UUID
    voucher_number: str = Field(..., min_length=1, max_length=50)
    voucher_type: str = Field(..., description="sales/purchase")
    quantity: int = 0
    purchase_cost: Optional[Decimal] = None
    deduction_amount: Optional[Decimal] = None
    actual_purchase_price: Optional[Decimal] = None
    avg_unit_price: Optional[Decimal] = None
    purchase_deduction: Optional[Decimal] = None
    as_cost: Optional[Decimal] = None
    sale_amount: Optional[Decimal] = None
    sale_deduction: Optional[Decimal] = None
    actual_sale_price: Optional[Decimal] = None
    profit: Optional[Decimal] = None
    profit_rate: Optional[Decimal] = None
    avg_margin: Optional[Decimal] = None
    upm_settlement_status: Optional[str] = None
    payment_info: Optional[str] = None
    memo: Optional[str] = None


class VoucherUpdate(BaseModel):
    """전표 수정"""
    quantity: Optional[int] = None
    purchase_cost: Optional[Decimal] = None
    deduction_amount: Optional[Decimal] = None
    actual_purchase_price: Optional[Decimal] = None
    avg_unit_price: Optional[Decimal] = None
    purchase_deduction: Optional[Decimal] = None
    as_cost: Optional[Decimal] = None
    sale_amount: Optional[Decimal] = None
    sale_deduction: Optional[Decimal] = None
    actual_sale_price: Optional[Decimal] = None
    profit: Optional[Decimal] = None
    profit_rate: Optional[Decimal] = None
    avg_margin: Optional[Decimal] = None
    upm_settlement_status: Optional[str] = None
    payment_info: Optional[str] = None
    memo: Optional[str] = None


class VoucherResponse(BaseModel):
    id: UUID
    trade_date: date
    counterparty_id: UUID
    counterparty_name: Optional[str] = None
    voucher_number: str
    voucher_type: str
    quantity: int
    total_amount: Decimal
    purchase_cost: Optional[Decimal] = None
    deduction_amount: Optional[Decimal] = None
    actual_purchase_price: Optional[Decimal] = None
    avg_unit_price: Optional[Decimal] = None
    purchase_deduction: Optional[Decimal] = None
    as_cost: Optional[Decimal] = None
    sale_amount: Optional[Decimal] = None
    sale_deduction: Optional[Decimal] = None
    actual_sale_price: Optional[Decimal] = None
    profit: Optional[Decimal] = None
    profit_rate: Optional[Decimal] = None
    avg_margin: Optional[Decimal] = None
    upm_settlement_status: Optional[str] = None
    payment_info: Optional[str] = None
    settlement_status: str
    payment_status: str
    memo: Optional[str] = None
    # 계산 필드
    total_receipts: Decimal = Decimal("0")   # 누적 입금액
    total_payments: Decimal = Decimal("0")   # 누적 송금액
    balance: Decimal = Decimal("0")          # 잔액
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VoucherListResponse(BaseModel):
    vouchers: List[VoucherResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# 입금 (Receipt)
# ============================================================================

class ReceiptCreate(BaseModel):
    receipt_date: date
    amount: Decimal = Field(..., gt=0, description="입금액 (양수)")
    memo: Optional[str] = None


class ReceiptResponse(BaseModel):
    id: UUID
    voucher_id: UUID
    receipt_date: date
    amount: Decimal
    memo: Optional[str] = None
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# 송금 (Payment)
# ============================================================================

class PaymentCreate(BaseModel):
    payment_date: date
    amount: Decimal = Field(..., gt=0, description="송금액 (양수)")
    memo: Optional[str] = None


class PaymentResponse(BaseModel):
    id: UUID
    voucher_id: UUID
    payment_date: date
    amount: Decimal
    memo: Optional[str] = None
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# 전표 상세 (입금/송금 이력 포함)
# ============================================================================

class VoucherDetailResponse(VoucherResponse):
    """전표 상세 (입금/송금 이력 포함)"""
    receipts: List[ReceiptResponse] = []
    payments: List[PaymentResponse] = []


# ============================================================================
# 변경 요청 (VoucherChangeRequest)
# ============================================================================

class ChangeRequestResponse(BaseModel):
    id: UUID
    voucher_id: UUID
    voucher_number: Optional[str] = None
    counterparty_name: Optional[str] = None
    trade_date: Optional[date] = None
    upload_job_id: Optional[UUID] = None
    before_data: Optional[dict] = None
    after_data: Optional[dict] = None
    diff_summary: Optional[dict] = None
    status: str
    reviewed_by: Optional[UUID] = None
    review_memo: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ChangeRequestReview(BaseModel):
    review_memo: Optional[str] = None


# ============================================================================
# 업로드 템플릿 (UploadTemplate)
# ============================================================================

class UploadTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    voucher_type: str = Field(..., description="sales/purchase")
    column_mapping: dict
    skip_columns: Optional[list] = None
    is_default: bool = False


class UploadTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    column_mapping: Optional[dict] = None
    skip_columns: Optional[list] = None
    is_default: Optional[bool] = None


class UploadTemplateResponse(BaseModel):
    id: UUID
    name: str
    voucher_type: str
    column_mapping: dict
    skip_columns: Optional[list] = None
    is_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# 업로드 (UPM Excel)
# ============================================================================

class UploadPreviewRow(BaseModel):
    """업로드 미리보기 행"""
    row_index: int
    status: str = "new"  # new / update / conflict / unmatched / locked / excluded / error
    counterparty_name: str = ""
    counterparty_id: Optional[UUID] = None
    trade_date: Optional[date] = None  # excluded/error 행은 None 가능
    voucher_number: str = ""
    data: dict = {}  # UPM 원본 컬럼 전체
    diff: Optional[dict] = None  # 기존 전표와 차이 (update일 때)
    error: Optional[str] = None


class UploadJobResponse(BaseModel):
    id: UUID
    job_type: str
    status: str
    progress: int
    original_filename: str
    result_summary: Optional[dict] = None
    error_message: Optional[str] = None
    is_reviewed: bool
    is_confirmed: bool
    created_at: datetime
    completed_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    # 작업자 정보
    created_by: Optional[UUID] = None
    created_by_name: Optional[str] = None
    created_by_email: Optional[str] = None

    class Config:
        from_attributes = True


class UploadJobDetailResponse(UploadJobResponse):
    """업로드 작업 상세 (미리보기 포함)"""
    preview_rows: List[UploadPreviewRow] = []
    unmatched_counterparties: List[str] = []


# ============================================================================
# 미매칭 거래처
# ============================================================================

class UnmatchedCounterparty(BaseModel):
    """미매칭 거래처 항목"""
    id: UUID  # upload_job_id or a temp tracking id
    alias_name: str
    upload_job_id: UUID
    row_count: int = 1


class UnmatchedMapRequest(BaseModel):
    """미매칭 거래처 매핑 요청"""
    counterparty_id: Optional[UUID] = None  # 기존 거래처에 매핑
    new_counterparty_name: Optional[str] = None  # 새 거래처 생성


# ============================================================================
# 대시보드 / 리포트
# ============================================================================

class DashboardSummary(BaseModel):
    """대시보드 정산 요약"""
    total_receivable: Decimal = Decimal("0")     # 미수 총액
    total_payable: Decimal = Decimal("0")        # 미지급 총액
    settling_count: int = 0                       # 정산중 건수
    locked_count: int = 0                         # 마감 건수
    open_sales_count: int = 0                     # 미정산 판매 건수
    unpaid_purchase_count: int = 0                # 미지급 매입 건수
    pending_changes_count: int = 0                # 대기 중 변경 요청
    unmatched_count: int = 0                      # 미매칭 거래처 수


class TopCounterpartyItem(BaseModel):
    """미수/미지급 상위 거래처"""
    counterparty_id: UUID
    counterparty_name: str
    amount: Decimal
    voucher_count: int


# ============================================================================
# 미수/미지급 현황
# ============================================================================

class ReceivableItem(BaseModel):
    """미수 현황 항목"""
    counterparty_id: UUID
    counterparty_name: str
    total_amount: Decimal
    total_received: Decimal
    balance: Decimal  # 미수 잔액
    voucher_count: int


class PayableItem(BaseModel):
    """미지급 현황 항목"""
    counterparty_id: UUID
    counterparty_name: str
    total_amount: Decimal
    total_paid: Decimal
    balance: Decimal  # 미지급 잔액
    voucher_count: int


# ============================================================================
# 마감 (Lock)
# ============================================================================

class BatchLockRequest(BaseModel):
    """일괄 마감 요청"""
    voucher_ids: List[UUID]
    memo: Optional[str] = None


class BatchLockResponse(BaseModel):
    """일괄 마감 응답"""
    locked_count: int
    skipped_count: int  # 이미 마감된 건
    failed_ids: List[UUID] = []


class LockHistoryItem(BaseModel):
    """마감 내역 항목"""
    id: UUID
    action: str  # voucher_lock / voucher_unlock / voucher_batch_lock
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    description: Optional[str] = None
    target_id: Optional[UUID] = None
    created_at: datetime


# ============================================================================
# 거래처 입출금 이벤트 (CounterpartyTransaction)
# ============================================================================

class TransactionCreate(BaseModel):
    """입출금 이벤트 생성"""
    counterparty_id: UUID
    transaction_type: str = Field(..., description="deposit/withdrawal")
    transaction_date: date
    amount: Decimal = Field(..., gt=0, description="금액 (양수)")
    memo: Optional[str] = None
    bank_reference: Optional[str] = None


class TransactionUpdate(BaseModel):
    """입출금 이벤트 수정 (PENDING 상태만)"""
    transaction_date: Optional[date] = None
    amount: Optional[Decimal] = Field(None, gt=0)
    memo: Optional[str] = None


class TransactionResponse(BaseModel):
    id: UUID
    counterparty_id: UUID
    counterparty_name: Optional[str] = None
    transaction_type: str
    transaction_date: date
    amount: Decimal
    allocated_amount: Decimal = Decimal("0")
    unallocated_amount: Decimal = Decimal("0")
    memo: Optional[str] = None
    source: str
    bank_reference: Optional[str] = None
    netting_record_id: Optional[UUID] = None
    status: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TransactionDetailResponse(TransactionResponse):
    """상세 (배분 내역 포함)"""
    allocations: List["AllocationResponse"] = []
    hold_reason: Optional[str] = None
    hide_reason: Optional[str] = None


class TransactionHoldRequest(BaseModel):
    """보류 처리 요청"""
    reason: str = Field(..., min_length=1, max_length=500, description="보류 사유 (필수)")


class TransactionHideRequest(BaseModel):
    """숨김 처리 요청"""
    reason: Optional[str] = Field(None, max_length=500, description="숨김 사유 (선택)")


class TransactionListResponse(BaseModel):
    transactions: List[TransactionResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# 배분 (TransactionAllocation)
# ============================================================================

class AllocationItem(BaseModel):
    """배분 단일 항목"""
    voucher_id: UUID
    amount: Decimal = Field(..., gt=0)


class AllocationRequest(BaseModel):
    """수동 배분 요청"""
    allocations: List[AllocationItem]


class AutoAllocateRequest(BaseModel):
    """자동 배분 요청"""
    strategy: str = Field("fifo", description="fifo / proportional")
    voucher_ids: Optional[List[UUID]] = None  # None이면 전체 대상


class AllocationResponse(BaseModel):
    id: UUID
    transaction_id: UUID
    voucher_id: UUID
    voucher_number: Optional[str] = None
    voucher_trade_date: Optional[date] = None
    voucher_total_amount: Optional[Decimal] = None
    allocated_amount: Decimal
    allocation_order: int
    memo: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# 거래처 타임라인 / 잔액
# ============================================================================

class CounterpartyTimelineItem(BaseModel):
    """타임라인 항목 (입출금 + 배분 정보)"""
    id: UUID
    transaction_type: str
    transaction_date: date
    amount: Decimal
    allocated_amount: Decimal
    unallocated_amount: Decimal
    source: str
    status: str
    memo: Optional[str] = None
    allocation_count: int = 0
    created_at: datetime


class CounterpartyBalanceSummary(BaseModel):
    """거래처 잔액 요약"""
    counterparty_id: UUID
    counterparty_name: str
    total_deposits: Decimal = Decimal("0")
    total_withdrawals: Decimal = Decimal("0")
    total_allocated_deposits: Decimal = Decimal("0")
    total_allocated_withdrawals: Decimal = Decimal("0")
    unallocated_deposits: Decimal = Decimal("0")
    unallocated_withdrawals: Decimal = Decimal("0")
    total_receivable: Decimal = Decimal("0")   # 미수
    total_payable: Decimal = Decimal("0")      # 미지급


# ============================================================================
# 상계 (Netting)
# ============================================================================

class NettingVoucherItem(BaseModel):
    """상계 전표 항목"""
    voucher_id: UUID
    amount: Decimal = Field(..., gt=0)


class NettingCreateRequest(BaseModel):
    """상계 초안 생성"""
    counterparty_id: UUID
    netting_date: date
    sales_vouchers: List[NettingVoucherItem]
    purchase_vouchers: List[NettingVoucherItem]
    memo: Optional[str] = None


class NettingVoucherLinkResponse(BaseModel):
    voucher_id: UUID
    voucher_number: Optional[str] = None
    voucher_type: Optional[str] = None
    trade_date: Optional[date] = None
    total_amount: Optional[Decimal] = None
    netted_amount: Decimal

    class Config:
        from_attributes = True


class NettingResponse(BaseModel):
    id: UUID
    counterparty_id: UUID
    counterparty_name: Optional[str] = None
    netting_date: date
    netting_amount: Decimal
    status: str
    memo: Optional[str] = None
    created_by: UUID
    created_by_name: Optional[str] = None
    confirmed_by: Optional[UUID] = None
    confirmed_by_name: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NettingDetailResponse(NettingResponse):
    """상세 (참여 전표 포함)"""
    voucher_links: List[NettingVoucherLinkResponse] = []


class NettingListResponse(BaseModel):
    records: List[NettingResponse]
    total: int
    page: int
    page_size: int


class NettingEligibleVoucher(BaseModel):
    """상계 대상 전표"""
    id: UUID
    voucher_number: str
    voucher_type: str
    trade_date: date
    total_amount: Decimal
    already_allocated: Decimal = Decimal("0")
    available_for_netting: Decimal = Decimal("0")


class NettingEligibleResponse(BaseModel):
    """상계 가능 전표 목록"""
    counterparty_id: UUID
    counterparty_name: str
    sales_vouchers: List[NettingEligibleVoucher] = []
    purchase_vouchers: List[NettingEligibleVoucher] = []
    max_nettable_amount: Decimal = Decimal("0")


# ============================================================================
# 은행 임포트 (BankImport)
# ============================================================================

class BankImportLineResponse(BaseModel):
    id: UUID
    line_number: int
    transaction_date: date
    description: str
    amount: Decimal
    balance_after: Optional[Decimal] = None
    counterparty_name_raw: Optional[str] = None
    counterparty_id: Optional[UUID] = None
    counterparty_name: Optional[str] = None  # API에서 주입
    status: str
    match_confidence: Optional[Decimal] = None
    duplicate_key: Optional[str] = None
    bank_reference: Optional[str] = None
    transaction_id: Optional[UUID] = None

    class Config:
        from_attributes = True


class BankImportLineUpdate(BaseModel):
    """라인 수동 매칭/수정"""
    counterparty_id: Optional[UUID] = None
    status: Optional[str] = None  # matched/excluded


class BankImportJobResponse(BaseModel):
    id: UUID
    original_filename: str
    file_hash: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    import_date_from: Optional[date] = None
    import_date_to: Optional[date] = None
    status: str
    total_lines: int
    matched_lines: int
    confirmed_lines: int
    error_message: Optional[str] = None
    created_by: UUID
    created_by_name: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BankImportJobDetailResponse(BankImportJobResponse):
    """상세 (라인 목록 포함)"""
    lines: List[BankImportLineResponse] = []


# ============================================================================
# 조정 전표 (Adjustment Voucher)
# ============================================================================

class AdjustmentVoucherCreate(BaseModel):
    """조정 전표 생성 (마감된 전표 대상)"""
    adjustment_type: str = Field(..., description="correction/return_/write_off/discount")
    adjustment_reason: str = Field(..., min_length=1, description="조정 사유")
    trade_date: date
    total_amount: Decimal  # 음수 가능 (반품/대손)
    quantity: int = 0
    memo: Optional[str] = None


# ============================================================================
# 기간 마감 (PeriodLock)
# ============================================================================

class PeriodLockResponse(BaseModel):
    id: UUID
    year_month: str
    status: str
    locked_voucher_count: int
    locked_at: Optional[datetime] = None
    locked_by: Optional[UUID] = None
    locked_by_name: Optional[str] = None
    unlocked_at: Optional[datetime] = None
    unlocked_by: Optional[UUID] = None
    memo: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
