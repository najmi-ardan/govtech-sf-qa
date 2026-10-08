/**
 * Aura responses are sometimes prefixed with a while(1); guard. Strip it before JSON.parse.
 */
export function parseAuraJson(body: string): unknown {
  const cleaned = body.replace(/^\s*while\s*\(\s*1\s*\)\s*;?/, '').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').trim();
  return JSON.parse(cleaned);
}
