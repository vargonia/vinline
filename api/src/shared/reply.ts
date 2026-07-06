// Success envelope + cursor helpers.
export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return meta ? { data, meta } : { data };
}

// Cursor encodes (created_at ISO, id) of the last row.
export function encodeCursor(createdAt: Date | string, id: string): string {
  const iso = typeof createdAt === 'string' ? createdAt : createdAt.toISOString();
  return Buffer.from(JSON.stringify({ c: iso, i: id })).toString('base64url');
}

export function decodeCursor(cursor: string): { c: string; i: string } | null {
  try {
    const obj = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof obj.c === 'string' && typeof obj.i === 'string') return obj;
    return null;
  } catch {
    return null;
  }
}
