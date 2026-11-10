(()=>{
 const data=JSON.parse(document.getElementById('component-data').textContent),$=id=>document.getElementById(id);
 let token=null,state={record:{revision:0,edits:[]},component_status:{}};
 const message=text=>$('component-message').textContent=text;
 const selected=()=>$('component-target').value;
 function select(){const e=state.record.edits.find(e=>e.target_id===selected());$('component-text').value=e?.text??data.targets[selected()];$('component-decision').value=e?.decision??'';$('component-note').value=e?.note??'';}
 function badges(){
  document.querySelectorAll('.reviewer-state').forEach(n=>n.remove());
  for(const [id,s] of Object.entries(state.component_status)){
   if(s.status==='unreviewed')continue;
   const target=document.getElementById('component-'+id);if(!target)continue;
   const p=document.createElement('p');p.className='reviewer-state';const edit=state.record.edits.find(e=>e.target_id===id);
   p.textContent='Reviewer: '+s.status.replaceAll('_',' ')+(edit?.text?' · '+edit.text:'')+(s.reasons.length?' · '+s.reasons.join('; '):'');target.prepend(p);
  }
 }
 $('component-target').addEventListener('change',select);
 document.querySelectorAll('[data-component]').forEach(b=>b.addEventListener('click',()=>{$('component-target').value=b.dataset.component;select();$('component-review').scrollIntoView({behavior:'smooth',block:'start'});}));
 $('hide-findings').addEventListener('change',e=>document.body.classList.toggle('hide-findings',e.target.checked));
 async function request(method,payload){const r=await fetch('/api/'+(data.endpoint||'assessment-reviews')+'/'+data.kind+'/'+data.identity,{method,headers:{'X-Review-Token':token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});const v=await r.json();if(!r.ok)throw Error(v.error||'Review request failed');return v;}
 async function save(edits){
  if(!$('component-name').value.trim())throw Error('Enter the reviewer name.');
  state=await request('POST',{expected_revision:state.record.revision,artifact_sha256:data.artifact_sha256,reviewer:{name:$('component-name').value.trim(),type:$('component-type').value},edits});select();badges();message('Saved component-review revision '+state.record.revision+'. Original analysis and model judgments are preserved.');
 }
 $('component-save').addEventListener('click',async()=>{try{
  const id=selected(),e={target_id:id,decision:$('component-decision').value};
  if($('component-text').value.trim()!==data.targets[id])e.text=$('component-text').value.trim();
  if($('component-note').value.trim())e.note=$('component-note').value.trim();
  await save([...state.record.edits.filter(e=>e.target_id!==id),e]);
 }catch(error){message(error.message);}});
 $('component-reset').addEventListener('click',async()=>{try{await save(state.record.edits.filter(e=>e.target_id!==selected()));}catch(error){message(error.message);}});
 $('component-export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=data.identity+'-component-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 select();
 (async()=>{try{
  if(location.protocol==='file:')throw Error('Open through run-local.sh --serve to save component judgments. Images, evidence and blank review worksheets remain available offline.');
  const r=await fetch('/api/bootstrap');if(!r.ok)throw Error('Start the local review server.');token=(await r.json()).token;
  state=await request('GET');select();badges();$('component-save').disabled=false;$('component-reset').disabled=false;
  if(state.record.reviewer&&state.record.reviewer.type!=='automated_test'){$('component-name').value=state.record.reviewer.name;$('component-type').value=state.record.reviewer.type;}
  message('Local component review connected · revision '+state.record.revision+'. Independent expert review has not been obtained.');
 }catch(error){message(error.message);}})();
})();
