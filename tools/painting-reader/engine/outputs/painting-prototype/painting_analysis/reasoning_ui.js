(()=>{
 const data=JSON.parse(document.getElementById('reasoning-data').textContent),$=id=>document.getElementById(id);
 let token=null,sourceReview=null,clauseReview={record:{revision:0,edits:[]}},job=null;
 const message=text=>$('reasoning-status').textContent=text;
 const clauseMessage=text=>$('clause-review-message').textContent=text;
 const current=()=>data.clauses.find(c=>c.id===$('clause-target').value);
 function picture(id){$('picture-select').value=id;document.querySelectorAll('.picture').forEach(p=>p.hidden=p.id!=='picture-'+id);}
 $('picture-select').addEventListener('change',()=>picture($('picture-select').value));
 document.querySelectorAll('[data-picture]').forEach(b=>b.addEventListener('click',()=>{picture(b.dataset.picture);$('picture-select').scrollIntoView({behavior:'smooth',block:'center'});}));
 function selectClause(){const c=current(),e=clauseReview.record.edits.find(e=>e.clause_id===c.id);$('clause-statement').value=e?.statement??c.statement;$('clause-decision').value=e?.decision??'accepted';$('clause-note').value=e?.note??'';}
 function judgments(){
  for(const c of data.clauses){const e=clauseReview.record.edits.find(e=>e.clause_id===c.id);$('judgment-'+c.id).textContent=e?'Reviewer judgment: '+e.decision+(e.statement?' · '+e.statement:'')+(e.note?' · '+e.note:''):'Independent review pending.';}
  clauseMessage('Clause review revision '+clauseReview.record.revision+'. Judgments are separate from model assessments.');
  for(const [id,status] of Object.entries(clauseReview.explanation_status||{})){
   let badge=$('judgment-explanation-'+id);if(!badge){badge=document.createElement('p');badge.id='judgment-explanation-'+id;badge.className='badge';$(id).after(badge);}badge.textContent='Reviewer state: '+status.replaceAll('_',' ');
  }
 }
 document.querySelectorAll('[data-review-clause]').forEach(b=>b.addEventListener('click',()=>{$('clause-target').value=b.dataset.reviewClause;selectClause();$('clause-review').scrollIntoView({behavior:'smooth',block:'start'});}));
 $('clause-target').addEventListener('change',selectClause);
 async function api(path,method='GET',payload){const r=await fetch(path,{method,headers:{'X-Review-Token':token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});const v=await r.json();if(!r.ok)throw Error(v.error||'Request failed');return v;}
 const clausePath='/api/clauses/'+encodeURIComponent(data.work_id)+'/'+data.run_id;
 async function refresh(){sourceReview=await api('/api/review/'+data.work_id);clauseReview=await api(clausePath);selectClause();judgments();message('Local service connected. Saved source review: '+sourceReview.record.revision+'; this analysis: '+data.review_revision+'.'+(sourceReview.record.revision!==data.review_revision?' Reanalysis is needed to use the newer review.':''));}
 async function saveClauses(edits){
  if(!$('clause-reviewer').value.trim())throw Error('Enter the reviewer name.');
  clauseReview=await api(clausePath,'POST',{expected_revision:clauseReview.record.revision,result_sha256:data.result_sha256,reviewer:{name:$('clause-reviewer').value.trim(),type:$('clause-reviewer-type').value},edits});selectClause();judgments();clauseMessage('Saved clause review revision '+clauseReview.record.revision+'.');
 }
 $('clause-save').addEventListener('click',async()=>{try{
  const c=current(),e={clause_id:c.id,decision:$('clause-decision').value};
  if($('clause-statement').value.trim()!==c.statement)e.statement=$('clause-statement').value.trim();
  if($('clause-note').value.trim())e.note=$('clause-note').value.trim();
  await saveClauses([...clauseReview.record.edits.filter(e=>e.clause_id!==c.id),e]);
 }catch(error){clauseMessage(error.message);}});
 $('clause-reset').addEventListener('click',async()=>{try{await saveClauses(clauseReview.record.edits.filter(e=>e.clause_id!==current().id));}catch(error){clauseMessage(error.message);}});
 $('clause-export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(clauseReview,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=data.work_id+'-clause-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 async function poll(){
  if(!job)return;
  try{job=await api('/api/jobs/'+job.job_id);message(job.status+' · '+job.message);
   if(['complete','superseded','failed','cancelled'].includes(job.status)){
    $('reasoning-rerun').disabled=false;$('reasoning-cancel').disabled=true;
    if(job.report_url){$('reasoning-result-link').href=job.report_url;$('reasoning-result-link').textContent=job.status==='superseded'?'Inspect result from older review inputs':'Open the new analysis';$('reasoning-result-link').hidden=false;}
    job=null;return;
   }setTimeout(poll,2000);
  }catch(error){message(error.message+' · reload to reconnect.');$('reasoning-rerun').disabled=false;}
 }
 $('reasoning-rerun').addEventListener('click',async()=>{try{
  await refresh();job=await api('/api/reanalyze/'+data.work_id,'POST',{expected_revision:sourceReview.record.revision,base_sha256:sourceReview.record.base_sha256,from_run:data.run_id,result_sha256:data.result_sha256,clause_review_revision:clauseReview.record.revision});
  $('reasoning-rerun').disabled=true;$('reasoning-cancel').disabled=false;$('reasoning-result-link').hidden=true;poll();
 }catch(error){message(error.message);}});
 $('reasoning-cancel').addEventListener('click',async()=>{try{if(job)job=await api('/api/jobs/'+job.job_id+'/cancel','POST',{});poll();}catch(error){message(error.message);}});
 window.addEventListener('painting-review-saved',async()=>{try{await refresh();}catch(error){message(error.message);}});
 selectClause();
 (async()=>{try{
  if(location.protocol==='file:')throw Error('Open through run-local.sh --serve for persistent judgments and reanalysis. Evidence and comparisons remain available offline.');
  const r=await fetch('/api/bootstrap');if(!r.ok)throw Error('Start the local review server.');token=(await r.json()).token;await refresh();
  for(const id of ['reasoning-rerun','clause-save','clause-reset'])$(id).disabled=false;
  const reviewer=clauseReview.record.reviewer;if(reviewer&&reviewer.type!=='automated_test'){$('clause-reviewer').value=reviewer.name;$('clause-reviewer-type').value=reviewer.type;}
  const recent=await api('/api/reanalysis-state/'+data.work_id);
  if(recent.active){job=recent.active;$('reasoning-rerun').disabled=true;$('reasoning-cancel').disabled=false;poll();}
  else if(recent.latest?.report_url){$('reasoning-result-link').href=recent.latest.report_url;$('reasoning-result-link').textContent=recent.latest.is_current?'Open the most recent reanalysis':'Inspect a reanalysis from older review inputs';$('reasoning-result-link').hidden=false;}
 }catch(error){message(error.message);clauseMessage(error.message);}})();
})();
