"""A short account first; optional evidence and a single, simple response."""
import json
from pathlib import Path
from PIL import Image
from .understanding_report import page,esc,title_for
from .reporting import encoded
from .reasoning import sha


def swatch(rgb,label):
    color='#'+''.join(f'{v:02x}' for v in rgb)
    return f'<span class="swatch" style="background:{color}" aria-label="{esc(label)}"></span> {esc(label)}'


SCRIPT=r'''(()=>{
const data=JSON.parse(document.getElementById('reading-data').textContent),$=id=>document.getElementById(id);
let token=null,state={revision:0,choice:null};const test=new URLSearchParams(location.search).get('test')==='1';
if(test){$('feedback-status').textContent='Interface test mode: responses are labeled automated_test.';}
function render(){for(const choice of ['fits','missing'])$(choice).setAttribute('aria-pressed',String(state.choice===choice));$('reading-note').value=state.note||'';}
async function request(method,payload){const r=await fetch('/api/reading-feedback/'+data.work_id,{method,headers:{'X-Review-Token':token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});const v=await r.json();if(!r.ok)throw Error(v.error||'Could not save response');return v;}
async function save(choice){try{state=await request('POST',{expected_revision:state.revision,artifact_sha256:data.artifact_sha256,choice,note:$('reading-note').value,actor:test?'automated_test':'local_viewer'});render();$('feedback-status').textContent=choice===null?'Response cleared; history retained.':choice==='fits'?'Saved: this broadly fits your reading.':'Saved: something is missing from this reading.';}catch(e){$('feedback-status').textContent=e.message;}}
for(const choice of ['fits','missing'])$(choice).addEventListener('click',()=>save(choice));$('clear-response').addEventListener('click',()=>save(null));
(async()=>{try{if(location.protocol==='file:')throw Error('The reading and evidence work offline. Open the local server to save a response.');const r=await fetch('/api/bootstrap');if(!r.ok)throw Error('Start the local reading server to save a response.');token=(await r.json()).token;state=await request('GET');render();for(const id of ['fits','missing','clear-response'])$(id).disabled=false;if(!test)$('feedback-status').textContent=state.choice?'Your previous response is saved.':'A short response is enough.';}catch(e){$('feedback-status').textContent=e.message;}})();
})();'''


