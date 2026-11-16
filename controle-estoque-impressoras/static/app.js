// Frontend mínimo: cada aba é descrita em SECOES (endpoint, campos do formulário e colunas da tabela).
const brl = v => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const api = async (url, opts = {}) => {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
  return r.status === 204 ? null : r.json();
};

// Listas usadas em <select> (preenchidas a cada renderização)
const opcoes = {
  suprimentos: async () => (await api("/api/suprimentos")).map(s => [s.id, `${s.nome} (${s.tipo})`]),
  toners: async () => (await api("/api/suprimentos")).filter(s => s.tipo === "toner").map(s => [s.id, s.nome]),
  impressoras: async () => (await api("/api/impressoras")).map(i => [i.id, `${i.marca} ${i.modelo} ${i.numero_serie ?? ""}`]),
};

const SECOES = {
  resumo: { titulo: "Resumo" },
  suprimentos: {
    titulo: "Tintas e toners", url: "/api/suprimentos",
    campos: [
      ["nome", "Nome"], ["tipo", "Tipo", ["tinta", "toner"]], ["modelo", "Modelo"], ["cor", "Cor"],
      ["estoque_minimo", "Estoque mínimo", "number"], ["valor_unitario", "Valor unitário (R$)", "money"],
    ],
    colunas: [["nome", "Nome"], ["tipo", "Tipo"], ["modelo", "Modelo"], ["cor", "Cor"],
      ["quantidade", "Qtd."], ["estoque_minimo", "Mín."], ["valor_unitario", "Valor unit.", brl], ["valor_em_estoque", "Valor em estoque", brl]],
  },
  movimentos: {
    titulo: "Entradas / Saídas", url: "/api/movimentos",
    campos: [
      ["suprimento_id", "Suprimento", "suprimentos"], ["tipo", "Tipo", ["entrada", "saida"]],
      ["quantidade", "Quantidade", "number"], ["valor_unitario", "Valor unit. (vazio = padrão)", "money"],
      ["data", "Data", "date"], ["impressora_id", "Impressora (saída)", "impressoras", true], ["observacao", "Observação"],
    ],
    colunas: [["data", "Data"], ["tipo", "Tipo"], ["suprimento_id", "Suprimento #"], ["quantidade", "Qtd."],
      ["valor_unitario", "Valor unit.", brl], ["valor_total", "Total", brl], ["impressora_id", "Impressora #"]],
  },
  impressoras: {
    titulo: "Impressoras alugadas", url: "/api/impressoras",
    campos: [
      ["marca", "Marca"], ["modelo", "Modelo"], ["numero_serie", "Nº de série"], ["locadora", "Locadora"],
      ["local", "Local / setor"], ["data_inicio", "Início do contrato", "date"], ["data_fim", "Fim do contrato", "date"],
      ["valor_mensal", "Aluguel mensal (R$)", "money"], ["status", "Status", ["ativa", "manutencao", "devolvida"]],
    ],
    colunas: [["id", "#"], ["marca", "Marca"], ["modelo", "Modelo"], ["numero_serie", "Série"], ["locadora", "Locadora"],
      ["local", "Local"], ["valor_mensal", "Aluguel/mês", brl], ["status", "Status"]],
  },
  manutImpressoras: {
    titulo: "Manutenção de impressoras", url: "/api/manutencoes-impressora",
    campos: [["impressora_id", "Impressora", "impressoras"], ["data", "Data", "date"], ["descricao", "Descrição"],
      ["tecnico", "Técnico"], ["valor", "Valor (R$)", "money"]],
    colunas: [["data", "Data"], ["impressora_id", "Impressora #"], ["descricao", "Descrição"], ["tecnico", "Técnico"], ["valor", "Valor", brl]],
  },
  manutToners: {
    titulo: "Manutenção de toners", url: "/api/manutencoes-toner",
    campos: [["suprimento_id", "Toner", "toners"], ["data", "Data", "date"], ["servico", "Serviço (recarga, cilindro...)"],
      ["quantidade", "Quantidade", "number"], ["fornecedor", "Fornecedor"], ["valor", "Valor total (R$)", "money"]],
    colunas: [["data", "Data"], ["suprimento_id", "Toner #"], ["servico", "Serviço"], ["quantidade", "Qtd."], ["fornecedor", "Fornecedor"], ["valor", "Valor", brl]],
  },
};

