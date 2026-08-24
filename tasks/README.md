# Tasks — Automações CRM (Twenty + Evolution API + Dify)

Índice das tarefas de automação para os clientes do Twenty. Cada tarefa tem sua
própria pasta/arquivo `.md` com descrição do problema e a solução proposta
(ou já implementada). Quando a tarefa exige código, o script é feito em
Node.js e fica dentro da pasta da própria tarefa.

## Stack envolvida

- **Twenty** (`../twenty`) — CRM. Fonte de verdade dos contatos (`Person`),
  possui Workflows internos (triggers por webhook, tempo/cron, atualização de
  registro) e uma API GraphQL/REST própria.
- **Evolution API** — gateway não-oficial do WhatsApp. Expõe endpoints REST
  para consultar contatos/chats de uma instância e dispara webhooks
  (`messages.upsert`, etc.) quando eventos acontecem.
- **Dify** (`../dify`) — orquestração de agentes/LLM. Usado para lógica de
  conversação, extração estruturada de dados e decisão de follow-up.

## Status das tarefas

| # | Tarefa | Status |
|---|--------|--------|
| 1 | [Import de contatos do WhatsApp](./01-import-contatos-whatsapp/task.md) | ✅ Implementada (script Node.js) |
| 2 | [Follow-up encadeado de clientes sem resposta](./02-follow-up-clientes-sem-resposta.md) | 📝 Especificada — pendente de decisões do cliente |
| 3 | [Filtro/link para reengajar quem não respondeu](./03-filtro-clientes-sem-resposta-link.md) | 📝 Especificada — pendente de definição de UX |
| 4 | [Agent de extração de detalhes de tatuagem](./04-agent-extracao-detalhes-tatuagem.md) | 📝 Especificada — pronta para implementar |

## Convenção de cada tarefa

- `task.md` (ou `NN-nome.md` quando não precisa de script): descrição do
  problema, decisões em aberto e solução proposta/implementada.
- Se houver script: `package.json` (sem dependências externas quando
  possível, usando `fetch` nativo do Node ≥ 18) + `.env.example` com as
  variáveis necessárias.
