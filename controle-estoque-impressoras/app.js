// Controle de Estoque – Impressoras
// App 100% local: os dados ficam salvos no próprio aparelho (localStorage). Não precisa de servidor.

// ---------------- Banco de dados local ----------------
const CHAVE = "estoque-impressoras-v1";
const TABELAS = ["suprimentos", "movimentos", "impressoras", "manutImpressoras", "manutToners"];

function carregar() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE)) || {};
    for (const t of TABELAS) d[t] ??= [];
    d.proximoId ??= 1;
    return d;
  } catch { return Object.fromEntries([...TABELAS.map(t => [t, []]), ["proximoId", 1]]); }
}
let db = carregar();
const salvar = () => localStorage.setItem(CHAVE, JSON.stringify(db));

const hoje = () => new Date().toISOString().slice(0, 10);
const num = v => Number(v) || 0;
const brl = v => num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = d => d ? d.split("-").reverse().join("/") : "";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const porId = (t, id) => db[t].find(x => x.id === Number(id));

// ---------------- Regras de negócio ----------------
const saldo = supId => db.movimentos
  .filter(m => m.suprimento_id === supId)
  .reduce((s, m) => s + (m.tipo === "entrada" ? m.quantidade : -m.quantidade), 0);

const nomeSup = id => porId("suprimentos", id)?.nome ?? `#${id}`;
const nomeImp = id => { const i = porId("impressoras", id); return i ? `${i.marca} ${i.modelo}` : id ? `#${id}` : ""; };

function suprimentosComSaldo() {
  return db.suprimentos.map(s => {
    const quantidade = saldo(s.id);
    return { ...s, quantidade, valor_em_estoque: quantidade * num(s.valor_unitario), abaixo_do_minimo: quantidade < num(s.estoque_minimo) };
  }).sort((a, b) => a.nome.localeCompare(b.nome));
}

// Validações/ajustes antes de salvar cada tipo de registro (lançar erro = cancela)
const ANTES_DE_SALVAR = {
  movimentos(m) {
    const sup = porId("suprimentos", m.suprimento_id);
    if (!sup) throw new Error("Escolha um suprimento (cadastre um na aba Tintas e toners).");
    if (!(m.quantidade > 0)) throw new Error("A quantidade deve ser maior que zero.");
    if (m.tipo === "saida" && m.quantidade > saldo(sup.id))
      throw new Error(`Saldo insuficiente: há só ${saldo(sup.id)} unidade(s) de ${sup.nome}.`);
    m.valor_unitario ??= num(sup.valor_unitario);
    m.valor_total = m.quantidade * m.valor_unitario;
  },
  manutImpressoras(m) { if (!porId("impressoras", m.impressora_id)) throw new Error("Escolha uma impressora."); },
  manutToners(m) { if (!porId("suprimentos", m.suprimento_id)) throw new Error("Escolha um toner."); m.quantidade ||= 1; },
  impressoras(m) { m.status ||= "ativa"; },
};

// Ao excluir, remove também os registros que dependem do item
const AO_EXCLUIR = {
  suprimentos: id => { db.movimentos = db.movimentos.filter(m => m.suprimento_id !== id); db.manutToners = db.manutToners.filter(m => m.suprimento_id !== id); },
  impressoras: id => { db.manutImpressoras = db.manutImpressoras.filter(m => m.impressora_id !== id); },
};

function inserir(tabela, reg) {
  ANTES_DE_SALVAR[tabela]?.(reg);
  reg.id = db.proximoId++;
  db[tabela].push(reg);
  salvar();
}

function excluir(tabela, id) {
  AO_EXCLUIR[tabela]?.(id);
  db[tabela] = db[tabela].filter(x => x.id !== id);
  salvar();
}

// ---------------- Telas ----------------
const opcoes = {
  suprimentos: () => db.suprimentos.map(s => [s.id, `${s.nome} (${s.tipo})`]),
  toners: () => db.suprimentos.filter(s => s.tipo === "toner").map(s => [s.id, s.nome]),
  impressoras: () => db.impressoras.map(i => [i.id, `${i.marca} ${i.modelo} ${i.numero_serie ?? ""}`]),
};

