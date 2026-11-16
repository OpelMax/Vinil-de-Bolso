"""Painel com os valores consolidados de todos os itens."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Impressora, ManutencaoImpressora, ManutencaoToner, Movimento
from .suprimentos import listar as listar_suprimentos

router = APIRouter(prefix="/api/resumo", tags=["Resumo"])


def _soma(db: Session, expr, *where) -> float:
    return round(db.scalar(select(func.coalesce(func.sum(expr), 0)).where(*where)) or 0, 2)


@router.get("")
def resumo(db: Session = Depends(get_db)):
    sups = listar_suprimentos(db)
    total_mov = Movimento.quantidade * Movimento.valor_unitario
    return {
        "suprimentos": {
            "itens_cadastrados": len(sups),
            "unidades_em_estoque": sum(s.quantidade for s in sups),
            "valor_em_estoque": round(sum(s.valor_em_estoque for s in sups), 2),
            "abaixo_do_minimo": [s.nome for s in sups if s.abaixo_do_minimo],
            "valor_entradas": _soma(db, total_mov, Movimento.tipo == "entrada"),
            "valor_saidas": _soma(db, total_mov, Movimento.tipo == "saida"),
        },
        "impressoras": {
            "ativas": db.scalar(select(func.count()).where(Impressora.status != "devolvida")),
            "aluguel_mensal": _soma(db, Impressora.valor_mensal, Impressora.status != "devolvida"),
        },
        "manutencoes": {
            "impressoras": _soma(db, ManutencaoImpressora.valor),
            "toners": _soma(db, ManutencaoToner.valor),
        },
    }
