import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(process.cwd(),'.unit-screens-'));
test.after(()=>rmSync(dir,{recursive:true,force:true}));
const compiled=await build({stdin:{contents:`export {Workspace} from './components/trips/workspace';export {HistoryView} from './components/trips/history';export {SignIn} from './components/auth/sign-in';export {AppShell} from './components/trips/app-shell';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',packages:'external',plugins:[{name:'router-fixture',setup(b){
  b.onResolve({filter:/^next\/(navigation|link)$/},a=>({path:a.path,namespace:'router'}));
  b.onLoad({filter:/.*/,namespace:'router'},a=>({loader:'js',resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'const params=new URLSearchParams(); export const useSearchParams=()=>params;export const usePathname=()=>"/";':`import React from 'react';export default function Link({href,prefetch,...props}){return React.createElement('a',{...props,href});}`}));
}}]});
writeFileSync(join(dir,'screens.mjs'),compiled.outputFiles[0].text);
const {Workspace,HistoryView,SignIn,AppShell}=await import(pathToFileURL(join(dir,'screens.mjs')));
const render=(component,props={})=>renderToStaticMarkup(React.createElement(component,props));
test('planner renders required destination/date controls and a single submission action',()=>{
  const html=render(Workspace,{aiReady:true});
  assert.match(html,/Where to next/);assert.match(html,/type="date"/);assert.match(html,/required=""/);
  assert.equal((html.match(/Create my itinerary/g)??[]).length,1);
  assert.doesNotMatch(html,/href="\/cost\?/);
});
test('all workspace views render their own initial state',()=>{
  assert.match(render(Workspace,{view:'trips'}),/Loading your trips/);
  assert.match(render(Workspace,{view:'explore'}),/Airbnb/);
  assert.match(render(Workspace,{view:'pricing'}),/Plus/);
});
test('history starts with a loading status and a route back to planning',()=>{
  const html=render(HistoryView);assert.match(html,/Your search history/);assert.match(html,/role="status"/);assert.match(html,/Loading history/);assert.match(html,/href="\/"/);
});
test('sign-in reports callback failures and renders account-specific controls safely',()=>{
  const failed=render(SignIn,{enabled:true,user:null,returnTo:'/',callbackError:true});
  assert.match(failed,/Sign-in did not complete/);assert.match(failed,/type="email"/);
  const signedIn=render(SignIn,{enabled:true,user:{id:'test',email:'<script>@test.example',displayName:'Test'},returnTo:'/',callbackError:false});
  assert.doesNotMatch(signedIn,/<script>/);assert.match(signedIn,/Sign out/);
});
test('application shell renders guest and signed-in account navigation',()=>{
  const guest=render(AppShell,{user:null,children:'Workspace content'});
  assert.match(guest,/Sign in to Roamly/);assert.match(guest,/Workspace content/);
  for(const href of ['/trips','/history','/explore'])assert.ok(guest.includes(`href="${href}"`));
  const member=render(AppShell,{user:{id:'x',email:'x@test.example',displayName:'Ada Lovelace'}});
  assert.match(member,/Manage your account/);assert.match(member,/Ada/);
});
