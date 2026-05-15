(function () {
  var STORAGE_KEY = 'md-live-viewer-toc-open';
  var root = document.getElementById('toc');
  var list = root && root.querySelector('.toc__list');
  var toggle = root && root.querySelector('.toc__toggle');
  var prose = document.querySelector('main.prose');
  if (!root || !list || !toggle || !prose) return;

  function slugify(text, index) {
    var s = (text || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\p{Letter}\p{Number}\-_]/gu, '');
    if (!s) s = 'heading-' + index;
    return s;
  }

  function ensureUniqueId(headings) {
    var used = Object.create(null);
    headings.forEach(function (h, i) {
      var base = h.id || slugify(h.textContent, i + 1);
      var id = base;
      var n = 2;
      while (used[id] || (document.getElementById(id) && document.getElementById(id) !== h)) {
        id = base + '-' + n++;
      }
      used[id] = true;
      h.id = id;
    });
  }

  function buildList(headings) {
    list.innerHTML = '';
    headings.forEach(function (h) {
      var level = Number(h.tagName.substring(1));
      var li = document.createElement('li');
      li.setAttribute('data-level', String(level));
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (history.replaceState) history.replaceState(null, '', '#' + h.id);
      });
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  function setOpen(open) {
    root.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch (_) {}
  }

  function initObserver(headings) {
    if (!('IntersectionObserver' in window)) return;
    var linkById = Object.create(null);
    list.querySelectorAll('a').forEach(function (a) {
      linkById[a.getAttribute('href').slice(1)] = a;
    });
    var active = null;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = entry.target.id;
            var link = linkById[id];
            if (link && link !== active) {
              if (active) active.classList.remove('is-active');
              link.classList.add('is-active');
              active = link;
            }
          }
        });
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );
    headings.forEach(function (h) { observer.observe(h); });
  }

  var headings = Array.prototype.slice.call(prose.querySelectorAll('h1, h2, h3'));
  if (headings.length === 0) {
    root.hidden = true;
    return;
  }
  root.hidden = false;

  ensureUniqueId(headings);
  buildList(headings);

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) {}
  setOpen(saved === '1');

  toggle.addEventListener('click', function () {
    setOpen(!root.classList.contains('is-open'));
  });

  initObserver(headings);
})();