const SECOES = {
  resumo: { titulo: "Resumo" },
  suprimentos: {
    titulo: "Tintas e toners",
    listar: suprimentosComSaldo,
    campos: [
      ["nome", "Nome", "text", "obrigatorio"], ["tipo", "Tipo", ["tinta", "toner"]], ["modelo", "Modelo"], ["cor", "Cor"],
      ["estoque_minimo", "Estoque mínimo", "number"], ["valor_unitario", "Valor unitário (R$)", "money"],
    ],
    colunas: [["nome", "Nome"], ["tipo", "Tipo"], ["modelo", "Modelo"], ["cor", "Cor"], ["quantidade", "Qtd."],
      ["estoque_minimo", "Mín."], ["valor_unitario", "Valor unit.", brl], ["valor_em_estoque", "Em estoque", brl]],
  },
  movimentos: {
    titulo: "Entradas / Saídas",
    campos: [
      ["suprimento_id", "Suprimento", "suprimentos"], ["tipo", "Tipo", ["entrada", "saida"]],
      ["quantidade", "Quantidade", "number", "obrigatorio"], ["valor_unitario", "Valor unit. (vazio = padrão)", "money"],
      ["data", "Data", "date"], ["impressora_id", "Impressora (saída)", "impressoras", "opcional"], ["observacao", "Observação"],
    ],
    colunas: [["data", "Data", dataBR], ["tipo", "Tipo"], ["suprimento_id", "Suprimento", nomeSup], ["quantidade", "Qtd."],
      ["valor_unitario", "Valor unit.", brl], ["valor_total", "Total", brl], ["impressora_id", "Impressora", nomeImp]],
  },
  impressoras: {
    titulo: "Impressoras alugadas",
    campos: [
      ["marca", "Marca", "text", "obrigatorio"], ["modelo", "Modelo", "text", "obrigatorio"], ["numero_serie", "Nº de série"],
      ["locadora", "Locadora"], ["alugada_para", "Alugada para (cliente/destino)"], ["local", "Endereço / local de instalação"],
      ["data_inicio", "Início do contrato", "date"], ["data_fim", "Fim do contrato", "date"],
      ["valor_mensal", "Aluguel mensal (R$)", "money"], ["status", "Status", ["ativa", "manutencao", "devolvida"]],
    ],
    colunas: [["marca", "Marca"], ["modelo", "Modelo"], ["numero_serie", "Série"], ["locadora", "Locadora"],
      ["alugada_para", "Alugada para"], ["local", "Local"], ["data_fim", "Fim contrato", dataBR],
      ["valor_mensal", "Aluguel/mês", brl], ["status", "Status"]],
  },
  manutImpressoras: {
    titulo: "Manutenção de impressoras",
    campos: [["impressora_id", "Impressora", "impressoras"], ["data", "Data", "date"], ["descricao", "Descrição", "text", "obrigatorio"],
      ["tecnico", "Técnico"], ["valor", "Valor (R$)", "money"]],
    colunas: [["data", "Data", dataBR], ["impressora_id", "Impressora", nomeImp], ["descricao", "Descrição"], ["tecnico", "Técnico"], ["valor", "Valor", brl]],
  },
  manutToners: {
    titulo: "Manutenção de toners",
    campos: [["suprimento_id", "Toner", "toners"], ["data", "Data", "date"], ["servico", "Serviço (recarga, cilindro...)", "text", "obrigatorio"],
      ["quantidade", "Quantidade", "number"], ["fornecedor", "Fornecedor"], ["valor", "Valor total (R$)", "money"]],
    colunas: [["data", "Data", dataBR], ["suprimento_id", "Toner", nomeSup], ["servico", "Serviço"], ["quantidade", "Qtd."],
      ["fornecedor", "Fornecedor"], ["valor", "Valor", brl]],
  },
  backup: { titulo: "Backup" },
};

const $conteudo = document.getElementById("conteudo");
const $abas = document.getElementById("abas");
let atual = "resumo";

function campoHTML([nome, rotulo, tipo, flag]) {
  const req = flag === "obrigatorio" ? "required" : "";
  if (Array.isArray(tipo))
    return `<label>${rotulo}<select name="${nome}">${tipo.map(o => `<option>${o}</option>`).join("")}</select></label>`;
  if (opcoes[tipo]) {
    const lista = opcoes[tipo]();
    return `<label>${rotulo}<select name="${nome}" ${flag === "opcional" ? "" : "required"}>
      ${flag === "opcional" || !lista.length ? '<option value="">—</option>' : ""}
      ${lista.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select></label>`;
  }
  const attrs = tipo === "money" ? 'type="number" step="0.01" min="0" inputmode="decimal"'
    : tipo === "number" ? 'type="number" min="0" inputmode="numeric"'
    : tipo === "date" ? `type="date" ${nome === "data" ? `value="${hoje()}"` : ""}` : 'type="text"';
  return `<label>${rotulo}<input name="${nome}" ${attrs} ${req}></label>`;
}

function lerFormulario(form, campos) {
  const dados = {};
  for (const [nome, , tipo] of campos) {
    const v = form.elements[nome].value.trim();
    if (v === "") continue;
    dados[nome] = ["number", "money"].includes(tipo) || opcoes[tipo] ? Number(v) : v;
  }
  return dados;
}

