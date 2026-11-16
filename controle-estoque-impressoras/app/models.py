"""Tabelas do sistema de controle de estoque."""
from datetime import date

from sqlalchemy import Date, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Suprimento(Base):
    """Tinta ou toner de impressora mantido em estoque."""

    __tablename__ = "suprimentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    tipo: Mapped[str] = mapped_column(Enum("tinta", "toner", name="tipo_suprimento"))
    modelo: Mapped[str | None] = mapped_column(String(80))       # ex.: HP 664, TN-1060
    cor: Mapped[str | None] = mapped_column(String(30))          # preto, ciano...
    estoque_minimo: Mapped[int] = mapped_column(Integer, default=0)
    valor_unitario: Mapped[float] = mapped_column(Float, default=0)  # preço de referência

    movimentos: Mapped[list["Movimento"]] = relationship(back_populates="suprimento", cascade="all, delete-orphan")
    manutencoes: Mapped[list["ManutencaoToner"]] = relationship(back_populates="suprimento", cascade="all, delete-orphan")


class Movimento(Base):
    """Entrada ou saída de suprimento do estoque."""

    __tablename__ = "movimentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    suprimento_id: Mapped[int] = mapped_column(ForeignKey("suprimentos.id"))
    tipo: Mapped[str] = mapped_column(Enum("entrada", "saida", name="tipo_movimento"))
    quantidade: Mapped[int] = mapped_column(Integer)
    valor_unitario: Mapped[float] = mapped_column(Float, default=0)
    data: Mapped[date] = mapped_column(Date, default=date.today)
    impressora_id: Mapped[int | None] = mapped_column(ForeignKey("impressoras.id"))  # destino da saída
    observacao: Mapped[str | None] = mapped_column(Text)

    suprimento: Mapped[Suprimento] = relationship(back_populates="movimentos")


class Impressora(Base):
    """Impressora alugada."""

    __tablename__ = "impressoras"

    id: Mapped[int] = mapped_column(primary_key=True)
    marca: Mapped[str] = mapped_column(String(60))
    modelo: Mapped[str] = mapped_column(String(80))
    numero_serie: Mapped[str | None] = mapped_column(String(80), unique=True)
    locadora: Mapped[str | None] = mapped_column(String(120))    # empresa que aluga
    local: Mapped[str | None] = mapped_column(String(120))       # setor / endereço onde está
    data_inicio: Mapped[date | None] = mapped_column(Date)
    data_fim: Mapped[date | None] = mapped_column(Date)
    valor_mensal: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(
        Enum("ativa", "manutencao", "devolvida", name="status_impressora"), default="ativa"
    )

    manutencoes: Mapped[list["ManutencaoImpressora"]] = relationship(back_populates="impressora", cascade="all, delete-orphan")


class ManutencaoImpressora(Base):
    __tablename__ = "manutencoes_impressora"

    id: Mapped[int] = mapped_column(primary_key=True)
    impressora_id: Mapped[int] = mapped_column(ForeignKey("impressoras.id"))
    data: Mapped[date] = mapped_column(Date, default=date.today)
    descricao: Mapped[str] = mapped_column(Text)
    tecnico: Mapped[str | None] = mapped_column(String(120))
    valor: Mapped[float] = mapped_column(Float, default=0)

    impressora: Mapped[Impressora] = relationship(back_populates="manutencoes")


class ManutencaoToner(Base):
    """Recarga, troca de cilindro, limpeza etc. de toners."""

    __tablename__ = "manutencoes_toner"

    id: Mapped[int] = mapped_column(primary_key=True)
    suprimento_id: Mapped[int] = mapped_column(ForeignKey("suprimentos.id"))
    data: Mapped[date] = mapped_column(Date, default=date.today)
    servico: Mapped[str] = mapped_column(String(80))   # recarga, cilindro, limpeza...
    quantidade: Mapped[int] = mapped_column(Integer, default=1)
    fornecedor: Mapped[str | None] = mapped_column(String(120))
    valor: Mapped[float] = mapped_column(Float, default=0)  # valor total do serviço

    suprimento: Mapped[Suprimento] = relationship(back_populates="manutencoes")
