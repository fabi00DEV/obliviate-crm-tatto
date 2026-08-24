# Task 4 — Agent para extrair detalhes da tatuagem (exceto orçamento)

## Descrição

Criar um agente que, durante a conversa no WhatsApp, extrai automaticamente
os detalhes do pedido de tatuagem do cliente — **exceto orçamento/valor**,
que fica de fora de propósito (provavelmente porque isso é tratado à parte,
por um humano, para não travar negociação com um número gerado por IA) —
e salva essas informações estruturadas no Twenty, vinculadas ao contato.

## Campos a extrair (proposta inicial — validar com o cliente)

- Estilo (ex: realismo, old school, fineline, blackwork...)
- Tamanho aproximado
- Local do corpo
- Referências (descrição textual; se vierem imagens, ao menos registrar que
  existem referências anexadas)
- Cor ou preto e cinza
- Prazo/urgência desejada
- Observações livres (alergias, tatuagens já existentes na região, etc.)
- **Explicitamente NÃO extrair/perguntar**: orçamento, forma de pagamento

## Proposta de solução (Dify + Twenty)

### Fluxo

1. **Gatilho**: o mesmo webhook `messages.upsert` da Evolution API (ver
   [Task 1](./01-import-contatos-whatsapp/task.md)) já dispara hoje para
   criar o `Person`. Ele passa a também encaminhar a mensagem para um
   **Dify Workflow/Agent** (via API do Dify), enviando o texto da mensagem
   e o histórico recente da conversa daquele contato.
2. **Extração (Dify)**: um Agent/Chatflow no Dify com um prompt de sistema
   focado em extração estruturada, com saída em **JSON** (usar o recurso de
   "structured output"/JSON schema do Dify) contendo os campos acima.
   Regras importantes no prompt:
   - Nunca perguntar sobre orçamento/valor/forma de pagamento.
   - Se um campo não foi mencionado ainda na conversa, retornar `null`
     em vez de inventar.
   - Rodar a cada nova mensagem, acumulando/atualizando os campos já
     conhecidos (merge com o que já foi extraído antes, não substituir do
     zero) — ou seja, o Dify precisa ter acesso ao estado atual salvo no
     Twenty para fazer o merge, não só à mensagem nova.
3. **Persistência (Twenty)**: o próprio Dify Workflow, no final, faz uma
   chamada HTTP (node "HTTP Request" do Dify) para a API do Twenty
   (GraphQL ou REST) atualizando os campos custom do `Person` (ou de um
   objeto custom dedicado, ver abaixo) correspondente ao telefone/JID do
   remetente.

### Modelagem no Twenty

Duas opções, a decidir:
- **Campos custom direto em `Person`**: mais simples, mas polui o objeto de
  contato com dados que só fazem sentido para quem pediu tatuagem.
- **Objeto custom `Pedido de Tatuagem`** (recomendado): um novo objeto no
  Data Model do Twenty, relacionado 1:N com `Person` (um cliente pode pedir
  mais de uma tatuagem ao longo do tempo), com os campos listados acima.
  Fica mais organizado para reportar/filtrar depois (ex: "quantos pedidos
  de realismo este mês").

### Identificação do contato

- Casar a mensagem recebida com o `Person`/`Pedido de Tatuagem` certo pelo
  telefone extraído do `remoteJid` (mesma lógica de normalização usada na
  Task 1), não pelo `pushName` (que pode mudar/repetir).

## Pré-requisitos antes de implementar

1. Criar o objeto/campos no Twenty (Settings → Data Model).
2. Ter a API do Twenty acessível com uma API key (Settings → API & Webhooks)
   para o Dify conseguir gravar de volta.
3. Confirmar limite de o quê o agente pode perguntar proativamente (o
   agente só extrai do que o cliente já disse, ou tem liberdade de fazer
   perguntas de esclarecimento no meio da conversa? Se sim, isso muda o
   agente de "extrator passivo" para "assistente de triagem ativo").

## Próximo passo

Esta é a mais pronta para implementar das três pendentes — as únicas
decisões realmente em aberto são o modelo de dados (objeto custom vs.
campos em `Person`) e se o agente pode fazer perguntas ativamente. Depois de
alinhar isso, a implementação segue o mesmo padrão de integração da Task 1
(webhook Evolution API → processamento → API do Twenty), só que passando
pelo Dify no meio para a parte de extração/LLM.
