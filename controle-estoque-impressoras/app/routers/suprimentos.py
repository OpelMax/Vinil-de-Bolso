"""Tintas e toners: cadastro + saldo calculado a partir das movimentações."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Movimento, Suprimento
from ..schemas import SuprimentoIn, SuprimentoOut

router = APIRouter(prefix="/api/suprimentos", tags=["Suprimentos"])


def saldo(db: Session, suprimento_id: int) -> int:
    sinal = case((Movimento.tipo == "entrada", Movimento.quantidade), else_=-Movimento.quantidade)
    return db.scalar(select(func.coalesce(func.sum(sinal), 0)).where(Movimento.suprimento_id == suprimento_id))


def _out(db: Session, s: Suprimento) -> SuprimentoOut:
    qtd = saldo(db, s.id)
    return SuprimentoOut.model_validate(s).model_copy(update={
        "quantidade": qtd,
        "valor_em_estoque": round(qtd * s.valor_unitario, 2),
        "abaixo_do_minimo": qtd < s.estoque_minimo,
    })


def _get(db: Session, item_id: int) -> Suprimento:
    s = db.get(Suprimento, item_id)
    if not s:
        raise HTTPException(404, "Suprimento não encontrado")
    return s


@router.get("", response_model=list[SuprimentoOut])
def listar(db: Session = Depends(get_db)):
    return [_out(db, s) for s in db.scalars(select(Suprimento).order_by(Suprimento.nome))]


@router.get("/{item_id}", response_model=SuprimentoOut)
def obter(item_id: int, db: Session = Depends(get_db)):
    return _out(db, _get(db, item_id))


@router.post("", response_model=SuprimentoOut, status_code=201)
def criar(dados: SuprimentoIn, db: Session = Depends(get_db)):
    s = Suprimento(**dados.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return _out(db, s)


@router.put("/{item_id}", response_model=SuprimentoOut)
def atualizar(item_id: int, dados: SuprimentoIn, db: Session = Depends(get_db)):
    s = _get(db, item_id)
    for k, v in dados.model_dump().items():
        setattr(s, k, v)
    db.commit()
    return _out(db, s)


@router.delete("/{item_id}", status_code=204)
def remover(item_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, item_id))
    db.commit()