function renderResumo() {
  const sups = suprimentosComSaldo();
  const soma = (lista, f) => lista.reduce((s, x) => s + num(f(x)), 0);
  const ativas = db.impressoras.filter(i => i.status !== "devolvida");
  const baixos = sups.filter(s => s.abaixo_do_minimo).map(s => esc(s.nome));
  const cards = [
    ["Valor em estoque (tintas/toners)", brl(soma(sups, s => s.valor_em_estoque))],
    ["Unidades em estoque", soma(sups, s => s.quantidade)],
    ["Total de entradas", brl(soma(db.movimentos.filter(m => m.tipo === "entrada"), m => m.valor_total))],
    ["Total de saídas", brl(soma(db.movimentos.filter(m => m.tipo === "saida"), m => m.valor_total))],
    ["Impressoras alugadas", ativas.length],
    ["Aluguel mensal", brl(soma(ativas, i => i.valor_mensal))],
    ["Manutenção de impressoras", brl(soma(db.manutImpressoras, m => m.valor))],
    ["Manutenção de toners", brl(soma(db.manutToners, m => m.valor))],
  ];
  $conteudo.innerHTML = `<div class="cards">${cards.map(([t, v]) => `<div class="card"><small>${t}</small><strong>${v}</strong></div>`).join("")}</div>
    ${baixos.length ? `<p class="alerta">Abaixo do estoque mínimo: ${baixos.join(", ")}</p>` : ""}`;
}

function renderSecao(chave, s) {
  const itens = s.listar ? s.listar() : [...db[chave]].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "") || b.id - a.id);
  $conteudo.innerHTML = `
    <form>${s.campos.map(campoHTML).join("")}<button>Salvar</button></form>
    ${itens.length ? `<div class="tabela"><table>
      <thead><tr>${s.colunas.map(c => `<th>${c[1]}</th>`).join("")}<th></th></tr></thead>
      <tbody>${itens.map(i => `<tr class="${i.abaixo_do_minimo ? "alerta" : ""}">
        ${s.colunas.map(([k, , fmt]) => `<td>${esc(fmt ? fmt(i[k]) : i[k])}</td>`).join("")}
        <td><button data-id="${i.id}" aria-label="Excluir">✕</button></td></tr>`).join("")}</tbody>
    </table></div>` : `<p class="vazio">Nenhum registro ainda.</p>`}`;

  $conteudo.querySelector("form").onsubmit = e => {
    e.preventDefault();
    try { inserir(chave, lerFormulario(e.target, s.campos)); render(); }
    catch (err) { alert(err.message); }
  };
  $conteudo.querySelectorAll("td button").forEach(b => b.onclick = () => {
    if (confirm("Excluir este registro?")) { excluir(chave, Number(b.dataset.id)); render(); }
  });
}

function renderBackup() {
  $conteudo.innerHTML = `<div class="card backup">
    <p>Os dados ficam salvos <b>somente neste aparelho</b>. Faça backup com frequência e guarde o arquivo
    (Google Drive, WhatsApp, e-mail...). O mesmo arquivo serve para passar os dados para outro celular.</p>
    <button id="exportar">Baixar backup</button>
    <label class="botao">Restaurar backup<input id="importar" type="file" accept=".json,application/json" hidden></label>
  </div>`;
  document.getElementById("exportar").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }));
    a.download = `backup-estoque-${hoje()}.json`;
    a.click();
  };
  document.getElementById("importar").onchange = async e => {
    const arq = e.target.files[0];
    if (!arq) return;
    try {
      const dados = JSON.parse(await arq.text());
      if (!TABELAS.every(t => Array.isArray(dados[t]))) throw new Error();
      if (!confirm("Isto vai substituir todos os dados atuais pelos do backup. Continuar?")) return;
      localStorage.setItem(CHAVE, JSON.stringify(dados));
      db = carregar();
      alert("Backup restaurado!");
      atual = "resumo"; render();
    } catch { alert("Arquivo de backup inválido."); }
  };
}

function render() {
  $abas.innerHTML = Object.entries(SECOES)
    .map(([k, s]) => `<button data-k="${k}" class="${k === atual ? "ativa" : ""}">${s.titulo}</button>`).join("");
  $abas.querySelectorAll("button").forEach(b => b.onclick = () => { atual = b.dataset.k; render(); scrollTo(0, 0); });
  if (atual === "resumo") renderResumo();
  else if (atual === "backup") renderBackup();
  else renderSecao(atual, SECOES[atual]);
}

render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
