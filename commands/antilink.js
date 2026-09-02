// plugins/antilink.js
const { bot, getData, setData } = require('../lib/');

// ── Default settings ──
const DEFAULT_ACTION = 'warn';   // 'warn' or 'kick'
const DEFAULT_LIMIT = 3;

// ── Link detection patterns ──
const LINK_PATTERNS = [
  /https?:\/\/(?:chat\.whatsapp\.com|wa\.me)\/\S+/gi,
  /https?:\/\/[^\s]+/gi,   // any link (optional)
  /@[^\s]+/gi             // mentions? but we handle links only
];

// ── Toggle anti‑link ──
bot({
  pattern: 'antilink ?(.*)',
  desc: 'Toggle anti‑link protection',
  type: 'group',
  onlyGroup: true,
}, async (message, match) => {
  if (!match) return await message.send('*Usage:* .antilink on/off');

  if (match === 'on' || match === 'off') {
    const enabled = match === 'on';
    await setData(`antilink_${message.jid}`, enabled, message.id);
    return await message.send(
      enabled ? '✅ Anti‑link activated' : '❌ Anti‑link deactivated'
    );
  }
  return await message.send('*Usage:* .antilink on/off');
});

// ── Set action ──
bot({
  pattern: 'antilink action ?(.*)',
  desc: 'Set action: warn or kick',
  type: 'group',
  onlyGroup: true,
}, async (message, match) => {
  if (!match || !['warn', 'kick'].includes(match.toLowerCase())) {
    return await message.send('*Usage:* .antilink action warn/kick');
  }
  await setData(`antilink_action_${message.jid}`, match.toLowerCase(), message.id);
  await message.send(`✅ Anti‑link action set to ${match.toLowerCase()}`);
});

// ── Set warn limit ──
bot({
  pattern: 'antilink limit ?(.*)',
  desc: 'Set warn limit before kick (default 3)',
  type: 'group',
  onlyGroup: true,
}, async (message, match) => {
  const num = parseInt(match);
  if (!num || num < 1) return await message.send('*Usage:* .antilink limit <number> (min 1)');
  await setData(`antilink_limit_${message.jid}`, num, message.id);
  await message.send(`✅ Anti‑link limit set to ${num}`);
});

// ── Clear warnings for a user ──
bot({
  pattern: 'antilink clear ?(.*)',
  desc: 'Clear warnings for a user (mention or reply)',
  type: 'group',
  onlyGroup: true,
}, async (message, match) => {
  const target = message.mention[0] || message.reply_message?.sender;
  if (!target) return await message.send('*Usage:* .antilink clear @user or reply to user');
  const key = `antilink_warn_${message.jid}_${target}`;
  await setData(key, 0, message.id);
  await message.send(`✅ Warnings cleared for @${target.split('@')[0]}`, { mentions: [target] });
});

// ── Event: Message handler ──
bot({
  on: 'text',
  fromMe: false,
  type: 'group'
}, async (message) => {
  const jid = message.jid;
  // Check if anti‑link is enabled for this group
  const isEnabled = await getData(`antilink_${jid}`, message.id);
  if (!isEnabled) return;

  // Skip if sender is sudo or bot itself
  if (message.sudo || message.fromMe) return;

  const body = message.text || '';
  const hasLink = LINK_PATTERNS.some(pattern => pattern.test(body));
  if (!hasLink) return;

  // Get action and limit
  const action = await getData(`antilink_action_${jid}`) || DEFAULT_ACTION;
  const limit = await getData(`antilink_limit_${jid}`) || DEFAULT_LIMIT;

  // ── Delete the message ──
  try {
    await message.client.sendMessage(jid, { delete: message.key });
  } catch (err) {
    console.error('Delete failed:', err.message);
  }

  if (action === 'kick') {
    // Kick immediately
    try {
      await message.client.groupParticipantsUpdate(jid, [message.participant], 'remove');
      await message.send(`⚠️ @${message.participant.split('@')[0]} kicked for sending link.`, {
        mentions: [message.participant]
      });
    } catch (err) {
      console.error('Kick error:', err.message);
    }
    return;
  }

  // ── Warn mode ──
  const warnKey = `antilink_warn_${jid}_${message.participant}`;
  let warnCount = await getData(warnKey) || 0;
  warnCount++;
  await setData(warnKey, warnCount, message.id);

  if (warnCount >= limit) {
    // Kick
    try {
      await message.client.groupParticipantsUpdate(jid, [message.participant], 'remove');
      await message.send(`⚠️ @${message.participant.split('@')[0]} kicked for exceeding ${limit} link warnings.`, {
        mentions: [message.participant]
      });
      // Reset warnings after kick
      await setData(warnKey, 0, message.id);
    } catch (err) {
      console.error('Kick error:', err.message);
    }
  } else {
    await message.send(`⚠️ @${message.participant.split('@')[0]} warned for sending link. (${warnCount}/${limit} warnings)`, {
      mentions: [message.participant]
    });
  }
});