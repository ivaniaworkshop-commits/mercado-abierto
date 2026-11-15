'use strict';
// Static UI regression: no credentials, no browser session, no money, no network.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..','rio_pey_codi','static');
const pages=[
  'index.html','login.html','unificada/index.html',
  'unificada/caja/index.html','unificada/mercado/index.html',
  'unificada/hackaton/index.html'
];
for(const name of pages){
  const html=fs.readFileSync(path.join(root,name),'utf8');
  for(const asset of ['/static/rio-help.js','/static/rio-help.css']){
    assert.equal(html.split(asset).length-1,1,name+' must load '+asset+' exactly once');
  }
}
const source=fs.readFileSync(path.join(root,'rio-help.js'),'utf8');
const style=fs.readFileSync(path.join(root,'rio-help.css'),'utf8');
new Function(source); // syntax check; do not execute code or call any provider
assert.match(source,/const anchor=document\.body/);
assert.match(source,/setAttribute\('aria-controls','rio-help-dialog'\)/);
assert.match(source,/setAttribute\('aria-expanded','false'\)/);
assert.match(source,/dataset\.sessionRequired/);
assert.match(source,/attributeFilter:\['data-session-ready'\]/);
assert.match(source,/rio-help-above-mobile-nav/);
assert.match(source,/if\(!catalog \|\| !catalog\.tutoriales\[active\]\)return/);
assert.match(style,/#rio-help-open\s*\{[^}]*position:fixed/s);
assert.match(style,/#rio-help-open\[hidden\]\s*\{display:none!important\}/);
assert.match(style,/#rio-help-open:focus-visible/);
console.log('RIO_HELP_DOCK_STATIC_PASS '+pages.length+'/6');
