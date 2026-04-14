"""
Treatment Plan Billing System - Pydantic Schemas
=================================================
Modelos Pydantic para validación de request/response en los endpoints
de gestión de planes de tratamiento y facturación.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from enum import Enum

from pydantic import BaseModel, Field, field_validator


# =============================================================================
# ENUMS
# =============================================================================


class PlanStatus(str, Enum):
    """Estado del plan de tratamiento"""

    DRAFT = "draft"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ItemStatus(str, Enum):
    """Estado del ítem dentro de un plan"""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PaymentMethod(str, Enum):
    """Método de pago"""

    CASH = "cash"
    TRANSFER = "transfer"
    CARD = "card"
    INSURANCE = "insurance"


# =============================================================================
# REQUEST MODELS
# =============================================================================


class TreatmentPlanItemCreate(BaseModel):
    """Modelo base para crear un ítem de plan"""

    treatment_type_code: Optional[str] = Field(
        None, description="Código del tipo de tratamiento"
    )
    custom_description: Optional[str] = Field(
        None,
        description="Descripción personalizada si es diferente al tratamiento estándar",
    )
    estimated_price: Optional[float] = Field(
        0,
        description="Precio estimado (opcional, se usa base_price de treatment_types si no se provee)",
    )
    approved_price: Optional[float] = Field(None, description="Precio aprobado")
    status: Optional[str] = Field("pending", description="Estado del ítem")


class CreateTreatmentPlanBody(BaseModel):
    """Cuerpo para crear un nuevo plan de tratamiento"""

    name: str = Field(..., max_length=255, description="Nombre del plan")
    professional_id: Optional[int] = Field(
        None, description="ID del profesional principal"
    )
    notes: Optional[str] = Field(None, description="Notas u observaciones")
    items: Optional[List[TreatmentPlanItemCreate]] = Field(
        default_factory=list, description="Ítems iniciales del plan"
    )

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre del plan no puede estar vacío")
        return v.strip()


class UpdateTreatmentPlanBody(BaseModel):
    """Cuerpo para actualizar un plan de tratamiento"""

    name: Optional[str] = Field(None, max_length=255, description="Nombre del plan")
    professional_id: Optional[int] = Field(
        None, description="ID del profesional principal"
    )
    status: Optional[str] = Field(None, description="Nuevo estado del plan")
    approved_total: Optional[float] = Field(None, description="Monto total aprobado")
    notes: Optional[str] = Field(None, description="Notas u observaciones")
    # Campos de configuración presupuesto (opcionales)
    payment_conditions: Optional[str] = Field(
        None, description="e.g. Válido por 30 días"
    )
    discount_pct: Optional[float] = Field(
        None, description="porcentaje de descuento 0-100"
    )
    discount_amount: Optional[float] = Field(None, description="descuento fijo en $")
    installments: Optional[int] = Field(None, description="cantidad de cuotas")
    installments_amount: Optional[float] = Field(None, description="monto por cuota")
    currency: Optional[str] = Field(
        None, description="ARS, USD, PYG, EUR, BRL, CLP, UYU, MXN"
    )
    financed_total: Optional[float] = Field(
        None, description="total con recargo por financiación"
    )


class AddPlanItemBody(BaseModel):
    """Cuerpo para agregar un ítem a un plan existente"""

    treatment_type_code: Optional[str] = Field(
        None, description="Código del tipo de tratamiento"
    )
    custom_description: Optional[str] = Field(
        None, description="Descripción personalizada"
    )
    estimated_price: Optional[float] = Field(None, description="Precio estimado")
    approved_price: Optional[float] = Field(None, description="Precio aprobado")


class UpdatePlanItemBody(BaseModel):
    """Cuerpo para actualizar un ítem de plan"""

    treatment_type_code: Optional[str] = Field(
        None, description="Código del tipo de tratamiento"
    )
    custom_description: Optional[str] = Field(
        None, description="Descripción personalizada"
    )
    estimated_price: Optional[float] = Field(None, description="Precio estimado")
    approved_price: Optional[float] = Field(None, description="Precio aprobado")
    status: Optional[ItemStatus] = Field(None, description="Estado del ítem")
    sort_order: Optional[int] = Field(None, description="Orden del ítem")


class RegisterPaymentBody(BaseModel):
    """Cuerpo para registrar un pago contra un plan"""

    amount: float = Field(..., gt=0, description="Monto del pago")
    payment_method: PaymentMethod = Field(..., description="Método de pago")
    payment_date: Optional[date] = Field(
        None, description="Fecha del pago (default: hoy)"
    )
    appointment_id: Optional[str] = Field(
        None, description="ID del turno asociado (opcional)"
    )
    receipt_data: Optional[dict] = Field(None, description="Datos del comprobante")
    notes: Optional[str] = Field(None, description="Notas del pago")
    recorded_by: Optional[str] = Field(
        None, description="Email del usuario que registra"
    )

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("El monto debe ser mayor a 0")
        return v


class LinkPlanItemBody(BaseModel):
    """Cuerpo para vincular/desvincular un turno a un ítem de plan"""

    plan_item_id: Optional[str] = Field(
        None, description="ID del ítem de plan (null para desvincular)"
    )


# =============================================================================
# RESPONSE MODELS
# =============================================================================


class TreatmentPlanItemResponse(BaseModel):
    """Respuesta para un ítem individual del plan"""

    id: str
    plan_id: str
    tenant_id: int
    treatment_type_code: Optional[str]
    custom_description: Optional[str]
    estimated_price: float
    approved_price: Optional[float]
    status: str
    sort_order: int
    # Campos calculados
    appointments_count: int = Field(
        default=0, description="Cantidad de turnos vinculados"
    )
    # Timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TreatmentPlanPaymentResponse(BaseModel):
    """Respuesta para un pago registrado"""

    id: str
    plan_id: str
    tenant_id: int
    amount: float
    payment_method: str
    payment_date: Optional[date]
    recorded_by: Optional[str]
    appointment_id: Optional[str]
    receipt_data: Optional[dict]
    notes: Optional[str]
    # Timestamps
    created_at: datetime

    class Config:
        from_attributes = True


class TreatmentPlanResponse(BaseModel):
    """Respuesta para lista de planes (resumen)"""

    id: str
    tenant_id: int
    patient_id: int
    professional_id: Optional[int]
    name: str
    status: str
    estimated_total: float
    approved_total: Optional[float]
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    notes: Optional[str]
    # Campos calculados agregados
    items_count: int = Field(default=0, description="Cantidad de ítems en el plan")
    paid_total: float = Field(default=0, description="Total pagado")
    pending_total: float = Field(default=0, description="Saldo pendiente")
    # Timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TreatmentPlanDetailResponse(BaseModel):
    """Respuesta detallada de un plan con todos sus ítems y pagos"""

    id: str
    tenant_id: int
    patient_id: int
    professional_id: Optional[int]
    name: str
    status: str
    estimated_total: float
    approved_total: Optional[float]
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    notes: Optional[str]
    # Arrays completos
    items: List[TreatmentPlanItemResponse] = Field(default_factory=list)
    payments: List[TreatmentPlanPaymentResponse] = Field(default_factory=list)
    # Campos calculados
    paid_total: float = Field(default=0, description="Total pagado")
    pending_total: float = Field(default=0, description="Saldo pendiente")
    # Joined fields
    professional_name: Optional[str] = None
    patient_name: Optional[str] = None
    # Timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
