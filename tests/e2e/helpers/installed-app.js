import { chromium } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { configureContext } from './test.js';

// Real Chrome install, OS app registration and standalone launch. Keep a fresh
// profile so tests never install into the developer's everyday browser profile.
export async function nativeApp() {
  const origin='http://127.0.0.1:4173', manifestId=origin+'/';
  const context=await chromium.launchPersistentContext(`.test-data/m20-chrome-${randomUUID()}`, {
    channel:'chrome',headless:false,viewport:null,deviceScaleFactor:undefined,isMobile:false,baseURL:origin,
    ignoreDefaultArgs:['--disable-background-networking'],
    args:['--window-position=-32000,-32000','--window-size=1366,900']
  });
  await configureContext(context);
  context.setDefaultTimeout(30000);
  context.on('page', recordAccounts);
  context.pages().forEach(recordAccounts);
  const cdp=await context.browser().newBrowserCDPSession();
  let installed=false;
  return {
    context,page:context.pages()[0],
    async install() {
      await cdp.send('PWA.install',{manifestId,installUrlOrBundleUrl:manifestId});
      installed=true;
      await cdp.send('PWA.getOsAppState',{manifestId});
      // Chrome's protocol defaults to opening installed apps in a browser tab.
      await cdp.send('PWA.changeAppUserSettings',{manifestId,displayMode:'standalone'});
      const next=context.waitForEvent('page');
      await cdp.send('PWA.launch',{manifestId,url:origin+'/app'});
      const page=await next;
      await page.waitForLoadState('domcontentloaded');
      return page;
    },
    async close() {
      if(installed)await Promise.race([cdp.send('PWA.uninstall',{manifestId}).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,10000))]);
      await context.close().catch(()=>{});
    }
  };
}
function recordAccounts(page) {
  page.on('response',async response=>{
    if(!response.url().includes('/auth/v1/signup')||!response.ok())return;
    const data=await response.json().catch(()=>null);
    if(!data?.user?.email?.startsWith('vertex-e2e-m20-'))return;
    mkdirSync('.test-data',{recursive:true});
    appendFileSync('.test-data/accounts.ndjson',JSON.stringify({id:data.user.id,email:data.user.email})+'\n');
  });
}
export async function displayedPushes(page) {
  return page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.ready;
    return (await reg.getNotifications()).map(item=>({title:item.title,body:item.body,path:item.data?.path}));
  });
}
