'use strict';
// Isolated regressions of the real A11Y_R003 reporting gate. No bank calls,
// credentials, browser, fixture server or package installation required.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'a11y_r003_browser_audit.cjs'),'utf8');
const start=source.indexOf('  const views=report.viewports.flatMap(v=>v.views);');
const end=source.indexOf(' }finally{await browser.close();}',start);
assert(start>=0 && end>start, 'Gate source could not be identified; review runner structure');
const gate=vm.runInNewContext('(function(report,process){\n'+source.slice(start,end)+'\n})',{}, {timeout:1000});
function mock({writes=0,egress=0,overflow=false,incomplete=false,contrast=false,dialog=true,short=false,duplicate=false,badstate=false,duplicateWidth=false}={}){
 const keys=[['menu','default'],['negocios','default'],['caja','codi'],['caja','cash'],['historial','default']];
 const make=()=>Array.from({length:short?4:5},(_,i)=>({
   view: duplicate && i===4?'menu':keys[i][0],
   state: duplicate && i===4?'default':(badstate && i===3?'unexpected':keys[i][1]),
   axe:{violations:[],incomplete:incomplete&&i===0?[{id:'test'}]:[]},
   contrast:{violations:contrast&&i===0?[{ratio:2.9}]:[],unknown:[],combinations:[]},
   horizontal_overflow:overflow&&i===0
 }));
 return {
   summary:{blocked_writes:writes,blocked_cross_origin:egress},gates:{},
   viewports:[
     {width:390,views:make(),dialog:dialog?'PASS_CANCEL_ONLY':'NOT_OBSERVED',javascript_errors:[]},
     {width:duplicateWidth?390:320,views:make(),dialog:dialog?'PASS_CANCEL_ONLY':'NOT_OBSERVED',javascript_errors:[]}
   ]
 };
}
const cases=[
 ['clean',{},false],
 ['blocked_write',{writes:1},true],
 ['cross_origin_egress',{egress:1},true],
 ['horizontal_overflow',{overflow:true},true],
 ['missing_view',{short:true},true],
 ['duplicate_view',{duplicate:true},true],
 ['invalid_view_state',{badstate:true},true],
 ['duplicate_viewport',{duplicateWidth:true},true],
 ['axe_incomplete',{incomplete:true},true],
 ['contrast_violation',{contrast:true},true],
 ['dialog_unobserved',{dialog:false},true]
];
for(const [name,options,shouldBlock] of cases){
 const report=mock(options),status={exitCode:0};
 gate(report,status);
 assert.equal(status.exitCode===1,shouldBlock,name);
 assert.equal(report.summary.blocked_writes,options.writes||0,name+' write counter');
 assert.equal(report.summary.blocked_cross_origin,options.egress||0,name+' cross-origin counter');
 if(name==='cross_origin_egress')assert.equal(report.gates.network_isolation,'BLOCKED_CROSS_ORIGIN_EGRESS');
 if(name==='horizontal_overflow'||name==='duplicate_view'||name==='invalid_view_state'||name==='duplicate_viewport')assert.equal(report.gates.browser,'BLOCKED_VIEWPORT_OR_BROWSER');
 if(name==='clean')assert.equal(report.gates.browser,'PASS');
}
console.log('A11Y_R003_GATE_REGRESSION_PASS '+cases.length+'/'+cases.length);
