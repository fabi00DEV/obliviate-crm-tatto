# Task 1 — Import de todos os contatos do WhatsApp do cliente

## Descrição

O cliente já tem um número de WhatsApp conectado via **Evolution API**. Hoje,
contatos só entram no Twenty de forma reativa: quando alguém manda mensagem,
um Workflow do Twenty (trigger de webhook) recebe o evento `messages.upsert`
da Evolution API e cria o `Person` a partir dos campos `data.pushName` (nome)
e `data.key.remoteJid` (JID/telefone).

Isso deixa de fora todo o histórico: contatos que já existiam na agenda do
WhatsApp antes desse webhook existir, ou que nunca mandaram mensagem depois
dele estar ativo. A tarefa é fazer uma importação em lote (one-off, mas
reexecutável) de **todos** os contatos já salvos na instância da Evolution
API, reaproveitando o mesmo ponto de entrada (webhook) que já cria `Person`
no Twenty — sem precisar criar um segundo caminho de criação de contato.

## Formato de referência (webhook existente)

O webhook do Twenty já em produção recebe hoje o evento `messages.upsert` da
Evolution API, deste formato (exemplo real, truncado nos campos irrelevantes):

```json
{
  "event": "messages.upsert",
  "instance": "Fausto",
  "apikey": "<sua-apikey-aqui>",
  "date_time": "2026-08-12T18:38:22.061Z",
  "data": {
    "key": {
      "id": "AC7610723059A7DE3C00CB7B12CB3F83",
      "fromMe": false,
      "remoteJid": "554888098989@s.whatsapp.net"
    },
    "pushName": "Fábio Carvalho",
    "instanceId": "2c532251-928c-40d5-827a-a16aadfdadfc",
    "messageType": "conversation",
    "message": { "conversation": "Hellyeah" }
  }
}
```

Dele, o Workflow do Twenty extrai:
- **nome** ← `data.pushName`
- **JID** ← `data.key.remoteJid`
- **telefone** ← número antes do `@` em `data.key.remoteJid`

## Solução implementada

Script `import-contacts.js` (Node.js, sem dependências externas — usa o
`fetch` nativo do Node ≥ 18):

1. **Busca os contatos** na Evolution API (`POST /chat/findContacts/{instance}`,
   endpoint padrão do Evolution API v2 — ajustável via
   `EVOLUTION_CONTACTS_PATH` caso a versão do cliente use outra rota).
2. **Filtra e normaliza**: descarta grupos (`@g.us`), broadcast
   (`status@broadcast`) e duplicados; extrai `pushName`/`name` e o número a
   partir do JID.
3. **Reaproveita o webhook existente**: para cada contato, monta um payload
   com a *mesma estrutura* do `messages.upsert` acima (mesmos campos que o
   Workflow do Twenty já sabe ler — `data.pushName`, `data.key.remoteJid`,
   `event`, `instance`, `apikey`), preenchendo a mensagem com um texto
   neutro de importação. Isso evita ter que criar/duplicar lógica de criação
   de `Person` dentro do Twenty: é o mesmo Workflow, só que disparado por um
   script em vez de por uma mensagem real.
4. **Envia com throttle** (delay configurável entre requisições) para não
   sobrecarregar o Workflow/Twenty, com retry exponencial em erros
   transitórios (5xx / rede).
5. **Loga o resultado** (sucesso/falha por contato) em um JSON de saída, para
   auditoria e possível reprocessamento apenas dos que falharam.
6. Suporta `DRY_RUN=true` para simular sem de fato enviar ao Twenty, e
   `LIMIT` para testar com poucos contatos antes de rodar a base inteira.

### ⚠️ Ponto de atenção

O Workflow do Twenty que hoje cria o `Person` pode ter alguma condição de
gatilho mais restrita do que só "existe `pushName` e `remoteJid`" (por
exemplo, filtrar por `event == "messages.upsert"` especificamente, ou exigir
`message.conversation` não vazio). O script já envia `event: "messages.upsert"`
e um `message.conversation` de placeholder para maximizar compatibilidade,
mas **confirme no Workflow do Twenty (Settings → Workflows) se há algum outro
filtro na trigger** antes de rodar a importação completa. Rode primeiro com
`LIMIT=3` para validar de ponta a ponta.

### Idempotência

O script não verifica duplicidade do lado do Twenty (não temos acesso de
leitura à API do Twenty nesta tarefa, só ao webhook de criação). Se o
Workflow do Twenty já faz upsert por telefone/JID (comportamento comum), rodar
o script mais de uma vez é seguro. Se não fizer, verifique isso antes de
reexecutar em produção.

## Como rodar

```bash
cd tasks/01-import-contatos-whatsapp
cp .env.example .env   # preencha com os dados reais
node --env-file=.env import-contacts.js
# ou, em Node < 20.6, exporte as variáveis do .env manualmente / use `env $(cat .env | xargs) node import-contacts.js`
```

Variáveis de ambiente (ver `.env.example`):

| Variável | Obrigatória | Descrição |
|---|---|---|
| `EVOLUTION_API_URL` | sim | Base URL da Evolution API (ex: `http://localhost:8080`) |
| `EVOLUTION_API_KEY` | sim | API key da instância na Evolution API |
| `EVOLUTION_INSTANCE` | sim | Nome da instância (ex: `Fausto`) |
| `EVOLUTION_CONTACTS_PATH` | não (default `/chat/findContacts`) | Path do endpoint de contatos, caso a versão da Evolution API do cliente use outro |
| `TWENTY_WEBHOOK_URL` | sim | URL do webhook do Twenty que já cria `Person` |
| `INCLUDE_GROUPS` | não (default `false`) | Incluir JIDs de grupo (`@g.us`) na importação |
| `LIMIT` | não | Limita quantos contatos processar (para teste) |
| `DELAY_MS` | não (default `300`) | Delay entre cada chamada ao webhook do Twenty |
| `DRY_RUN` | não (default `false`) | Se `true`, só loga o payload sem enviar |
| `OUTPUT_LOG` | não (default `./import-results.json`) | Onde salvar o log de resultado |

Ao final, o script imprime um resumo (`total`, `sucesso`, `falha`, `pulados`)
e grava o detalhe por contato em `OUTPUT_LOG`.
