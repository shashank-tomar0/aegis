// AEGIS PQC Crypto Service — real post-quantum cryptography via @noble/post-quantum
// NIST-selected algorithms: ML-KEM, ML-DSA, SLH-DSA

import { createHash, randomUUID } from 'node:crypto';
import {
  ml_kem512, ml_kem768, ml_kem1024,
} from '@noble/post-quantum/ml-kem.js';
import {
  ml_dsa44, ml_dsa65, ml_dsa87,
} from '@noble/post-quantum/ml-dsa.js';
import {
  slh_dsa_shake_128f, slh_dsa_shake_192f, slh_dsa_shake_256f,
} from '@noble/post-quantum/slh-dsa.js';
import type { PqcKeyPairResult, PqcSignResult, PqcCapsuleResult } from '@aegis/shared/types.js';

// Algorithm registry — maps AEGIS algorithm names to implementation + metadata
type KemImpl = typeof ml_kem768;
type DsaImpl = typeof ml_dsa65;

interface KemDef {
  name: string;
  impl: KemImpl;
  nistLevel: number;
  pkBytes: number;
  skBytes: number;
  ctBytes: number;
  ssBytes: number;
  klass: 'kem';
}

interface DsaDef {
  name: string;
  impl: DsaImpl;
  nistLevel: number;
  pkBytes: number;
  skBytes: number;
  sigBytes: number;
  klass: 'dsa';
}

type AlgoDef = KemDef | DsaDef;

const ALGORITHMS: Record<string, AlgoDef> = {
  'ML-KEM-512': { name: 'ML-KEM-512', impl: ml_kem512, nistLevel: 1, pkBytes: 800, skBytes: 1632, ctBytes: 768, ssBytes: 32, klass: 'kem' },
  'ML-KEM-768': { name: 'ML-KEM-768', impl: ml_kem768, nistLevel: 3, pkBytes: 1184, skBytes: 2400, ctBytes: 1088, ssBytes: 32, klass: 'kem' },
  'ML-KEM-1024': { name: 'ML-KEM-1024', impl: ml_kem1024, nistLevel: 5, pkBytes: 1568, skBytes: 3168, ctBytes: 1568, ssBytes: 32, klass: 'kem' },
  'ML-DSA-44': { name: 'ML-DSA-44', impl: ml_dsa44, nistLevel: 2, pkBytes: 1312, skBytes: 2560, sigBytes: 2420, klass: 'dsa' },
  'ML-DSA-65': { name: 'ML-DSA-65', impl: ml_dsa65, nistLevel: 3, pkBytes: 1952, skBytes: 4032, sigBytes: 3309, klass: 'dsa' },
  'ML-DSA-87': { name: 'ML-DSA-87', impl: ml_dsa87, nistLevel: 5, pkBytes: 2592, skBytes: 4896, sigBytes: 4627, klass: 'dsa' },
  'SLH-DSA-SHAKE-128F': { name: 'SLH-DSA-SHAKE-128F', impl: slh_dsa_shake_128f, nistLevel: 1, pkBytes: 32, skBytes: 64, sigBytes: 17088, klass: 'dsa' },
  'SLH-DSA-SHAKE-192F': { name: 'SLH-DSA-SHAKE-192F', impl: slh_dsa_shake_192f, nistLevel: 3, pkBytes: 48, skBytes: 96, sigBytes: 35664, klass: 'dsa' },
  'SLH-DSA-SHAKE-256F': { name: 'SLH-DSA-SHAKE-256F', impl: slh_dsa_shake_256f, nistLevel: 5, pkBytes: 64, skBytes: 128, sigBytes: 49856, klass: 'dsa' },
};

export function listAlgorithms(): Array<{ name: string; nistLevel: number; klass: string }> {
  return Object.values(ALGORITHMS).map(({ name, nistLevel, klass }) => ({ name, nistLevel, klass }));
}

export function hasAlgorithm(name: string): boolean {
  return name in ALGORITHMS;
}

function b64(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64');
}

function fingerprint(pk: Uint8Array): string {
  return createHash('sha256').update(pk).digest('hex');
}

// Generate a PQC key pair
export function generateKeyPair(algorithm = 'ML-KEM-768'): PqcKeyPairResult {
  const def = ALGORITHMS[algorithm];
  if (!def) throw new Error(`Unsupported algorithm: ${algorithm}`);

  const kp = def.impl.keygen();
  return {
    algorithm: def.name,
    keySizeBytes: kp.publicKey.length,
    publicKeyB64: b64(kp.publicKey),
    secretKeyB64: b64(kp.secretKey),
    fingerprint: fingerprint(kp.publicKey),
    generatedAt: Date.now(),
  };
}

