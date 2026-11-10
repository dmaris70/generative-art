"""Short current reading with an optional change record and immutable history."""
import json
from pathlib import Path
from PIL import Image
from .understanding_report import page,esc,title_for
from .reporting import encoded
from .reasoning import sha

STYLE='main{max-width:880px;padding:22px}header h1{font-size:36px;margin:8px 0}header p{margin:8px 0 14px}.reading-image{padding:10px;margin-bottom:16px}.reading-image img{max-height:29vh}.reading-text{font:clamp(20px,2.6vw,24px)/1.55 Georgia,serif}.simple-response{border:0;background:transparent;padding:4px 0;margin:0}.simple-response h2{font-size:25px;margin:18px 0 8px}.simple-response button{font-size:15px;margin:4px 6px 4px 0;padding:9px 17px}.simple-response button[aria-pressed=true]{background:#244e3a;color:white}.simple-response label{margin:9px 0}textarea{max-width:680px}details{margin:10px 0}.small{font-size:13px}.status{font-size:14px;color:#5d6b64}.change-list li{margin-bottom:10px}blockquote{border-left:3px solid #bdcbbd;margin:12px 0;padding-left:16px}'

SCRIPT=r'''(()=>{
const data=JSON.parse(document.getElementById('revision-data').textContent),$=id=>document.getElementById(id);
let token=null,view=null,timer=null,saving=false;const test=new URLSearchParams(location.search).get('test')==='1';
async function api(path,method='GET',payload){const r=await fetch('/api/'+path,{method,headers:{'X-Review-Token':token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});const v=await r.json();if(!r.ok)throw Error(v.error||'Could not update the reading');return v;}
function list(id,items){const ul=$(id);ul.replaceChildren();for(const text of items){const li=document.createElement('li');li.textContent=text;ul.append(li);}}
function draw(v,initial=false){const changed=!view||view.revision_id!==v.revision_id;view=v;$('main-reading').textContent=v.paragraph;$('main-reading').setAttribute('aria-busy','false');$('revision-label').textContent=v.revision_id==='baseline'?'Original reading':'Revised from your correction · version '+v.history.length;
const f=v.feedback,relevant=(f.reading_revision_id||'baseline')===v.revision_id;
if(initial||changed){$('reading-note').value=relevant?(f.note||''):'';for(const c of ['fits','missing'])$(c).setAttribute('aria-pressed',String(relevant&&f.choice===c));}
$('changes').hidden=!v.changes;if(v.changes){$('paragraph-origin').textContent=v.paragraph_origin==='controlled_evidence_and_report_rendering'?'This paragraph was assembled from scoped image descriptors and your quoted responses. The free-form model drafts and their withheld judgments remain preserved.':'This paragraph is a model proposal that passed the automated wording and source checks.';$('previous-reading').textContent=v.changes.previous_paragraph;$('revised-reading').textContent=v.changes.revised_paragraph;
list('applied-changes',[...(v.changes.features_applied||[]).map(x=>x.text),...v.changes.retained_or_qualified.map(x=>x.text+' — '+(x.status==='retained_as_report'?'Retained as your reported experience; not a measured effect.':'Kept as a qualified proposal; its factual scope remains limited.'))]);list('pending-changes',v.changes.pending.map(x=>x.text+' — '+x.reasons.join(' ')));}
const history=$('reading-history');history.replaceChildren();const first=document.createElement('a');first.href='initial-report.html';first.textContent='Original reading';history.append(first);
for(const h of v.history){const p=document.createElement('p'),a=document.createElement('a');a.href=h.report_url;a.textContent='Version '+h.ordinal+' · correction '+h.feedback_revision;p.append(a);history.append(p);}
const active=v.active&&['queued','running','generated'].includes(v.active.status);$('retry-revision').hidden=active||!v.last_job||!['failed','rejected','superseded'].includes(v.last_job.status);
if(active){$('feedback-status').textContent=v.active.message;timer=setTimeout(refresh,1600);}else if(v.last_job&&['failed','rejected','superseded','cancelled'].includes(v.last_job.status)&&v.last_job.feedback_revision===f.revision){$('feedback-status').textContent=v.last_job.message;}
else $('feedback-status').textContent=changed&&v.revision_id!=='baseline'?'Your correction has been applied. The earlier reading is preserved.':test?'Interface test mode; automated responses do not start inference.':'A short response is enough. Corrections are checked and applied automatically.';
}
async function refresh(initial=false){clearTimeout(timer);try{draw(await api('reading-state/'+data.work_id),initial);}catch(e){$('feedback-status').textContent=e.message;}}
async function save(choice){if(saving)return;saving=true;try{const saved=await api('reading-feedback/'+data.work_id,'POST',{expected_revision:view.feedback.revision,artifact_sha256:data.base_sha256,reading_revision_id:view.revision_id,choice,note:$('reading-note').value,actor:test?'automated_test':'local_viewer'});await refresh(true);if(saved.apply_error){$('feedback-status').textContent=saved.apply_error;$('retry-revision').hidden=false;}else if(choice===null)$('feedback-status').textContent='Response cleared; earlier readings are preserved.';else if(choice==='fits')$('feedback-status').textContent='Saved: this broadly fits your reading.';}catch(e){$('feedback-status').textContent=e.message;}finally{saving=false;}}
for(const c of ['fits','missing'])$(c).addEventListener('click',()=>save(c));$('clear-response').addEventListener('click',()=>save(null));
$('retry-revision').addEventListener('click',async()=>{try{await api('reading-revise/'+data.work_id,'POST',{expected_revision:view.feedback.revision,artifact_sha256:data.base_sha256,reading_revision_id:view.revision_id});await refresh();}catch(e){$('feedback-status').textContent=e.message;}});
(async()=>{try{const r=await fetch('/api/bootstrap');if(!r.ok)throw Error('Open the local server to apply corrections.');token=(await r.json()).token;await refresh(true);for(const id of ['fits','missing','clear-response'])$(id).disabled=false;}catch(e){$('feedback-status').textContent=e.message;}})();
})();'''

