import { normalizeBookSearch } from '@catalog/contracts';

export function findBookSearchMatches(value: string, search: string) {
  const tokens = normalizeBookSearch(search).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  let normalized = '';
  let offset = 0;
  const positions: { start: number; end: number }[] = [];
  for (const character of value) {
    const end = offset + character.length;
    const folded = /\s/u.test(character) ? ' ' : normalizeBookSearch(character);
    normalized += folded;
    for (let index = 0; index < folded.length; index++) positions.push({ start: offset, end });
    if (!folded && positions.length) positions[positions.length - 1]!.end = end;
    offset = end;
  }
  const matches: { start: number; end: number }[] = [];
  for (const token of new Set(tokens)) {
    let index = normalized.indexOf(token);
    while (index !== -1) {
      matches.push({
        start: positions[index]!.start,
        end: positions[index + token.length - 1]!.end,
      });
      index = normalized.indexOf(token, index + 1);
    }
  }
  const merged: { start: number; end: number }[] = [];
  for (const match of matches.sort((a, b) => a.start - b.start)) {
    const previous = merged[merged.length - 1];
    if (previous && match.start <= previous.end) previous.end = Math.max(previous.end, match.end);
    else merged.push({ ...match });
  }
  return merged;
}
