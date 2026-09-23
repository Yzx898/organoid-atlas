const state = { articles: [], config: {}, view: 'latest', section: 'research', search: '', topic: 'all', status: 'all', period: 'year', detail: 'all', limit: 20 };
const $ = selector => document.querySelector(selector);
const el = (tag, className, value) => { const node = document.createElement(tag); if (className) node.className = className; if (value != null) node.textContent = value; return node; };
function addText(parent, tag, className, value) { const node = el(tag, className, value); parent.append(node); return node; }
function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } }
function matches(text, words) { return (words || []).some(word => { const needle = word.toLocaleLowerCase(); return needle.length < 4 ? new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(text) : text.includes(needle); }); }
function classifyTopics(article) {
  const text = `${article.title || ''} ${article.abstract || ''} ${(article.keywords || []).join(' ')}`.toLocaleLowerCase();
  article._topics = Object.entries(state.config.topics || {}).filter(([, topic]) => matches(text, topic.keywords)).map(([key]) => key);
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
  if (article._metrics) addText(main, 'p', 'data-source', `期刊指标（${article._metrics.year || '年份待核实'}）：JIF ${article._metrics.jif ?? '—'} · ${article._metrics.quartile || '—'}；来源：${article._metrics.source}`);
  if (article.abstractZh) { const p = addText(main, 'p', 'abstract'); addText(p, 'strong', '', '中文摘要译文 · '); p.append(document.createTextNode(article.abstractZh)); addText(main, 'p', 'translation-note', article.reviewed ? '人工已审核译文。请以英文原文为准。' : '中文内容由开源模型辅助翻译，待人工审核；请以英文原文为准。'); }
  if (article.abstract) { const p = addText(main, 'p', 'abstract'); addText(p, 'strong', '', 'Original abstract · '); p.append(document.createTextNode(article.abstract)); }
  if (article.takeaways?.length) { addText(main, 'p', 'takeaways-title', '研究要点 · 从英文摘要提取'); const ul = el('ul', 'takeaways'); article.takeaways.forEach(point => addText(ul, 'li', '', point)); main.append(ul); }
  const tags = el('div', 'tags'); (article.tags || []).forEach(tag => addText(tags, 'span', 'tag' + (tag === '器官芯片' ? ' chip' : ''), tag)); for (const key of article._topics || []) addText(tags, 'span', 'tag', state.config.topics[key].label); main.append(tags);
  if (state.view === 'pathogen') { const list = el('div', 'category-list'); for (const [group, labels] of Object.entries(article._categories || {})) labels.forEach(label => addText(list, 'span', '', `${group}：${label}`)); main.append(list); }
  const identifiers = [article.doi && `DOI: ${article.doi}`, article.pmid && `PMID: ${article.pmid}`, article.pmcid && `PMCID: ${article.pmcid}`].filter(Boolean).join(' · ');
  if (identifiers) addText(main, 'p', 'data-source', identifiers);
  card.append(main); const side = el('div', 'article-side'); addText(side, 'span', article.reviewed ? 'state checked' : 'state', article.reviewed ? '✓ 已审核' : '◷ 待审核');
  const source = addText(side, 'a', '', '查看原文 ↗'); source.href = safeUrl(article.url); source.target = '_blank'; source.rel = 'noopener noreferrer';
  if (article.pmcid) { const full = addText(side, 'a', '', '开放全文 ↗'); full.href = safeUrl(`https://europepmc.org/articles/${article.pmcid}`); full.target = '_blank'; full.rel = 'noopener noreferrer'; }
  card.append(side); return card;
}
function cutoffDate() { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); }
function inView(a) {
  if (state.period === 'year' && (a.date || '') < cutoffDate()) return false;
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
  const q = state.search.trim().toLocaleLowerCase();
  const base = state.articles.filter(a => !a.hidden && inView(a));
  for (const [section, id] of [['research','tabResearch'],['review','tabReview'],['preprint','tabPreprint']]) $(`#${id}`).textContent = base.filter(a => a.section === section).length;
  const filtered = base.filter(a => a.section === state.section && (state.topic === 'all' || (a.tags || []).includes(state.topic)) && (state.status === 'all' || Boolean(a.reviewed) === (state.status === 'reviewed')) && (state.detail === 'all' || (() => { const [group, label] = state.detail.split(':'); return (a._categories[group] || []).includes(label); })()) && (!q || [a.title, a.titleZh, a.authors, a.journal, a.abstract, a.abstractZh, a.doi, a.pmid].some(v => (v || '').toLocaleLowerCase().includes(q))));
  $('#resultCount').textContent = `符合条件：${filtered.length} 篇`;
  const container = $('#articles'); container.replaceChildren();
  if (!filtered.length) addText(container, 'p', 'empty', '没有符合条件的文献，请调整筛选条件。');
  else container.append(...filtered.slice(0, state.limit).map(renderCard));
  $('#more').hidden = filtered.length <= state.limit;
}
async function optionalJson(path, fallback) { try { const response = await fetch(path, {cache:'no-store'}); return response.ok ? await response.json() : fallback; } catch { return fallback; } }
async function init() {
  try {
    const response = await fetch('data/articles.json', {cache:'no-store'}); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json(); const [config, translations] = await Promise.all([optionalJson('config.json', {}), optionalJson('data/translations.json', {})]); state.config = config;
    state.articles = (data.articles || []).map(a => { const translated = translations[a.key] || {}; for (const field of ['titleZh','abstractZh','takeaways']) if (!a[field] || Array.isArray(a[field]) && !a[field].length) a[field] = translated[field] || a[field]; classifyTopics(a); return a; }).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
    $('#updatedAt').textContent = data.updatedAt || '等待首次检索'; $('#totalCount').textContent = state.articles.filter(a => !a.hidden).length; $('#researchCount').textContent = state.articles.filter(a => !a.hidden && a.section === 'research').length; render();
  } catch (error) { $('#articles').replaceChildren(addText(document.createDocumentFragment(), 'p', 'empty', '文献数据暂时无法载入，请稍后重试。')); $('#resultCount').textContent = '数据载入失败'; console.error(error); }
}
document.querySelectorAll('.entry').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.entry').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); state.view = button.dataset.view; state.detail = 'all'; state.limit = 20; updateDetails(); $('#scopeNote').textContent = state.view === 'highImpact' ? '依据配置中的重点期刊名单；不等同于 JIF 或 JCR Q1。' : state.view === 'latest' ? '默认展示最近一年；历史文献可切换查看。' : '按标题、关键词和摘要自动识别专题，分类结果待人工核对。'; render(); }));
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.filter').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); state.section = button.dataset.section; state.limit = 20; render(); }));
$('#search').addEventListener('input', e => { state.search = e.target.value; state.limit = 20; render(); });
for (const id of ['topic','status','period','detail']) $(`#${id}`).addEventListener('change', e => { state[id] = e.target.value; state.limit = 20; render(); });
$('#more').addEventListener('click', () => { state.limit += 20; render(); });
init();