def change_html(changes):
    return '<p><b>Earlier:</b> '+esc(changes['previous_paragraph'])+'</p><p><b>Revised:</b> '+esc(changes['revised_paragraph'])+'</p><h3>Applied refinements</h3><ul>'+''.join('<li>'+esc(i['text'])+'</li>' for i in changes.get('features_applied',[]))+'</ul><h3>Retained or qualified</h3><ul>'+''.join('<li>'+esc(i['text']+' — '+i['reason'])+'</li>' for i in changes['retained_or_qualified'])+'</ul><h3>Still pending</h3><ul>'+''.join('<li>'+esc(i['text']+' — '+' '.join(i['reasons']))+'</li>' for i in changes['pending'])+'</ul>'

def render_revision(r,output):
    title,artist=title_for(r['work_id']);output=Path(output)
    header='<header><div class="eyebrow">Preserved reading revision · '+esc(r['revision_id'][:8])+'</div><h1>'+esc(title)+'</h1><p>'+esc(artist)+'</p></header>'
    body='<style>'+STYLE+'</style><figure class="reading-image"><img src="'+encoded(Image.open(output/'image.png').convert('RGB'))+'" alt="Painting reproduction"></figure><div class="reading-text">'+esc(r['display']['paragraph'])+'</div>'
    if not r['display']['eligible_for_display']:body+='<p>This proposal was withheld from the current reading.</p>'
    body+='<details><summary>What changed and what remains pending</summary><p>Paragraph origin: '+esc(r['display'].get('origin','native_revision_draft').replace('_',' '))+'.</p>'+change_html(r['changes'])+'</details><p class="small">This version is preserved. Automated checks are not independent expert validation.</p><p><a href="/reading/'+esc(r['work_id'])+'/report.html">Current reading</a> · <a href="revision.json">Technical record</a> · <a href="inference-audit.json">Native audit</a></p>'
    return page('Preserved reading revision',header,body)

def render_current(base,folder):
    folder=Path(folder);title,artist=title_for(base['work_id'])
    header='<header><div class="eyebrow" id="revision-label">Your painting reading</div><h1>'+esc(title)+'</h1><p>'+esc(artist)+'</p></header>'
    body='<style>'+STYLE+'</style><figure class="reading-image"><img src="'+encoded(Image.open(folder/'image.png').convert('RGB'))+'" alt="'+esc(title)+'"></figure><div class="reading-text" id="main-reading" aria-busy="true">'+esc(base['display']['paragraph'])+'</div>'
    body+='<section class="simple-response"><h2>Does this reflect your reading?</h2><label>One short correction, if you wish<textarea id="reading-note" rows="2" maxlength="2000" placeholder="Optional"></textarea></label><button id="fits" aria-pressed="false" disabled>Yes, broadly</button><button id="missing" aria-pressed="false" disabled>Something is missing</button><p id="feedback-status" class="status" role="status">Checking saved corrections…</p><button id="retry-revision" hidden>Retry applying correction</button><button id="clear-response" class="small" disabled>Clear my response</button></section>'
    body+='<details id="changes" hidden><summary>What changed after your correction</summary><p id="paragraph-origin"></p><p><b>Earlier:</b> <span id="previous-reading"></span></p><p><b>Revised:</b> <span id="revised-reading"></span></p><h3>Applied or qualified</h3><ul id="applied-changes" class="change-list"></ul><h3>Still pending verification</h3><ul id="pending-changes" class="change-list"></ul><p class="small">Factual additions are checked against available image evidence. Your experience stays attributed to you. Automated checks can still miss errors.</p></details>'
    body+='<details><summary>Earlier versions</summary><div id="reading-history"><a href="initial-report.html">Original reading</a></div></details><details><summary>Image measurements and original evidence</summary><p><a href="initial-report.html">Open the preserved measurement report</a></p><p>Tree proportions describe an approximate box. Sky curves do not establish closed contours or physical stroke groups. Hue balance remains unverified.</p></details>'
    data=json.dumps({'work_id':base['work_id'],'base_sha256':sha(folder/'reading.json')}).replace('<','\\u003c')
    return page(title,header,body+'<script type="application/json" id="revision-data">'+data+'</script><script>'+SCRIPT+'</script>')
