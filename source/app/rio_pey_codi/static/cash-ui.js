/* Mercado Abierto: manual cash ledger. It never creates or confirms a bank payment. */
(function(root,factory){
  const core=root.RioCore||(typeof module==='object'&&module.exports?require('./unificada/caja/caja-1.js'):null);
  const api=factory(core);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.MercadoCashCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
 'use strict';
 const SCHEMA='MERCADO_ABIERTO_CASH_V1',MAX_CENTS=100000000,MAX_SALES=2000,MAX_BYTES=1000000;
 const check=(ok,text)=>{if(!ok)throw Error(text)};
 function fixed(cents){return String(Math.floor(cents/100))+'.'+String(cents%100).padStart(2,'0')}
 function money(cents){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(cents/100)}
 function amount(value,zero=false){check(Core,'No se pudo cargar la calculadora de efectivo.');const cents=Core.parseCents(value);check(cents<=MAX_CENTS&&(zero||cents>0),'Indica un importe mayor que cero y dentro del límite de la caja.');return cents}
 function grams(value){const match=/^(0|[1-9]\d{0,6})(?:[.,](\d{1,3}))?$/.exec(String(value).trim());check(match,'Indica kilogramos con hasta tres decimales.');const qty=Number(match[1])*1000+Number((match[2]||'').padEnd(3,'0'));check(Number.isSafeInteger(qty)&&qty>0&&qty<=1000000,'El peso debe ser mayor que cero y como máximo 1000 kg.');return qty}
 function line(raw){check(Core,'No se pudo cargar la calculadora de efectivo.');check(raw&&['piece','kg'].includes(raw.unit),'Selecciona piezas o kilogramos.');const calculated=Core.calculateLine({description:raw.name,kind:raw.unit==='kg'?'weight':'piece',price:raw.price,qty:raw.unit==='kg'?String(grams(raw.qty)):String(raw.qty)});check(calculated.amountCents>0&&calculated.amountCents<=MAX_CENTS,'El producto debe tener un importe mayor que cero y dentro del límite.');return calculated}
 function sum(lines){const total=Core.totalCents(lines);check(total>0&&total<=MAX_CENTS,'El total está fuera del límite de la caja.');return total}
 function scope(user,merchant){check(/^[0-9a-f]{32}$/.test(user)&&/^[0-9a-f]{32}$/.test(merchant),'Selecciona un comercio con una sesión válida.');return {user,merchant}}
 function storageKey(value){return 'mercadoabierto.cash.v1:'+value.user+':'+value.merchant}
 function cleanLine(value){check(value&&typeof value==='object','Producto inválido en el respaldo.');check(['piece','weight'].includes(value.kind)&&Number.isSafeInteger(value.priceCents)&&value.priceCents>=0&&value.priceCents<=MAX_CENTS&&Number.isSafeInteger(value.quantity)&&value.quantity>0,'Producto inválido en el respaldo.');const rebuilt=Core.calculateLine({description:value.description,kind:value.kind,price:fixed(value.priceCents),qty:String(value.quantity)});check(rebuilt.amountCents===value.amountCents&&rebuilt.amountCents>0,'El importe del producto no coincide con precio y cantidad.');return rebuilt}
 function cleanSale(value){
  check(value&&typeof value==='object'&&/^CASH-[A-Za-z0-9-]{8,64}$/.test(value.id),'Folio de efectivo inválido.');
  check(value.source==='USER_DECLARED_CASH'&&value.paymentMethod==='cash'&&value.bankPaymentConfirmed===false,'El respaldo sólo admite efectivo declarado manualmente.');
  check(typeof value.concept==='string'&&value.concept.trim().length>0&&value.concept.length<=140,'Concepto inválido en el respaldo.');
  check(typeof value.folio==='string'&&(value.folio===''||/^[A-Za-z0-9][A-Za-z0-9._-]{0,69}$/.test(value.folio)),'Folio de venta inválido.');
  check(Number.isSafeInteger(value.amountMinor)&&value.amountMinor>0&&value.amountMinor<=MAX_CENTS&&Number.isSafeInteger(value.receivedMinor)&&value.receivedMinor>=value.amountMinor&&value.receivedMinor<=MAX_CENTS,'Importes de efectivo inválidos.');
  check(typeof value.createdAt==='string'&&Number.isFinite(Date.parse(value.createdAt)),'Fecha de venta inválida.');
  check(Array.isArray(value.lines)&&value.lines.length<=30,'Productos de venta inválidos.');
  const lines=value.lines.map(cleanLine);if(lines.length)check(sum(lines)===value.amountMinor,'Los productos no coinciden con el total de venta.');
  check(value.changeMinor===value.receivedMinor-value.amountMinor,'El cambio no coincide con el efectivo recibido.');
  return {id:value.id,createdAt:new Date(value.createdAt).toISOString(),folio:value.folio,concept:value.concept.trim(),amountMinor:value.amountMinor,receivedMinor:value.receivedMinor,changeMinor:value.receivedMinor-value.amountMinor,lines,source:'USER_DECLARED_CASH',paymentMethod:'cash',bankPaymentConfirmed:false};
 }
 function sale(raw){return cleanSale({...raw,changeMinor:raw.receivedMinor-raw.amountMinor,source:'USER_DECLARED_CASH',paymentMethod:'cash',bankPaymentConfirmed:false})}
 function payload(sales,context){check(Array.isArray(sales)&&sales.length<=MAX_SALES,'El respaldo excede el límite de ventas.');const normalized=sales.map(cleanSale);check(new Set(normalized.map(item=>item.id)).size===normalized.length,'El respaldo contiene folios duplicados.');return {schema:SCHEMA,scope:scope(context.user,context.merchant),sales:normalized}}
 function encode(sales,context){const text=JSON.stringify(payload(sales,context));check(text.length<=MAX_BYTES,'El historial excede el tamaño permitido. Exporta un respaldo antes de continuar.');return text}
 function commit(storage,context,expected,next){const text=encode(next,context),key=storageKey(context);if(storage.getItem(key)!==expected){const error=Error('El historial cambió en otra pestaña. Revisa las ventas actualizadas y vuelve a intentar.');error.code='CASH_STALE_STORAGE';throw error}storage.setItem(key,text);check(storage.getItem(key)===text,'No se pudo confirmar el guardado local.');return text}
 function decode(text,context){check(typeof text==='string'&&text.length<=MAX_BYTES,'El archivo supera el tamaño permitido.');let raw;try{raw=JSON.parse(text)}catch(_){throw Error('El archivo no contiene un respaldo JSON válido.')}check(raw&&raw.schema===SCHEMA&&raw.scope?.user===context.user&&raw.scope?.merchant===context.merchant,'El respaldo pertenece a otra cuenta o comercio, o no es de esta caja.');return payload(raw.sales,context).sales}
 function merge(existing,incoming){const result=new Map(existing.map(item=>[item.id,cleanSale(item)]));for(const value of incoming){const item=cleanSale(value),prior=result.get(item.id);check(!prior||JSON.stringify(prior)===JSON.stringify(item),'El mismo folio tiene datos diferentes; el respaldo no se importó.');result.set(item.id,item)}check(result.size<=MAX_SALES,'Demasiadas ventas para importar.');return [...result.values()]}
 function ticket(value,business){const item=cleanSale(value);const name=String(business||'Mi negocio').replace(/[\r\n\t]+/g,' ').trim().slice(0,120);return 'MERCADO ABIERTO · TICKET DE EFECTIVO\n'+name+'\nFolio: '+(item.folio||item.id)+'\nFecha: '+new Date(item.createdAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})+'\nConcepto: '+item.concept.replace(/[\r\n\t]+/g,' ')+'\n'+item.lines.map(x=>x.description.replace(/[\r\n\t]+/g,' ')+' · '+money(x.amountCents)).join('\n')+'\nTotal: '+money(item.amountMinor)+'\nRecibido: '+money(item.receivedMinor)+'\nCambio: '+money(item.changeMinor)+'\n\nEFECTIVO REGISTRADO MANUALMENTE\nDeclaración de la persona que atendió la caja. Sin verificación bancaria independiente. No es CFDI.\n'}
 return {SCHEMA,MAX_BYTES,MAX_SALES,MAX_CENTS,amount,grams,line,sum,money,fixed,scope,storageKey,sale,payload,encode,commit,decode,merge,ticket};
});

