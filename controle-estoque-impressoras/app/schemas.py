"""Esquemas de entrada/saída da API (Pydantic)."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Suprimentos (tintas / toners) ----------
class SuprimentoIn(BaseModel):
    nome: str
    tipo: Literal["tinta", "toner"]
    modelo: str | None = None
    cor: str | None = None
    estoque_minimo: int = Field(0, ge=0)
    valor_unitario: float = Field(0, ge=0)


class SuprimentoOut(SuprimentoIn, _Out):
    quantidade: int = 0
    valor_em_estoque: float = 0
    abaixo_do_minimo: bool = False


# ---------- Movimentos ----------
class MovimentoIn(BaseModel):
    suprimento_id: int
    tipo: Literal["entrada", "saida"]
    quantidade: int = Field(gt=0)
    valor_unitario: float | None = Field(None, ge=0)  # vazio = usa valor do suprimento
    data: date = Field(default_factory=date.today)
    impressora_id: int | None = None
    observacao: str | None = None


class MovimentoOut(_Out):
    suprimento_id: int
    tipo: str
    quantidade: int
    valor_unitario: float
    data: date
    impressora_id: int | None
    observacao: str | None
    valor_total: float = 0


# ---------- Impressoras alugadas ----------
class ImpressoraIn(BaseModel):
    marca: str
    modelo: str
    numero_serie: str | None = None
    locadora: str | None = None
    local: str | None = None
    data_inicio: date | None = None
    data_fim: date | None = None
    valor_mensal: float = Field(0, ge=0)
    status: Literal["ativa", "manutencao", "devolvida"] = "ativa"


class ImpressoraOut(ImpressoraIn, _Out):
    pass


# ---------- Manutenções ----------
class ManutencaoImpressoraIn(BaseModel):
    impressora_id: int
    data: date = Field(default_factory=date.today)
    descricao: str
    tecnico: str | None = None
    valor: float = Field(0, ge=0)


class ManutencaoImpressoraOut(ManutencaoImpressoraIn, _Out):
    pass


class ManutencaoTonerIn(BaseModel):
    suprimento_id: int
    data: date = Field(default_factory=date.today)
    servico: str
    quantidade: int = Field(1, gt=0)
    fornecedor: str | None = None
    valor: float = Field(0, ge=0)


class ManutencaoTonerOut(ManutencaoTonerIn, _Out):
    pass
