#!/usr/bin/env node
'use strict';

/**
 * Importa todos os contatos de uma instancia da Evolution API para o Twenty,
 * reaproveitando o webhook ja existente que cria Person a partir do evento
 * "messages.upsert". Ver task.md nesta mesma pasta para o contexto completo.
 *
 * Uso:
 *   node --env-file=.env import-contacts.js
 *   (ou exporte as variaveis de ambiente listadas no .env.example antes de rodar)
 */

const fs = require('node:fs');
const path = require('node:path');

// --- .env fallback loader (para Node < 20.6, que nao tem --env-file) ------
function loadDotEnvFallback() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
loadDotEnvFallback();

// --- Config -----------------------------------------------------------
const config = {
  evolutionApiUrl: requireEnv('EVOLUTION_API_URL'),
  evolutionApiKey: requireEnv('EVOLUTION_API_KEY'),
  evolutionInstance: requireEnv('EVOLUTION_INSTANCE'),
  evolutionContactsPath: process.env.EVOLUTION_CONTACTS_PATH || '/chat/findContacts',
  twentyWebhookUrl: requireEnv('TWENTY_WEBHOOK_URL'),
  includeGroups: /^true$/i.test(process.env.INCLUDE_GROUPS || 'false'),
  limit: process.env.LIMIT ? Number(process.env.LIMIT) : null,
  delayMs: process.env.DELAY_MS ? Number(process.env.DELAY_MS) : 300,
  dryRun: /^true$/i.test(process.env.DRY_RUN || 'false'),
  outputLog: process.env.OUTPUT_LOG || path.join(__dirname, 'import-results.json'),
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] variavel de ambiente obrigatoria ausente: ${name}`);
    process.exit(1);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Evolution API ------------------------------------------------------
async function fetchContacts() {
  const url = `${trimSlash(config.evolutionApiUrl)}${config.evolutionContactsPath}/${config.evolutionInstance}`;
  console.log(`[evolution] buscando contatos em ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.evolutionApiKey,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const body = await safeText(response);
    throw new Error(
      `Falha ao buscar contatos na Evolution API (${response.status} ${response.statusText}): ${body}`,
    );
  }

  const data = await response.json();
  // Evolution API costuma retornar um array diretamente; alguns forks
  // envolvem em { contacts: [...] } ou { data: [...] } — cobrimos os dois.
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.contacts)) return data.contacts;
  if (Array.isArray(data.data)) return data.data;

  throw new Error('Formato de resposta inesperado ao buscar contatos na Evolution API');
}

function trimSlash(url) {
  return url.replace(/\/+$/, '');
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return '<sem corpo>';
  }
}

// --- Normalizacao ---------------------------------------------------------
function normalizeContact(raw) {
  const jid = raw.id || raw.remoteJid || raw.jid;
  if (!jid) return null;

  if (jid === 'status@broadcast') return null;
  if (!config.includeGroups && jid.endsWith('@g.us')) return null;

  const number = jid.split('@')[0];
  const pushName = raw.pushName || raw.name || raw.notify || number;

  return { jid, number, pushName };
}

function dedupeByNumber(contacts) {
  const seen = new Set();
  const result = [];
  for (const contact of contacts) {
    if (seen.has(contact.number)) continue;
    seen.add(contact.number);
    result.push(contact);
  }
  return result;
}

// --- Payload no formato do webhook existente (messages.upsert) ------------
function buildWebhookPayload(contact) {
  const now = new Date();
  return {
    event: 'messages.upsert',
    instance: config.evolutionInstance,
    apikey: config.evolutionApiKey,
    date_time: now.toISOString(),
    data: {
      key: {
        id: `IMPORT-${contact.number}-${now.getTime()}`,
        fromMe: false,
        remoteJid: contact.jid,
      },
      source: 'import-script',
      status: 'DELIVERY_ACK',
      message: {
        conversation: '[Contato importado automaticamente do WhatsApp]',
      },
      pushName: contact.pushName,
      instanceId: config.evolutionInstance,
      messageType: 'conversation',
      messageTimestamp: Math.floor(now.getTime() / 1000),
    },
  };
}

// --- Envio ao Twenty com retry ---------------------------------------------
async function postToTwenty(payload, attempt = 1) {
  const maxAttempts = 3;

  if (config.dryRun) {
    console.log(`[dry-run] payload que seria enviado:`, JSON.stringify(payload));
    return { ok: true, status: 0, dryRun: true };
  }

  try {
    const response = await fetch(config.twentyWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok && response.status >= 500 && attempt < maxAttempts) {
      const backoff = 500 * 2 ** (attempt - 1);
      console.warn(
        `[twenty] status ${response.status}, tentativa ${attempt}/${maxAttempts}, aguardando ${backoff}ms`,
      );
      await sleep(backoff);
      return postToTwenty(payload, attempt + 1);
    }

    return { ok: response.ok, status: response.status, body: await safeText(response) };
  } catch (err) {
    if (attempt < maxAttempts) {
      const backoff = 500 * 2 ** (attempt - 1);
      console.warn(
        `[twenty] erro de rede, tentativa ${attempt}/${maxAttempts}, aguardando ${backoff}ms: ${err.message}`,
      );
      await sleep(backoff);
      return postToTwenty(payload, attempt + 1);
    }
    return { ok: false, status: 0, error: err.message };
  }
}

// --- Main -------------------------------------------------------------
async function main() {
  console.log(
    `[config] instance=${config.evolutionInstance} dryRun=${config.dryRun} limit=${config.limit ?? 'sem limite'}`,
  );

  const rawContacts = await fetchContacts();
  console.log(`[evolution] ${rawContacts.length} contatos retornados pela API`);

  let contacts = rawContacts.map(normalizeContact).filter(Boolean);
  contacts = dedupeByNumber(contacts);
  console.log(`[filtro] ${contacts.length} contatos apos filtrar grupos/duplicados`);

  if (config.limit) {
    contacts = contacts.slice(0, config.limit);
    console.log(`[filtro] limitado a ${contacts.length} contatos (LIMIT=${config.limit})`);
  }

  const results = { success: [], failed: [] };

  for (const [index, contact] of contacts.entries()) {
    const payload = buildWebhookPayload(contact);
    const result = await postToTwenty(payload);

    const record = { number: contact.number, pushName: contact.pushName, jid: contact.jid };

    if (result.ok) {
      results.success.push(record);
      console.log(`[${index + 1}/${contacts.length}] OK  ${contact.pushName} (${contact.number})`);
    } else {
      results.failed.push({ ...record, status: result.status, error: result.error || result.body });
      console.error(
        `[${index + 1}/${contacts.length}] FALHA ${contact.pushName} (${contact.number}) — status ${result.status}`,
      );
    }

    if (config.delayMs > 0 && index < contacts.length - 1) {
      await sleep(config.delayMs);
    }
  }

  fs.writeFileSync(config.outputLog, JSON.stringify(results, null, 2));

  console.log('\n--- Resumo ---');
  console.log(`Total processado: ${contacts.length}`);
  console.log(`Sucesso: ${results.success.length}`);
  console.log(`Falha: ${results.failed.length}`);
  console.log(`Log salvo em: ${config.outputLog}`);

  if (results.failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
