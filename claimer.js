#!/usr/bin/env node
/**
 * GOG Free Game Claimer
 * ----------------------
 * Hits https://www.gog.com/giveaway/claim with your GOG session cookies.
 * A simple authenticated GET is all it takes — GOG adds the game to your
 * library automatically. No browser, no Playwright, no captchas.
 *
 * Usage:
 *   node claimer.js             # claim now
 *   node claimer.js --dry-run   # test cookies without claiming
 */

import 'dotenv/config';
import chalk from 'chalk';

const CLAIM_URL  = 'https://www.gog.com/giveaway/claim';
const CHECK_URL  = 'https://www.gog.com/userData.json';
const DRY_RUN    = process.argv.includes('--dry-run');
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL?.trim();
const APP_NAME = 'GOG Free Game Claimer';

// ── helpers ──────────────────────────────────────────────────────────────────

function getCookies() {
  const cookie = process.env.GOG_COOKIE;
  if (!cookie || cookie.trim() === '') {
    console.error(chalk.red('❌  GOG_COOKIE is not set in your .env file.'));
    console.error(chalk.yellow('    See README.md for how to get your cookies.'));
    process.exit(1);
  }
  return cookie.trim();
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function sendDiscordUpdate(level, message) {
  if (!WEBHOOK_URL) return;

  const colors = {
    info: 0x5865F2,   // blurple
    warn: 0xF1C40F,   // yellow
    error: 0xE74C3C,  // red
    success: 0x2ECC71 // green
  };

  const levelLabel = {
    info: 'INFO',
    warn: 'WARNING',
    error: 'ERROR',
    success: 'SUCCESS',
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: APP_NAME,
            description: message.slice(0, 3500),
            color: colors[level] ?? colors.info,
            footer: { text: levelLabel[level] ?? levelLabel.info },
            timestamp: new Date().toISOString(),
          }
        ]
      }),
    });

    if (!res.ok) {
      console.error(chalk.yellow(`⚠️  Discord webhook failed: HTTP ${res.status}`));
    }
  } catch (err) {
    console.error(chalk.yellow(`⚠️  Discord webhook error: ${err.message}`));
  }
}

async function logEvent(level, consoleMessage, discordMessage = null) {
  if (level === 'error') console.error(consoleMessage);
  else if (level === 'warn') console.warn(consoleMessage);
  else console.log(consoleMessage);

  const payload = discordMessage ?? consoleMessage;
  await sendDiscordUpdate(level, payload);
}

// ── core claim logic ──────────────────────────────────────────────────────────

async function verifyAuth(cookie) {
  const res = await fetch(CHECK_URL, {
    headers: {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    },
  });

  if (!res.ok) throw new Error(`Auth check failed: HTTP ${res.status}`);

  const data = await res.json();
  if (!data.isLoggedIn) throw new Error('Cookies are invalid or expired — not logged in.');

  return data.username || data.email || 'unknown';
}

async function claimGiveaway(cookie, dryRun = false) {
  if (dryRun) {
    await logEvent('info', chalk.yellow('🧪  DRY RUN — skipping actual claim request.'), '🧪 DRY RUN — skipping actual claim request.');
    return { status: 'dry-run' };
  }

  const res = await fetch(CLAIM_URL, {
    method: 'GET',
    headers: {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.gog.com/',
    },
    redirect: 'follow',
  });

  const text = await res.text();

  // Parse the JSON response if possible
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON response is fine */ }

  return { status: res.status, ok: res.ok, json, raw: text };
}

function interpretResult(result) {
  if (result.status === 'dry-run') return { outcome: 'dry-run', title: null };

  const { json, raw, status } = result;

  // Already claimed responses
  if (json?.message?.toLowerCase().includes('already'))
    return { outcome: 'already_claimed', title: json.game?.title ?? null };

  if (raw?.toLowerCase().includes('already claimed'))
    return { outcome: 'already_claimed', title: null };

  // Success — GOG returns game info
  if (json?.checksum || json?.productId || json?.game)
    return { outcome: 'claimed', title: json.game?.title ?? json.title ?? 'Unknown Game' };

  // No active giveaway
  if (status === 404 || raw?.includes('notFound') || raw?.includes('No giveaway'))
    return { outcome: 'no_giveaway', title: null };

  // HTTP error
  if (!result.ok)
    return { outcome: 'error', title: null, detail: `HTTP ${status}: ${raw?.slice(0, 100)}` };

  // Empty / ambiguous response — treat as claimed (GOG sometimes returns empty on success)
  return { outcome: 'claimed', title: null };
}

// ── main run ──────────────────────────────────────────────────────────────────

async function run() {
  const now = timestamp();
  await logEvent('info', chalk.blue(`\n[${now}] GOG Free Game Claimer starting...`), `Run started at ${now}`);

  const cookie = getCookies();

  // 1. Verify we're actually logged in
  let username;
  try {
    username = await verifyAuth(cookie);
    await logEvent('success', chalk.green(`Authenticated as: ${username}`), `Authenticated as: ${username}`);
  } catch (err) {
    await logEvent('error', chalk.red(`Auth failed: ${err.message}`), `Auth failed: ${err.message}`);
    process.exit(1);
  }

  // 2. Hit the claim endpoint
  let result;
  try {
    result = await claimGiveaway(cookie, DRY_RUN);
  } catch (err) {
    await logEvent('error', chalk.red(`Claim request failed: ${err.message}`), `Claim request failed: ${err.message}`);
    process.exit(1);
  }

  // 3. Interpret the response
  const { outcome, title, detail } = interpretResult(result);


  const entry = { timestamp: now, outcome, title, username };

  switch (outcome) {
    case 'claimed':
      await logEvent(
        'success',
        chalk.green(`Claimed${title ? ': ' + title : ' a free game'}. Check your GOG library.`),
        `Claimed${title ? `: ${title}` : ' a free game'} on GOG.`,
      );
      break;

    case 'already_claimed':
      await logEvent(
        'info',
        chalk.cyan(`Already claimed${title ? ': ' + title : ' the current giveaway'}.`),
        `Already claimed${title ? `: ${title}` : ' the current giveaway'}.`,
      );
      break;

    case 'no_giveaway':
      await logEvent('warn', chalk.yellow('No active giveaway on GOG right now.'), 'No active giveaway on GOG right now.');
      break;

    case 'dry-run':
      await logEvent('info', chalk.yellow('Dry run complete: cookies are valid.'), 'Dry run complete: cookies are valid.');
      break;

    case 'error':
      await logEvent('error', chalk.red(`Error: ${detail}`), `Error: ${detail}`);
      process.exit(1);
  }

  await logEvent(
    'info',
    chalk.gray(`    Raw response: ${JSON.stringify(result.json ?? result.raw?.slice(0, 120) ?? '(empty)')}`),
    `Raw response: ${JSON.stringify(result.json ?? result.raw?.slice(0, 120) ?? '(empty)')}`,
  );
}

// ── entry point ───────────────────────────────────────────────────────────────

run().catch(err => {
  console.error(chalk.red('Fatal error:'), err); // May happen before runtime logger is available
  process.exit(1);
});
