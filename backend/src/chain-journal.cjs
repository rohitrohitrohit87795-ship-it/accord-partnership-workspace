const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { Transaction } = require('ethers');

// The local Hardhat node is memory-only. Preserve signed public transactions and
// block parameters so a new process can reconstruct precisely the same chain.
class ChainJournal {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'blockchain-journal.json');
    this.pending = Promise.resolve();
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : null;
    if (this.data && (this.data.version !== 1 || this.data.chainId !== 31337))
      throw new Error('The blockchain backup format or network is not supported.');
  }

  capture(provider) {
    const operation = this.pending
      .catch(() => {})
      .then(async () => {
        const height = Number(BigInt(await provider.send('eth_blockNumber', [])));
        const saved = this.data?.blocks || [];
        if (saved.length) {
          const tip = saved[saved.length - 1];
          const block = await provider.send('eth_getBlockByNumber', [tip.number, false]);
          if (!block || block.hash !== tip.hash)
            throw new Error(
              'The running blockchain differs from its backup. Restart using npm start.',
            );
        }
        if (saved.length === height + 1) return;
        const blocks = [...saved];
        for (let number = blocks.length; number <= height; number++) {
          const block = await provider.send('eth_getBlockByNumber', [
            '0x' + number.toString(16),
            true,
          ]);
          if (!block) throw new Error('A blockchain block could not be backed up.');
          const transactions = block.transactions.map((tx) => {
            const transaction = Transaction.from({
              type: Number(BigInt(tx.type)),
              chainId: BigInt(tx.chainId),
              nonce: Number(BigInt(tx.nonce)),
              to: tx.to,
              data: tx.input,
              value: BigInt(tx.value),
              gasLimit: BigInt(tx.gas),
              ...(Number(BigInt(tx.type)) === 2
                ? {
                    maxFeePerGas: BigInt(tx.maxFeePerGas),
                    maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas),
                    accessList: tx.accessList || [],
                  }
                : {
                    gasPrice: BigInt(tx.gasPrice),
                    ...(tx.accessList ? { accessList: tx.accessList } : {}),
                  }),
              signature: { r: tx.r, s: tx.s, v: Number(BigInt(tx.v)) },
            });
            if (transactionsUnsupported(tx) || transaction.hash !== tx.hash)
              throw new Error('Cannot safely back up transaction ' + tx.hash);
            return transaction.serialized;
          });
          blocks.push({
            number: block.number,
            hash: block.hash,
            timestamp: block.timestamp,
            baseFeePerGas: block.baseFeePerGas,
            mixHash: block.mixHash,
            transactions,
          });
        }
        const data = {
          version: 1,
          chainId: 31337,
          initialDate: new Date(Number(BigInt(blocks[0].timestamp)) * 1000).toISOString(),
          blocks,
        };
        const temporary = this.file + '.tmp';
        const fd = fs.openSync(temporary, 'w');
        try {
          fs.writeFileSync(fd, JSON.stringify(data));
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.previous');
        fs.renameSync(temporary, this.file);
        this.data = data;
      });
    this.pending = operation;
    return operation;
  }

  async restore(provider) {
    if (!this.data) return;
    const height = Number(BigInt(await provider.send('eth_blockNumber', [])));
    const saved = this.data.blocks;
    const existing = await provider.send('eth_getBlockByNumber', [
      '0x' + height.toString(16),
      false,
    ]);
    if (saved[height]?.hash !== existing?.hash)
      throw new Error('Blockchain backup does not match this node. The backup has been preserved.');
    if (height >= saved.length - 1) return;
    await provider.send('evm_setAutomine', [false]);
    try {
      for (const block of saved.slice(height + 1)) {
        await provider.send('evm_setNextBlockTimestamp', [Number(BigInt(block.timestamp))]);
        if (block.baseFeePerGas)
          await provider.send('hardhat_setNextBlockBaseFeePerGas', [block.baseFeePerGas]);
        if (block.mixHash) await provider.send('hardhat_setPrevRandao', [block.mixHash]);
        for (const raw of block.transactions) await provider.send('eth_sendRawTransaction', [raw]);
        await provider.send('evm_mine', []);
        const actual = await provider.send('eth_getBlockByNumber', [block.number, false]);
        if (actual.hash !== block.hash)
          throw new Error('Blockchain replay differs at block ' + Number(BigInt(block.number)));
      }
    } finally {
      await provider.send('evm_setAutomine', [true]);
    }
  }
}

function transactionsUnsupported(tx) {
  return Number(BigInt(tx.type)) > 2;
}

// Wallet requests pass through this gateway. A mined transaction is written to
// disk before its successful RPC response is returned to the wallet.
function createRpcGateway(upstream, provider, journal) {
  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    let requests;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new Error('RPC request is too large.');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      requests = JSON.parse(body);
      const response = await fetch(upstream, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.text();
      const entries = Array.isArray(requests) ? requests : [requests];
      if (
        entries.some((item) =>
          ['eth_sendRawTransaction', 'eth_sendTransaction', 'evm_mine'].includes(item.method),
        )
      )
        await journal.capture(provider);
      res.writeHead(response.status);
      res.end(result);
    } catch (error) {
      console.error('Local blockchain request failed:', error.message);
      const failure = (item) => ({
        jsonrpc: '2.0',
        id: item?.id ?? null,
        error: {
          code: -32000,
          message: 'Local blockchain request or backup failed. Check backend logs before retrying.',
        },
      });
      res.writeHead(200);
      res.end(JSON.stringify(Array.isArray(requests) ? requests.map(failure) : failure(requests)));
    }
  });
}
module.exports = { ChainJournal, createRpcGateway };
