"""Entradas e saídas de tintas/toners."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Impressora, Movimento, Suprimento
from ..schemas import MovimentoIn, MovimentoOut
from .suprimentos import saldo

router = APIRouter(prefix="/api/movimentos", tags=["Entradas e saídas"])


def _out(m: Movimento) -> MovimentoOut:
    out = MovimentoOut.model_validate(m, from_attributes=True)
    return out.model_copy(update={"valor_total": round(m.quantidade * m.valor_unitario, 2)})


@router.get("", response_model=list[MovimentoOut])
def listar(suprimento_id: int | None = None, tipo: str | None = None, db: Session = Depends(get_db)):
    q = select(Movimento).order_by(Movimento.data.desc(), Movimento.id.desc())
    if suprimento_id:
        q = q.where(Movimento.suprimento_id == suprimento_id)
    if tipo:
        q = q.where(Movimento.tipo == tipo)
    return [_out(m) for m in db.scalars(q)]


@router.post("", response_model=MovimentoOut, status_code=201)
def registrar(dados: MovimentoIn, db: Session = Depends(get_db)):
    sup = db.get(Suprimento, dados.suprimento_id)
    if not sup:
        raise HTTPException(404, "Suprimento não encontrado")
    if dados.impressora_id and not db.get(Impressora, dados.impressora_id):
        raise HTTPException(404, "Impressora não encontrada")
    if dados.tipo == "saida" and dados.quantidade > saldo(db, sup.id):
        raise HTTPException(400, "Saldo insuficiente para esta saída")

    valores = dados.model_dump()
    if valores["valor_unitario"] is None:
        valores["valor_unitario"] = sup.valor_unitario
    m = Movimento(**valores)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _out(m)


@router.delete("/{item_id}", status_code=204)
def remover(item_id: int, db: Session = Depends(get_db)):
    m = db.get(Movimento, item_id)
    if not m:
        raise HTTPException(404, "Movimento não encontrado")
    db.delete(m)
    db.commit()
