const state = { articles: [], config: {}, translations: {}, reviews: {}, manifest: null, fullLoaded: false, fullPromise: null, view: 'latest', section: 'research', search: '', topic: 'all', status: 'all', period: 'year', detail: 'all', organ: 'all', journal: 'all', oa: false, sort: 'new', limit: 20 };
const $ = selector => document.querySelector(selector);
const el = (tag, className, value) => { const node = document.createElement(tag); if (className) node.className = className; if (value != null) node.textContent = value; return node; };
function addText(parent, tag, className, value) { const node = el(tag, className, value); parent.append(node); return node; }
function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } }
function matches(text, words) { return (words || []).some(word => { const needle = word.toLocaleLowerCase(); return needle.length < 4 ? new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(text) : text.includes(needle); }); }
function classifyTopics(article) {
  const text = `${article.title || ''} ${article.abstract || ''} ${(article.keywords || []).join(' ')}`.toLocaleLowerCase();
  article._topics = Object.entries(state.config.topics || {}).filter(([, topic]) => matches(text, topic.keywords)).map(([key]) => key);
  article._organs = Object.entries(state.config.organSystems || {}).filter(([, words]) => matches(text, words)).map(([key]) => key);
  article._categories = {};
  const categories = state.config.topics?.pathogen?.categories || {};
  for (const [group, options] of Object.entries(categories)) article._categories[group] = Object.entries(options).filter(([, words]) => matches(text, words)).map(([label]) => label);
  const journal = (article.journal || '').trim().toLocaleLowerCase();
  const metrics = Object.entries(state.config.journalMetrics || {}).find(([name]) => name.trim().toLocaleLowerCase() === journal)?.[1];
  const rule = state.config.highImpactRule || {};
  article._metrics = metrics?.source ? metrics : null;
  article._highImpact = (state.config.journalWhitelist || []).some(name => name.trim().toLocaleLowerCase() === journal) || Boolean(article._metrics && (Number(article._metrics.jif) >= Number(rule.minJif) || article._metrics.quartile === rule.jcrQuartile));
}
function renderCard(article, index) {
  const card = el('article', 'article-card'); addText(card, 'div', 'article-number', String(index + 1).padStart(2, '0'));
  const main = el('div', 'article-main'); const title = addText(main, 'h3');
  const link = addText(title, 'a', '', article.titleZh || article.title || '未提供题目'); link.href = safeUrl(article.url); link.target = '_blank'; link.rel = 'noopener noreferrer';
  if (article.titleZh) addText(main, 'p', 'english-title', article.title);
  const meta = el('div', 'article-meta'); [article.journal || '期刊待核实', article.onlineDate || article.date || '日期待核实', article.authors || '作者待核实'].forEach(item => addText(meta, 'span', '', item)); main.append(meta);
  if (article._metrics) addText(main, 'p', 'data-source', `期刊指标（${article._metrics.year || '年份待核实'}）：JIF ${article._metrics.jif ?? '—'} · ${article._metrics.category || '学科待核实'} · ${article._metrics.quartile || '—'}；来源：${article._metrics.source}`);
  if (article.abstractZh) { const p = addText(main, 'p', 'abstract'); addText(p, 'strong', '', '中文摘要译文 · '); p.append(document.createTextNode(article.abstractZh)); addText(main, 'p', 'translation-note', article.reviewed ? '人工已审核译文。请以英文原文为准。' : '中文内容由开源模型辅助翻译，待人工审核；请以英文原文为准。'); }
  if (article.abstract) { const p = addText(main, 'p', 'abstract'); addText(p, 'strong', '', 'Original abstract · '); p.append(document.createTextNode(article.abstract)); }
  if (article.takeaways?.length) { addText(main, 'p', 'takeaways-title', '研究要点 · 从英文摘要提取'); const ul = el('ul', 'takeaways'); article.takeaways.forEach(point => addText(ul, 'li', '', point)); main.append(ul); }
  const tags = el('div', 'tags'); (article.tags || []).forEach(tag => addText(tags, 'span', 'tag' + (tag === '器官芯片' ? ' chip' : ''), tag)); for (const key of article._topics || []) addText(tags, 'span', 'tag', state.config.topics[key].label); main.append(tags);
  if (state.view === 'pathogen') { const list = el('div', 'category-list'); for (const [group, labels] of Object.entries(article._categories || {})) labels.forEach(label => addText(list, 'span', '', `${group}：${label}`)); main.append(list); }
  const identifiers = [article.doi && `DOI: ${article.doi}`, article.pmid && `PMID: ${article.pmid}`, article.pmcid && `PMCID: ${article.pmcid}`].filter(Boolean).join(' · ');
  if (identifiers) addText(main, 'p', 'data-source', identifiers);
  const details = [article.date && `首次发表：${article.date}`, article.onlineDate && `电子发表：${article.onlineDate}`, article.articleType && `类型：${article.articleType}`, article.license && `许可：${article.license}`, article.affiliations?.length && `作者单位：${article.affiliations.slice(0, 5).join('；')}`].filter(Boolean);
  if (details.length) { const more = el('details', 'paper-details'); addText(more, 'summary', '', '出版与机构信息'); details.forEach(detail => addText(more, 'p', '', detail)); main.append(more); }
  card.append(main); const side = el('div', 'article-side'); addText(side, 'span', article.reviewed ? 'state checked' : 'state', article.reviewed ? '✓ 已审核' : '◷ 待审核');
  addText(side, 'span', 'publication-status', article.section === 'preprint' ? '预印本 · 未同行评审' : '正式发表');
  const source = addText(side, 'a', '', '查看原文 ↗'); source.href = safeUrl(article.url); source.target = '_blank'; source.rel = 'noopener noreferrer';
  if (article.source && article.sourceId) { const record = addText(side, 'a', '', '来源记录 ↗'); record.href = safeUrl(`https://europepmc.org/article/${encodeURIComponent(article.source)}/${encodeURIComponent(article.sourceId)}`); record.target = '_blank'; record.rel = 'noopener noreferrer'; }
  if (article.openAccessUrl || (article.openAccess && article.pmcid)) { const full = addText(side, 'a', '', '开放全文 ↗'); full.href = safeUrl(article.openAccessUrl || `https://europepmc.org/articles/${article.pmcid}`); full.target = '_blank'; full.rel = 'noopener noreferrer'; }
  card.append(side); return card;
}
function cutoffDate() { const d = new Date(); if (state.period === 'month') d.setDate(d.getDate() - 30); else d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); }
function inView(a) {
  if (/editorial|letter|comment|correction|retraction|erratum|conference|book chapter|interview|news|biography/i.test(`${a.title || ''} ${a.articleType || ''}`)) return false;
  if (state.period !== 'all' && (a.date || '') < cutoffDate()) return false;
  if (state.view === 'highImpact') return a._highImpact;
  if (['pathogen', 'drug', 'ai'].includes(state.view)) return a._topics.includes(state.view);
  return true;
}
function updateDetails() {
  const wrap = $('#detailWrap'), select = $('#detail'); wrap.hidden = state.view !== 'pathogen'; select.replaceChildren(el('option', '', '全部类别')); select.firstChild.value = 'all';
  if (wrap.hidden) return;
  for (const [group, options] of Object.entries(state.config.topics?.pathogen?.categories || {})) for (const name of Object.keys(options)) { const option = el('option', '', `${group}：${name}`); option.value = `${group}:${name}`; select.append(option); }
  select.value = state.detail;
}
function render() {
  if (!state.articles.length) return;
  if (state.period === 'all' && !state.fullLoaded) { $('#resultCount').textContent = '正在载入全部历史…'; $('#articles').replaceChildren(addText(document.createDocumentFragment(), 'p', 'empty', '正在逐年载入历史文献，请稍候…')); $('#more').hidden = true; return; }
  const q = state.search.trim().toLocaleLowerCase();
  const base = state.articles.filter(a => !a.hidden && inView(a));
  for (const [section, id] of [['research','tabResearch'],['review','tabReview'],['preprint','tabPreprint']]) $(`#${id}`).textContent = base.filter(a => a.section === section).length;
  const filtered = base.filter(a => a.section === state.section && (state.topic === 'all' || (a.tags || []).includes(state.topic)) && (state.status === 'all' || Boolean(a.reviewed) === (state.status === 'reviewed')) && (state.organ === 'all' || a._organs.includes(state.organ)) && (state.journal === 'all' || a.journal === state.journal) && (!state.oa || Boolean(a.openAccess || a.openAccessUrl)) && (state.detail === 'all' || (() => { const [group, label] = state.detail.split(':'); return (a._categories[group] || []).includes(label); })()) && (!q || [a.title, a.titleZh, a.authors, a.journal, a.abstract, a.abstractZh, a.doi, a.pmid].some(v => (v || '').toLocaleLowerCase().includes(q))));
  if (state.sort === 'old') filtered.reverse();
  if (state.sort === 'translated') filtered.sort((a, b) => Number(Boolean(b.abstractZh)) - Number(Boolean(a.abstractZh)));
  $('#resultCount').textContent = `符合条件：${filtered.length} 篇`;
  const container = $('#articles'); container.replaceChildren();
  if (!filtered.length) addText(container, 'p', 'empty', '没有符合条件的文献，请调整筛选条件。');
  else container.append(...filtered.slice(0, state.limit).map(renderCard));
  $('#more').hidden = filtered.length <= state.limit;
}
async function optionalJson(path, fallback) { try { const response = await fetch(path, {cache:'no-store'}); return response.ok ? await response.json() : fallback; } catch { return fallback; } }
function loading(title, detail, progress, error = false) {
  const notice = $('#loadingNotice'); notice.hidden = false; notice.classList.toggle('error', error);
  $('#loadingTitle').textContent = title; $('#loadingText').textContent = detail; $('#loadingProgress').value = progress;
}
function prepare(raw) {
  return raw.map(a => {
    const translated = state.translations[a.key] || {};
    for (const field of ['titleZh','abstractZh','takeaways']) if (!a[field] || Array.isArray(a[field]) && !a[field].length) a[field] = translated[field] || a[field];
    const review = state.reviews[a.key] || state.reviews[a.doi && `doi:${a.doi.toLowerCase()}`] || state.reviews[a.pmid && `pmid:${a.pmid}`] || {};
    for (const field of ['titleZh','abstractZh','takeaways','reviewed','hidden','tags','section']) if (Object.hasOwn(review, field)) a[field] = review[field];
    classifyTopics(a); return a;
  }).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
}
function refreshJournals() {
  const select = $('#journal'), chosen = select.value;
  select.replaceChildren(el('option', '', '全部期刊')); select.firstChild.value = 'all';
  const journals = new Map(); state.articles.forEach(a => { if (a.journal) journals.set(a.journal, (journals.get(a.journal) || 0) + 1); });
  const popular = [...journals].sort((a,b) => b[1]-a[1]).slice(0,60);
  if (chosen !== 'all' && journals.has(chosen) && !popular.some(([name]) => name === chosen)) popular.push([chosen, journals.get(chosen)]);
  for (const [name, count] of popular) { const option = el('option', '', `${name} (${count})`); option.value = name; select.append(option); }
  select.value = chosen;
}
function refreshTotals() {
  const visible = state.articles.filter(a => !a.hidden && !/editorial|letter|comment|correction|retraction|erratum|conference|book chapter|interview|news|biography/i.test(`${a.title || ''} ${a.articleType || ''}`));
  $('#totalCount').textContent = state.manifest?.count ?? visible.length;
  $('#researchCount').textContent = state.manifest?.sections?.research ?? (state.fullLoaded ? visible.filter(a => a.section === 'research').length : '—');
  $('#translationCount').textContent = Object.values(state.translations).filter(value => value.abstractZh).length || visible.filter(a => a.abstractZh).length;
}
async function fetchYear(year) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`data/articles/${encodeURIComponent(year)}.json`);
      if (!response.ok) throw new Error(`Year ${year}: HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}
async function ensureAllHistory() {
  if (state.fullLoaded) return;
  if (state.fullPromise) return state.fullPromise;
  state.fullPromise = (async () => {
    const years = state.manifest.years;
    let finished = 0, next = 0, failed = false;
    const lists = new Array(years.length);
    loading('正在载入全部历史', `已载入 0 / ${years.length} 个年份`, 0); render();
    async function worker() {
      while (!failed && next < years.length) {
        const i = next++;
        try { lists[i] = await fetchYear(years[i]); } catch (error) { failed = true; throw error; }
        finished++;
        if (!failed) loading('正在载入全部历史', `已载入 ${finished} / ${years.length} 个年份`, Math.round(finished / years.length * 90));
      }
    }
    await Promise.all(Array.from({length: Math.min(3, years.length)}, worker));
    loading('正在整理历史文献', '正在准备筛选结果…', 95);
    state.articles = prepare(lists.flat()); state.fullLoaded = true;
    refreshJournals(); refreshTotals(); render();
    loading('历史文献已载入', `共 ${state.manifest.count} 篇`, 100);
    $('#loadingNotice').hidden = true;
  })();
  try { await state.fullPromise; } catch (error) {
    loading('历史文献载入失败', '请检查网络后重新选择“全部历史”。', 0, true);
    state.period = 'year'; $('#period').value = 'year'; render(); console.error(error);
  } finally { state.fullPromise = null; }
}
async function init() {
  try {
    loading('正在载入文献', '步骤 1 / 3：读取文献索引…', 10);
    const [manifest, config, translations, reviews] = await Promise.all([optionalJson('data/index.json', null), optionalJson('config.json', {}), optionalJson('data/translations.json', {}), optionalJson('data/reviews.json', {})]);
    state.manifest = manifest; state.config = config; state.translations = translations; state.reviews = reviews;
    loading('正在载入文献', '步骤 2 / 3：读取近期文献…', 35);
    let raw;
    if (manifest?.years) {
      const recent = await optionalJson('data/recent.json', null);
      if (recent) raw = recent;
      else { const current = new Date().getUTCFullYear(); const years = manifest.years.filter(year => Number(year) >= current - 1); raw = (await Promise.all((years.length ? years : manifest.years.slice(0,2)).map(fetchYear))).flat(); }
    } else {
      const response = await fetch('data/articles.json', {cache:'no-store'}); if (!response.ok) throw new Error(`HTTP ${response.status}`); raw = (await response.json()).articles; state.fullLoaded = true;
    }
    loading('正在载入文献', '步骤 3 / 3：整理筛选结果…', 85);
    state.articles = prepare(raw || []);
    $('#updatedAt').textContent = manifest?.updatedAt || '等待首次检索'; refreshTotals();
    const organ = $('#organ'); for (const name of Object.keys(state.config.organSystems || {})) { const option = el('option', '', name); option.value = name; organ.append(option); }
    refreshJournals(); render(); loading('文献已载入', '近期文献可以开始浏览。', 100); $('#loadingNotice').hidden = true;
  } catch (error) { loading('文献载入失败', '请检查网络后刷新页面重试。', 0, true); $('#articles').replaceChildren(addText(document.createDocumentFragment(), 'p', 'empty', '文献数据暂时无法载入，请稍后重试。')); $('#resultCount').textContent = '数据载入失败'; console.error(error); }
}
document.querySelectorAll('.entry').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.entry').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); state.view = button.dataset.view; state.detail = 'all'; state.limit = 20; updateDetails(); $('#scopeNote').textContent = state.view === 'highImpact' ? '依据配置中的重点期刊名单；不等同于 JIF 或 JCR Q1。' : state.view === 'latest' ? '默认展示最近一年；历史文献可切换查看。' : '按标题、关键词和摘要自动识别专题，分类结果待人工核对。'; render(); }));
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.filter').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); state.section = button.dataset.section; state.limit = 20; render(); }));
$('#search').addEventListener('input', e => { state.search = e.target.value; state.limit = 20; render(); });
for (const id of ['topic','status','period','detail','organ','journal','sort']) $(`#${id}`).addEventListener('change', e => { state[id] = e.target.value; state.limit = 20; if (id === 'period' && state.period === 'all' && !state.fullLoaded) ensureAllHistory(); else render(); });
$('#oa').addEventListener('change', e => { state.oa = e.target.checked; state.limit = 20; render(); });
$('#reset').addEventListener('click', () => { for (const id of ['topic','status','detail','organ','journal']) { state[id] = 'all'; $(`#${id}`).value = 'all'; } state.period = 'year'; $('#period').value = 'year'; state.sort = 'new'; $('#sort').value = 'new'; state.oa = false; $('#oa').checked = false; state.search = ''; $('#search').value = ''; state.limit = 20; render(); });
$('#more').addEventListener('click', () => { state.limit += 20; render(); });
init();
