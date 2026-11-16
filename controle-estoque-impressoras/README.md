# Controle de Estoque – Impressoras

Esqueleto de aplicativo para controlar:

- **Tintas e toners**: cadastro, saldo calculado automaticamente, alerta de estoque mínimo
- **Entradas e saídas** de suprimentos (a saída pode indicar a impressora de destino; saída maior que o saldo é bloqueada)
- **Impressoras alugadas**: locadora, local, contrato, aluguel mensal, status
- **Manutenções nas impressoras**
- **Manutenções nos toners** (recarga, cilindro, limpeza...)
- **Resumo de valores**: valor em estoque, total de entradas e saídas, aluguel mensal, gastos com manutenção

Projeto independente: não compartilha código com nenhum outro app.

## Como rodar

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

- Interface: http://localhost:8000
- Documentação da API (Swagger): http://localhost:8000/docs

O banco é um arquivo SQLite (`estoque.db`) criado sozinho na primeira execução.
Para usar outro banco, defina `DATABASE_URL` (ex.: `postgresql://usuario:senha@host/estoque`).

## Estrutura

```
app/
  main.py            # cria o app e registra as rotas
  database.py        # conexão (SQLAlchemy)
  models.py          # tabelas
  schemas.py         # validação de entrada/saída
  crud.py            # gerador de rotas CRUD genéricas
  routers/
    suprimentos.py   # tintas/toners + cálculo de saldo
    movimentos.py    # entradas e saídas
    cadastros.py     # impressoras e manutenções
    resumo.py        # painel de valores
static/              # interface web (HTML + JS puro)
```

## Endpoints

| Recurso | Rota |
|---|---|
| Tintas/toners | `/api/suprimentos` |
| Entradas/saídas | `/api/movimentos` (filtros `?suprimento_id=&tipo=`) |
| Impressoras alugadas | `/api/impressoras` |
| Manutenção de impressoras | `/api/manutencoes-impressora` |
| Manutenção de toners | `/api/manutencoes-toner` |
| Resumo de valores | `/api/resumo` |

Todos aceitam `GET`, `POST` e `DELETE /{id}`; os cadastros também aceitam `PUT /{id}`.

## Próximos passos sugeridos

- Login e permissões de usuário
- Edição de registros pela interface (hoje: criar e excluir)
- Filtros por período e relatórios em PDF/Excel
- Migrações com Alembic em vez de `create_all`
- Aviso de contratos de aluguel perto do vencimento
