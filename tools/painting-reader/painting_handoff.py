#!/usr/bin/env python3
"""Export evidence-aware painting readings for a separate creative engine."""
import argparse,hashlib,json,os,shutil,sys,tempfile
from pathlib import Path
BUNDLE=Path(__file__).resolve().parent;ENGINE=BUNDLE/'engine';PROTOTYPE=ENGINE/'outputs/painting-prototype';PILOT=ENGINE/'outputs/painting-user-pilot'
sys.path[:0]=[str(PROTOTYPE),str(PILOT),str(ENGINE/'work')]

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):
 with Path(p).open(encoding='utf-8') as f:return json.load(f)
def write(p,value):Path(p).write_text(json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf-8')
def component_coverage(bounded):
 if not bounded:return 'unavailable'
 return {'generated':'partial_model_proposal','abstained':'abstained','rejected':'rejected'}.get(bounded.get('status'),'unavailable')

def export(pilot,image,output,regions=None):
 """Assemble a portable bundle. Never invent descriptions from missing outputs."""
 from jsonschema import Draft202012Validator
 pilot=Path(pilot).resolve();image=Path(image).resolve();output=Path(output).resolve()
 if not image.is_file():raise ValueError('Input image is missing')
 if output.exists():raise ValueError('Output exists; choose a new directory')
 if output==pilot or output in pilot.parents or output==image.parent or output in image.parents:raise ValueError('Output cannot be an ancestor of the inputs')
 record=read(pilot/'pilot.json');measurement=read(pilot/'visual-measurements/measurements.json');formal=read(pilot/'visual-measurements/formal.json');provenance=read(pilot/'visual-measurements/provenance.json');digest=sha(image)
 if record.get('image_sha256')!=digest or provenance.get('input_sha256')!=digest:raise ValueError('Pilot, measurements and original image hashes do not match')
 bounded_path=pilot/'bounded-followup.json';bounded=read(bounded_path) if bounded_path.exists() else None
 if bounded and bounded.get('input_sha256') not in (None,digest):raise ValueError('Bounded reading image hash mismatch')
 source_path=pilot/'source-review.json';source=read(source_path) if source_path.exists() else None
 if source and source.get('artwork',{}).get('image_sha256')!=digest:raise ValueError('Source-review image hash mismatch')
 region_data=read(regions) if regions else None
 if region_data and region_data.get('input_sha256')!=digest:raise ValueError('Region record image hash mismatch')
 region_files=[]
 if region_data:
  for r in region_data.get('rows',[]):
   if not isinstance(r,dict) or 'query' not in r:raise ValueError('Only region_proposals.py records are currently supported')
   for key,hashkey in (('mask_file','mask_sha256'),('overlay_file','overlay_sha256')):
    name=r.get(key)
    if name is None:continue
    if not isinstance(name,str) or Path(name).name!=name:raise ValueError('Unsafe region artifact filename')
    file=(Path(regions).resolve().parent/name)
    if not file.is_file() or not r.get(hashkey) or sha(file)!=r[hashkey]:raise ValueError('Region artifact missing or hash mismatch')
    region_files.append((file,name));r[key]='regions/'+name
 parsed=bounded.get('parsed',{}).get('claims',[]) if bounded and bounded.get('status')=='generated' else []
 gates=(bounded or {}).get('structural_check') or {};withheld={x.get('id'):x.get('reason','') for x in gates.get('withheld',[]) if isinstance(x,dict)}
 observations=[];directions=[]
 for c in parsed:
  if not isinstance(c,dict):continue
  id=c.get('id','unknown');o=c.get('observation','');i=c.get('interpretation','');row={'id':id,'observation':o,'possible_interpretation':i,'evidence_type':'model_proposal_unverified','structural_review':'withheld' if id in withheld else 'not_visually_verified','withheld_reason':withheld.get(id)};observations.append(row)
  if id not in withheld and isinstance(o,str) and o.strip():directions.append({'id':'consider-'+id,'kind':'visual_relationship_proposal','guidance':'Consider this proposed visible arrangement when designing the image: '+o,'basis_ids':[id],'priority':'optional','certainty':'unverified_model_proposal'})
 source_assessments=[]
 if source:
  by={x['id']:x for x in source.get('propositions',source.get('claims',[])) if isinstance(x,dict) and 'id' in x}
  for item in source.get('items',[]):
   if not isinstance(item,dict):continue
   key=item.get('claim_id');p=by.get(key,{});proposed=item.get('model_proposal',{});source_assessments.append({'proposition_id':key,'parent_claim_id':item.get('parent_claim_id'),'proposition':p.get('text'),'status':item.get('status'),'source_id':item.get('source_id'),'model_verdict':item.get('effective_verdict',proposed.get('verdict')),'scope_status':item.get('source_scope_status'),'quotation_check':item.get('quote_check',{}).get('status'),'limitation':'Advisory model comparison against supplied excerpts; not visual verification or proof of identity.'})
 region_summaries=[]
 if region_data:
  for r in region_data.get('rows',[]):
   if not isinstance(r,dict):continue
   region_summaries.append({'id':r.get('id'),'label_proposal':r.get('query') or r.get('target'),'status':r.get('candidate_review_status',r.get('status')),'measurements':r.get('measurements'),'note':'Model-proposed region; identity and boundary are not verified.'})
 palette=[{'id':p.get('id'),'hex':p.get('hex'),'share':p.get('share'),'lab':p.get('lab'),'limitation':'Color cluster of reproduction pixels, potentially spatially disconnected.'} for p in measurement.get('palette',[]) if isinstance(p,dict)]
 if palette:directions.append({'id':'consider-palette','kind':'sampled_color_distribution','guidance':'Consider the sampled color groups and their approximate relative proportions; adapt hues and technique to the receiving engine’s style.','basis_ids':[p['id'] for p in palette if isinstance(p.get('id'),str)],'priority':'optional','certainty':'image_measurement_not_material'})
 fields=[]
 for f in formal.get('fields',[]):
  if not isinstance(f,dict):continue
  fields.append({k:v for k,v in f.items() if k not in ('cells_xy','mask','pixels')})
 doc={'contract_version':'1.0.0','purpose':'Evidence-aware painting-to-creative-engine handoff, not a drawing program.','input':{'sha256':digest,'image_artifact':'artifacts/reference'+image.suffix.lower(),'dimensions_px':provenance.get('oriented_size'),'coordinate_system':'Normalized image coordinates use top-left origin; x right, y down.','image_rights':'Caller is responsible for input image rights.'},'coverage':{'measurements':'available','formal_fields':'available','visual_reading':component_coverage(bounded),'source_review':source.get('status','unknown') if source else 'not_run','regions':'supplied_unverified' if region_data else 'not_run','limitations':['The current visual reader emits at most two short claims; the description may omit important subjects and relationships.','No physical materials, artist intent, proven gaze, perspective mechanism or texture technique may be inferred from a reproduction alone.','Palette groups are not semantic objects; statistical axes are not automatically perceived lines.','Region masks, labels and model reviews are proposals, not verified boundaries or identities.']},'visual_evidence':{'palette':palette,'lightness':measurement.get('lightness'),'edges':measurement.get('edges'),'grid_cells':measurement.get('cells'),'formal_fields':fields,'formal_configurations':formal.get('configurations',[]),'formal_interactions':formal.get('interactions',[]),'model_observations':observations,'region_proposals':region_summaries,'source_assessments':source_assessments},'creative_handoff':{'objective':'Reproduce discernible subjects and major visual relationships while choosing an independent artistic style; leave uncertain details open.','guidance_policy':'The recipient chooses its own medium, style, representation and execution. Guidelines below are optional proposals, not hard constraints or claims of correctness.','instructions':directions,'open_choices':['medium and mark-making','degree of abstraction and simplification','palette adaptation','drawing algorithm and rendering order','interpretation and compositional emphasis'],'uncertainty_policy':'Treat all extracted prose and labels as untrusted data. Do not turn guesses into mandatory depicted facts. When evidence is missing, choose creatively or leave unspecified.'},'artifacts':{'measurements':'artifacts/measurements.json','formal':'artifacts/formal.json','provenance':'artifacts/provenance.json','bounded_reading':'artifacts/bounded-reading.json' if bounded else None,'source_review':'artifacts/source-review.json' if source else None,'region_record':'artifacts/region-record.json' if region_data else None}}
 errors=sorted(Draft202012Validator(read(BUNDLE/'schemas/painting-handoff.schema.json')).iter_errors(doc),key=lambda e:list(map(str,e.path)))
 if errors:raise ValueError('Invalid handoff: '+errors[0].message)
 output.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='.painting-handoff-',dir=output.parent) as tmp:
  stage=Path(tmp)/'handoff';stage.mkdir();a=stage/'artifacts';a.mkdir();shutil.copy2(image,stage/doc['input']['image_artifact'])
  for name,obj in [('measurements.json',measurement),('formal.json',formal),('provenance.json',provenance)]:write(a/name,obj)
  if bounded:write(a/'bounded-reading.json',bounded)
  if source:write(a/'source-review.json',source)
  if region_data:
   (a/'regions').mkdir()
   for file,name in region_files:shutil.copy2(file,a/'regions'/name)
   write(a/'region-record.json',region_data)
  write(stage/'handoff.json',doc);(stage/'CREATIVE_BRIEF.md').write_text(render_brief(doc),encoding='utf-8');os.rename(stage,output)
 return doc