// Sign a message with PQC signature algorithm
export function signMessage(message: string, algorithm = 'ML-DSA-65'): PqcSignResult {
  const def = ALGORITHMS[algorithm];
  if (!def || def.klass !== 'dsa') throw new Error(`Not a signature algorithm: ${algorithm}`);

  const kp = def.impl.keygen();
  const msg = Buffer.from(message, 'utf-8');
  const sig = def.impl.sign(msg, kp.secretKey);
  const verified = def.impl.verify(sig, msg, kp.publicKey);

  return {
    algorithm: def.name,
    signatureB64: b64(sig),
    signatureBytes: sig.length,
    messageHash: createHash('sha256').update(msg).digest('hex'),
    publicKeyB64: b64(kp.publicKey),
    verified,
  };
}

// Independently verify a PQC signature against a supplied public key
export function verifyMessage(message: string, signatureB64: string, publicKeyB64: string, algorithm = 'ML-DSA-65'): { algorithm: string; verified: boolean } {
  const def = ALGORITHMS[algorithm];
  if (!def || def.klass !== 'dsa') throw new Error(`Not a signature algorithm: ${algorithm}`);

  const msg = Buffer.from(message, 'utf-8');
  const sig = Uint8Array.from(Buffer.from(signatureB64, 'base64'));
  const pk = Uint8Array.from(Buffer.from(publicKeyB64, 'base64'));
  const verified = def.impl.verify(sig, msg, pk);

  return { algorithm: def.name, verified };
}

// KEM: encapsulate a shared secret to a PQC public key
export function encapsulate(publicKeyB64: string, algorithm = 'ML-KEM-768'): PqcCapsuleResult {
  const def = ALGORITHMS[algorithm];
  if (!def || def.klass !== 'kem') throw new Error(`Not a KEM algorithm: ${algorithm}`);

  const pk = Uint8Array.from(Buffer.from(publicKeyB64, 'base64'));
  const enc = def.impl.encapsulate(pk);

  return {
    algorithm: def.name,
    cipherTextB64: b64(enc.cipherText),
    sharedSecretB64: b64(enc.sharedSecret),
    sharedSecretBytes: enc.sharedSecret.length,
  };
}

// KEM: decapsulate the shared secret with the secret key
export function decapsulate(publicKeyB64: string, secretKeyB64: string, cipherTextB64: string, algorithm = 'ML-KEM-768'): string {
  const def = ALGORITHMS[algorithm];
  if (!def || def.klass !== 'kem') throw new Error(`Not a KEM algorithm: ${algorithm}`);

  const sk = Uint8Array.from(Buffer.from(secretKeyB64, 'base64'));
  const ct = Uint8Array.from(Buffer.from(cipherTextB64, 'base64'));
  const ss = def.impl.decapsulate(ct, sk);
  return b64(ss);
}

// Issue a PQC-signed X.509-style certificate
export function issueCertificate(req: {
  subject: string;
  algorithm: string;
  validityDays: number;
  attributes?: Record<string, string>;
}): {
  serial: string;
  subject: string;
  issuer: string;
  algorithm: string;
  publicKeyB64: string;
  notBefore: number;
  notAfter: number;
  fingerprint: string;
  signatureB64: string;
  pem: string;
} {
  const def = ALGORITHMS[req.algorithm];
  if (!def || def.klass !== 'dsa') throw new Error(`Unsupported signature algorithm: ${req.algorithm}`);

  const kp = def.impl.keygen();
  const serial = randomUUID().replace(/-/g, '');
  const notBefore = Date.now();
  const notAfter = notBefore + req.validityDays * 86_400_000;

  // Minimal TBS (to-be-signed) payload — deterministic PEM-ish structure
  const attrs = req.attributes ?? {};
  const tbs = JSON.stringify({ serial, subject: req.subject, issuer: 'AEGIS Root CA', algorithm: def.name, pk: b64(kp.publicKey), notBefore, notAfter, attrs });
  const sig = def.impl.sign(Buffer.from(tbs, 'utf-8'), kp.secretKey);

  const pem = [
    '-----BEGIN PQC CERTIFICATE-----',
    Buffer.from(tbs).toString('base64').replace(/(.{64})/g, '$1\n'),
    '-----END PQC CERTIFICATE-----',
  ].join('\n');

  return {
    serial,
    subject: req.subject,
    issuer: 'AEGIS Root CA',
    algorithm: def.name,
    publicKeyB64: b64(kp.publicKey),
    notBefore,
    notAfter,
    fingerprint: fingerprint(kp.publicKey),
    signatureB64: b64(sig),
    pem,
  };
}