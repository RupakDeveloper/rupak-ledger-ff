import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './public/style.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const $ = id => document.getElementById(id);
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN',{maximumFractionDigits:2});
let supabase, mode='login', user=null, profile=null, lobbyRows=[], paymentRows=[], qrUrl=null;


// Persistent dark/light theme with the animated dot-matrix switch.
function applyTheme(theme){
  const light = theme === 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  const toggle = $('themeToggle');
  if(toggle){
    toggle.setAttribute('aria-checked', String(light));
    toggle.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    toggle.title = light ? 'Switch to dark theme' : 'Switch to light theme';
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', light ? '#f4f6f8' : '#10131d');
}
function setupThemeToggle(){
  let saved = 'dark';
  try { saved = localStorage.getItem('rupak-ledger-theme') || 'dark'; } catch {}
  applyTheme(saved);
  $('themeToggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try { localStorage.setItem('rupak-ledger-theme', next); } catch {}
  });
}

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
function setTotals(t,prefix=''){ const ids=prefix ? ['pLobbies','pEarned','pReceived','pPending'] : ['totalLobbies','earned','received','pending']; const values=[t.count,money(t.earned),money(t.received),money(t.pending)]; ids.forEach((id,i)=>{ const el=$(id); if(el) el.textContent=values[i]; }); }
function renderRows(target,rows,pays=[],editable=false){
 const items=[...rows.map(r=>({date:r.lobby_date,label:`${r.lobby_count} lobbies × ${money(r.rate)}`,amount:Number(r.lobby_count)*Number(r.rate),kind:'Lobby',id:r.id})),...pays.map(p=>({date:p.paid_at,label:p.note||'Payment received',amount:Number(p.amount),kind:'Payment',id:p.id}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 $(target).innerHTML=items.length?items.map(x=>`<div class="record"><div><b>${escapeHtml(x.label)}</b><small>${escapeHtml(x.date)} · ${x.kind}</small></div><div class="amount"><b>${money(x.amount)}</b>${editable?`<button class="ghost delete" data-kind="${x.kind}" data-id="${x.id}">Delete</button>`:''}</div></div>`).join(''):'<p class="muted tiny">No records yet.</p>';
 if(editable) $(target).querySelectorAll('.delete').forEach(b=>b.addEventListener('click',()=>deleteRow(b.dataset.kind,b.dataset.id)));
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// Country calling codes used by the admin WhatsApp selector.
const COUNTRIES = [
['IN','India','91'],['US','United States','1'],['CA','Canada','1'],['GB','United Kingdom','44'],['AU','Australia','61'],['NZ','New Zealand','64'],
['AF','Afghanistan','93'],['AL','Albania','355'],['DZ','Algeria','213'],['AD','Andorra','376'],['AO','Angola','244'],['AG','Antigua and Barbuda','1268'],['AR','Argentina','54'],['AM','Armenia','374'],['AT','Austria','43'],['AZ','Azerbaijan','994'],['BS','Bahamas','1242'],['BH','Bahrain','973'],['BD','Bangladesh','880'],['BB','Barbados','1246'],['BY','Belarus','375'],['BE','Belgium','32'],['BZ','Belize','501'],['BJ','Benin','229'],['BT','Bhutan','975'],['BO','Bolivia','591'],['BA','Bosnia and Herzegovina','387'],['BW','Botswana','267'],['BR','Brazil','55'],['BN','Brunei','673'],['BG','Bulgaria','359'],['BF','Burkina Faso','226'],['BI','Burundi','257'],['KH','Cambodia','855'],['CM','Cameroon','237'],['CV','Cape Verde','238'],['CF','Central African Republic','236'],['TD','Chad','235'],['CL','Chile','56'],['CN','China','86'],['CO','Colombia','57'],['KM','Comoros','269'],['CG','Congo','242'],['CD','DR Congo','243'],['CR','Costa Rica','506'],['CI',"Côte d’Ivoire",'225'],['HR','Croatia','385'],['CU','Cuba','53'],['CY','Cyprus','357'],['CZ','Czechia','420'],['DK','Denmark','45'],['DJ','Djibouti','253'],['DM','Dominica','1767'],['DO','Dominican Republic','1809'],['EC','Ecuador','593'],['EG','Egypt','20'],['SV','El Salvador','503'],['GQ','Equatorial Guinea','240'],['ER','Eritrea','291'],['EE','Estonia','372'],['SZ','Eswatini','268'],['ET','Ethiopia','251'],['FJ','Fiji','679'],['FI','Finland','358'],['FR','France','33'],['GA','Gabon','241'],['GM','Gambia','220'],['GE','Georgia','995'],['DE','Germany','49'],['GH','Ghana','233'],['GR','Greece','30'],['GD','Grenada','1473'],['GT','Guatemala','502'],['GN','Guinea','224'],['GW','Guinea-Bissau','245'],['GY','Guyana','592'],['HT','Haiti','509'],['HN','Honduras','504'],['HK','Hong Kong','852'],['HU','Hungary','36'],['IS','Iceland','354'],['ID','Indonesia','62'],['IR','Iran','98'],['IQ','Iraq','964'],['IE','Ireland','353'],['IL','Israel','972'],['IT','Italy','39'],['JM','Jamaica','1876'],['JP','Japan','81'],['JO','Jordan','962'],['KZ','Kazakhstan','7'],['KE','Kenya','254'],['KI','Kiribati','686'],['KP','North Korea','850'],['KR','South Korea','82'],['KW','Kuwait','965'],['KG','Kyrgyzstan','996'],['LA','Laos','856'],['LV','Latvia','371'],['LB','Lebanon','961'],['LS','Lesotho','266'],['LR','Liberia','231'],['LY','Libya','218'],['LI','Liechtenstein','423'],['LT','Lithuania','370'],['LU','Luxembourg','352'],['MO','Macao','853'],['MG','Madagascar','261'],['MW','Malawi','265'],['MY','Malaysia','60'],['MV','Maldives','960'],['ML','Mali','223'],['MT','Malta','356'],['MH','Marshall Islands','692'],['MR','Mauritania','222'],['MU','Mauritius','230'],['MX','Mexico','52'],['FM','Micronesia','691'],['MD','Moldova','373'],['MC','Monaco','377'],['MN','Mongolia','976'],['ME','Montenegro','382'],['MA','Morocco','212'],['MZ','Mozambique','258'],['MM','Myanmar','95'],['NA','Namibia','264'],['NR','Nauru','674'],['NP','Nepal','977'],['NL','Netherlands','31'],['NI','Nicaragua','505'],['NE','Niger','227'],['NG','Nigeria','234'],['MK','North Macedonia','389'],['NO','Norway','47'],['OM','Oman','968'],['PK','Pakistan','92'],['PW','Palau','680'],['PS','Palestine','970'],['PA','Panama','507'],['PG','Papua New Guinea','675'],['PY','Paraguay','595'],['PE','Peru','51'],['PH','Philippines','63'],['PL','Poland','48'],['PT','Portugal','351'],['PR','Puerto Rico','1787'],['QA','Qatar','974'],['RO','Romania','40'],['RU','Russia','7'],['RW','Rwanda','250'],['KN','Saint Kitts and Nevis','1869'],['LC','Saint Lucia','1758'],['VC','Saint Vincent and the Grenadines','1784'],['WS','Samoa','685'],['SM','San Marino','378'],['ST','São Tomé and Príncipe','239'],['SA','Saudi Arabia','966'],['SN','Senegal','221'],['RS','Serbia','381'],['SC','Seychelles','248'],['SL','Sierra Leone','232'],['SG','Singapore','65'],['SK','Slovakia','421'],['SI','Slovenia','386'],['SB','Solomon Islands','677'],['SO','Somalia','252'],['ZA','South Africa','27'],['SS','South Sudan','211'],['ES','Spain','34'],['LK','Sri Lanka','94'],['SD','Sudan','249'],['SR','Suriname','597'],['SE','Sweden','46'],['CH','Switzerland','41'],['SY','Syria','963'],['TW','Taiwan','886'],['TJ','Tajikistan','992'],['TZ','Tanzania','255'],['TH','Thailand','66'],['TL','Timor-Leste','670'],['TG','Togo','228'],['TO','Tonga','676'],['TT','Trinidad and Tobago','1868'],['TN','Tunisia','216'],['TR','Türkiye','90'],['TM','Turkmenistan','993'],['TV','Tuvalu','688'],['UG','Uganda','256'],['UA','Ukraine','380'],['AE','United Arab Emirates','971'],['UY','Uruguay','598'],['UZ','Uzbekistan','998'],['VU','Vanuatu','678'],['VA','Vatican City','379'],['VE','Venezuela','58'],['VN','Vietnam','84'],['YE','Yemen','967'],['ZM','Zambia','260'],['ZW','Zimbabwe','263'],
['AI','Anguilla','1264'],['AW','Aruba','297'],['BM','Bermuda','1441'],['KY','Cayman Islands','1345'],['CW','Curaçao','599'],['FO','Faroe Islands','298'],['GI','Gibraltar','350'],['GL','Greenland','299'],['GP','Guadeloupe','590'],['GU','Guam','1671'],['GG','Guernsey','44'],['IM','Isle of Man','44'],['JE','Jersey','44'],['MQ','Martinique','596'],['MS','Montserrat','1664'],['NC','New Caledonia','687'],['PS','Palestinian Territories','970'],['RE','Réunion','262'],['SX','Sint Maarten','1721'],['TC','Turks and Caicos Islands','1649'],['VG','British Virgin Islands','1284'],['VI','US Virgin Islands','1340']
];
function flagEmoji(iso){
 return iso.toUpperCase().replace(/[A-Z]/g,c=>String.fromCodePoint(c.charCodeAt(0)+127397));
}
function setupAdminPhone(){
 const select=$('adminCountry');
 select.innerHTML=COUNTRIES.map(([iso,name,dial])=>`<option value="${iso}" data-dial="${dial}">${flagEmoji(iso)} ${name} (+${dial})</option>`).join('');
 select.value='IN';
 const number=$('settingsAdmin');
 number.addEventListener('input',()=>{
  let digits=number.value.replace(/\D/g,'');
  if(select.value==='IN'){
   digits=digits.slice(0,10);
   number.value=digits.length>5?digits.slice(0,5)+' '+digits.slice(5):digits;
  }else number.value=digits.slice(0,15);
 });
 select.addEventListener('change',()=>{
  number.value='';
  number.placeholder=select.value==='IN'?'98765 43210':'Enter mobile number';
  number.focus();
 });
}
function getAdminPhone(){
 const selected=$('adminCountry').selectedOptions[0];
 const dial=selected?.dataset.dial||'91';
 const national=$('settingsAdmin').value.replace(/\D/g,'');
 if(!national)return '';
 if(selected.value==='IN' && national.length!==10)throw new Error('Enter a valid 10-digit Indian mobile number.');
 if(national.length<4 || national.length>15)throw new Error('Check the admin mobile number.');
 return dial+national;
}
function loadAdminPhone(saved){
 const digits=String(saved||'').replace(/\D/g,'');
 if(!digits){$('adminCountry').value='IN';$('settingsAdmin').value='';return;}
 // Prefer the longest matching calling code to avoid ambiguous shared codes.
 const matches=COUNTRIES.filter(c=>digits.startsWith(c[2])).sort((a,b)=>b[2].length-a[2].length);
 const match=matches[0]||COUNTRIES[0];
 $('adminCountry').value=match[0];
 let national=digits.startsWith(match[2])?digits.slice(match[2].length):digits;
 if(match[0]==='IN' && national.length>10)national=national.slice(-10);
 $('settingsAdmin').value=match[0]==='IN'&&national.length>5?national.slice(0,5)+' '+national.slice(5):national;
}

async function ensureUserProfile(authUser, preferredUsername=''){
 const {data:existing,error:readError}=await supabase.from('profiles').select('id,username').eq('id',authUser.id).maybeSingle();
 if(readError)throw readError;
 if(existing)return existing;
 const candidate=cleanUser(authUser.user_metadata?.username||preferredUsername||'');
 if(!/^[a-z0-9._-]{3,24}$/.test(candidate)){
  throw new Error('Your account is signed in, but its profile is missing. Enter the username you chose when registering, then log in again.');
 }
 const {data:created,error:createError}=await supabase.from('profiles').upsert({id:authUser.id,username:candidate},{onConflict:'id'}).select('id,username').single();
 if(createError){
  if(createError.code==='23505')throw new Error('This username is already used by another account. Enter the original username for this account or contact the site admin.');
  throw createError;
 }
 return created;
}
async function loadDashboard(){
 const [pr,lr,pay]=await Promise.all([
  supabase.from('profiles').select('*').eq('id',user.id).maybeSingle(),
  supabase.from('lobbies').select('*').eq('user_id',user.id).order('lobby_date',{ascending:false}),
  supabase.from('payments').select('*').eq('user_id',user.id).order('paid_at',{ascending:false})
 ]);
 if(pr.error||lr.error||pay.error) throw new Error(pr.error?.message||lr.error?.message||pay.error?.message);
 if(!pr.data)throw new Error('Your profile is missing. Please log out and log in again so the app can restore it.');
 profile=pr.data;lobbyRows=lr.data;paymentRows=pay.data;
 $('settingsUpi').value=profile.upi_id||'mn9981953@oksbi';$('settingsUpiName').value=profile.upi_name||'Mina Nath';loadAdminPhone(profile.admin_whatsapp||'');
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
function setMode(m){mode=m;document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===m));$('emailLabel').classList.remove('hidden');$('authSubmit').textContent=m==='signup'?'Create account':'Login';$('password').autocomplete=m==='signup'?'new-password':'current-password';msg('authMsg','');}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>setMode(t.dataset.tab)));
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();msg('authMsg','Please wait…');const username=cleanUser($('username').value);const password=$('password').value;
 if(!/^[a-z0-9._-]{3,24}$/.test(username)){msg('authMsg','Username: 3–24 letters, numbers, dot, underscore or hyphen.');return;}
 if(password.length<6){msg('authMsg','Password must contain at least 6 characters.');return;}
 try{
  const email=$('email').value.trim();
  if(!email){msg('authMsg','Enter the email address used for this account.');return;}
  if(mode==='signup'){
   const {data,error}=await supabase.auth.signUp({email,password,options:{data:{username}}});
   if(error)throw error;
   if(!data.user)throw new Error('Account creation did not return a user. Please try again.');
   user=data.user;
   if(!data.session){msg('authMsg','Account created. If email confirmation is enabled in Supabase, verify your email and then log in.');return;}
   await ensureUserProfile(user,username);
  }else{
   const {data,error}=await supabase.auth.signInWithPassword({email,password});
   if(error)throw error;
   user=data.user;
   await ensureUserProfile(user,username);
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
let currentPayAmount=0;
function upiUri(amount){const pa=$('settingsUpi').value.trim();const pn=$('settingsUpiName').value.trim()||'Payment';return `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&am=${encodeURIComponent(Number(amount).toFixed(2))}&cu=INR&tn=${encodeURIComponent('Lobby payment')}`;}
$('paySettingsForm').addEventListener('submit',async e=>{e.preventDefault();let adminPhone;try{adminPhone=getAdminPhone();}catch(err){msg('settingsMsg',err.message);return;}const payload={upi_id:$('settingsUpi').value.trim(),upi_name:$('settingsUpiName').value.trim(),admin_whatsapp:adminPhone};const {error}=await supabase.from('profiles').update(payload).eq('id',user.id);if(error){msg('settingsMsg',error.message);return;}profile={...profile,...payload};msg('settingsMsg','Payment settings saved online.');});
$('makePayQr').addEventListener('click',async()=>{const amount=Number($('receiveAmount').value);if(!Number.isFinite(amount)||amount<=0){msg('receiveMsg','Enter a valid amount first.');return;}if(!/^[-\w.]+@[-\w.]+$/.test(($('settingsUpi').value||'').trim())){msg('receiveMsg','Enter a valid UPI ID in Payment & admin settings.');return;}try{currentPayAmount=amount;const uri=upiUri(amount);$('upiQr').src=await QRCode.toDataURL(uri,{width:320,margin:2,errorCorrectionLevel:'H'});$('receiveTitle').textContent='Pay '+$('settingsUpiName').value;$('upiAmountLabel').textContent=money(amount);$('upiIdLabel').textContent='UPI ID: '+$('settingsUpi').value;$('upiPayLink').href=uri;$('receiveCard').classList.remove('hidden');msg('receiveMsg','QR ready. Scan it or open a UPI app.');}catch(err){msg('receiveMsg',err.message);}});
async function receiptCanvas(){const node=$('receiveCard');if(node.classList.contains('hidden'))throw new Error('Generate the payment QR first.');return await html2canvas(node,{backgroundColor:'#151a28',scale:2});}
$('downloadPng').addEventListener('click',async()=>{try{const c=await receiptCanvas();const a=document.createElement('a');a.download='rupak-payment-'+currentPayAmount+'.png';a.href=c.toDataURL('image/png');a.click();}catch(e){msg('receiveMsg',e.message);}});
$('downloadPdf').addEventListener('click',async()=>{try{const c=await receiptCanvas();const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a5'});const w=140,h=c.height*w/c.width;pdf.addImage(c.toDataURL('image/png'),'PNG',5,5,w,h);pdf.save('rupak-payment-'+currentPayAmount+'.pdf');}catch(e){msg('receiveMsg',e.message);}});
$('shareAdmin').addEventListener('click',async()=>{
 try{
  if(!currentPayAmount)throw new Error('Generate the payment QR first.');
  const phone=getAdminPhone();
  if(!phone)throw new Error('Add and save the admin WhatsApp number in Payment & admin settings first.');
  const text=encodeURIComponent(`Payment request: ${money(currentPayAmount)}\nPayee: ${$('settingsUpiName').value.trim()}\nUPI ID: ${$('settingsUpi').value.trim()}\nPlease find the payment receipt attached.`);
  // wa.me opens the exact configured admin chat. WhatsApp does not permit a web link
  // to silently attach a local image; the user can attach the downloaded PNG in chat.
  const waUrl=`https://wa.me/${phone}?text=${text}`;
  const opened=window.open(waUrl,'_blank');
  if(!opened)location.href=waUrl;
  msg('receiveMsg','Admin WhatsApp chat opened with the amount and UPI details. Download the PNG above and attach it in the chat.');
 }catch(e){msg('receiveMsg',e.message);}
});
async function init(){
 setupThemeToggle();
 setupAdminPhone();
 if(!SUPABASE_URL||!SUPABASE_ANON_KEY){$('setupNotice').classList.remove('hidden');$('setupNotice').textContent='Setup required: add your Supabase URL and anon/publishable key to the .env file, then deploy. See START-HERE.txt.';return;}
 supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
 const {data:{session}}=await supabase.auth.getSession();user=session?.user||null;
 const uname=new URLSearchParams(location.search).get('u');
 if(uname){await loadPublic(uname);return;}
 if(user){try{await ensureUserProfile(user);await loadDashboard();}catch(e){msg('authMsg',e.message);show('authView');}}else show('authView');
 supabase.auth.onAuthStateChange((_event,s)=>{user=s?.user||null;if(!user){show('authView');$('logoutBtn').classList.add('hidden');}});
}
init().catch(e=>{show('authView');msg('authMsg',e.message);});
