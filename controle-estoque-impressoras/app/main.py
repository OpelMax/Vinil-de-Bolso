"""Ponto de entrada: uvicorn app.main:app --reload"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .routers import movimentos, resumo, suprimentos
from .routers.cadastros import impressoras, manut_impressoras, manut_toners

Base.metadata.create_all(bind=engine)  # para produção, trocar por migrações (Alembic)

app = FastAPI(title="Controle de Estoque de Impressoras", version="0.1.0")

for r in (suprimentos.router, movimentos.router, impressoras, manut_impressoras, manut_toners, resumo.router):
    app.include_router(r)

app.mount("/", StaticFiles(directory=Path(__file__).parent.parent / "static", html=True), name="static")
