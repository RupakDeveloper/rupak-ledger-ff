import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const $ = id => document.getElementById(id);
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN',{maximumFractionDigits:2});
let supabase, mode='login', user=null, profile=null, lobbyRows=[], paymentRows=[], qrUrl=null;

function show(id){['authView','dashboard','publicView'].forEach(x=>$(x).classList.toggle('hidden',x!==id));}
function msg(id,s){$(id).textContent=s||'';}
function cleanUser(s){return s.trim().toLowerCase();}
function publicUrl(name){return `${location.origin}/?u=${encodeURIComponent(name)}`;}
function totals(rows,pays){
 const count=rows.reduce((a,r)=>a+Number(r.lobby_count),0);
 const earned=rows.reduce((a,r)=>a+Number(r.lobby_count)*Number(r.rate),0);
 const received=pays.reduce((a,p)=>a+Number(p.amount),0);
 return {count,earned,received,pending:Math.max(0,earned-received)};
}
function setTotals(t,prefix=''){
 const ids = prefix
 ? ['pLobbies','pEarned','pReceived','pPending']
 : ['totalLobbies','earned','received','pending'];

 const values = [
   t.count,
   money(t.earned),
   money(t.received),
   money(t.pending)
 ];

 ids.forEach((id,i)=>{
   const el = document.getElementById(id);
   if(el) el.textContent = values[i];
 });
}
function renderRows(target,rows,pays=[],editable=false){
 const items=[...rows.map(r=>({date:r.lobby_date,label:`${r.lobby_count} lobbies × ${money(r.rate)}`,amount:Number(r.lobby_count)*Number(r.rate),kind:'Lobby',id:r.id})),...pays.map(p=>({date:p.paid_at,label:p.note||'Payment received',amount:Number(p.amount),kind:'Payment',id:p.id}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 $(target).innerHTML=items.length?items.map(x=>`<div class="record"><div><b>${escapeHtml(x.label)}</b><small>${escapeHtml(x.date)} · ${x.kind}</small></div><div class="amount"><b>${money(x.amount)}</b>${editable?`<button class="ghost delete" data-kind="${x.kind}" data-id="${x.id}">Delete</button>`:''}</div></div>`).join(''):'<p class="muted tiny">No records yet.</p>';
 if(editable) $(target).querySelectorAll('.delete').forEach(b=>b.addEventListener('click',()=>deleteRow(b.dataset.kind,b.dataset.id)));
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function loadDashboard(){
 const [pr,lr,pay]=await Promise.all([
  supabase.from('profiles').select('*').eq('id',user.id).single(),
  supabase.from('lobbies').select('*').eq('user_id',user.id).order('lobby_date',{ascending:false}),
  supabase.from('payments').select('*').eq('user_id',user.id).order('paid_at',{ascending:false})
 ]);
 if(pr.error||lr.error||pay.error) throw new Error(pr.error?.message||lr.error?.message||pay.error?.message);
 profile=pr.data;lobbyRows=lr.data;paymentRows=pay.data;
 $('who').textContent=profile.username;setTotals(totals(lobbyRows,paymentRows));renderRows('records',lobbyRows,paymentRows,true);
 $('profileUrl').textContent=publicUrl(profile.username);
 $('qrPreview').classList.toggle('hidden',!profile.qr_url);$('removeQr').classList.toggle('hidden',!profile.qr_url);if(profile.qr_url)$('qrPreview').src=profile.qr_url;
 show('dashboard');$('logoutBtn').classList.remove('hidden');
}
async function loadPublic(name){
 const {data:p,error}=await supabase.from('public_profiles').select('*').eq('username',cleanUser(name)).maybeSingle();
 if(error||!p){show('publicView');$('publicName').textContent='Profile not found';$('publicRecords').innerHTML='<p class="muted">Check the username and try again.</p>';return;}
 const [l,pay]=await Promise.all([supabase.from('public_lobbies').select('*').eq('user_id',p.id).order('lobby_date',{ascending:false}),supabase.from('public_payments').select('*').eq('user_id',p.id).order('paid_at',{ascending:false})]);
 if(l.error||pay.error)throw new Error(l.error?.message||pay.error?.message);
 $('publicName').textContent='@'+p.username;setTotals(totals(l.data,pay.data),'p');renderRows('publicRecords',l.data,pay.data,false);
 $('publicQr').classList.toggle('hidden',!p.qr_url);if(p.qr_url)$('publicQr').src=p.qr_url;show('publicView');$('logoutBtn').classList.add('hidden');
}
async function refresh(){await loadDashboard();}
async function deleteRow(kind,id){
 if(!confirm('Delete this record?'))return;
 const table=kind==='Lobby'?'lobbies':'payments';const {error}=await supabase.from(table).delete().eq('id',id).eq('user_id',user.id);
 if(error)alert(error.message);else await refresh();
}
function setMode(m){mode=m;document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===m));$('emailLabel').classList.toggle('hidden',m!=='signup');$('authSubmit').textContent=m==='signup'?'Create account':'Login';$('password').autocomplete=m==='signup'?'new-password':'current-password';msg('authMsg','');}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>setMode(t.dataset.tab)));
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();msg('authMsg','Please wait…');const username=cleanUser($('username').value);const password=$('password').value;
 if(!/^[a-z0-9._-]{3,24}$/.test(username)){msg('authMsg','Username: 3–24 letters, numbers, dot, underscore or hyphen.');return;}
 try{
  if(mode==='signup'){
   const email=$('email').value.trim();if(!email){msg('authMsg','Enter an email for account recovery and verification.');return;}
   const {data,error}=await supabase.auth.signUp({email,password,options:{data:{username}}});if(error)throw error;
   if(!data.session){msg('authMsg','Account created. Check your email to verify, then log in.');return;}
   user=data.user;
   const {error:pe}=await supabase.from('profiles').insert({id:user.id,username});if(pe)throw pe;
  }else{
   const email=$('email').value.trim();if(!email){msg('authMsg','For login, enter the email used when creating this account in the email field.');$('emailLabel').classList.remove('hidden');return;}
   const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;user=data.user;
  }
  await loadDashboard();
 }catch(err){msg('authMsg',err.message||'Something went wrong.');}
});
$('lobbyDate').value=new Date().toISOString().slice(0,10);
$('lobbyForm').addEventListener('submit',async e=>{e.preventDefault();const payload={user_id:user.id,lobby_date:$('lobbyDate').value,lobby_count:Number($('lobbyCount').value),rate:Number($('lobbyRate').value)};const {error}=await supabase.from('lobbies').insert(payload);if(error)msg('lobbyMsg',error.message);else{msg('lobbyMsg','Record saved online.');$('lobbyCount').value=1;await refresh();}});
$('paymentForm').addEventListener('submit',async e=>{e.preventDefault();const {error}=await supabase.from('payments').insert({user_id:user.id,amount:Number($('paymentAmount').value),note:$('paymentNote').value});if(error)msg('paymentMsg',error.message);else{msg('paymentMsg','Payment saved.');$('paymentAmount').value='';$('paymentNote').value='';await refresh();}});
$('qrFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;if(f.size>4*1024*1024){msg('qrMsg','Maximum QR image size is 4 MB.');return;}const ext=f.name.split('.').pop().toLowerCase();const path=`${user.id}/qr-${Date.now()}.${ext}`;const {error:up}=await supabase.storage.from('ledger-qr').upload(path,f,{upsert:true,contentType:f.type});if(up){msg('qrMsg',up.message);return;}const {data}=supabase.storage.from('ledger-qr').getPublicUrl(path);const {error}=await supabase.from('profiles').update({qr_url:data.publicUrl}).eq('id',user.id);if(error)msg('qrMsg',error.message);else{msg('qrMsg','QR uploaded.');await refresh();}});
$('removeQr').addEventListener('click',async()=>{const {error}=await supabase.from('profiles').update({qr_url:null}).eq('id',user.id);if(error)msg('qrMsg',error.message);else{msg('qrMsg','QR removed.');await refresh();}});
$('shareBtn').addEventListener('click',()=>window.open(publicUrl(profile.username),'_blank'));
$('copyBtn').addEventListener('click',async()=>{await navigator.clipboard.writeText(publicUrl(profile.username));$('copyBtn').textContent='Copied!';});
$('exportBtn').addEventListener('click',()=>{const rows=[['Type','Date','Description','Amount'],...lobbyRows.map(r=>['Lobby',r.lobby_date,`${r.lobby_count} lobbies x ${r.rate}`,r.lobby_count*r.rate]),...paymentRows.map(p=>['Payment',p.paid_at,p.note||'Payment received',p.amount])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='rupak-ledger.csv';a.click();URL.revokeObjectURL(a.href);});
$('logoutBtn').addEventListener('click',async()=>{await supabase.auth.signOut();user=null;show('authView');$('logoutBtn').classList.add('hidden');});
$('homeBtn').addEventListener('click',()=>location.href='/');
async function init(){
 if(!SUPABASE_URL||!SUPABASE_ANON_KEY){$('setupNotice').classList.remove('hidden');$('setupNotice').textContent='Setup required: add your Supabase URL and anon/publishable key to the .env file, then deploy. See START-HERE.txt.';return;}
 supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
 const {data:{session}}=await supabase.auth.getSession();user=session?.user||null;
 const uname=new URLSearchParams(location.search).get('u');
 if(uname){await loadPublic(uname);return;}
 if(user){try{await loadDashboard();}catch(e){msg('authMsg',e.message);show('authView');}}else show('authView');
 supabase.auth.onAuthStateChange((_event,s)=>{user=s?.user||null;if(!user){show('authView');$('logoutBtn').classList.add('hidden');}});
}
init().catch(e=>{show('authView');msg('authMsg',e.message);});