def render_reading(r,output):
    output=Path(output);title,artist=title_for(r['work_id']);c={x['id']:x for x in r['features']['candidates']};tree=c['C1'];land=c['C2'];g=tree['geometry'];local=tree['color']['comparisons']['local_ring'];whole=tree['color']['comparisons']['remaining_image']
    header=f'<header><div class="eyebrow">A reading shaped by your response</div><h1>{esc(title)}</h1><p class="muted">{esc(artist)}</p></header>'
    body='<style>main{max-width:860px;padding:24px}.reading-text{font:clamp(20px,2.6vw,25px)/1.65 Georgia,serif}.reading-image img{max-height:36vh}.simple-response{border:0;background:transparent;padding:6px 0 24px}.simple-response button{font-size:15px;margin:4px 6px 4px 0;padding:10px 18px}.simple-response button[aria-pressed=true]{background:#244e3a;color:white}textarea{max-width:640px}details{margin:12px 0}.swatch{display:inline-block;vertical-align:middle;width:35px;height:22px;border:1px solid #b7beb2;border-radius:3px;margin:0 5px 0 12px}.small-link{font-size:12px}h1{font-size:clamp(29px,4vw,42px)}@media(max-width:650px){main{padding:18px}.reading-image img{max-height:30vh}}</style>'
    body+='<figure class="reading-image"><img src="'+encoded(Image.open(output/'image.png').convert('RGB'))+'" alt="Wheat Field with Cypresses"></figure>'
    body+='<div class="reading-text" id="main-reading">'+esc(r['display']['paragraph'])+'</div><section class="simple-response"><h2>Does this reflect your reading?</h2><label class="muted">One short correction, if you wish<textarea id="reading-note" rows="2" maxlength="2000" placeholder="Optional"></textarea></label><button id="fits" disabled aria-pressed="false">Yes, broadly</button><button id="missing" disabled aria-pressed="false">Something is missing</button><p id="feedback-status" class="muted" role="status">Connecting…</p><button id="clear-response" disabled class="small-link">Clear my response</button></section>'
    body+='<details><summary>Look closer at the tree</summary><p>The proposed tree box spans '+f'{g["height_fraction"]:.0%}'+' of the image height and '+f'{g["width_fraction"]:.0%}'+ ' of its width. Its pixel height is '+f'{g["pixel_height_to_width"]:.2f}'+ ' times its width. This measures an approximate box, not the tree’s silhouette.</p>'
    if local and whole:body+='<p>The box is '+f'{abs(local["signed_lightness_difference"]):.1f}'+' L* '+('darker' if local['signed_lightness_difference']<0 else 'lighter')+' than its local surrounding ring. Its color distance from the rest of the image is '+f'{whole["delta_E_1976"]:.1f}'+' in CIELAB ΔE76. These are descriptors, not a score of importance.</p>'
    body+='<p>'+swatch(tree['color']['mean_rgb'],'Tree-box average')+'</p><figure><img src="'+encoded(Image.open(output/'regions.png').convert('RGB'))+'" alt="Approximate tree, sky and land envelopes"><figcaption>Approximate inherited regions, shown only to locate the measurements.</figcaption></figure></details>'
    body+='<details><summary>Look closer at the cloud shapes</summary><p>Pink marks show candidate curved edges inside the sky region, excluding the proposed tree box. They may include contours, texture and other depicted forms.</p><figure><img src="'+encoded(Image.open(output/'curves.png').convert('RGB'))+'" alt="Candidate curved-edge pixels in the approximate sky region"></figure>'
    for row in r['sky_probe']['controls']:
        value=row['curved_share_of_strong_edges'];body+='<p>Blur '+f'{row["blur_pixels"]:.1f}'+' pixels: '+(f'{value:.0%} of selected strong edges meet the declared curvature threshold.' if value is not None else 'Too few edge samples for a summary.')+'</p>'
    body+='<p>This examines curved structure; it does not identify every cloud boundary, establish closed circles or measure turmoil. “Turmoil” remains your reported experience.</p></details>'
    body+='<details><summary>Look closer at the golden land</summary><p>'+swatch(land['color']['mean_rgb'],'Land-box average')+'</p><p>The measured average color is kept separate from your description, “warm.” We have not inferred calmness, comfort or a universal emotional response from the pixels.</p></details>'
    body+='<details><summary>Compare with the account written without your comments</summary><p><b>Without your comments:</b> '+esc(r['image_only']['paragraph'])+'</p><p><b>With your comments:</b> '+esc(r['display']['paragraph'])+'</p><p>This is a development comparison on the same painting, not independent evidence of improved accuracy.</p><details><summary>How this paragraph was chosen</summary><p>Displayed origin: '+esc(r['display']['origin'].replace('_',' '))+'.</p><p>'+esc('; '.join(r['display']['selection_flags']) or 'The generated account passed the attribution and short-text checks.')+'</p><p>The displayed reading preserves one person’s response. Model audit judgments are not expert validation.</p><pre>'+esc(json.dumps(r['audit_dimensions'],indent=2))+'</pre></details></details>'
    body+='<details><summary>Method checks on other paintings</summary><p>The same numerical measurements were applied to two existing development works. Your reported feelings were not transferred to them. These checks do not establish interpretive generalization.</p><ul>'+''.join('<li>'+esc(title_for(p['work_id'])[0])+' · '+str(len(p['features']['candidates']))+' candidate regions</li>' for p in r['transfer_probes'])+'</ul></details>'
    body+='<p class="muted small-link"><a href="/synthesis/arguments/'+esc(r['work_id'])+'/report.html">Earlier detailed workspace</a> · <a href="reading.json">Technical record</a> · <a href="inference-audit.json">Model audit</a></p>'
    data=json.dumps({'work_id':r['work_id'],'artifact_sha256':sha(output/'reading.json')}).replace('<','\\u003c').replace('&','\\u0026')
    return page(title,header,body+'<script type="application/json" id="reading-data">'+data+'</script><script>'+SCRIPT+'</script>')
