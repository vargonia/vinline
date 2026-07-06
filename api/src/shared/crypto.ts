// Crypto helpers: Argon2id password hashing, refresh token gen/hash,
// RS256 JWT sign/verify.
import { randomBytes, createHash, generateKeyPairSync } from 'node:crypto';
import argon2 from 'argon2';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';

const ACCESS_TTL_SECONDS = 15 * 60; // 15 min

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// 256-bit opaque refresh token, base64url.
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type Keys = {
  privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  publicKey: Awaited<ReturnType<typeof importSPKI>>;
  ephemeral: boolean;
};

let keysPromise: Promise<Keys> | null = null;

async function loadKeys(): Promise<Keys> {
  const privPem = process.env.JWT_PRIVATE_KEY;
  const pubPem = process.env.JWT_PUBLIC_KEY;
  if (privPem && pubPem) {
    return {
      privateKey: await importPKCS8(privPem, 'RS256'),
      publicKey: await importSPKI(pubPem, 'RS256'),
      ephemeral: false,
    };
  }
  // Ephemeral dev keypair.
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  // eslint-disable-next-line no-console
  console.warn(
    '\x1b[33m[WARN] JWT_PRIVATE_KEY/JWT_PUBLIC_KEY not set — generated an EPHEMERAL keypair. ' +
      'Tokens will not survive a restart. DEV ONLY.\x1b[0m',
  );
  return {
    privateKey: await importPKCS8(privateKey, 'RS256'),
    publicKey: await importSPKI(publicKey, 'RS256'),
    ephemeral: true,
  };
}

function getKeys(): Promise<Keys> {
  if (!keysPromise) keysPromise = loadKeys();
  return keysPromise;
}

// Sign access JWT: RS256, 15min, sub=userId, jti=sessionId.
export async function signAccessToken(userId: string, sessionId: string): Promise<string> {
  const { privateKey } = await getKeys();
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(userId)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(privateKey);
}

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; sessionId: string } | null> {
  try {
    const { publicKey } = await getKeys();
    const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });
    if (!payload.sub || !payload.jti) return null;
    return { userId: payload.sub, sessionId: payload.jti };
  } catch {
    return null;
  }
}

export const ACCESS_TTL = ACCESS_TTL_SECONDS;
