# Task 3 — Filtro de contatos sem resposta com link para enviar mensagem

## Descrição

Diferente da [Task 2](./02-follow-up-clientes-sem-resposta.md) (que é
automática/em cadeia), aqui o objetivo é dar para o time comercial uma
**lista filtrada, dentro do Twenty**, de quem não respondeu, com uma ação
rápida (link/botão) para disparar manualmente uma mensagem — sem precisar
sair do CRM ou abrir o WhatsApp Web para achar a conversa.

## Decisões em aberto (a definir)

- **"Link configurado"**: precisa ser esclarecido com o cliente qual das
  opções abaixo ele quer:
  1. Um botão/ação dentro do próprio Twenty (linha da lista ou no registro
     do contato) que dispara uma mensagem pré-definida via Evolution API
     (sem sair do CRM, sem WhatsApp Web).
  2. Um link `https://wa.me/<numero>?text=<mensagem>` que abre o WhatsApp
     (Web ou app) já com a mensagem preenchida, exigindo clique manual de
     "enviar" — mais simples, mas não é 100% automático nem fica registrado
     no Twenty automaticamente.
  3. Ação em massa (selecionar vários contatos da lista e disparar a mesma
     mensagem para todos de uma vez) vs. ação individual por contato.
- **Critério de "não respondeu"**: mesmo campo/lógica de
  `Última interação em` da Task 2, ou um critério próprio (ex: só contatos
  que nunca tiveram nenhuma resposta, diferente de "não respondeu ao último
  follow-up")?
- **Qual mensagem enviar pelo link**: fixa, ou várias opções/templates para
  quem for usar escolher?

## Proposta de solução (Twenty)

### Filtro/lista

- Criar uma **View salva** no Twenty sobre `Person` (ou `Opportunity`)
  filtrando por `Última interação em` mais antiga que N dias **e**
  `Última interação foi da empresa` (para não listar quem já respondeu).
  Esses campos já existem/serão criados como parte da Task 2 — reaproveitar.

### Ação de envio

- **Opção recomendada (1 acima)**: usar um **Workflow do Twenty com trigger
  manual** (Twenty suporta botão de ação em registro/lista que dispara um
  Workflow). O Workflow chama um webhook próprio (pequeno serviço Node.js,
  igual em espírito ao da Task 1) que por sua vez chama a Evolution API
  (`POST /message/sendText/{instance}`) para mandar a mensagem, e registra
  a atividade/nota no `Person` para manter o histórico.
- Se o cliente preferir a opção 2 (link `wa.me`), não precisa de nenhum
  script: basta um campo fórmula/rich-text no Twenty (ou um botão de link
  externo) que monta a URL `https://wa.me/<numero>?text=<mensagem
  codificada>` a partir do telefone do contato. É a opção mais simples de
  implementar, mas não fica registrado automaticamente no Twenty (alguém
  precisa marcar manualmente que enviou).

## Próximo passo

Validar com o cliente qual das 3 opções de "link" ele quer (sugestão: perguntar
mostrando as opções 1 e 2 lado a lado, já que têm esforço e comportamento bem
diferentes) e só então implementar.
