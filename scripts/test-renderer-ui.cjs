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
  const canvas = document.createElement('canvas');canvas.width=960;canvas.height=600;
  const context=canvas.getContext('2d');context.fillStyle='#e5eff5';context.fillRect(0,0,960,600);
  context.fillStyle='#287a63';context.fillRect(40,40,540,520);
  context.fillStyle='#d05163';context.fillRect(620,40,300,240);
  context.fillStyle='#334b65';context.fillRect(620,320,300,240);
  const png = canvas.toDataURL('image/png');
  const settings = { interfaceMode:mode, themeMode:theme, themeAccent:accent, captureEnabled:true, capturePausedUntil:null,
    globalShortcut:'Alt+V', excludedAppNames:[], sensitiveKeywords:[], captureImages:true, captureFiles:true,
    launchAtLogin:false, pasteAfterCopy:false, maxHistoryItems:1000, maxTextLength:20000, maxImageBytes:5242880,
    maxFilePaths:20, retentionDays:0, maxStorageBytes:268435456, backupIntervalHours:24, backupKeepCount:7, automaticBackups:true };
  const items = Array.from({length:936}, (_,i) => ({id:String(i),kind:'text',text:'Synthetic clipboard '+i+' '+ 'long content '.repeat(25),
    pinned:false,copyCount:1,createdAt:Date.now(),updatedAt:Date.now()-i}));
  items[0] = {...items[0],kind:'image',dataUrl:png,width:960,height:600,byteSize:8192};
  items[1] = {...items[1],kind:'file',paths:['C:\\Example\\'+'very-long-filename'.repeat(40)+'.txt']};
  items[2].text = 'unbroken'.repeat(2000) + '\n\t' + 'long code line '.repeat(100);
  const state = {items,settings,storageBytes:2048,storageDirectory:'C:\\Example',storageFilePath:'C:\\Example\\history.br',storageCompression:'brotli',storageEncrypted:false,encryptionAvailable:false};
  let stateListener = () => {};
  const audit = window.audit = {copies:0,hides:0,updateCase:'available',releaseInstall:null,
    holdMutation:false,releaseMutation:null,mutationFailure:false,pins:0,deletes:0};
  const waitMutation = async () => {
    if(audit.holdMutation) await new Promise(resolve=>{audit.releaseMutation=resolve;});
    if(audit.mutationFailure) throw Error('Synthetic persistence failure');
  };
  const emit = () => stateListener(structuredClone(state));
  window.lightClip = {
    getState:async()=>structuredClone(state),onStateChanged:fn=>{stateListener=fn; return ()=>{};},
    onHistoryItemUpserted:fn=>{audit.emitHistory=fn;return ()=>{};},onPasteStatus:fn=>{audit.emitPaste=fn;return ()=>{};},
    copyItem:async()=>{audit.copies++;await new Promise(r=>setTimeout(r,120));return {ok:true};},
    togglePin:async id=>{audit.pins++;await waitMutation();const item=items.find(i=>i.id===id);item.pinned=!item.pinned;
      audit.emitHistory({item:structuredClone(item),storageBytes:2048,retainedIds:state.items.map(i=>i.id)});
      return {ok:true,data:structuredClone(item)};},
    deleteItem:async id=>{audit.deletes++;await waitMutation();state.items=state.items.filter(i=>i.id!==id);return {ok:true,data:{storageBytes:1024}};},
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
      if(command==='plugin:updater|download_and_install' || command==='plugin:process|restart') throw Error('Unsafe legacy updater path');
      if(command==='install_signed_update') {
        if(args.rid!==1) throw Error('Invalid update resource');
        args.onEvent.onmessage({event:'Started',data:{contentLength:100}});
        args.onEvent.onmessage({event:'Progress',data:{chunkLength:100}});
        args.onEvent.onmessage({event:'Finished'});
        audit.installChannel=args.onEvent;
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
        await page.locator('.image-preview-frame').first().hover();
        await page.getByRole('tooltip',{name:'图片预览'}).waitFor();
        assert.equal(await page.locator('.image-hover-preview').evaluate(el=>{
          const r=el.getBoundingClientRect();return r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight;
        }),true);
        assert.equal(await page.locator('.image-hover-preview img').evaluate(img=>img.complete && img.naturalWidth>0),true);
        if(output) {fs.mkdirSync(output,{recursive:true});await page.screenshot({animations:'disabled',path:path.join(output,`hover-${width}-${theme}.png`)});}
        await page.locator('.history-list').evaluate(el=>el.dispatchEvent(new Event('scroll')));
        await page.getByRole('tooltip',{name:'图片预览'}).waitFor({state:'hidden'});
        await page.locator('.filter-tab').last().hover();
        await page.waitForTimeout(400);
        assert.equal(await page.locator('.filter-tooltip').last().evaluate(el=>{
          const rect=el.getBoundingClientRect();return rect.right<=innerWidth && getComputedStyle(el).visibility==='visible';
        }),true);
        const preview = mode==='compact' ? page.getByTitle('预览和操作').first() : page.getByTitle('预览',{exact:true}).first();
        await preview.focus(); await page.keyboard.press('Enter');
        await page.getByRole('dialog',{name:'历史预览'}).waitFor();
        assert.equal(await page.evaluate(()=>audit.copies),0);
        const imageViewport = page.locator('.preview-image-viewport');
        await imageViewport.hover();
        await page.mouse.wheel(0, -480);
        assert.equal(await page.locator('.image-zoom-level').textContent(), '115%');
        const imageBox = await imageViewport.boundingBox();
        if (!imageBox) throw new Error('Image viewport has no bounds');
        await page.mouse.move(imageBox.x + imageBox.width / 2, imageBox.y + imageBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(imageBox.x + imageBox.width / 2 + 40, imageBox.y + imageBox.height / 2 + 25);
        await page.mouse.up();
        assert.match(await page.locator('.preview-image').getAttribute('style'), /translate\(40px, 25px\)/);
        await imageViewport.dblclick();
        assert.equal(await page.locator('.image-zoom-level').textContent(), '100%');
        await page.evaluate(()=>{audit.holdMutation=true;});
        await page.getByRole('dialog',{name:'历史预览'}).getByRole('button',{name:'固定',exact:true}).click();
        await page.getByRole('button',{name:'保存中…',exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'保存中…',exact:true}).isDisabled(),true);
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(()=>audit.pins),1);
        // A delayed native response must not prevent closing the modal or advancing browser frames.
        await page.getByTitle('关闭预览').click();
        await page.getByRole('dialog',{name:'历史预览'}).waitFor({state:'hidden',timeout:1000});
        await page.evaluate(()=>{audit.holdMutation=false;audit.releaseMutation();});
        await preview.click();
        await page.getByRole('dialog',{name:'历史预览'}).getByRole('button',{name:'取消固定',exact:true}).waitFor();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.preview-modal')),true);
        await page.keyboard.press('Escape');
        await page.getByRole('dialog',{name:'历史预览'}).waitFor({state:'hidden'});
        // Path and unbroken-text fixtures must not introduce a horizontal scroll surface.
        for(const kind of ['file','text']) {
          const row=page.locator('.history-item-'+kind).first();
          assert.ok((await row.locator('.item-preview').getAttribute('title')).length>260);
          await row.getByTitle(mode==='compact'?'预览和操作':'预览',{exact:true}).click();
          await page.getByRole('dialog',{name:'历史预览'}).waitFor();
          for(const selector of ['.history-list','.preview-modal','.preview-body']) {
            assert.equal(await page.locator(selector).evaluate(el=>{
              const style=getComputedStyle(el);return style.overflowX==='hidden' || el.scrollWidth<=el.clientWidth+2;
            }),true,selector+' exposes horizontal overflow');
          }
          if(output) await page.screenshot({animations:'disabled',path:path.join(output,`preview-${kind}-${width}-${theme}.png`)});
          await page.keyboard.press('Escape');
          await page.getByRole('dialog',{name:'历史预览'}).waitFor({state:'hidden'});
        }
        const textRow=page.locator('.history-item-text').first();
        await textRow.getByTitle(mode==='compact'?'预览和操作':'预览',{exact:true}).click();
        await page.evaluate(()=>{audit.mutationFailure=true;});
        await page.getByRole('dialog',{name:'历史预览'}).getByRole('button',{name:'删除',exact:true}).click();
        await page.getByText('删除失败，请重试',{exact:true}).waitFor();
        assert.equal(await page.getByRole('dialog',{name:'历史预览'}).isVisible(),true);
        await page.evaluate(()=>{audit.mutationFailure=false;});
        await page.getByRole('dialog',{name:'历史预览'}).getByRole('button',{name:'删除',exact:true}).click();
        await page.getByRole('dialog',{name:'历史预览'}).waitFor({state:'hidden'});
        assert.equal(await page.evaluate(()=>audit.deletes),2);
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
        await page.evaluate(()=>audit.installChannel.onmessage({event:'Installing'}));
        await page.getByText('正在打开安装程序',{exact:true}).waitFor();
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
