'use strict';
// Offline network-policy checks against the exact policy function in the audit runner.
// No browser, external network, payment, credential or fixture server is involved.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'a11y_r003_browser_audit.cjs'),'utf8');
const from=source.indexOf('function allowAuditRequest(');
const to=source.indexOf('\nasync function login(page){',from);
assert(from>=0 && to>from,'Cannot find audit network policy function');
const decide=vm.runInNewContext(source.slice(from,to)+'\nallowAuditRequest',{}, {timeout:1000});
const target='https://rio-a11y-isolated.vercel.app';
const cases=[
 ['same_origin_get','GET',target,'/static/workspace.css',true],
 ['same_origin_head','HEAD',target,'/health',true],
 ['same_origin_options','OPTIONS',target,'/v1/auth/me',true],
 ['same_origin_login','POST',target,'/v1/auth/login',true],
 ['checkout_post','POST',target,'/v1/checkout/charge',false],
 ['delete_merchant','DELETE',target,'/v1/merchant/connect',false],
 ['external_get','GET','https://external.example','/script.js',false],
 ['external_login','POST','https://external.example','/v1/auth/login',false],
 ['external_options','OPTIONS','https://external.example','/health',false],
 ['scheme_downgrade','GET','http://rio-a11y-isolated.vercel.app','/static',false],
 ['account_put','PUT',target,'/v1/account',false],
 ['business_patch','PATCH',target,'/v1/businesses',false]
];
for(const [name,method,origin,pathname,allowed] of cases){
 assert.equal(decide(method,origin,pathname,target),allowed,name);
}
console.log('A11Y_R003_NETWORK_POLICY_PASS '+cases.length+'/'+cases.length);
