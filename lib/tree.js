import { state } from './state.js';

export function getChildren(pathStr) {
  const clean = pathStr ? pathStr.replace(/^\/+|\/+$/g, '') : '';
  const segs = clean ? clean.split('/').filter(Boolean) : [];
  let node = state.tree;
  for (const seg of segs) {
    const next = node.children.get(seg);
    if (!next) return { path: clean, children: [] };
    node = next;
  }
  const children = Array.from(node.children.values())
    .map((child) => ({
      name: child.name,
      slug: segs.length ? segs.concat(child.name).join('/') : child.name,
      url: child.url,
      isDir: child.children.size > 0,
    }))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, 'ja');
    });
  return { path: clean, children };
}