const $conteudo = document.getElementById("conteudo");
const $abas = document.getElementById("abas");
let atual = "resumo";

async function campoHTML([nome, rotulo, tipo, opcional]) {
  if (Array.isArray(tipo))
    return `<label>${rotulo}<select name="${nome}">${tipo.map(o => `<option>${o}</option>`).join("")}</select></label>`;
  if (opcoes[tipo]) {
    const lista = await opcoes[tipo]();
    return `<label>${rotulo}<select name="${nome}" ${opcional ? "" : "required"}>
      ${opcional ? '<option value="">—</option>' : ""}${lista.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`;
  }
  const t = tipo === "money" ? 'number" step="0.01' : tipo || "text";
  return `<label>${rotulo}<input name="${nome}" type="${t}"></label>`;
}

function lerFormulario(form, campos) {
  const dados = {};
  for (const [nome, , tipo] of campos) {
    const v = form.elements[nome].value.trim();
    if (v === "") continue;  // campo vazio = usa padrão da API
    dados[nome] = ["number", "money"].includes(tipo) || opcoes[tipo] ? Number(v) : v;
  }
  return dados;
}

async function renderResumo() {
  const r = await api("/api/resumo");
  const cards = [
    ["Valor em estoque (tintas/toners)", brl(r.suprimentos.valor_em_estoque)],
    ["Unidades em estoque", r.suprimentos.unidades_em_estoque],
    ["Total de entradas", brl(r.suprimentos.valor_entradas)],
    ["Total de saídas", brl(r.suprimentos.valor_saidas)],
    ["Impressoras alugadas", r.impressoras.ativas],
    ["Aluguel mensal", brl(r.impressoras.aluguel_mensal)],
    ["Manutenção de impressoras", brl(r.manutencoes.impressoras)],
    ["Manutenção de toners", brl(r.manutencoes.toners)],
  ];
  $conteudo.innerHTML = `<div class="cards">${cards.map(([t, v]) => `<div class="card"><small>${t}</small><strong>${v}</strong></div>`).join("")}</div>
    ${r.suprimentos.abaixo_do_minimo.length ? `<p class="alerta">Abaixo do estoque mínimo: ${r.suprimentos.abaixo_do_minimo.join(", ")}</p>` : ""}`;
}

async function renderSecao(s) {
  const [campos, itens] = await Promise.all([Promise.all(s.campos.map(campoHTML)), api(s.url)]);
  $conteudo.innerHTML = `
    <form>${campos.join("")}<button>Salvar</button></form>
    <div class="tabela"><table>
      <thead><tr>${s.colunas.map(c => `<th>${c[1]}</th>`).join("")}<th></th></tr></thead>
      <tbody>${itens.map(i => `<tr class="${i.abaixo_do_minimo ? "alerta" : ""}">
        ${s.colunas.map(([k, , fmt]) => `<td>${fmt ? fmt(i[k]) : i[k] ?? ""}</td>`).join("")}
        <td><button data-id="${i.id}" title="Excluir">✕</button></td></tr>`).join("")}</tbody>
    </table></div>`;

  $conteudo.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    try { await api(s.url, { method: "POST", body: JSON.stringify(lerFormulario(e.target, s.campos)) }); render(); }
    catch (err) { alert(err.message); }
  };
  $conteudo.querySelectorAll("td button").forEach(b => b.onclick = async () => {
    if (confirm("Excluir este registro?")) { await api(`${s.url}/${b.dataset.id}`, { method: "DELETE" }); render(); }
  });
}

function render() {
  $abas.innerHTML = Object.entries(SECOES)
    .map(([k, s]) => `<button data-k="${k}" class="${k === atual ? "ativa" : ""}">${s.titulo}</button>`).join("");
  $abas.querySelectorAll("button").forEach(b => b.onclick = () => { atual = b.dataset.k; render(); });
  (atual === "resumo" ? renderResumo() : renderSecao(SECOES[atual])).catch(e => $conteudo.textContent = e.message);
}

render();
