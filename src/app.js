const api = window.pulse;
const compact = new URLSearchParams(location.search).get('view') === 'tray';
let state, active = 'stocks', query = '', importantOnly = true, unreadOnly = false, selected = null, tab = 'feed', sort = 'latest';
let error = '';
const root = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = value => value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '尚未更新';
function ago(value) {
    if (!value) return '时间未知';
    const mins = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
    return mins < 1 ? '刚刚' : mins < 60 ? `${mins} 分钟前` : mins < 1440 ? `${Math.floor(mins / 60)} 小时前` : `${Math.floor(mins / 1440)} 天前`;
}
function matches(a, board) {
    if (!board) return true;
    const text = `${a.title} ${a.summary} ${a.titleZh || ''} ${a.summaryZh || ''}`.toLowerCase();
    return (board.preset === 'stocks' && (a.group === 'finance' || a.reasons?.some(r => ['货币政策', '宏观与贸易', '地缘风险', '经济与资产', '产业与监管'].includes(r)))) || board.keywords.split(/[,，\n]/).map(w => w.trim().toLowerCase()).filter(Boolean).some(w => {
        if (!/^[a-z0-9\s-]+$/i.test(w)) return text.includes(w);
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
    });
}
function articles() {
    const board = state.boards.find(b => b.id === active);
    return state.articles.filter(a => matches(a, board) && (!importantOnly || a.score >= 40) && (!unreadOnly || !state.readIds.includes(a.id)) && `${a.titleZh || ''} ${a.summaryZh || ''} ${a.title} ${a.summary} ${a.source}`.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => sort === 'latest' ? (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0) : b.score - a.score || (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}
function chinese(a, field) {
    if (a[`${field}Zh`]) return a[`${field}Zh`];
    if (a.translationStatus === 'failed') return field === 'title' ? '中文翻译暂不可用，稍后重试' : '翻译服务连接失败，将自动重试。';
    return field === 'title' ? '正在翻译这条消息…' : a.summary ? '摘要正在翻译，请稍候。' : '来源未提供摘要。';
}
function card(a, small = false) {
    const read = state.readIds.includes(a.id);
    return `<button class="news-card ${small ? 'small' : ''} ${selected === a.id ? 'selected' : ''} ${read ? 'read' : ''}" data-article="${esc(a.id)}">
    <div class="card-meta"><span class="source-dot"></span><span>${esc(a.source)}</span><span class="meta-time">${ago(a.publishedAt)}</span>${!read ? '<span class="unread-dot"></span>' : ''}</div>
    <h3>${esc(chinese(a, 'title'))}</h3>${!small ? `<p class="summary">${esc(chinese(a, 'summary'))}</p>` : ''}
    <div class="card-bottom"><span class="score ${a.score >= 70 ? 'high' : ''}">${a.score >= 70 ? '重点' : '关注'} ${a.score}</span>${a.reasons.slice(0, 2).map(r => `<span class="tag">${esc(r)}</span>`).join('')}<span class="arrow">↗</span></div>
  </button>`;
}
function render() {
    if (!state) return;
    const list = articles();
    const board = state.boards.find(b => b.id === active);
    const healthy = state.statuses.filter(s => s.ok).length;
    const refresh = `<button class="refresh ${state.refreshing ? 'spinning' : ''}" id="refresh" title="立即刷新" ${state.refreshing ? 'disabled' : ''}>↻</button>`;
    if (compact) {
        root.innerHTML = `<div class="tray-shell"><header class="tray-head"><div><span class="brand-icon">◎</span><strong>GlobalPulse</strong><span class="live"><i></i> ${state.refreshing ? '更新中' : '消息雷达'}</span></div>${refresh}</header>
      <div class="tray-tabs">${state.boards.map(b => `<button data-board="${esc(b.id)}" class="${active === b.id ? 'active' : ''}">${esc(b.name)}</button>`).join('')}<button data-board="all" class="${active === 'all' ? 'active' : ''}">全部</button></div>
      <div class="tray-status">重点速览 · ${healthy}/${state.statuses.length || 15} 来源在线<span>${time(state.lastUpdated)}</span></div>
      <div class="tray-list">${list.slice(0, 12).map(a => card(a, true)).join('') || empty()}</div>
      <footer class="tray-footer"><span>每 ${state.settings.interval} 秒更新</span><button id="open-main">打开完整工作台 ↗</button></footer></div>`;
        bind(); return;
    }
    const selectedArticle = state.articles.find(a => a.id === selected);
    root.innerHTML = `<div class="layout">
    <aside class="sidebar"><div class="brand"><span class="brand-icon">◎</span><div>GlobalPulse<small>全球重要消息雷达</small></div></div>
      <div class="nav-label">工作空间 <span>全球视野</span></div><button class="nav-item ${active === 'all' && tab === 'feed' ? 'active' : ''}" data-board="all"><span>▦</span>全球总览<span class="nav-count">${state.articles.length}</span></button>
      <div class="nav-label channels-label">关注板块<button id="add-board" title="添加板块">＋</button></div>
      <nav>${state.boards.map(b => `<div class="board-row"><button class="nav-item ${active === b.id && tab === 'feed' ? 'active' : ''}" data-board="${esc(b.id)}"><span>${b.id === 'stocks' ? '↗' : '◈'}</span>${esc(b.name)}<span class="nav-count">${state.articles.filter(a => matches(a, b) && a.score >= 40).length}</span></button><button class="delete-board" data-delete="${esc(b.id)}" title="删除 ${esc(b.name)} 板块">×</button></div>`).join('')}</nav>
      <button class="add-channel" id="add-channel">＋ 添加关注板块</button>
      <div class="sidebar-bottom"><button class="nav-item ${tab === 'sources' ? 'active' : ''}" id="sources"><span>◉</span>来源与连接<span class="connection-dot ${healthy ? '' : 'offline'}"></span></button><button class="nav-item ${tab === 'settings' ? 'active' : ''}" id="settings"><span>⚙</span>偏好设置</button><div class="local-note">◌ 本地保存 · 公共新闻联网翻译</div></div>
    </aside>
    <main><header class="topbar"><span>情报工作台 <span class="slash">/</span> ${tab === 'feed' ? esc(board?.name || '全球总览') : tab === 'sources' ? '来源与连接' : '偏好设置'}</span><div><span class="live"><i></i> ${state.refreshing ? '正在聚合消息' : '自动更新已开启'}</span>${refresh}</div></header>
      <div class="content">${error || state.storageError ? `<div class="alert">${esc(error || state.storageError)}</div>` : ''}
      ${tab === 'feed' ? `<section class="page-heading"><div><div class="eyebrow">全球信号，中文速览</div><h1>${esc(board?.name || '全球重要消息')}<span class="heading-dot">.</span></h1><p>汇聚全球独立来源，聚焦值得关注的变化。</p></div><div class="date-block">${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}<small>${new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}</small></div></section>
      <section class="stats"><div><span>已搜罗消息</span><strong>${state.articles.filter(a => matches(a, board)).length}<small>条</small></strong></div><div><span>重点信号 <em>规则筛选</em></span><strong class="mint">${state.articles.filter(a => matches(a, board) && a.score >= 70).length}<small>条</small></strong></div><div><span>独立来源在线</span><strong>${healthy}<small>/ ${state.statuses.length || 15}</small></strong></div><div><span>最近成功更新</span><strong class="update-time">${time(state.lastUpdated)}</strong></div></section>
      ${state.statuses.length && healthy === 0 ? '<div class="alert">所有来源暂不可用，正在展示本地缓存。可在“来源与连接”中查看错误。</div>' : ''}
      <section class="feed-tools"><div class="segmented"><button id="filter-important" class="${importantOnly ? 'active' : ''}">重要消息</button><button id="filter-all" class="${!importantOnly ? 'active' : ''}">全部消息</button></div><div class="tool-right"><label class="search">⌕ <input id="search" placeholder="搜索消息、来源…" value="${esc(query)}"></label><button id="unread" class="filter-button ${unreadOnly ? 'enabled' : ''}">仅未读</button><select id="sort"><option value="importance" ${sort === 'importance' ? 'selected' : ''}>重要性优先</option><option value="latest" ${sort === 'latest' ? 'selected' : ''}>最新发布</option></select></div></section>
      <div class="feed-caption"><span><i class="tiny-dot"></i> ${list.length} 条${importantOnly ? '重要' : ''}消息</span><span>中文机器翻译 · ${state.translating ? '正在翻译' : '已翻译'} ${state.articles.filter(a => a.translationStatus === 'done').length}/${state.articles.length} 条 · ${sort === 'latest' ? '最新消息在前，未知时间置后' : '重要性优先'}</span></div>
      <div class="feed-layout ${selectedArticle ? 'with-detail' : ''}"><section class="news-list">${list.map(a => card(a)).join('') || empty()}</section>${selectedArticle ? detail(selectedArticle) : ''}</div>
      <footer class="disclaimer">重要性为关键词规则评分，并非事实核验或投资建议；不预测涨跌。RSS 存在发布延迟，非交易所实时快讯。</footer>` : tab === 'sources' ? sources() : settings()}
      </div>
    </main></div>`;
    bind();
}
function empty() { return `<div class="empty"><span>◎</span><h3>${state.refreshing ? '正在搜罗全球消息' : '暂时没有匹配消息'}</h3><p>${state.refreshing ? '正在连接多个独立来源，首次加载可能需要片刻。' : '试试“全部消息”、关闭仅未读、调整板块关键词，或检查来源连接。'}</p></div>`; }
function detail(a) { return `<aside class="detail"><div class="detail-header"><span>消息详情</span><button id="close-detail">×</button></div><div class="eyebrow">${esc(a.source)}</div><h2>${esc(chinese(a, 'title'))}</h2><p class="muted">${a.publishedAt ? new Date(a.publishedAt).toLocaleString('zh-CN') : '来源未提供发布时间'}</p><div class="detail-score"><span>重要性评分</span><strong>${a.score}<small>/99</small></strong></div><p class="reason">命中主题：${esc(a.reasons.join('、') || '基础财经来源')}。该分数由关键词与发布时间计算，不代表消息可信度或股价方向。</p><h4>来源摘要</h4><p class="detail-summary">${esc(chinese(a, 'summary'))}</p><button class="primary full" data-link="${esc(a.url)}">在浏览器中阅读原文（未翻译）↗</button><p class="muted fine-print">标题与摘要为机器翻译，可能出错；外链原文未翻译。全文归原出版方所有。多来源展示不代表同一事件已获交叉验证。</p></aside>`; }
function sources() { return `<section class="page-heading"><div><div class="eyebrow">独立新闻来源</div><h1>来源与连接<span class="heading-dot">.</span></h1><p>直接读取出版方 RSS 订阅源。失败会保留缓存，不会生成虚假消息。</p></div></section><div class="source-grid">${state.statuses.map(s => `<article class="source-card"><div><span class="status-pill ${s.ok ? 'ok' : 'bad'}">${s.ok ? '连接正常' : '连接失败'}</span><span class="muted">${time(s.checkedAt)}</span></div><h2>${esc(s.name)}</h2><p>${s.ok ? `本次获取 ${s.count} 条消息` : esc(s.error)}</p><p class="muted">最近成功：${s.lastSuccess ? new Date(s.lastSuccess).toLocaleString('zh-CN') : '暂无'}</p><button data-link="${esc(s.url)}">查看订阅源 ↗</button></article>`).join('') || '<div class="empty">正在检查来源连接…</div>'}</div><div class="notice">网络环境可能限制部分境外来源。更新时间表示本应用完成拉取的时间，不等于新闻事件发生时间。默认每 60 秒拉取，缓存保留最近 7 天，最多 3000 条。</div>`; }
function settings() { return `<section class="page-heading"><div><div class="eyebrow">个性化工作台</div><h1>偏好设置<span class="heading-dot">.</span></h1><p>保持轻量，让消息在需要时出现。</p></div></section><section class="settings-panel"><div class="setting-row"><div><h3>更新频率</h3><p>最短 60 秒；避免过度请求公共订阅源。</p></div><select id="interval">${[60, 120, 300, 900].map(n => `<option value="${n}" ${state.settings.interval === n ? 'selected' : ''}>${n < 60 ? n + ' 秒' : n / 60 + ' 分钟'}</option>`).join('')}</select></div><div class="setting-row"><div><h3>登录时启动</h3><p>登录系统后启动应用。建议在打包应用中开启。</p></div><input id="login" type="checkbox" ${state.settings.launchAtLogin ? 'checked' : ''}></div><div class="setting-row"><div><h3>菜单栏常驻</h3><p>关闭主窗口仍继续收集消息。点击顶部 ◉ 查看摘要；右键可退出。</p></div><span class="status-pill ok">已启用</span></div><div class="notice">新闻及译文、板块、设置和已读记录保存在本机。公共新闻的标题与摘要会发送至 Google（谷歌）翻译公共接口；设置和已读记录不发送。该接口无需密钥，可能限流或失败，将在后续刷新时自动重试，不保证服务可用性。机器翻译可能出错，外链原文未翻译。</div></section>`; }
function action(fn) { return async (...args) => { try { error = ''; await fn(...args); } catch (e) { error = e.message; render(); } }; }
function on(selector, event, handler) { document.querySelector(selector)?.addEventListener(event, action(handler)); }
function bind() {
    on('#refresh', 'click', async () => { state = await api.refresh(); render(); });
    document.querySelectorAll('[data-board]').forEach(el => el.onclick = () => { active = el.dataset.board; selected = null; tab = 'feed'; render(); });
    document.querySelectorAll('[data-article]').forEach(el => el.onclick = action(async () => { selected = el.dataset.article; const a = state.articles.find(x => x.id === selected); await api.read(selected); if (compact) await api.openLink(a.url); else render(); }));
    document.querySelectorAll('[data-link]').forEach(el => el.onclick = action(() => api.openLink(el.dataset.link)));
    document.querySelectorAll('[data-delete]').forEach(el => el.onclick = action(async () => { const b = state.boards.find(x => x.id === el.dataset.delete); if (await api.confirmDelete(b.name)) { state = await api.saveBoards(state.boards.filter(x => x.id !== b.id)); if (active === b.id) active = 'all'; render(); } }));
    ['#add-board', '#add-channel'].forEach(id => on(id, 'click', () => document.querySelector('#board-dialog').showModal()));
    on('#sources', 'click', () => { tab = 'sources'; render(); });
    on('#settings', 'click', () => { tab = 'settings'; render(); });
    on('#close-detail', 'click', () => { selected = null; render(); });
    on('#filter-important', 'click', () => { importantOnly = true; render(); });
    on('#filter-all', 'click', () => { importantOnly = false; render(); });
    on('#unread', 'click', () => { unreadOnly = !unreadOnly; render(); });
    on('#sort', 'change', e => { sort = e.target.value; render(); });
    on('#search', 'input', e => { const pos = e.target.selectionStart; query = e.target.value; render(); const input = document.querySelector('#search'); input.focus(); input.setSelectionRange(pos, pos); });
    on('#interval', 'change', async e => { state = await api.settings({ ...state.settings, interval: Number(e.target.value) }); render(); });
    on('#login', 'change', async e => { state = await api.settings({ ...state.settings, launchAtLogin: e.target.checked }); render(); });
    on('#open-main', 'click', () => api.openMain());
}
document.querySelector('#cancel-board').onclick = () => document.querySelector('#board-dialog').close();
const presets = { military: ['军事', 'military,missile,defense,war,army,nato,军事,导弹,国防,战争,军队'], tech: ['科技', 'technology,artificial intelligence,semiconductor,chip,AI,科技,人工智能,芯片,半导体'], energy: ['能源', 'energy,oil,gas,opec,solar,nuclear,能源,石油,天然气,核能,光伏'] };
document.querySelectorAll('[data-preset]').forEach(el => el.onclick = () => { const [name, keywords] = presets[el.dataset.preset]; const form = document.querySelector('#board-form'); form.elements.name.value = name; form.elements.keywords.value = keywords; });
document.querySelector('#board-form').onsubmit = action(async e => {
    e.preventDefault(); const data = new FormData(e.target);
    const board = { id: crypto.randomUUID(), name: data.get('name').trim(), keywords: data.get('keywords').trim() };
    state = await api.saveBoards([...state.boards, board]); active = board.id; tab = 'feed'; selected = null;
    document.querySelector('#board-dialog').close(); e.target.reset(); render();
});
if (compact) document.body.classList.add('compact');
if (api) {
    api.onUpdate(next => { state = next; render(); });
    api.state().then(next => { state = next; render(); }).catch(e => { root.textContent = `加载失败：${e.message}`; });
} else root.textContent = '请通过 GlobalPulse 桌面应用打开。';