const { isAddress, parseEther, formatEther } = require('ethers');
const crypto = require('node:crypto');
const same = (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function text(value, label, min = 1, max = 2000) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    fail(`${label} must contain ${min}–${max} characters.`);
  return value.trim();
}
function wei(value, allowZero = false) {
  try {
    const n = parseEther(String(value));
    if (n < 0n || (!allowZero && n === 0n) || n > parseEther('1000000000'))
      fail('Enter a valid positive ETH amount.');
    return n;
  } catch {
    fail('Enter a valid ETH amount with at most 18 decimal places.');
  }
}
function add(a, b) {
  return formatEther(wei(a, true) + wei(b, true));
}
function sub(a, b) {
  const v = wei(a, true) - wei(b, true);
  if (v < 0n) fail('Insufficient balance.');
  return formatEther(v);
}
function address(value) {
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) fail('Enter a valid non-zero wallet address.');
  return value;
}
function normalize(input, user) {
  const name = text(input.name, 'Partnership name', 2, 100),
    description = text(input.description, 'Description', 10, 2000);
  if (!Array.isArray(input.partners) || input.partners.length < 2 || input.partners.length > 20)
    fail('Include between 2 and 20 partners.');
  const seen = new Set();
  let total = 0;
  const partners = input.partners.map((p) => {
    const wallet = address(p.wallet);
    const key = wallet.toLowerCase();
    if (seen.has(key)) fail('Each partner must have a unique wallet.');
    seen.add(key);
    const weight = Math.round(Number(p.ownership) * 100);
    if (
      !Number.isFinite(weight) ||
      weight <= 0 ||
      weight > 10000 ||
      Math.abs(Number(p.ownership) * 100 - weight) > 0.00001
    )
      fail('Ownership requires a positive percentage with up to two decimal places.');
    total += weight;
    return {
      name: text(p.name, 'Partner name', 1, 80),
      wallet,
      expected: formatEther(wei(p.expected)),
      deposited: '0.0',
      weight,
      signed: false,
      exited: false,
    };
  });
  if (total !== 10000) fail('Ownership must total exactly 100%.');
  if (!user.wallet || !seen.has(user.wallet.toLowerCase()))
    fail('Include your wallet in the partner list.');
  const quorum = Number(input.quorum);
  if (!Number.isInteger(quorum) || quorum < 51 || quorum > 100)
    fail('Quorum must be between 51% and 100%.');
  const endsAt = new Date(input.endsAt).getTime();
  if (!Number.isFinite(endsAt) || endsAt <= Date.now()) fail('Choose a future end date.');
  return {
    id: crypto.randomUUID(),
    name,
    description,
    category: text(input.category || 'Business', 'Category', 1, 60),
    partners,
    quorum,
    endsAt: new Date(endsAt).toISOString(),
    status: 'Proposed',
    treasury: '0.0',
    revenue: '0.0',
    spent: '0.0',
    distributed: '0.0',
    settledTotal: '0.0',
    profitReserve: '0.0',
    expenses: [],
    proposals: [],
    exits: [],
    createdAt: new Date().toISOString(),
    creatorId: user.id,
  };
}
module.exports = { same, fail, text, wei, address, normalize };
