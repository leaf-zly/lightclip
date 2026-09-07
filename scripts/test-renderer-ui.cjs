/** Renderer-only regression audit. Uses synthetic records and never accesses the user's clipboard. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../dist/renderer');
const output = process.env.LIGHTCLIP_AUDIT_OUTPUT;
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  try { res.end(fs.readFileSync(file)); } catch { res.writeHead(404).end(); }
});

/** Installs an isolated bridge, including controllable updater transfer and install phases. */
function installFixture({mode, theme, accent}) {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const settings = { interfaceMode:mode, themeMode:theme, themeAccent:accent, captureEnabled:true, capturePausedUntil:null,
    globalShortcut:'Alt+V', excludedAppNames:[], sensitiveKeywords:[], captureImages:true, captureFiles:true,
    launchAtLogin:false, pasteAfterCopy:false, maxHistoryItems:1000, maxTextLength:20000, maxImageBytes:5242880,
    maxFilePaths:20, retentionDays:0, maxStorageBytes:268435456, backupIntervalHours:24, backupKeepCount:7, automaticBackups:true };
  const items = Array.from({length:936}, (_,i) => ({id:String(i),kind:'text',text:'Synthetic clipboard '+i+' '+ 'long content '.repeat(25),
    pinned:false,copyCount:1,createdAt:Date.now(),updatedAt:Date.now()-i}));
  items[0] = {...items[0],kind:'image',dataUrl:png,width:1,height:1,byteSize:68};
  items[1] = {...items[1],kind:'file',paths:['C:\\Example\\a-very-long-filename.txt']};
  const state = {items,settings,storageBytes:2048,storageDirectory:'C:\\Example',storageFilePath:'C:\\Example\\history.br',storageCompression:'brotli',storageEncrypted:false,encryptionAvailable:false};
  let stateListener = () => {};
  const audit = window.audit = {copies:0,hides:0,updateCase:'available',releaseInstall:null};
  const emit = () => stateListener(structuredClone(state));
  window.lightClip = {
    getState:async()=>structuredClone(state),onStateChanged:fn=>{stateListener=fn; return ()=>{};},
    onHistoryItemUpserted:fn=>{audit.emitHistory=fn;return ()=>{};},onPasteStatus:fn=>{audit.emitPaste=fn;return ()=>{};},
    copyItem:async()=>{audit.copies++;await new Promise(r=>setTimeout(r,120));return {ok:true};},
    togglePin:async id=>{const item=items.find(i=>i.id===id);item.pinned=!item.pinned;emit();return {ok:true,data:structuredClone(item)};},
    deleteItem:async id=>{state.items=state.items.filter(i=>i.id!==id);emit();return {ok:true};},
    updateSettings:async patch=>{await new Promise(r=>setTimeout(r,120));Object.assign(settings,patch);return {ok:true,data:{...settings}};},
    hidePanel:async()=>{audit.hides++;},openExternalUrl:async()=>({ok:true})
  };
  localStorage.setItem('lightclip.last-update-check',String(Date.now()));
  window.__TAURI_INTERNALS__ = {
    transformCallback:()=>1,
    invoke:async(command,args)=>{
      if(command==='plugin:updater|check') {
        await new Promise(r=>setTimeout(r,50));
        if(audit.updateCase==='error') throw Error('Synthetic network failure');
        if(audit.updateCase==='current') return null;
        return {rid:1,version:'9.0.0',currentVersion:'2.3.0',body:'## Changes\n'+('- Synthetic release note\n').repeat(80)};
      }
      if(command==='plugin:updater|download_and_install') {
        args.onEvent.onmessage({event:'Started',data:{contentLength:100}});
        args.onEvent.onmessage({event:'Progress',data:{chunkLength:100}});
        args.onEvent.onmessage({event:'Finished'});
        await new Promise(resolve=>{audit.releaseInstall=resolve;});
        throw Error('Synthetic installation failure');
      }
    }
  };
}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({channel:process.env.AUDIT_BROWSER || 'msedge',headless:true});
  try {
    for (const width of [320,390,560,860]) {
      for (const theme of ['light','dark']) {
        const mode = width < 560 ? 'compact' : 'standard';
        const page = await browser.newPage({viewport:{width,height:600}});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.addInitScript(installFixture,{mode,theme,accent:'blue'});
        await page.goto('http://127.0.0.1:'+server.address().port);
        await page.locator('.history-item').first().waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
        assert.equal(await page.locator('.image-preview').first().evaluate(img=>img.complete && img.naturalWidth>0),true);
        await page.locator('.filter-tab').last().hover();
        await page.waitForTimeout(400);
        assert.equal(await page.locator('.filter-tooltip').last().evaluate(el=>{
          const rect=el.getBoundingClientRect();return rect.right<=innerWidth && getComputedStyle(el).visibility==='visible';
        }),true);
        const preview = mode==='compact' ? page.getByTitle('预览和操作').first() : page.getByTitle('预览',{exact:true}).first();
        await preview.focus(); await page.keyboard.press('Enter');
        await page.getByRole('dialog',{name:'历史预览'}).waitFor();
        assert.equal(await page.evaluate(()=>audit.copies),0);
        await page.getByRole('dialog',{name:'历史预览'}).getByRole('button',{name:'固定',exact:true}).click();
        await page.getByRole('dialog',{name:'历史预览'}).getByRole('button',{name:'取消固定',exact:true}).waitFor();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.preview-modal')),true);
        await page.keyboard.press('Escape');
        await page.getByRole('dialog',{name:'历史预览'}).waitFor({state:'hidden'});
        if(mode==='compact') await page.getByTitle('更多操作').click();
        await (mode==='compact' ? page.getByRole('button',{name:'设置',exact:true}) : page.getByTitle('设置',{exact:true})).click();
        await page.locator('.settings-pane').waitFor();
        const scrolled=await page.locator('.settings-pane').evaluate(el=>{el.scrollTop=el.scrollHeight;return el.scrollTop>0;});
        assert.equal(scrolled,true);
        await page.locator('.setting-text-input').first().focus();await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(()=>audit.copies),0);
        // All update entry points must reach the same rich dialog.
        await page.getByTitle('检查更新').last().click();
        await page.getByRole('dialog',{name:'软件更新'}).waitFor();
        await page.getByRole('button',{name:'下载并安装'}).click();
        await page.waitForFunction(()=>!!audit.releaseInstall);
        assert.equal(await page.getByTitle('关闭',{exact:true}).isDisabled(),true);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(()=>audit.hides),0);
        await page.evaluate(()=>audit.releaseInstall());
        await page.getByRole('button',{name:'浏览器下载'}).waitFor();
        if(output && width===390) {fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'updater-'+theme+'.png')});}
        await page.getByTitle('关闭',{exact:true}).click();
        assert.equal(await page.evaluate(()=>audit.hides),0);
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({width,theme,mode,result:'passed'}));
        await page.close();
      }
    }
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
