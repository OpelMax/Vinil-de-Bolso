"""Fábrica de rotas CRUD genéricas para evitar repetição."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db


def crud_router(prefix: str, model, schema_in, schema_out, tag: str) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=[tag])

    def _get(db: Session, item_id: int):
        obj = db.get(model, item_id)
        if not obj:
            raise HTTPException(404, f"{tag} {item_id} não encontrado(a)")
        return obj

    @router.get("", response_model=list[schema_out])
    def listar(db: Session = Depends(get_db)):
        return db.scalars(select(model).order_by(model.id.desc())).all()

    @router.get("/{item_id}", response_model=schema_out)
    def obter(item_id: int, db: Session = Depends(get_db)):
        return _get(db, item_id)

    @router.post("", response_model=schema_out, status_code=201)
    def criar(dados: schema_in, db: Session = Depends(get_db)):
        obj = model(**dados.model_dump())
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @router.put("/{item_id}", response_model=schema_out)
    def atualizar(item_id: int, dados: schema_in, db: Session = Depends(get_db)):
        obj = _get(db, item_id)
        for k, v in dados.model_dump().items():
            setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        return obj

    @router.delete("/{item_id}", status_code=204)
    def remover(item_id: int, db: Session = Depends(get_db)):
        db.delete(_get(db, item_id))
        db.commit()

    return router
