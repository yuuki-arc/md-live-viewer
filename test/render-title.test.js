import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from '../lib/render.js';

function withTempMd(name, content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mlv-title-'));
  const file = join(dir, name);
  writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('frontmatter の title が最優先される', () => {
  withTempMd('note.md', '---\ntitle: FM Title\n---\n# H1 Title\n', (file) => {
    assert.equal(render(file).title, 'FM Title');
  });
});

test('H1 がタイトルになる', () => {
  withTempMd('note.md', '# H1 Title\n\nbody\n', (file) => {
    assert.equal(render(file).title, 'H1 Title');
  });
});

test('コードフェンス内の # 行はタイトルとして扱われない', () => {
  withTempMd('setup.md', '```bash\n# install deps\nnpm ci\n```\n', (file) => {
    assert.equal(render(file).title, 'setup');
  });
});

test('setext 形式（下線 =）の H1 もタイトルになる', () => {
  withTempMd('note.md', 'My Setext Title\n===============\n\nbody\n', (file) => {
    assert.equal(render(file).title, 'My Setext Title');
  });
});

test('HTML コメント内の # 行はタイトルとして扱われない', () => {
  withTempMd('draft.md', '<!--\n# draft title\n-->\n\nbody\n', (file) => {
    assert.equal(render(file).title, 'draft');
  });
});

test('フェンスの後にある H1 はタイトルになる', () => {
  withTempMd('note.md', '```bash\n# comment\n```\n\n# Real Title\n', (file) => {
    assert.equal(render(file).title, 'Real Title');
  });
});