if(typeof window!=='undefined'&&typeof document!=='undefined')(()=>{
 'use strict';
 const C=window.MercadoCashCore,$=id=>document.getElementById(id),method=$('payment-method'),tools=$('cash-tools');
 if(!method||!tools)return;
 let context=null,cart=[],sales=[],storedText=null,lastSale=null,blocked=false,epoch=0,importing=false,lastFingerprint='';
 const say=text=>{$('cash-status').textContent=text;if(method.value!=='cash'&&text&&typeof notice==='function')notice(text)};
 const sayError=text=>{say(text);if(typeof reportError==='function')reportError(text)};
 const current=()=>C.scope(typeof currentUserId==='string'?currentUserId:'',typeof currentMerchant==='string'?currentMerchant:'');
 const same=value=>context&&value.user===context.user&&value.merchant===context.merchant;
 const hasPending=()=>typeof pendingOrder!=='undefined'&&!!pendingOrder;
 function busy(){return !context||blocked||importing||(typeof selectionBusy!=='undefined'&&selectionBusy)||(typeof checkoutBusy!=='undefined'&&checkoutBusy)||!(typeof merchantRoles!=='undefined'&&['owner','admin','cashier'].includes(merchantRoles.get(context.merchant)))}
 function refreshControls(){const disabled=busy();tools.hidden=method.value!=='cash';for(const id of ['cash-item-add','cash-cart-apply','cash-cart-clear','cash-record','cash-export','cash-import','cash-new-sale']){const el=$(id);if(el)el.disabled=disabled}if($('cash-ticket'))$('cash-ticket').disabled=disabled||!lastSale;return !disabled}
 function persist(next){try{storedText=C.commit(localStorage,context,storedText,next);sales=next}catch(error){if(error.code==='CASH_STALE_STORAGE'){try{const latest=localStorage.getItem(C.storageKey(context)),updated=latest===null?[]:C.decode(latest,context);sales=updated;storedText=latest;if(lastSale&&!sales.some(item=>item.id===lastSale.id)){lastSale=null;lastFingerprint=''}renderHistory();refreshControls()}catch(invalid){blocked=true;refreshControls();throw Error('No se pudo abrir el historial actualizado. Se conservó sin cambios: '+invalid.message)}}throw error}}
 function renderCart(){const target=$('cash-cart');target.replaceChildren();cart.forEach((item,index)=>{const row=document.createElement('li'),text=document.createElement('span'),remove=document.createElement('button');text.textContent=item.description+' · '+(item.kind==='piece'?item.quantity+' piezas':item.quantity/1000+' kg')+' · '+C.money(item.amountCents);remove.type='button';remove.className='outline';remove.textContent='Quitar';remove.setAttribute('aria-label','Quitar '+item.description);remove.addEventListener('click',()=>{if(busy())return;cart.splice(index,1);renderCart()});row.append(text,remove);target.append(row)});$('cash-cart-total').textContent=cart.length?C.money(C.sum(cart)):C.money(0)}
 function renderHistory(){const target=$('cash-history');target.replaceChildren();$('cash-history-empty').hidden=sales.length>0;for(const item of sales.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)){const row=document.createElement('li'),text=document.createElement('span'),button=document.createElement('button');text.textContent=(item.folio||item.id)+' · '+item.concept+' · '+C.money(item.amountMinor)+' · efectivo declarado';button.type='button';button.className='outline';button.textContent='Ticket';button.addEventListener('click',()=>downloadTicket(item));row.append(text,button);target.append(row)}}
 function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 function downloadTicket(item){if(busy())return;try{download(C.ticket(item,$('merchant')?.selectedOptions?.[0]?.textContent),'efectivo-'+item.id+'.txt','text/plain;charset=utf-8')}catch(error){sayError(error.message)}}
 function calculateChange(){try{const total=C.amount($('amount').value),received=C.amount($('cash-received').value,true);$('cash-change').textContent=received>=total?C.money(received-total):'Faltan '+C.money(total-received)}catch(_){$('cash-change').textContent='—'}}
 function record(){if(!refreshControls()||method.value!=='cash')return;try{
  if(hasPending())throw Error('Hay un folio CoDi guardado en esta caja. Revisa su estado y prepara una venta nueva antes de registrar otro cobro en efectivo.');
  const scope=current();if(!same(scope))throw Error('El comercio cambió. Vuelve a seleccionar la caja.');
  const concept=$('sale-concept').value.trim(),total=C.amount($('amount').value),received=C.amount($('cash-received').value,true),folio=$('sale-order').value.trim();
  if(received<total)throw Error('El efectivo recibido es menor que el total.');
  const matching=cart.length&&C.sum(cart)===total?cart:[];
  const fingerprint=JSON.stringify([folio,concept,total,received,matching]);
  if(lastSale&&lastFingerprint===fingerprint){say('Esta venta ya está registrada. Usa «Otra venta en efectivo» para una venta distinta.');return}
  const item=C.sale({id:'CASH-'+crypto.randomUUID(),createdAt:new Date().toISOString(),folio,concept,amountMinor:total,receivedMinor:received,lines:matching});
  persist([...sales,item]);lastSale=item;lastFingerprint=fingerprint;renderHistory();refreshControls();calculateChange();say('Efectivo registrado manualmente. El ticket quedó guardado en este navegador para este usuario y comercio.');
 }catch(error){sayError(error.message)}}
 function reset(){epoch++;context=null;cart=[];sales=[];storedText=null;lastSale=null;lastFingerprint='';blocked=false;importing=false;for(const id of ['cash-item-name','cash-item-price','cash-import'])if($(id))$(id).value='';if($('cash-item-qty'))$('cash-item-qty').value='1';$('cash-received').value='';$('cash-change').textContent='—';say('');try{context=current();storedText=localStorage.getItem(C.storageKey(context));if(storedText!==null)sales=C.decode(storedText,context)}catch(error){blocked=true;say('No se pudo abrir el historial de efectivo. El archivo anterior se conservó: '+error.message)}renderCart();renderHistory();refreshControls();setTimeout(refreshControls,0)}
 method.addEventListener('change',()=>{refreshControls();calculateChange()});
 $('cash-item-add').addEventListener('click',()=>{if(busy())return;try{if(cart.length>=30)throw Error('El carrito admite como máximo 30 productos.');cart.push(C.line({name:$('cash-item-name').value,price:$('cash-item-price').value,qty:$('cash-item-qty').value,unit:$('cash-item-unit').value}));renderCart();say('Producto añadido. Pulsa «Usar carrito en el cobro» para copiar el total al formulario.')}catch(error){sayError(error.message)}});
 $('cash-cart-apply')?.addEventListener('click',()=>{if(busy())return;try{if(hasPending())throw Error('Conserva los datos del folio CoDi guardado; prepara otra venta antes de copiar un carrito nuevo.');$('amount').value=C.fixed(C.sum(cart));$('sale-concept').value=cart.map(item=>item.description).join(', ').slice(0,140);calculateChange();say('Concepto e importe actualizados en el formulario único de cobro.')}catch(error){sayError(error.message)}});
 $('cash-cart-clear')?.addEventListener('click',()=>{if(!busy()){cart=[];renderCart();say('Carrito vacío. El importe del formulario se conserva.')}});
 $('cash-record').addEventListener('click',record);
 $('charge').addEventListener('submit',event=>{if(method.value==='cash'){event.preventDefault();event.stopImmediatePropagation();record()}},true);
 $('cash-ticket').addEventListener('click',()=>{if(lastSale)downloadTicket(lastSale)});
 $('cash-export').addEventListener('click',()=>{if(busy())return;try{download(C.encode(sales,context),'mercado-abierto-efectivo-'+context.merchant+'.json','application/json');say('Respaldo local exportado. Contiene datos de las ventas de este usuario y comercio.')}catch(error){sayError(error.message)}});
 $('cash-import').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file||busy())return;const captured={...context},version=epoch;importing=true;refreshControls();try{if(file.size>C.MAX_BYTES)throw Error('El archivo supera el tamaño permitido.');const text=await file.text();if(version!==epoch||!same(captured))throw Error('El comercio cambió; el respaldo no se importó.');const next=C.merge(sales,C.decode(text,captured));persist(next);renderHistory();say('Respaldo integrado sin duplicar folios. Los registros siguen siendo declaraciones manuales de efectivo.')}catch(error){if(version===epoch)sayError(error.message)}finally{if(version===epoch){importing=false;event.target.value='';refreshControls()}}});
 $('cash-new-sale')?.addEventListener('click',()=>{if(busy())return;if(hasPending()){say('Primero revisa y prepara otra venta desde el folio CoDi guardado.');return}cart=[];lastSale=null;lastFingerprint='';$('sale-order').value='';$('sale-concept').value='';$('amount').value='';$('cash-received').value='';$('cash-change').textContent='—';renderCart();refreshControls();say('Lista para otra venta en efectivo. El historial se conserva.')});
 $('cash-received').addEventListener('input',calculateChange);$('amount').addEventListener('input',calculateChange);
 window.addEventListener('rio-merchant-selected',reset);
 window.MercadoCash=Object.freeze({refreshControls,newSale:()=> $('cash-new-sale')?.click()});
 if(typeof currentUserId==='string'&&currentUserId&&typeof currentMerchant==='string'&&currentMerchant)reset();else refreshControls();
})();
