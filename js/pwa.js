export function createPWA({ client, state, escapeHtml:h }) {
  let installEvent=null, installedEvent=false, registration=null, registrationError=null, reloading=false;
  let activeUser=null, userRevision=0, userKnown=false;
  let preferenceDraft=null;
  const standalone=matchMedia('(display-mode: standalone)');
  const installed=()=>standalone.matches || navigator.standalone===true || installedEvent;
  const supported=()=>isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const apple=()=>/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const dismissed=()=>sessionStorage.getItem('vertex-install-dismissed')==='true';
  const result=async promise=>{const {data,error}=await promise;if(error)throw error;return data;};
  const bytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
  const instructions=()=>apple() ? 'In Safari, open Share, choose Add to Home Screen, then Add. Open Vertex from your home screen.' : /Firefox/.test(navigator.userAgent) ? 'On mobile, use your browser’s Install or Add to Home Screen menu. On desktop, use Chrome or Edge to install Vertex.' : 'Open your browser’s menu and choose Install Vertex, or choose Apps, then Install this site as an app. Then open Vertex from your apps.';
  function banner(){return '<aside class="device-banner-area" data-device-banner aria-label="Vertex app"></aside>';}
  function controls(){return '<section class="device-controls" data-device-controls aria-label="Device notifications"><p role="status">Checking notifications on this device…</p></section>';}
  function view(){return {title:'Vertex on this device',content:`<div class="page device-page"><div class="page-head"><span class="eyebrow">Vertex, within reach</span><h1>On this device.</h1><p>A home for your competitions. Important updates when you need them.</p></div><section class="device-install-card" data-install-card></section>${controls()}<section class="device-offline-note"><i class="fa-solid fa-wifi" aria-hidden="true"></i><div><h2>A useful pause when you’re offline.</h2><p>Vertex keeps an offline welcome page available. Account details, competition records and private files need a connection.</p></div></section></div>`};}
  function drawBanner(){
    const root=document.querySelector('[data-device-banner]');if(!root)return;
    if(registration?.waiting){root.innerHTML='<div class="device-banner"><div><strong>A fresh version of Vertex is ready.</strong><p>Save any edits before reloading.</p></div><button class="button primary" type="button" data-update-app>Reload to update</button></div>';}
    else if(!installed() && !dismissed() && (installEvent || apple())) root.innerHTML=`<div class="device-banner"><img src="/assets/logo.png" alt=""><div><strong>Keep Vertex within reach.</strong><p>Install for quick access and device notifications.</p></div><button class="button primary" type="button" data-install-app>${installEvent?'Install Vertex':'How to install'}</button><button class="device-dismiss" type="button" data-dismiss-install aria-label="Dismiss install banner"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`;
    else root.innerHTML='';
    root.querySelector('[data-dismiss-install]')?.addEventListener('click',()=>{sessionStorage.setItem('vertex-install-dismissed','true');drawBanner();});
    root.querySelector('[data-install-app]')?.addEventListener('click',()=>install());
    root.querySelector('[data-update-app]')?.addEventListener('click',()=>{reloading=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});});
  }
  function drawInstall(){
    const root=document.querySelector('[data-install-card]');if(!root)return;
    root.innerHTML=`<span class="eyebrow">${installed()?'Installed app':'Installation'}</span><h2>${installed()?'Vertex is open as an app.':'Make room for your next challenge.'}</h2><p>${installed()?'Your browser handles app permissions and updates. Device notifications are yours to control below.':h(instructions())}</p>${!installed()&&installEvent?'<button class="button primary" type="button" data-install-app>Install Vertex</button>':''}<p class="device-status" data-install-status role="status" aria-live="polite"></p>`;
    root.querySelector('[data-install-app]')?.addEventListener('click',()=>install());
  }
  async function install(){
    if(!installEvent){
      const target=document.querySelector('[data-install-status]') || document.querySelector('[data-push-status]');
      if(target)target.textContent=instructions();
      else {history.pushState({},'','/app');dispatchEvent(new PopStateEvent('popstate'));}
      return;
    }
    const event=installEvent;installEvent=null;
    try {await event.prompt();const choice=await event.userChoice;if(choice.outcome==='dismissed')sessionStorage.setItem('vertex-install-dismissed','true');}
    catch {const target=document.querySelector('[data-install-status]');if(target)target.textContent=instructions();}
    drawBanner();drawInstall();
  }
  async function setOwner(id){
    if(!registration?.active)return;
    await new Promise((resolve,reject)=>{
      const channel=new MessageChannel();const timeout=setTimeout(()=>reject(new Error('Could not update device privacy. Try again.')),5000);
      channel.port1.onmessage=()=>{clearTimeout(timeout);channel.port1.close();resolve();};
      registration.active.postMessage({type:'SET_PUSH_OWNER',userId:id},[channel.port2]);
    });
  }
  async function beforeLogout(){
    if(!registration)return;
    await setOwner(null);
    const subscription=await registration.pushManager?.getSubscription();
    if(subscription){
      // Unsubscribe even if a temporary server outage prevents row cleanup.
      try {await result(client.rpc('remove_push_subscription',{target_endpoint:subscription.endpoint}));}
      finally {await subscription.unsubscribe();localStorage.removeItem('vertex-push-owner');}
    }
  }
  async function setUser(id){
    const wasKnown=userKnown;userKnown=true;
    if(wasKnown&&id===activeUser)return;activeUser=id;preferenceDraft=null;const revision=++userRevision;
    if(!registration)return;
    const owner=localStorage.getItem('vertex-push-owner');
    if(owner && owner!==id){await setOwner(null);await (await registration.pushManager?.getSubscription())?.unsubscribe();localStorage.removeItem('vertex-push-owner');}
    if(revision===userRevision)bind();
  }
  function preference(name,title,description,checked){return `<label class="device-preference"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" name="${name}" ${checked?'checked':''}></label>`;}
  async function loadControls(root){
    const revision=root._deviceRevision=(root._deviceRevision||0)+1;
    const ownerId=state.session?.user.id;
    try{
      let key=null,subscription=null,saved=null;
      if(ownerId && supported() && registration && (installed() || localStorage.getItem('vertex-push-owner')===ownerId)){
        subscription=await registration.pushManager.getSubscription();
        if(subscription)saved=await result(client.from('push_subscriptions').select('announcements,results,deadlines,meetings').eq('endpoint',subscription.endpoint).maybeSingle());
        if(saved){localStorage.setItem('vertex-push-owner',ownerId);await setOwner(ownerId);}
        key=await result(client.rpc('push_application_key'));
      }
      if(!root.isConnected||revision!==root._deviceRevision||ownerId!==state.session?.user.id)return;
      const enabled=Boolean(saved && subscription && Notification.permission==='granted');
      if(enabled&&preferenceDraft?.owner===ownerId)saved={...saved,...preferenceDraft.choices};
      const blocked=supported() && Notification.permission==='denied';
      const focused=document.activeElement?.name;
      let message=!ownerId?'Log in to choose which updates reach this device.':!supported()?'This browser or connection does not support device notifications. Your in-app notification centre still works.':registrationError?'Could not prepare the Vertex app. Check your connection and try again.':blocked?'Notifications are blocked in your browser. Allow them in this site’s browser settings, then reload Vertex.':enabled?'Notifications are on for this account and device.':!installed()?'Enable notifications from the installed Vertex app. Install Vertex first, then open it from your apps.':!key?'Device notifications are temporarily unavailable. Try again shortly.':'Choose Enable notifications, then allow notifications in your browser.';
      root.innerHTML=`<div class="device-control-heading"><div><span class="eyebrow">On this device</span><h2>Device notifications</h2></div><span class="device-state ${enabled?'is-on':''}">${enabled?'On':'Off'}</span></div><p>${h(message)}</p><p class="device-privacy">Alerts can show competition titles and messages on your lock screen. Logging out turns them off on this device. In-app updates remain available.</p>${!ownerId?'<a class="button primary" data-link href="/login?returnTo=%2Fapp">Log in</a>':!supported()||blocked?'':!installed()&&!enabled?'<button class="button primary" type="button" data-enable-push>Enable notifications</button><button class="button secondary" type="button" data-install-first>Installation instructions</button>':enabled?`<form data-push-preferences>${preference('announcements','Announcements','Organiser updates for your competitions.',saved.announcements)}${preference('results','Results','Published leaderboards and your round outcome.',saved.results)}${preference('deadlines','Deadline reminders','A reminder during the final 24 hours for saved registration deadlines or unfinished round work.',saved.deadlines)}${preference('meetings','Meeting assignments','Meetings you or your team have been assigned.',saved.meetings)}<button class="button secondary" type="submit">Save notification choices</button></form><button class="button secondary" type="button" data-disable-push>Turn off on this device</button>`:`<button class="button primary" type="button" data-enable-push ${!key||!registration?'disabled':''}>Enable notifications</button>`}<p class="device-status" data-push-status role="status" aria-live="polite"></p>`;
      if(focused)root.querySelector(`[name="${focused}"]`)?.focus({preventScroll:true});
      const status=root.querySelector('[data-push-status]');
      const run=async(button,operation)=>{button.disabled=true;status.textContent='Updating device notifications…';try{await operation();}catch(error){if(root.isConnected)status.textContent=error.message+' Check your connection and browser settings, then try again.';}finally{if(button.isConnected)button.disabled=false;}};
      root.querySelector('[data-install-first]')?.addEventListener('click',()=>{status.textContent=instructions();if(installEvent)install();});
      root.querySelector('[data-enable-push]')?.addEventListener('click',event=>{
        if(!installed()){status.textContent='Install Vertex first. '+instructions();if(installEvent)install();return;}
        run(event.currentTarget,async()=>{
          // subscribe() requests permission from this explicit user gesture only.
          const next=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(key)});
          try{await result(client.rpc('save_push_subscription',{subscription:next.toJSON(),app_origin:location.origin}));}
          catch(error){await next.unsubscribe();throw error;}
          localStorage.setItem('vertex-push-owner',ownerId);await setOwner(ownerId);await loadControls(root);
          root.querySelector('[data-push-status]').textContent='Device notifications enabled.';
        });
      });
      root.querySelector('[data-disable-push]')?.addEventListener('click',event=>run(event.currentTarget,async()=>{
        await result(client.rpc('remove_push_subscription',{target_endpoint:subscription.endpoint}));await setOwner(null);
        await subscription.unsubscribe();localStorage.removeItem('vertex-push-owner');preferenceDraft=null;await loadControls(root);
        root.querySelector('[data-push-status]').textContent='Device notifications turned off.';
      }));
      root.querySelector('[data-push-preferences]')?.addEventListener('change',event=>{
        const form=event.currentTarget;
        preferenceDraft={owner:ownerId,choices:Object.fromEntries(['announcements','results','deadlines','meetings'].map(name=>[name,form.elements[name].checked]))};
      });
      root.querySelector('[data-push-preferences]')?.addEventListener('submit',event=>{
        event.preventDefault();const form=event.currentTarget;
        run(form.querySelector('button'),async()=>{
          const choices=Object.fromEntries(['announcements','results','deadlines','meetings'].map(name=>[name,form.elements[name].checked]));
          await result(client.rpc('save_push_subscription',{subscription:subscription.toJSON(),app_origin:location.origin,choices}));
          preferenceDraft=null;
          status.textContent='Notification choices saved for this device.';
        });
      });
    }catch(error){if(root.isConnected&&revision===root._deviceRevision){root.innerHTML=`<h2>Could not load device notifications.</h2><p>${h(error.message)}</p><button class="button secondary" type="button" data-retry-device>Try again</button>`;root.querySelector('[data-retry-device]').addEventListener('click',()=>loadControls(root));}}
  }
  function bind(){drawBanner();drawInstall();document.querySelectorAll('[data-device-controls]').forEach(root=>loadControls(root));}
  function start(){
    addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;drawBanner();drawInstall();});
    addEventListener('appinstalled',()=>{installedEvent=true;installEvent=null;bind();});
    standalone.addEventListener('change',()=>bind());
    if(!isSecureContext||!('serviceWorker' in navigator))return;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)location.reload();});
    navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='PUSH_SUBSCRIPTION_CHANGED')bind();});
    navigator.serviceWorker.register('/service-worker.js',{scope:'/',updateViaCache:'none'}).then(async reg=>{
      await navigator.serviceWorker.ready;
      registration=reg;
      const owner=localStorage.getItem('vertex-push-owner');
      if(userKnown&&owner&&owner!==activeUser){await setOwner(null);await (await reg.pushManager?.getSubscription())?.unsubscribe();localStorage.removeItem('vertex-push-owner');}
      reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')drawBanner();});});
      bind();
    }).catch(error=>{registrationError=error;bind();});
    addEventListener('online',()=>{registration?.update().catch(()=>{});bind();});
    addEventListener('focus',()=>{registration?.update().catch(()=>{});if(location.pathname==='/app')bind();});
  }
  return {start,bind,banner,controls,view,setUser,beforeLogout};
}
