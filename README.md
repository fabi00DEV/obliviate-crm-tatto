# obliviate-crm-tatto

CRM para estúdio de tatuagem, construído sobre [Twenty](https://github.com/twentyhq/twenty)
(CRM) e [Dify](https://github.com/langgenius/dify) (plataforma de agentes de IA),
com automações específicas do negócio em `tasks/`.

## Estrutura

- `dify/` — submódulo git apontando para `langgenius/dify`.
- `twenty/` — submódulo git apontando para `twentyhq/twenty`.
- `tasks/` — tarefas e scripts de automação específicos deste projeto
  (ex: import de contatos do WhatsApp, follow-up de clientes, extração de
  detalhes de tatuagem via agente).
- `ansible/` — infraestrutura como código para replicar o ambiente (Docker,
  os stacks do Dify e do Twenty, e o cliente Cloudflare Tunnel) em novas VMs.
  Ver [`ansible/README.md`](ansible/README.md).

## Clonando o repositório

`dify/` e `twenty/` são submódulos git — não vêm preenchidos em um clone
normal. Para trazer o conteúdo deles junto:

```bash
git clone --recurse-submodules git@github.com:fabi00DEV/obliviate-crm-tatto.git
```

Se já clonou sem a flag, inicialize os submódulos depois:

```bash
git submodule update --init --recursive
```

## Segredos

Nenhuma credencial deve ser commitada. Arquivos `.env` são ignorados pelo
`.gitignore` — use os `.env.example` de cada tarefa como referência e
preencha os valores reais localmente, sem versionar.
