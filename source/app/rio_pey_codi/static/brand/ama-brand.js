/* AMA R003 · Decorative branding only: no requests, auth, payment or storage. */
(()=>{'use strict';
  const ROOT='/static/brand/';
  const ASSETS=Object.freeze({primary:ROOT+'ama-mascota-mono.webp',classic:ROOT+'ama-mascota-clasica.webp'});
  function whichSurface(){
    const p=location.pathname.replace(/\/$/,'/index.html');
    if(p.includes('/hackaton/production.html'))return 'market-live';
    if(p.includes('/hackaton/'))return 'commerce';
    if(p.includes('/mercado/'))return 'market-sim';
    if(p.includes('/caja/'))return 'cash';
    if(p.includes('/unificada/'))return 'launch';
    if(p.endsWith('/payment-return.html'))return 'payment-return';
    if(p.endsWith('/login')||p.endsWith('/login.html'))return 'login';
    return 'account';
  }
  const surface=whichSurface();
  document.documentElement.dataset.amaSurface=surface;
  function identity(){
    const w=document.createElement('span');w.className='ama-brand-identity';w.setAttribute('aria-hidden','true');
    const im=document.createElement('img');im.src=ASSETS.primary;im.alt='';im.width=49;im.height=49;im.decoding='async';
    const name=document.createElement('span');name.className='ama-brand-wordmark';name.textContent='AMA';
    w.append(im,name);return w;
  }
  function decorate(el){
    if(!el||el.classList.contains('ama-augmented-brand'))return;
    el.classList.add('ama-augmented-brand');el.prepend(identity());
  }
  function intro(){
    const target=document.querySelector('.area-menu-view');
    if(!target||target.querySelector('.ama-workspace-intro'))return;
    const box=document.createElement('div');box.className='ama-workspace-intro';
    const copy=document.createElement('div');const h=document.createElement('strong');
    h.textContent='AMA · Tu mercado. Tu negocio. Tu comunidad.';
    const p=document.createElement('p');p.textContent='Compra, vende y organiza tu negocio en un espacio conectado.';
    copy.append(h,p);
    const im=document.createElement('img');im.src=ASSETS.classic;im.alt='Mascota AMA, camioncito de compras sonriente';im.width=150;im.height=150;im.decoding='async';
    box.append(copy,im);target.insertBefore(box,target.firstChild);
  }
  function decorateSidebar(){
    const side=document.querySelector('#sidebar.side');
    if(!side||side.querySelector('.ama-side-signature'))return;
    const a=document.createElement('a');a.className='ama-side-signature';a.href='/';
    const im=document.createElement('img');im.src=ASSETS.classic;im.alt='';im.width=47;im.height=47;im.decoding='async';
    const label=document.createElement('span');
    const title=document.createElement('strong');title.textContent='AMA';
    const subtitle=document.createElement('small');subtitle.textContent='Mi espacio comercial';
    label.append(title,subtitle);a.append(im,label);side.prepend(a);
  }
  function decoratePaymentReturn(){
    if(surface!=='payment-return')return;
    const main=document.querySelector('main');if(!main||main.querySelector('.ama-brand-return'))return;
    const link=document.createElement('a');link.href='/';link.className='ama-brand-return';
    const image=document.createElement('img');image.src=ASSETS.primary;image.alt='';image.width=58;image.height=58;
    const label=document.createElement('span');label.textContent='AMA · Mercado Abierto';
    link.append(image,label);main.prepend(link);
  }
  function setup(){
    document.querySelectorAll('.workspace-header .brand, header .brand, .auth-brand, header.topbar .brand')
      .forEach(el=>{if(/mercado abierto|\bama\b/i.test(el.textContent||''))decorate(el)});
    const trail=document.querySelector('header.topbar .trail');
    if(trail&&!trail.querySelector('.ama-brand-identity'))trail.prepend(identity());
    intro();decorateSidebar();decoratePaymentReturn();
  }
  let queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    const run=()=>{queued=false;setup()};
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else Promise.resolve().then(run);
  }
  function start(){
    setup();
    // The commerce sidebar and account menu are rendered after the DOM is loaded.
    // Only child-list changes trigger a queued, idempotent decor pass.
    if(typeof MutationObserver==='function'){
      const ob=new MutationObserver(list=>{
        if(list.some(m=>m.type==='childList'&&m.addedNodes.length))schedule();
      });
      ob.observe(document.body,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
