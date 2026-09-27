import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(process.cwd(),'.unit-billing-')),state=[],toasts=globalThis.__billingToasts=[];
let cursor=0,effect;
globalThis.__billingHooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useEffect(fn){effect=fn;}};
const compiled=await build({entryPoints:['components/trips/billing.tsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',plugins:[{name:'hooks',setup(b){
 b.onResolve({filter:/^next\/link$/},()=>({path:'next/link.js',external:true}));
 b.onResolve({filter:/^sonner$/},()=>({path:'sonner',namespace:'toast'}));
 b.onLoad({filter:/.*/,namespace:'toast'},()=>({loader:'js',contents:'const t=globalThis.__billingToasts;export const toast=Object.assign(m=>t.push(["message",m]),{error:m=>t.push(["error",m])});'}));
 b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',resolveDir:process.cwd(),contents:`export * from ${JSON.stringify(join(process.cwd(),'node_modules/react/index.js'))}; const h=globalThis.__billingHooks; export const useState=h.useState,useEffect=h.useEffect;`}));
}}]});
writeFileSync(join(dir,'fixture.mjs'),compiled.outputFiles[0].text);
const {BillingControls}=await import(pathToFileURL(join(dir,'fixture.mjs')));
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(' '):n?.props?text(n.props.children):'';
let props={price:'₹499'};const render=()=>{cursor=0;return BillingControls(props);};
const button=tree=>nodes(tree).find(n=>n.type==='button'&&n.props.className==='primary'); // the buy button
const tick=()=>new Promise(r=>setImmediate(r));
test.after(()=>{rmSync(dir,{recursive:true,force:true});delete globalThis.__billingHooks;delete globalThis.__billingToasts;});

// A browser on /pricing: records Plus announcements, address rewrites and the Razorpay options.
function browser(search='',status={plus:false,until:0},{stripe=false,dodo=false}={}){
 const page={events:[],replaced:null,checkout:null,opened:false,requests:[],bodies:{},assigned:null};
 globalThis.window={location:{origin:'https://heyroamly.com',pathname:'/pricing',search,assign(u){page.assigned=u;}},history:{state:{router:'kept'},replaceState(s,_,url){page.replaced={s,url};}},
  dispatchEvent(e){page.events.push(e);return true;},
  Razorpay:class{constructor(options){page.checkout=options;}open(){page.opened=true;}on(){}}};
 globalThis.fetch=async(url,options)=>{page.requests.push([url,options?.method??'GET']);assert.equal(new Headers(options?.headers).get('x-roamly-client'),'web','calls go through lib/client/api.ts');
  if(url==='/api/billing/status')return Response.json(status);
  const sent=options?.body?JSON.parse(options.body):undefined;if(sent)page.bodies[url]=sent;
  if(url==='/api/billing/coupon')return sent.code.trim().toUpperCase()==='ROAMLY99'?Response.json({code:'ROAMLY99',amount:9900,currency:'INR',label:'₹99',left:137,places:200}):Response.json({error:'That code isn’t valid.'},{status:400});
  if(url==='/api/billing/checkout')return Response.json(dodo&&!sent?.code?{provider:'dodo',url:'https://test.checkout.dodopayments.com/session/cks_ui'}:stripe&&!sent?.code?{provider:'stripe',url:'https://checkout.stripe.com/c/pay/cs_test_ui'}:{provider:'razorpay',orderId:'order_abc',amount:sent?.code?9900:49900,currency:'INR',keyId:'rzp_test_fixture',email:'buyer@example.test'});
  return Response.json({error:'unexpected '+url},{status:404});};
 state.length=toasts.length=0;
 return page;
}
async function load(){render();const cleanup=effect();await tick();await tick();return cleanup;}
const originals={window:globalThis.window,fetch:globalThis.fetch};
test.afterEach(()=>{globalThis.window=originals.window;globalThis.fetch=originals.fetch;props={price:'₹499'};});

test('checkout returns the buyer to Roamly through the server after paying, not a page-bound handler',async()=>{
 const page=browser();await load();
 assert.match(text(render()),/Get Plus · ₹499 for 30 days/);
 await button(render()).props.onClick();await tick();
 assert.ok(page.opened,'Razorpay opens');
 assert.equal(page.checkout.order_id,'order_abc');
 assert.equal(page.checkout.callback_url,'https://heyroamly.com/api/billing/callback','Razorpay posts the result back to the site');
 assert.equal(page.checkout.redirect,true,'the buyer follows the result, including when paying left the page');
 assert.equal(page.checkout.handler,undefined,'no handler: callback_url bypasses it anyway');
 assert.deepEqual(page.requests.map(([u,m])=>m+' '+u),['GET /api/billing/status','POST /api/billing/checkout']);
 assert.match(text(render()),/Opening checkout…/);
 page.checkout.modal.ondismiss();assert.match(text(render()),/Get Plus/,'closing checkout re-enables the button');
});

test('back from a paid checkout: Plus is celebrated everywhere and the address is cleaned so a reload does not replay it',async()=>{
 const until=Math.floor(Date.now()/1000)+30*86400;
 const page=browser('?checkout=activated',{plus:true,until,usage:{limit:20,used:0,remaining:20,resetsAt:'2026-09-28T00:00:00.000Z'}});
 await load();
 const shown=text(render());
 assert.match(shown,/Payment received\. Plus is active\./);
 assert.match(shown,/Your Plus benefits are ready/);assert.match(shown,/20 of 20 AI plans remaining today/);
 assert.equal(page.events.length,1);assert.equal(page.events[0].type,'roamly:plus');assert.deepEqual(page.events[0].detail,{plus:true,until});
 assert.deepEqual(page.replaced,{s:{router:'kept'},url:'/pricing'},'router state is kept, the outcome is dropped');
 assert.deepEqual(toasts,[],'the celebration is the confirmation');
 // The reload after that shows Plus but does not celebrate again.
 const reload=browser('',{plus:true,until});await load();
 assert.equal(reload.events.length,0);assert.equal(reload.replaced,null);assert.doesNotMatch(text(render()),/Payment received/);
});

test('failed, unverified and still-activating returns explain what happened without celebrating',async()=>{
 for(const [search,plus,expected,kind] of [
  ['?checkout=failed',false,/didn’t go through, so Plus wasn’t added/,'error'],
  ['?checkout=unverified',false,/couldn’t verify that payment\. If you were charged, contact support/,'error'],
  ['?checkout=pending',false,/Payment received\. Plus is switching on/,'message'],
  ['?checkout=activated',false,/Payment received\. Plus is switching on/,'message'],
 ]){
  const page=browser(search,{plus,until:0});await load();
  assert.match(text(render()),expected,search);assert.equal(page.events.length,0,search);assert.equal(page.replaced.url,'/pricing',search);
  // Also raised as a toast: on phones the note under the button is below the fold.
  assert.equal(toasts.length,1,search);assert.equal(toasts[0][0],kind,search);assert.match(toasts[0][1],expected,search);
 }
 // The address cannot put arbitrary words on the page.
 const forged=browser('?checkout=Call+%2B1-555-0100+for+a+refund');await load();
 assert.doesNotMatch(text(render()),/555|refund/);assert.equal(forged.events.length,0);assert.deepEqual(toasts,[]);
});

test('a shared launch-code link applies ₹99, checkout sends the code, and changing the code drops the offer',async()=>{
 const page=browser('?code=roamly99');await load();await tick();await tick();
 const shown=()=>text(render()).replace(/\s+/g,' ').replace(/ ([.,])/g,'$1'); // pieces of JSX text join with spaces here
 assert.match(shown(),/ROAMLY99 applied: Plus for ₹99\. 137 of 200 launch places left\./);
 assert.match(shown(),/Get Plus · ₹99 for 30 days/);assert.match(shown(),/₹99 for 30 days with ROAMLY99, once per account \(usually ₹499\)/);
 assert.deepEqual(page.bodies['/api/billing/coupon'],{code:'roamly99'});
 assert.equal(page.replaced,null,'the code stays in the address, so a reload keeps it');
 await button(render()).props.onClick();await tick();
 assert.deepEqual(page.bodies['/api/billing/checkout'],{code:'ROAMLY99'},'checkout asks for the code; the server sets the price');
 assert.equal(page.checkout.amount,9900);
 page.checkout.modal.ondismiss();
 const input=()=>nodes(render()).find(n=>n.type==='input'),form=()=>nodes(render()).find(n=>n.type==='form');
 input().props.onChange({target:{value:'WRONG'}});
 assert.match(shown(),/Get Plus · ₹499 for 30 days/,'editing the code drops the offer');
 await form().props.onSubmit({preventDefault(){}});await tick();
 assert.match(shown(),/That code isn’t valid\./);assert.match(shown(),/Get Plus · ₹499/);
 await button(render()).props.onClick();await tick();
 assert.deepEqual(page.bodies['/api/billing/checkout'],{},'no code: full price');
});
test('without a code nothing extra is asked for',async()=>{
 const page=browser();await load();
 assert.ok(!page.requests.some(([u])=>u==='/api/billing/coupon'));
 assert.match(text(render()),/Launch code/);
});

test('outside India with Stripe: checkout goes to Stripe’s own page, and Razorpay never opens',async()=>{
 props={price:'$10',via:'Stripe'};
 const page=browser('',{plus:false,until:0},{stripe:true});await load();
 const shown=()=>text(render()).replace(/\s+/g,' ').replace(/ ([.,])/g,'$1');
 assert.match(shown(),/Get Plus · \$10 for 30 days/);assert.match(shown(),/\$10 for 30 days, paid once through Stripe\./);
 await button(render()).props.onClick();await tick();
 assert.equal(page.assigned,'https://checkout.stripe.com/c/pay/cs_test_ui');
 assert.equal(page.checkout,null,'no Razorpay checkout');assert.match(shown(),/Opening checkout…/,'the button stays busy while the browser leaves');
});
test('the ₹99 code for a buyer outside India says it goes through Razorpay and needs an Indian card or UPI',async()=>{
 props={price:'$10',via:'Stripe'};
 const page=browser('?code=ROAMLY99',{plus:false,until:0},{stripe:true});await load();await tick();await tick();
 const shown=()=>text(render()).replace(/\s+/g,' ').replace(/ ([.,])/g,'$1');
 assert.match(shown(),/It’s paid in rupees through Razorpay, so it needs an Indian card or UPI\./);
 assert.match(shown(),/usually \$10\), paid once through Razorpay\./);
 await button(render()).props.onClick();await tick();
 assert.equal(page.assigned,null);assert.equal(page.checkout.amount,9900,'Razorpay opens for ₹99');
});
test('back from a cancelled Stripe checkout: a plain note, not an error, and the address is cleaned',async()=>{
 const page=browser('?checkout=cancelled');await load();
 assert.match(text(render()),/Checkout was cancelled, so you weren’t charged\./);
 assert.deepEqual(toasts,[['message','Checkout was cancelled, so you weren’t charged.']]);
 assert.equal(page.replaced.url,'/pricing');
});

test('outside India with Dodo Payments: checkout goes to Dodo’s page, and the page says tax may be added there',async()=>{
 props={price:'$10',via:'Dodo Payments'};
 const page=browser('',{plus:false,until:0},{dodo:true});await load();
 const shown=()=>text(render()).replace(/\s+/g,' ').replace(/ ([.,])/g,'$1');
 assert.match(shown(),/\$10 for 30 days, paid once through Dodo Payments\./);
 await button(render()).props.onClick();await tick();
 assert.equal(page.assigned,'https://test.checkout.dodopayments.com/session/cks_ui');assert.equal(page.checkout,null,'no Razorpay checkout');
});
