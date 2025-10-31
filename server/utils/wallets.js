import { ethers, Mnemonic } from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import * as bip32 from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';
import ECPairFactory from 'ecpair';
import { randomBytes } from 'crypto';
import { CHAIN_TYPES } from '../db/schemas/Network';

const BIP32 = bip32.BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

const MASTER_MNEMONIC = process.env.MASTER_MNEMONIC;

function sanitizeIndex(id) {
  return Math.min(Math.abs(id), 0x7fffffff);
}

/**
 * Generate EVM wallet (works on ALL EVM chains)
 */
export function generateEVMWallet(userIdOrIndex, isDemo = false) {
  if (isDemo) {
    // Demo wallet - random address, no private key
    const buf = randomBytes(20);
    return {
      chainType: CHAIN_TYPES.EVM,
      address: '0x' + buf.toString('hex'),
      derivationPath: null
    };
  }

  const mnemonic = Mnemonic.fromPhrase(MASTER_MNEMONIC);
  const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m");
  const index = sanitizeIndex(userIdOrIndex);
  const path = `m/44'/60'/0'/0/${index}`;
  const wallet = hdNode.derivePath(path);

  return {
    chainType: CHAIN_TYPES.EVM,
    address: wallet.address.toLowerCase(),
    derivationPath: path
  };
}

/**
 * Generate BTC wallet
 */
export function generateBTCWallet(userIdOrIndex, isDemo = false) {
  console.log("+++++++++++++++++++++++++++GENERATED BTC WALLET+++++++++++++++++++++++++++++++++++")
  if (isDemo) {
    const keyPair = ECPair.makeRandom();
    const { address } = bitcoin.payments.p2pkh({
      pubkey: keyPair.publicKey
    });

    return {
      chainType: CHAIN_TYPES.BTC,
      address,
      derivationPath: null
    };
  }

  const seed = bip39.mnemonicToSeedSync(MASTER_MNEMONIC);
  const root = BIP32.fromSeed(seed);
  const index = sanitizeIndex(userIdOrIndex);
  const path = `m/44'/0'/0'/0/${index}`;
  const child = root.derivePath(path);

  const { address } = bitcoin.payments.p2pkh({
    pubkey: child.publicKey,
    network: bitcoin.networks.bitcoin
  });

  console.log(`+++++++++++++++++++++++++++{${{
    isDemo,
    chainType: CHAIN_TYPES.BTC,
    address,
    derivationPath: path
  }}}+++++++++++++++++++++++++++++++++++`)

  return {
    chainType: CHAIN_TYPES.BTC,
    address,
    derivationPath: path
  };
}

/**
 * Get EVM signer from derivation path
 */
export function getEVMSigner(derivationPath, rpcUrl) {
  if (!derivationPath) {
    throw new Error('Derivation path is required');
  }

  const mnemonic = ethers.Mnemonic.fromPhrase(process.env.MASTER_MNEMONIC);
  const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic);
  const wallet = hdNode.derivePath(derivationPath);
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  return wallet.connect(provider);
}