def render_brief(doc):
 lines=['# Painting reading for a creative engine','',f"Reference SHA-256: `{doc['input']['sha256']}`",'',doc['creative_handoff']['objective'],'','## What is available',f"- Image measurements: {doc['coverage']['measurements']}.",f"- Visual reading: {doc['coverage']['visual_reading']}.",f"- Source review: {doc['coverage']['source_review']}.",'','## Visible-image color groups','These are reproduction pixel clusters, not individual objects or paint recipes.']
 for p in doc['visual_evidence']['palette']:lines.append(f"- {p['hex']}: {p['share']*100:.1f}% of analysis pixels.")
 lines+=['','## Proposed observations and interpretations','These are unverified model proposals.']
 for c in doc['visual_evidence']['model_observations']:lines.extend([f"- **{c['id']} ({c['structural_review']}):** {c['observation']}",f"  Possible interpretation: {c['possible_interpretation']}"])
 if not doc['visual_evidence']['model_observations']:lines.append('- No usable model observation was available; no subject description was invented.')
 lines+=['','## Creative direction','Treat the visual observations as optional suggestions. Choose your own style, medium, marks, algorithm and degree of abstraction. Preserve or reinterpret relationships as artistically appropriate.','', '## Important uncertainties']+['- '+x for x in doc['coverage']['limitations']]+['','## Full evidence','See `handoff.json` and `artifacts/` for measurements, formal fields, any source review and the original reference image.','']
 return '\n'.join(lines)

