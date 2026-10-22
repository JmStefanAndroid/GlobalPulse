const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, screen, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { SOURCES, DEFAULT_BOARDS, collect, safeUrl } = require('./news.cjs');
const { translateArticle } = require('./translate.cjs');
let translating = false;
async function translatePending() {
    if (translating) return;
    translating = true; state.translating = true;
    const attempted = new Set(); let completed = 0;
    const worker = async () => {
        while (!quitting) {
            const article = [...state.articles].sort((a, b) => (b.score >= 40) - (a.score >= 40) || Date.parse(b.publishedAt || b.fetchedAt) - Date.parse(a.publishedAt || a.fetchedAt)).find(a => a.translationStatus !== 'done' && !attempted.has(a.id));
            if (!article) return;
            attempted.add(article.id);
            let result;
            try { result = await translateArticle(article); } catch { result = { translationStatus: 'failed' }; }
            const current = state.articles.find(a => a.id === article.id && a.title === article.title && a.summary === article.summary);
            if (current) Object.assign(current, result);
            if (++completed % 8 === 0) { persist(); broadcast(); }
        }
    };
    try { await Promise.all(Array.from({ length: 4 }, worker)); }
    finally { translating = false; state.translating = false; persist(); broadcast(); }
}
let mainWindow, popup, tray, timer, busy = false, quitting = false;
let state = { boards: DEFAULT_BOARDS, articles: [], statuses: [], readIds: [], settings: { interval: 60, launchAtLogin: false }, lastUpdated: null, refreshing: false };
const storage = () => path.join(app.getPath('userData'), 'pulse.json');
function persist() {
    try { fs.writeFileSync(`${storage()}.tmp`, JSON.stringify(state)); fs.renameSync(`${storage()}.tmp`, storage()); }
    catch (error) { console.error('保存失败', error); state.storageError = '本地保存失败，请检查磁盘空间或权限'; }
}
function broadcast() {
    for (const win of [mainWindow, popup]) if (win && !win.isDestroyed()) win.webContents.send('update', state);
}
async function refresh() {
    if (busy) return state;
    busy = true; state.refreshing = true; broadcast();
    try {
        const result = await collect(state.articles, state.statuses);
        Object.assign(state, result);
        if (result.statuses.some(s => s.ok)) state.lastUpdated = new Date().toISOString();
        persist();
        void translatePending();
    } finally { busy = false; state.refreshing = false; broadcast(); }
    return state;
}
function schedule() { clearInterval(timer); timer = setInterval(refresh, state.settings.interval * 1000); }
function makeWindow(isPopup = false) {
    const win = new BrowserWindow({ width: isPopup ? 420 : 1320, height: isPopup ? 620 : 860, minWidth: isPopup ? 420 : 960, minHeight: isPopup ? 500 : 650, show: false, frame: !isPopup, resizable: !isPopup, fullscreenable: !isPopup, alwaysOnTop: isPopup, backgroundColor: '#0b1018', title: 'GlobalPulse · 全球消息雷达', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.loadFile(path.join(__dirname, '../src/index.html'), { query: { view: isPopup ? 'tray' : 'main' } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    if (isPopup) win.on('blur', () => win.hide());
    else win.on('close', event => { if (!quitting) { event.preventDefault(); win.hide(); } });
    return win;
}
function showMain() { if (!mainWindow || mainWindow.isDestroyed()) mainWindow = makeWindow(); mainWindow.show(); mainWindow.focus(); }
function togglePopup() {
    if (popup.isVisible()) return popup.hide();
    const bounds = tray.getBounds(); const area = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
    popup.setPosition(Math.max(area.x, Math.min(bounds.x - 200, area.x + area.width - 420)), area.y + 4);
    popup.show(); popup.focus();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', showMain);
    app.whenReady().then(() => {
        try {
            const saved = JSON.parse(fs.readFileSync(storage(), 'utf8'));
            state = { ...state, ...saved, refreshing: false, settings: { ...state.settings, ...saved.settings } };
            if (!Array.isArray(state.boards) || !Array.isArray(state.articles)) throw new Error('无效本地数据');
        } catch { state = { ...state, boards: DEFAULT_BOARDS, articles: [], statuses: [], readIds: [], refreshing: false }; }
        const pixels = Buffer.alloc(18 * 18 * 4);
        for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
            const distance = Math.hypot(x - 8.5, y - 8.5);
            if ((distance > 5.5 && distance < 8) || distance < 2.6) pixels[(y * 18 + x) * 4 + 3] = 255;
        }
        const icon = nativeImage.createFromBitmap(pixels, { width: 18, height: 18, scaleFactor: 1 });
        icon.setTemplateImage(true);
        tray = new Tray(icon); tray.setToolTip('GlobalPulse · 全球重要消息');
        tray.on('click', togglePopup);
        tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([{ label: '打开 GlobalPulse', click: showMain }, { label: '刷新消息', click: refresh }, { type: 'separator' }, { label: '退出', click: () => app.quit() }])));
        mainWindow = makeWindow(); popup = makeWindow(true);
        mainWindow.once('ready-to-show', () => mainWindow.show());
        Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'GlobalPulse', submenu: [{ label: '打开主窗口', click: showMain }, { role: 'hide' }, { role: 'quit', label: '退出 GlobalPulse' }] }, { role: 'editMenu' }, { role: 'viewMenu' }]));
        schedule(); refresh();
    });
}
ipcMain.handle('state', () => state);
ipcMain.handle('confirm-delete', async (event, name) => {
    const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), { type: 'question', buttons: ['取消', '删除板块'], defaultId: 0, cancelId: 0, message: `删除“${String(name).slice(0, 24)}”板块？`, detail: '已抓取的消息不会删除。' });
    return result.response === 1;
});
ipcMain.handle('refresh', refresh);
ipcMain.handle('boards', (_, boards) => {
    if (!Array.isArray(boards) || boards.length > 30 || boards.some(b => !b || typeof b.id !== 'string' || typeof b.name !== 'string' || !b.name.trim() || typeof b.keywords !== 'string' || !b.keywords.trim())) throw new Error('板块名称与关键词不能为空，最多 30 个板块');
    state.boards = boards.map(b => ({ id: b.id.slice(0, 80), name: b.name.trim().slice(0, 24), keywords: b.keywords.slice(0, 1500), preset: b.id === 'stocks' ? 'stocks' : undefined }));
    persist(); broadcast(); return state;
});
ipcMain.handle('settings', (_, settings) => {
    state.settings.interval = Math.max(60, Math.min(900, Number(settings.interval) || 60));
    state.settings.launchAtLogin = Boolean(settings.launchAtLogin);
    app.setLoginItemSettings({ openAtLogin: state.settings.launchAtLogin });
    persist(); schedule(); broadcast(); return state;
});
ipcMain.handle('read', (_, id) => { if (typeof id === 'string') state.readIds = [...new Set([...state.readIds, id])].slice(-5000); persist(); broadcast(); });
ipcMain.handle('open-link', (_, url) => { const safe = safeUrl(url); if (safe) return shell.openExternal(safe); });
ipcMain.handle('open-main', () => { popup?.hide(); showMain(); });
app.on('activate', showMain);
app.on('before-quit', () => { quitting = true; clearInterval(timer); });
app.on('window-all-closed', () => { });