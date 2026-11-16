# Controle de Estoque – Impressoras

App para celular (Android) que controla:

- **Tintas e toners**: cadastro, saldo automático e alerta de estoque mínimo
- **Entradas e saídas** (a saída pode indicar a impressora de destino; saída maior que o saldo é bloqueada)
- **Impressoras alugadas**: locadora, para onde/quem foi alugada, endereço, contrato, aluguel mensal, status
- **Manutenções nas impressoras** e **nos toners** (recarga, cilindro...)
- **Resumo de valores**: estoque, entradas, saídas, aluguéis e manutenções
- **Backup**: baixa e restaura um arquivo com todos os dados

Funciona **sem internet** e sem servidor: os dados ficam salvos no próprio celular.
Projeto independente, sem relação com nenhum outro app.

## Instalar no Android

1. Abra o link do app no **Chrome** do celular.
2. Toque em **Instalar app** (ou menu ⋮ → **Adicionar à tela inicial** → **Instalar**).
3. Pronto: o ícone "Estoque" aparece junto com os outros apps.

## Colocar o app no ar (uma vez só, grátis, pelo GitHub Pages)

1. Crie um repositório novo no GitHub (ex.: `controle-estoque-impressoras`).
2. Envie para ele **o conteúdo desta pasta** (arquivos na raiz do repositório).
3. No repositório: **Settings → Pages → Branch: `main` / `(root)` → Save**.
4. Em 1–2 minutos o link fica pronto: `https://SEU-USUARIO.github.io/controle-estoque-impressoras/`

Atualizações: basta enviar os arquivos novos; o app atualiza sozinho ao abrir com internet.

## Importante sobre os dados

Os dados ficam **só no aparelho**. Use a aba **Backup** com frequência e guarde o arquivo
(Drive, WhatsApp, e-mail). O mesmo arquivo serve para passar os dados para outro celular.
Desinstalar o app ou limpar os dados do Chrome apaga os registros.

## Arquivos

```
index.html             página do app
app.js                 telas, regras e armazenamento local
style.css              visual (pensado para celular)
manifest.webmanifest   nome, ícone e cores do app instalado
sw.js                  permite funcionar sem internet
icons/                 ícones do app
```

Para testar no computador: `python3 -m http.server` dentro da pasta e abrir http://localhost:8000