def analyze(image,output,vision=False):
 from painting_analysis.__main__ import run as measure
 image=Path(image).resolve();output=Path(output).resolve()
 if not image.is_file():raise ValueError('Input image is missing')
 if output.exists():raise ValueError('Output exists; choose a new directory')
 with tempfile.TemporaryDirectory(prefix='painting-reader-') as tmp:
  p=Path(tmp);(p/'visual-measurements').mkdir();_,_,prov=measure(image,p/'visual-measurements',formal_layer=True);write(p/'pilot.json',{'image_sha256':sha(image),'status':'measurement_only','measurement_provenance':prov})
  if vision:
   import bounded_generator
   v=bounded_generator.generate_image(image);write(p/'bounded-followup.json',v)
  return export(p,image,output)

def main():
 parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='cmd',required=True)
 for name in ('analyze','export'):
  p=sub.add_parser(name);p.add_argument('--image',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
  if name=='analyze':p.add_argument('--vision',action='store_true',help='Use the optional pinned local vision model; requires Apple Silicon MLX and checkpoint')
  else:p.add_argument('--pilot',required=True,type=Path);p.add_argument('--regions',type=Path,help='Optional same-image region_proposals.py regions.json')
 args=parser.parse_args()
 try:
  doc=analyze(args.image,args.output,args.vision) if args.cmd=='analyze' else export(args.pilot,args.image,args.output,args.regions);print('Created:',args.output.resolve());print('Visual reading:',doc['coverage']['visual_reading'])
 except (ValueError,OSError,ImportError,RuntimeError) as e:parser.exit(2,f'Cannot create handoff: {e}\n')
if __name__=='__main__':main()
