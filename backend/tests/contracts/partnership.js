const assert = require('node:assert/strict');
const { ethers } = require('hardhat');
const eth = ethers.parseEther;
describe('Partnership financial and consensus rules', function () {
  let p, alice, bob, charlie, outsider;
  beforeEach(async () => {
    [alice, bob, charlie, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('Partnership');
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    p = await Factory.deploy(
      'ABC Ventures',
      [alice.address, bob.address, charlie.address],
      [eth('5'), eth('3'), eth('2')],
      [5000, 3000, 2000],
      66,
      now + 365 * 86400,
    );
    await p.waitForDeployment();
  });
  async function active() {
    for (const who of [alice, bob, charlie]) await (await p.connect(who).approveAgreement()).wait();
  }
  async function funded() {
    await active();
    for (const [who, value] of [
      [alice, '5'],
      [bob, '3'],
      [charlie, '2'],
    ])
      await (await p.connect(who).depositContribution({ value: eth(value) })).wait();
  }
  it('requires all signatures, refuses outsiders and duplicate signatures', async () => {
    await assert.rejects(p.connect(outsider).approveAgreement(), /Partner required/);
    await p.approveAgreement();
    await assert.rejects(p.approveAgreement(), /Already signed/);
    await p.connect(bob).approveAgreement();
    assert.equal(await p.active(), false);
    await p.connect(charlie).approveAgreement();
    assert.equal(await p.active(), true);
  });
  it('guards funding limits and prevents distributions of capital', async () => {
    await assert.rejects(p.depositContribution({ value: eth('1') }), /Inactive/);
    await active();
    await assert.rejects(p.depositContribution({ value: eth('6') }), /Invalid contribution/);
    await p.depositContribution({ value: eth('5') });
    await assert.rejects(p.distributeProfit(eth('1')), /Insufficient profit/);
  });
  it('executes expenses exactly once after quorum and rejects insufficient treasury', async () => {
    await funded();
    await p.proposeExpense('Equipment', 'Business expense', outsider.address, eth('1'));
    await assert.rejects(p.executeExpense(0), /Quorum/);
    await p.approveExpense(0, true);
    await assert.rejects(p.approveExpense(0, true), /already voted/);
    await p.connect(bob).approveExpense(0, true);
    await p.executeExpense(0);
    assert.equal(await ethers.provider.getBalance(await p.getAddress()), eth('9'));
    await assert.rejects(p.executeExpense(0), /Quorum/);
    await p.proposeExpense('Too expensive', '', outsider.address, eth('20'));
    await p.approveExpense(1, true);
    await p.connect(bob).approveExpense(1, true);
    await assert.rejects(p.executeExpense(1), /Insufficient treasury/);
  });
  it('cancels expenses when sufficient partners reject', async () => {
    await funded();
    await p.proposeExpense('Bad expense', '', outsider.address, eth('1'));
    await p.approveExpense(0, false);
    await p.connect(bob).approveExpense(0, false);
    assert.equal((await p.expenses(0)).cancelled, true);
    await assert.rejects(p.executeExpense(0), /Quorum/);
  });
  it('distributes only profit in ownership shares with exact wei accounting', async () => {
    await funded();
    await p.depositRevenue({ value: eth('2') });
    const before = await ethers.provider.getBalance(bob.address);
    await p.distributeProfit(eth('1'));
    assert.equal((await ethers.provider.getBalance(bob.address)) - before, eth('0.3'));
    assert.equal(await p.profitReserve(), eth('1'));
    assert.equal(await p.distributed(), eth('1'));
    await assert.rejects(p.distributeProfit(eth('2')), /Insufficient profit/);
  });
  it('snapshots weighted votes and requires a resolvable result', async () => {
    await active();
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    await p.createProposal('Expansion', '', now + 86400);
    await p.vote(0, true);
    await assert.rejects(p.vote(0, true), /already voted/);
    await assert.rejects(p.closeProposal(0), /still open/);
    await p.connect(bob).vote(0, true);
    await p.closeProposal(0);
    assert.equal((await p.proposals(0)).passed, true);
  });
  it('requires remaining-partner exit quorum and normalizes payout weights', async () => {
    await funded();
    await p.connect(charlie).requestExit(eth('1'), 'Moving on');
    await assert.rejects(p.connect(charlie).approveExit(0), /Invalid approval/);
    await p.approveExit(0);
    await assert.rejects(p.settleExit(0), /quorum/);
    await p.connect(bob).approveExit(0);
    await p.settleExit(0);
    assert.equal((await p.partners(2)).exited, true);
    await assert.rejects(p.connect(charlie).depositRevenue({ value: 1n }), /Partner required/);
    assert.equal(await p.liveWeight(), 8000n);
    await p.depositRevenue({ value: eth('1') + 3n });
    const before = await ethers.provider.getBalance(bob.address);
    await p.distributeProfit(3n);
    assert.equal((await ethers.provider.getBalance(bob.address)) - before, 2n);
  });
  it('recoups expenses paid from capital before declaring later revenue as profit', async () => {
    await funded();
    await p.proposeExpense('Equipment', '', outsider.address, eth('1'));
    await p.approveExpense(0, true);
    await p.connect(bob).approveExpense(0, true);
    await p.executeExpense(0);
    await p.depositRevenue({ value: eth('2') });
    assert.equal(await p.profitReserve(), eth('1'));
    await p.distributeProfit(eth('1'));
    assert.equal(await p.profitReserve(), 0n);
    await assert.rejects(p.distributeProfit(1n), /Insufficient profit/);
  });
  it('rejects duplicate wallets, incorrect ownership and a factory creator outside the partnership', async () => {
    const F = await ethers.getContractFactory('PartnershipFactory'),
      factory = await F.deploy();
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    await assert.rejects(
      factory.createPartnership(
        'Bad',
        [bob.address, charlie.address],
        [1, 1],
        [5000, 5000],
        66,
        now + 86400,
      ),
      /Creator must/,
    );
    const C = await ethers.getContractFactory('Partnership');
    await assert.rejects(
      C.deploy('Bad', [alice.address, alice.address], [1, 1], [5000, 5000], 66, now + 86400),
      /Invalid partner/,
    );
    await assert.rejects(
      C.deploy('Bad', [alice.address, bob.address], [1, 1], [5000, 4000], 66, now + 86400),
      /Ownership/,
    );
  });
  it('closes expired proposals and restricts operating actions after the end date', async () => {
    await active();
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    await p.createProposal('Timed', '', now + 3600);
    await ethers.provider.send('evm_increaseTime', [3601]);
    await ethers.provider.send('evm_mine', []);
    await p.closeProposal(0);
    assert.equal((await p.proposals(0)).passed, false);
    await ethers.provider.send('evm_increaseTime', [365 * 86400]);
    await ethers.provider.send('evm_mine', []);
    await assert.rejects(p.depositRevenue({ value: 1n }), /Inactive or expired/);
    await p.requestExit(0, 'After expiry');
  });
});
