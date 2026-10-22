const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.setPath('userData', path.join(app.getPath('temp'), `globalpulse-smoke-${process.pid}`));
require('../electron/main.cjs');
const deadline = setTimeout(() => { console.error('桌面检查超时'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
    try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length !== 2) throw new Error('主窗口与菜单栏窗口未正确创建');
        await Promise.all(windows.map(win => new Promise(resolve => {
            if (!win.webContents.isLoading()) resolve(); else win.webContents.once('did-finish-load', resolve);
        })));
        const main = windows.find(w => w.getBounds().width > 500);
        const result = await main.webContents.executeJavaScript(`(async () => {
      const assert = (value, message) => { if (!value) throw new Error(message); };
      assert(document.querySelector('h1').textContent.includes('股票'), '默认股票板块');
      assert(document.querySelector('#sort').value === 'latest', '默认最新时间排序');
      const initialState = state;
      state = { ...state, articles: [
        { id: 'old', title: 'Old news', summary: 'English summary', score: 90, reasons: [], group: 'finance', publishedAt: '2026-01-01T00:00:00Z' },
        { id: 'new', title: 'New news', summary: 'English summary', titleZh: '最新中文消息', summaryZh: '中文摘要', translationStatus: 'done', score: 42, reasons: [], group: 'finance', publishedAt: '2026-10-22T00:00:00Z' },
        { id: 'unknown', title: 'Unknown news', summary: '', score: 80, reasons: [], group: 'finance', publishedAt: null, fetchedAt: '2099-01-01T00:00:00Z' }
      ] };
      render();
      assert(articles().map(a => a.id).join(',') === 'new,old,unknown', '发布时间倒序、未知置后及扩大筛选范围');
      assert(document.querySelector('.news-card h3').textContent === '最新中文消息', '中文标题');
      assert(!document.querySelector('.news-list').textContent.includes('English summary'), '不展示未翻译摘要');
      selected = 'new'; render();
      assert(document.querySelector('.detail h2').textContent === '最新中文消息', '详情中文标题');
      assert(document.querySelector('.detail-summary').textContent === '中文摘要', '详情中文摘要');
      state = initialState; selected = null; render();
      document.querySelector('#add-board').click();
      assert(document.querySelector('dialog').open, '创建对话框');
      document.querySelector('[data-preset="military"]').click();
      assert(document.querySelector('#board-form').elements.name.value === '军事', '军事预设');
      document.querySelector('#cancel-board').click();
      const original = await pulse.state();
      await pulse.saveBoards([...original.boards, { id: 'smoke-military', name: '军事', keywords: 'war,军事' }]);
      await new Promise(requestAnimationFrame);
      assert(document.querySelector('[data-board="smoke-military"]'), '添加板块');
      document.querySelector('[data-board="smoke-military"]').click();
      assert(document.querySelector('h1').textContent.includes('军事'), '切换板块');
      await pulse.saveBoards(original.boards);
      await new Promise(requestAnimationFrame);
      assert(!document.querySelector('[data-board="smoke-military"]'), '删除板块');
      document.querySelector('#sources').click();
      assert(document.querySelector('h1').textContent.includes('来源'), '来源页面');
      document.querySelector('#settings').click();
      assert(document.querySelector('#interval'), '偏好设置');
      document.querySelector('[data-board="stocks"]').click();
      return '默认板块、添加/删除、军事预设、页面切换验证通过';
    })()`);
        console.log(result);
        const popup = windows.find(w => w.getBounds().width < 500);
        const popupOk = await popup.webContents.executeJavaScript("Boolean(document.querySelector('#open-main') && document.querySelector('.tray-list'))");
        if (!popupOk) throw new Error('菜单栏摘要未渲染');
        console.log('菜单栏摘要窗口验证通过');
        const image = await main.webContents.capturePage();
        fs.writeFileSync(path.join(__dirname, '../release/smoke.png'), image.toPNG());
        clearTimeout(deadline); app.exit(0);
    } catch (error) { console.error(error); clearTimeout(deadline); app.exit(1); }
});