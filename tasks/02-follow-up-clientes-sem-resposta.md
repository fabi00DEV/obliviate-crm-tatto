# Task 2 — Follow-up de clientes que não responderam (mensagens encadeadas)

## Descrição

Quando um cliente manda mensagem (ou recebe uma proposta/orçamento) e não
responde, hoje ninguém retoma o contato automaticamente. A ideia é criar uma
sequência de follow-up: se o contato não responde em X tempo, dispara a
próxima mensagem de uma cadeia pré-definida (ex: "oi, ainda tem interesse?"
→ depois de mais alguns dias → "última tentativa, still there?"), até um
limite de tentativas ou até o cliente responder.

## Decisões em aberto (definir com o cliente antes de implementar)

- **Recorrência**: depois de quanto tempo sem resposta dispara o próximo
  passo da cadeia? Provavelmente diferente por etapa (ex: 24h → 3 dias →
  7 dias). Pode variar por tipo de contato (lead novo vs. orçamento
  enviado vs. cliente recorrente)?
- **Quantidade de mensagens na cadeia** e o que cada uma diz.
- **Automático total ou com aprovação humana**? Ou seja: o sistema manda
  sozinho, ou gera um rascunho que alguém aprova/edita antes de enviar
  (importante em WhatsApp, onde mensagens automáticas em excesso podem gerar
  bloqueio do número)?
- O que conta como "resposta"? Qualquer mensagem do cliente após o último
  envio da empresa, ou precisa ser uma resposta "de conteúdo" (ex: não conta
  um simples "👍")?
- O que acontece ao fim da cadeia sem resposta (marca como perdido/inativo?
  move de estágio no funil? notifica um humano?).

## Proposta de solução (Twenty + Dify)

### Modelagem no Twenty

- Usar o pipeline/`Opportunity` (ou um campo custom em `Person`, se o
  cliente não usa oportunidades) com um campo `Estágio de Follow-up`
  (ex: `Aguardando resposta`, `Follow-up 1 enviado`, `Follow-up 2 enviado`,
  `Sem resposta — encerrado`) e um campo `Última interação em` (timestamp).
- Toda mensagem recebida via webhook da Evolution API (o mesmo usado na
  [Task 1](./01-import-contatos-whatsapp/task.md)) atualiza
  `Última interação em` e reseta o estágio para `Aguardando resposta`
  quando é o cliente quem escreve.

### Motor de disparo (cron)

- Um Workflow do Twenty com trigger por tempo (ou um cron externo simples em
  Node.js, já que a stack do projeto favorece Node) roda periodicamente
  (ex: a cada hora) e consulta via API do Twenty os registros cujo
  `Última interação em` passou do threshold definido para o estágio atual.
- Para cada registro elegível, chama um workflow do **Dify** (exposto como
  API) passando `person_id`, telefone/JID, histórico recente e o estágio
  atual.

### Geração e envio da mensagem (Dify)

- Um Dify Workflow/Chatflow recebe o contato + estágio, escolhe o template
  daquela etapa da cadeia (ou gera uma variação com LLM, se quisermos
  personalização), e:
  - **se automático total**: chama a Evolution API (`POST /message/sendText/{instance}`)
    para enviar a mensagem, depois chama a API do Twenty para avançar o
    `Estágio de Follow-up` e atualizar `Última interação em` (para não
    dispersar de novo antes do próximo intervalo).
  - **se precisa aprovação**: em vez de enviar direto, grava a mensagem
    sugerida em uma `Task`/`Note` no Twenty vinculada ao contato (ou manda
    para um canal interno do time), e só envia quando alguém aprovar
    (poderia ser um segundo Workflow disparado por mudança de status da
    Task para "Aprovado").

### Por que essa divisão

- Twenty guarda o estado (fonte de verdade de quem está em qual etapa).
- Dify decide o conteúdo/orquestra a conversa (fácil trocar templates,
  adicionar personalização com LLM, sem mexer em código).
- Evolution API só executa o envio.

## Próximo passo

Depois de fechar as decisões acima com o cliente, criar:
1. Os campos custom em `Person`/`Opportunity` no Twenty.
2. O Dify Workflow com os templates da cadeia.
3. O script/cron Node.js (ou Workflow nativo do Twenty, se suportar
   trigger por tempo com a granularidade necessária) que varre e dispara.
