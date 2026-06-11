(() => {
  const SITE_NAME = 'The Daily Intelligence';
  const FOOTER_NOTE = 'Summaries are prepared with AI-assisted editorial automation and link to the original sources for full context.';
  const ARCHIVE_LIMIT = 20;
  const app = document.getElementById('app');
  if (!app) return;

  const dataRoot = app.dataset.dataRoot || 'data/';
  const assetPrefix = app.dataset.assetPrefix || '';
  const view = app.dataset.view || 'daily';
  const requestedSlug = app.dataset.publicationSlug || 'latest';
  const state = { mode: 'current', publication: null, contentItems: [], publications: [] };

  function safeText(value) { return value == null ? '' : String(value); }
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = safeText(value);
      else if (key.startsWith('data')) node.dataset[key.slice(4).charAt(0).toLowerCase() + key.slice(5)] = value;
      else node.setAttribute(key, value);
    });
    children.forEach(child => node.append(child));
    return node;
  }
  function dataUrl(path) { return `${dataRoot}${path}`.replace(/\/+/g, '/'); }
  function issueHref(slug) { return `${assetPrefix}issues/${slug}.html`; }
  function archiveHref() { return `${assetPrefix}archive.html`; }
  async function fetchJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
    return response.json();
  }
  function latestPublicationSlug(index) {
    const item = (index.items || []).find(entry => entry.status === 'published') || (index.items || [])[0];
    return item ? item.slug : null;
  }
  function formatLocalDateTime(utc, timeZone) {
    if (!utc) return '';
    try {
      return new Intl.DateTimeFormat('en-AU', {
        timeZone: timeZone || 'Australia/Sydney', year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      }).format(new Date(utc));
    } catch { return utc; }
  }
  function setMode(mode) {
    state.mode = mode;
    document.body.dataset.mode = mode;
    document.documentElement.lang = 'en';
    document.querySelectorAll('.mode-button').forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-current][data-friendly]').forEach(node => {
      node.textContent = node.dataset[mode] || node.dataset.current || node.textContent;
    });
  }
  function modeSwitcher() {
    const nav = el('nav', { className: 'mode-switcher', 'aria-label': 'Reading mode' }, [
      el('button', { type: 'button', className: 'mode-button is-active', dataMode: 'current', text: 'Current English' }),
      el('button', { type: 'button', className: 'mode-button', dataMode: 'friendly', text: 'Super friendly English' })
    ]);
    nav.querySelectorAll('button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
    return [nav, el('p', { className: 'mode-hint', text: 'Same issue. Choose the original brief or a simpler English version.' })];
  }
  function translatable(tag, className, current, friendly, attrs = {}) {
    return el(tag, { ...attrs, className, dataCurrent: current, dataFriendly: friendly, text: current });
  }
  function masthead(publication, itemCount) {
    return el('header', { className: 'masthead' }, [
      el('div', { className: 'masthead__rule' }),
      el('p', { className: 'eyebrow', text: 'Daily AI brief' }),
      el('h1', { text: SITE_NAME }),
      el('p', { className: 'byline' }, [document.createTextNode('by '), el('a', { href: 'https://lacbgrey.com.au/', text: 'LACB Grey' })]),
      el('p', { className: 'dek', text: 'AI stories, tools, trends, and projects selected for people who follow the field closely. Each issue focuses on what happened, why it matters, and how AI could shape daily life and business.' }),
      el('div', { className: 'issue-meta', 'aria-label': 'Issue metadata' }, [
        el('span', { text: publication.slug }),
        el('span', { text: formatLocalDateTime(publication.publicationDateUtc, publication.displayTimeZone) }),
        el('span', { text: `${itemCount} items` })
      ])
    ]);
  }
  function articleCard(item) {
    const summaryLabel = translatable('strong', '', 'Summary', 'In simple terms');
    const whyLabel = translatable('strong', '', 'Why it matters', 'Why this matters');
    return el('article', { className: 'news-item' }, [
      translatable('a', 'news-item__title', item.title, item.friendlyTitle, { href: item.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }),
      el('div', { className: 'news-item__meta', text: [item.sourceName, item.sourceKind, item.credit].filter(Boolean).join(' · ') }),
      el('p', {}, [summaryLabel, el('strong', { text: '.' }), document.createTextNode(' '), translatable('span', '', item.summary, item.friendlySummary)]),
      el('p', {}, [whyLabel, el('strong', { text: '.' }), document.createTextNode(' '), translatable('span', '', item.whyItMatters, item.friendlyWhyItMatters)])
    ]);
  }
  function archivePanel(currentSlug) {
    const records = state.publications.filter(pub => pub.slug !== currentSlug).slice(0, ARCHIVE_LIMIT);
    const aside = el('aside', { className: 'archive-panel', 'aria-labelledby': 'archive-panel-heading' }, [
      el('p', { className: 'section-label', text: 'Archive' }),
      el('h2', { id: 'archive-panel-heading', text: 'Past publications.' }),
      el('p', { className: 'archive-panel__dek', text: 'Recent issues, kept visible for context.' })
    ]);
    if (records.length) {
      const list = el('ol', { className: 'archive-panel__list' });
      records.forEach(pub => list.append(el('li', {}, [el('a', { href: issueHref(pub.slug) }, [
        el('span', { className: 'archive-panel__date', text: pub.slug }),
        el('span', { className: 'archive-panel__meta', text: 'Open publication' })
      ])])));
      aside.append(list);
    } else {
      aside.append(el('p', { className: 'archive-panel__empty', text: 'Archived publications will appear here after the next issue.' }));
    }
    aside.append(el('a', { className: 'archive-panel__all', href: archiveHref(), text: 'Full archive' }));
    return aside;
  }
  function renderDaily() {
    const publication = state.publication;
    const frame = el('div', { className: 'site-frame' });
    modeSwitcher().forEach(node => frame.append(node));
    frame.append(masthead(publication, state.contentItems.length));
    const main = el('main', {}, [
      el('section', { className: 'intro-card', 'aria-labelledby': 'today-heading' }, [
        el('p', { className: 'section-label', text: 'Today' }),
        translatable('h2', '', publication.header, publication.friendlyHeader, { id: 'today-heading' }),
        translatable('p', '', publication.summary, publication.friendlySummary)
      ]),
      el('section', { className: 'issue-list', 'aria-label': 'Newsletter items' }, state.contentItems.map(articleCard))
    ]);
    frame.append(el('div', { className: 'content-layout' }, [main, archivePanel(publication.slug)]));
    frame.append(el('footer', { className: 'site-footer' }, [el('a', { href: archiveHref(), text: 'Archive' }), el('span', { text: FOOTER_NOTE })]));
    app.replaceChildren(frame);
    setMode('current');
  }
  function renderArchive() {
    const frame = el('div', { className: 'site-frame' });
    frame.append(el('header', { className: 'masthead' }, [
      el('div', { className: 'masthead__rule' }), el('p', { className: 'eyebrow', text: 'Archive' }), el('h1', { text: SITE_NAME }),
      el('p', { className: 'byline' }, [document.createTextNode('by '), el('a', { href: 'https://lacbgrey.com.au/', text: 'LACB Grey' })]),
      el('p', { className: 'dek', text: 'Past issues of the daily AI brief.' })
    ]));
    const list = el('section', { className: 'issue-list', 'aria-label': 'Archived issues' });
    state.publications.forEach(pub => list.append(el('article', { className: 'news-item' }, [
      el('a', { className: 'news-item__title', href: issueHref(pub.slug), text: pub.header || pub.slug }),
      el('div', { className: 'news-item__meta', text: `${pub.slug} · ${formatLocalDateTime(pub.publicationDateUtc, pub.displayTimeZone)}` }),
      el('p', {}, [el('strong', { text: 'Summary.' }), document.createTextNode(` ${pub.summary || `Open the issue published on ${pub.slug}.`}`)]),
      el('p', {}, [el('strong', { text: 'Why it matters.' }), document.createTextNode(' The archive preserves the daily signal as AI tools, business conditions, and public attention keep moving.')])
    ])));
    frame.append(el('main', {}, [list]));
    frame.append(el('footer', { className: 'site-footer' }, [el('a', { href: `${assetPrefix}index.html`, text: 'Latest' }), el('span', { text: FOOTER_NOTE })]));
    app.replaceChildren(frame);
  }
  async function boot() {
    try {
      const publicationIndex = await fetchJson(dataUrl('index/publications.json'));
      state.publications = publicationIndex.items || [];
      if (view === 'archive') { renderArchive(); return; }
      const slug = requestedSlug === 'latest' ? latestPublicationSlug(publicationIndex) : requestedSlug;
      if (!slug) throw new Error('No publication found.');
      state.publication = await fetchJson(dataUrl(`daily-publications/${slug}.json`));
      const refs = state.publication.contentItemRefs || [];
      const loaded = await Promise.all(refs.map(ref => fetchJson(dataUrl(`content-items/${ref.contentItemId}.json`)).then(item => ({ ref, item }))));
      state.contentItems = loaded.sort((a, b) => (a.ref.position || 0) - (b.ref.position || 0)).map(({ ref, item }) => ({
        ...item,
        title: ref.overrideTitle || item.title,
        friendlyTitle: ref.overrideFriendlyTitle || item.friendlyTitle,
        summary: ref.overrideSummary || item.summary,
        friendlySummary: ref.overrideFriendlySummary || item.friendlySummary,
        whyItMatters: ref.overrideWhyItMatters || item.whyItMatters,
        friendlyWhyItMatters: ref.overrideFriendlyWhyItMatters || item.friendlyWhyItMatters
      }));
      renderDaily();
    } catch (error) {
      console.error(error);
      app.innerHTML = `<div class="site-frame"><section class="intro-card"><p class="section-label">Error</p><h2>Publication data could not load.</h2><p>${safeText(error.message)}</p></section></div>`;
    }
  }
  boot();
})();
