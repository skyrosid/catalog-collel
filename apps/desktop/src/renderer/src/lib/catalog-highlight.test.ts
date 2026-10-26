import { describe, expect, it } from 'vitest';
import { findBookSearchMatches } from './catalog-highlight';

const marked = (value: string, search: string) =>
  findBookSearchMatches(value, search).map(({ start, end }) => value.slice(start, end));

describe('catalogue search highlighting', () => {
  it('matches Hebrew without removing the vowels displayed in the book', () => {
    expect(marked('סֵפֶר שָׁלוֹם', 'שלום')).toEqual(['שָׁלוֹם']);
    expect(marked('שלום', 'שָׁלוֹם')).toEqual(['שלום']);
  });
  it('matches every literal search term, including punctuation and repeated occurrences', () => {
    expect(marked('רמב"ם (א) רמב"ם 100%', 'רמב"ם (א) %')).toEqual(['רמב"ם', '(א)', 'רמב"ם', '%']);
  });
  it('combines overlapping terms and preserves case and Unicode offsets', () => {
    expect(marked('📖 Rambam', 'ram rambam')).toEqual(['Rambam']);
  });
  it('does not match across spaces or add marks for an empty or unrelated search', () => {
    expect(marked('אב גד', 'אבגד')).toEqual([]);
    expect(marked('שלום', '  ')).toEqual([]);
    expect(marked('שלום', 'תורה')).toEqual([]);
  });
});
