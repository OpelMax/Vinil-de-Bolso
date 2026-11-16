"""Impressoras alugadas e manutenções (CRUD simples)."""
from ..crud import crud_router
from ..models import Impressora, ManutencaoImpressora, ManutencaoToner
from ..schemas import (
    ImpressoraIn, ImpressoraOut,
    ManutencaoImpressoraIn, ManutencaoImpressoraOut,
    ManutencaoTonerIn, ManutencaoTonerOut,
)

impressoras = crud_router("/api/impressoras", Impressora, ImpressoraIn, ImpressoraOut, "Impressoras")
manut_impressoras = crud_router(
    "/api/manutencoes-impressora", ManutencaoImpressora,
    ManutencaoImpressoraIn, ManutencaoImpressoraOut, "Manutenções de impressoras",
)
manut_toners = crud_router(
    "/api/manutencoes-toner", ManutencaoToner,
    ManutencaoTonerIn, ManutencaoTonerOut, "Manutenções de toners",
)
