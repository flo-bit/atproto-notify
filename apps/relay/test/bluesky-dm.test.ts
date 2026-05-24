import { expect, it } from 'vitest';

import { linkFacet } from '../src/delivery/bluesky-dm';

it('linkFacet places the link right after the prefix (UTF-8 byte offsets)', () => {
  const f = linkFacet('Hi\n\n', 'https://atmo.pub');
  expect(f.index.byteStart).toBe(4); // "Hi\n\n" = 4 bytes
  expect(f.index.byteEnd).toBe(4 + 'https://atmo.pub'.length);
  expect(f.features).toEqual([{ $type: 'app.bsky.richtext.facet#link', uri: 'https://atmo.pub' }]);
});

it('linkFacet accounts for multibyte characters in the prefix', () => {
  const prefix = '🔔 Test\n\n'; // 🔔 is 4 UTF-8 bytes, not 1
  const uri = 'https://x.example';
  const f = linkFacet(prefix, uri);
  const expectedStart = new TextEncoder().encode(prefix).length;
  expect(f.index.byteStart).toBe(expectedStart);
  expect(f.index.byteEnd).toBe(expectedStart + new TextEncoder().encode(uri).length);
});
