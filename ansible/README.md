# Ansible — provisionamento Twenty + Dify + Cloudflare Tunnel

Automatiza em uma VM nova exatamente o que já roda manualmente hoje: Docker,
o clone deste repositório (com os submódulos `dify/` e `twenty/`), os stacks
`docker compose` de cada um, e o cliente `cloudflared` expondo os serviços
pelos mesmos hostnames (`twenty.<domínio>`, `dify.<domínio>`, `ssh.<domínio>`).

Não provisiona a VM em si (sem Terraform/cloud API) nem cria o Cloudflare
Tunnel — assume que a VM já existe e que o tunnel já foi criado uma vez.

## Pré-requisitos

1. **VM alvo**: Ubuntu 22.04+, acesso SSH com um usuário sudo.
2. **Acesso ao GitHub na VM alvo**: como `obliviate-crm-tatto` é privado, a
   VM precisa conseguir clonar via SSH — configure uma
   [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
   no repo (somente leitura) e coloque a chave privada em `~/.ssh` do usuário
   `ansible_user`, ou use agent forwarding (`ansible_ssh_extra_args:
   -o ForwardAgent=yes` no inventário).
3. **Cloudflare Tunnel já existente** (criado uma vez, reutilizado por todas
   as VMs, ou um por VM se preferir):
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create obliviate-crm
   ```
   Isso gera um `tunnel_id` e um arquivo de credenciais JSON
   (`~/.cloudflared/<tunnel_id>.json`) — ambos vão para `vault.yml`.
   Os registros DNS (`twenty.<domínio>` etc. → `<tunnel_id>.cfargotunnel.com`)
   ainda precisam existir no Cloudflare (dashboard ou `cloudflared tunnel
   route dns`) — isso também não é gerenciado por este playbook.

## Configuração

```bash
cd ansible
cp inventory/hosts.example.ini inventory/hosts.ini      # editar com o IP/usuário da VM
cp group_vars/all/vault.yml.example group_vars/all/vault.yml  # editar com os segredos reais
ansible-vault encrypt group_vars/all/vault.yml
```

Ajuste `group_vars/all/vars.yml` se o domínio, as portas locais ou o
hostname `ssh.*` forem diferentes do ambiente atual (`liracraft.store`).

`inventory/hosts.ini` e `group_vars/all/vault.yml` (a versão real, não a
`.example`) estão no `.gitignore` — nunca commitar.

## Rodando

```bash
ansible-playbook site.yml --ask-vault-pass
```

Isso, por VM no grupo `crm_hosts`:

- instala Docker Engine + plugin `docker compose`;
- clona/atualiza `obliviate-crm-tatto` em `~/workspace/crm-obliviate`
  (`git submodule` incluso via `recursive: true`);
- gera `dify/docker/.env` e `twenty/packages/twenty-docker/.env` a partir dos
  respectivos `.env.example`, sobrescrevendo apenas as chaves sensíveis
  (`SECRET_KEY`, senhas de DB/Redis, `ENCRYPTION_KEY`, `SERVER_URL`, porta
  exposta do nginx do Dify) com os valores do vault;
- sobe os dois stacks (`docker compose up -d`);
- instala e configura o `cloudflared` como serviço systemd, com o
  `config.yml` de ingress gerado a partir de `cloudflare_ingress` em
  `vars.yml`.

## Replicando para outra VM/cliente

Adicione um host novo em `inventory/hosts.ini`, e se for um domínio/tunnel
diferente, mova `base_domain`, as portas e as credenciais do tunnel para
`group_vars/<nome-do-host>/` (ou crie um novo grupo) em vez de editar
`group_vars/all`, que hoje assume um único ambiente.
