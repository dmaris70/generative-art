(()=>{
  const data=JSON.parse(document.getElementById('review-data').textContent);
  const $=id=>document.getElementById('review-'+id);
  let state={record:{revision:0,edits:[]},snapshot:null}, token=null, start=null;
  const message=text=>$('message').textContent=text;
  const original=()=>data.entities.find(e=>e.entity_id===$('entity').value);
  const edit=()=>state.record.edits.find(e=>e.entity_id===$('entity').value);
  const bounds=data.bounds;
  const boxInputs=['x0','y0','x1','y1'];
  function draw(){
    const b=boxInputs.map(k=>Number($(k).value)), r=$('rect');
    r.setAttribute('x',(b[0]-bounds[0])/(bounds[2]-bounds[0]));r.setAttribute('y',(b[1]-bounds[1])/(bounds[3]-bounds[1]));
    r.setAttribute('width',(b[2]-b[0])/(bounds[2]-bounds[0]));r.setAttribute('height',(b[3]-b[1])/(bounds[3]-bounds[1]));
  }
  function select(){
    const o=original(), e=edit()||{};
    $('status').value=e.status||'unreviewed';$('text').value=e.label??e.statement??o.label??o.statement;
    $('note').value=e.note||'';
    $('box-fields').hidden=o.kind!=='region';$('svg').hidden=o.kind!=='region';
    $('reading-fields').hidden=o.kind==='region';
    $('alternative').value=e.alternative??(o.alternatives||[]).join('\n');
    $('challenge').value=e.challenge??(o.missing_evidence||[]).join('\n');
    if(o.kind==='region'){(e.bbox_normalized||o.bbox_normalized).forEach((v,i)=>$(boxInputs[i]).value=v);draw();}
  }
  function working(){
    const container=$('working');container.replaceChildren();
    document.querySelectorAll('.review-badge').forEach(e=>e.remove());
    const statuses=state.snapshot?.review_status||{};
    const entries=Object.entries(statuses);
    if(!entries.length){container.textContent='No reviewer decisions saved. All proposals remain unreviewed.';return;}
    for(const [id,s] of entries){
      const article=document.createElement('article'), title=document.createElement('b');
      title.textContent=id+' · '+s.status;article.append(title);
      const entity=[...state.snapshot.analysis.regions,...state.snapshot.analysis.claims].find(c=>c.id===id);
      const p=document.createElement('p');p.textContent=entity?.statement||entity?.label||id;article.append(p);
      if(s.reasons.length){const why=document.createElement('p');why.textContent=s.reasons.join('; ');article.append(why);}
      container.append(article);
      for(const target of [document.getElementById(id),document.getElementById(id+'-configuration')].filter(Boolean)){
        const badge=document.createElement('span');badge.className='review-badge';badge.textContent='Reviewer overlay: '+s.status+' · inspect working review state above';target.prepend(badge);
      }
    }
  }
  async function request(method,payload){
    const response=await fetch('/api/review/'+encodeURIComponent(data.work_id),{method,headers:{'X-Review-Token':token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
    const value=await response.json();if(!response.ok)throw Error(value.error||'Review request failed');return value;
  }
  async function save(edits){
    if(!$('name').value.trim())throw Error('Enter the reviewer name before saving.');
    state=await request('POST',{expected_revision:state.record.revision,base_sha256:state.record.base_sha256,reviewer:{name:$('name').value,type:$('type').value},edits});
    message('Saved revision '+state.record.revision+' · '+state.record.reviewer.name+' · '+state.record.reviewer.type+'. Original proposals are preserved.');select();working();
    window.dispatchEvent(new CustomEvent('painting-review-saved',{detail:{revision:state.record.revision}}));
  }
  $('save').addEventListener('click',async()=>{
    try{
      const o=original(), e={entity_id:o.entity_id,status:$('status').value};
      const text=$('text').value.trim(), key=o.kind==='region'?'label':'statement';
      if(text!==o[key])e[key]=text;
      if($('note').value.trim())e.note=$('note').value.trim();
      if(o.kind==='region'){
        const box=boxInputs.map(k=>Number($(k).value));
        if(JSON.stringify(box)!==JSON.stringify(o.bbox_normalized))e.bbox_normalized=box;
      }else{
        if($('alternative').value.trim()!==(o.alternatives||[]).join('\n'))e.alternative=$('alternative').value.trim();
        if($('challenge').value.trim()!==(o.missing_evidence||[]).join('\n'))e.challenge=$('challenge').value.trim();
      }
      await save([...state.record.edits.filter(v=>v.entity_id!==o.entity_id),e]);
    }catch(error){message(error.message);}
  });
  $('reset').addEventListener('click',async()=>{try{await save(state.record.edits.filter(e=>e.entity_id!==original().entity_id));}catch(error){message(error.message);}});
  $('export').addEventListener('click',()=>{
    const content=state.snapshot?{record:state.record,...state.snapshot}:{status:'offline_unreviewed',entities:data.entities};
    const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=data.work_id+'-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('entity').addEventListener('change',select);boxInputs.forEach(k=>$(k).addEventListener('input',draw));
  const point=event=>{const r=$('svg').getBoundingClientRect();return [Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))];};
  $('svg').addEventListener('pointerdown',e=>{start=point(e);$('svg').setPointerCapture(e.pointerId);});
  $('svg').addEventListener('pointermove',e=>{
    if(!start)return;const p=point(e), box=[Math.min(start[0],p[0]),Math.min(start[1],p[1]),Math.max(start[0],p[0]),Math.max(start[1],p[1])];
    boxInputs.forEach((k,i)=>$(k).value=(bounds[i%2]+box[i]*(bounds[i%2+2]-bounds[i%2])).toFixed(6));draw();
  });
  $('svg').addEventListener('pointerup',()=>{start=null;$('status').value='revised';});
  $('svg').addEventListener('pointercancel',()=>{start=null;});
  select();working();
  (async()=>{try{
    if(location.protocol==='file:')throw Error('Open this report through run-local.sh --serve to save local revisions. JSON export is available offline.');
    const r=await fetch('/api/bootstrap');if(!r.ok)throw Error('Start the local review server with run-local.sh --serve.');token=(await r.json()).token;
    state=await request('GET');$('save').disabled=false;$('reset').disabled=false;
    if(state.record.reviewer && state.record.reviewer.type!=='automated_test'){$('name').value=state.record.reviewer.name;$('type').value=state.record.reviewer.type;}
    message('Local review connected · revision '+state.record.revision+'.');select();working();
  }catch(error){message(error.message);}})();
})();
