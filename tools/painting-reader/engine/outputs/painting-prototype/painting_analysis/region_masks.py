"""Seeded region proposals with explicit exclusions and perturbation disagreement."""
from __future__ import annotations
import cv2
import numpy as np
import re
from PIL import Image,ImageDraw
from scipy.ndimage import gaussian_filter
from .features import rgb_to_lab

def discover_regions(image,domain,config):
    """Anonymous connected palette fields; area selects candidates, not significance."""
    lab=rgb_to_lab(np.asarray(image,dtype=float)/255)
    sigma=max(.5,max(image.size)*config['blur_at_512']/512)
    smooth=gaussian_filter(lab,(sigma,sigma,0));data=smooth[domain].astype(np.float32)
    if len(data)<20 or float(np.linalg.norm(np.quantile(data,.95,axis=0)-np.quantile(data,.05,axis=0)))<1:return []
    cv2.setRNGSeed(config['rng_seed']);cv2.setNumThreads(1)
    _,labels,centers=cv2.kmeans(data,config['palette_clusters'],None,(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_MAX_ITER,25,.2),1,cv2.KMEANS_PP_CENTERS)
    assigned=np.full(domain.shape,-1,np.int32);assigned[domain]=labels[:,0];components=[]
    for index in range(len(centers)):
        n,cc,stats,_=cv2.connectedComponentsWithStats((assigned==index).astype(np.uint8),8)
        for label in range(1,n):
            area=int(stats[label,cv2.CC_STAT_AREA])
            if area>=max(25,config['minimum_component_fraction']*domain.sum()):components.append((area,index,label,cc==label))
    components.sort(key=lambda x:(-x[0],x[1],x[2]));specs=[]
    for area,cluster,label,component in components[:config['maximum_regions']]:
        y,x=np.nonzero(component);margin=config['roi_margin'];roi=[max(0,x.min()/image.width-margin),max(0,y.min()/image.height-margin),min(1,(x.max()+1)/image.width+margin),min(1,(y.max()+1)/image.height+margin)]
        distance=cv2.distanceTransform(component.astype(np.uint8),cv2.DIST_L2,5);rank=np.argsort(-distance.ravel(),kind='stable');points=[]
        for flat in rank:
            yy,xx=np.unravel_index(flat,domain.shape)
            if distance[yy,xx]<max(2,min(image.size)*.01):break
            if all(np.hypot(xx-px,yy-py)>=min(image.size)*.07 for px,py in points):points.append((int(xx),int(yy)))
            if len(points)==3:break
        if not points:continue
        outside=(~component)&domain;away=cv2.distanceTransform(outside.astype(np.uint8),cv2.DIST_L2,5);by,bx=np.unravel_index(np.argmax(away),away.shape)
        contours,_=cv2.findContours(component.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);contour=max(contours,key=cv2.contourArea);approx=cv2.approxPolyDP(contour,max(.5,.002*cv2.arcLength(contour,True)),True)[:,0,:]
        if len(approx)<3:continue
        spec={'id':'R'+str(len(specs)+1),'label':'anonymous color-field proposal '+str(len(specs)+1),'role':'formal_field',
            'roi':[float(v) for v in roi],'initial_polygon':[[float(xx/(image.width-1)),float(yy/(image.height-1))] for xx,yy in approx],
            'foreground_points':[[xx/(image.width-1),yy/(image.height-1)] for xx,yy in points],
            'background_points':[[float(bx/(image.width-1)),float(by/(image.height-1))]],
            'scope':'Connected palette component selected by area for inspection. No named object, attention rank, material or viewer affect is inferred.',
            'discovery':{'palette_cluster':cluster,'connected_component_area':area,'mean_cluster_lab':centers[cluster].astype(float).tolist()}}
        specs.append(spec)
    return specs

def polygon_mask(size,points):
    if len(points)<3 or any(len(p)!=2 or not all(np.isfinite(v) and 0<=v<=1 for v in p) for p in points):raise ValueError('Invalid normalized polygon')
    out=Image.new('L',size);ImageDraw.Draw(out).polygon([(round(x*(size[0]-1)),round(y*(size[1]-1))) for x,y in points],fill=255)
    return np.asarray(out)>0

def rect_mask(size,box,expansion=0):
    if len(box)!=4 or not all(np.isfinite(v) for v in box) or not(0<=box[0]<box[2]<=1 and 0<=box[1]<box[3]<=1):raise ValueError('Invalid region box')
    x0,y0,x1,y1=box;out=np.zeros((size[1],size[0]),bool)
    a,b,c,d=[round(v*n) for v,n in zip([max(0,x0-expansion),max(0,y0-expansion),min(1,x1+expansion),min(1,y1+expansion)],[size[0],size[1],size[0],size[1]])]
    out[b:d,a:c]=True
    return out

def seed_pixels(size,points,radius):
    out=Image.new('L',size);draw=ImageDraw.Draw(out)
    for p in points:
        if len(p)!=2 or not all(np.isfinite(v) and 0<=v<=1 for v in p):raise ValueError('Invalid seed point')
        x,y=[round(v*(n-1)) for v,n in zip(p,size)];draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=255)
    return np.asarray(out)>0

def one_proposal(image,spec,domain,condition,config):
    size=image.size;roi=rect_mask(size,spec['roi'],condition['roi_expansion'])&domain
    if 'extent_polygon' in spec:roi&=polygon_mask(size,spec['extent_polygon'])
    for poly in spec.get('exclude_polygons',[]):roi&=~polygon_mask(size,poly)
    if not roi.any():raise ValueError('Empty region proposal domain')
    radius=max(1,round(min(size)*condition['seed_radius_fraction']))
    fg=seed_pixels(size,spec['foreground_points'],radius)&domain
    bg=seed_pixels(size,spec.get('background_points',[]),radius)
    if not fg.any() or np.any(fg&~roi) or np.any(fg&bg):raise ValueError('Conflicting or out-of-region seeds')
    labels=np.zeros(domain.shape,np.uint8);labels[roi]=cv2.GC_PR_BGD
    initial=polygon_mask(size,spec['initial_polygon'])&roi if 'initial_polygon' in spec else roi
    labels[initial]=cv2.GC_PR_FGD;labels[fg]=cv2.GC_FGD;labels[bg]=cv2.GC_BGD
    if int((labels==cv2.GC_BGD).sum())<5:raise ValueError('Insufficient background seeds/domain')
    cv2.setRNGSeed(config['rng_seed']);cv2.setNumThreads(1)
    result,_,_=cv2.grabCut(np.asarray(image).copy(),labels,None,np.zeros((1,65),np.float64),np.zeros((1,65),np.float64),config['iterations'],cv2.GC_INIT_WITH_MASK)
    mask=np.isin(result,[cv2.GC_FGD,cv2.GC_PR_FGD])&roi
    return mask,{'foreground_seed_pixels':int(fg.sum()),'background_seed_pixels':int(bg.sum()),'roi_pixels':int(roi.sum()),'mask_pixels':int(mask.sum()),
        'seed_dominated':bool(mask.sum()<3*fg.sum()),'roi_fill_fraction':float(mask.sum()/roi.sum())}

def mask_geometry(mask):
    y,x=np.nonzero(mask)
    if len(x)<3:return {'status':'insufficient_pixels','pixel_count':int(len(x))}
    xy=np.column_stack([x,y]).astype(float);center=xy.mean(0);values,vectors=np.linalg.eigh(np.cov(xy,rowvar=False));order=np.argsort(values)[::-1];values=values[order];axis=vectors[:,order[0]]
    angle=float(np.degrees(np.arctan2(axis[1],axis[0]))%180);elongation=float(np.sqrt(values[0]/values[1])) if values[1]>1e-12 else None
    contours,_=cv2.findContours(mask.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    return {'status':'measured_proposal','pixel_count':int(mask.sum()),'area_fraction':float(mask.mean()),
        'pixel_bounds':[int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)],
        'width_fraction':float((x.max()-x.min()+1)/mask.shape[1]),'height_fraction':float((y.max()-y.min()+1)/mask.shape[0]),
        'center_normalized':[float(center[0]/mask.shape[1]),float(center[1]/mask.shape[0])],
        'principal_axis_degrees_clockwise_from_right':angle,'principal_axis_elongation':elongation,
        'component_count':len(contours),'outer_contour_length_pixels':float(sum(cv2.arcLength(c,True) for c in contours)),
        'scope':'Geometry of the proposed mask; not verified object silhouette, gaze, stroke direction or original painted profile.'}

def refine_region(image,spec,domain,config):
    if not re.fullmatch(r'R[1-9][0-9]*',spec['id']):raise ValueError('Invalid region identity')
    variants=[];diagnostics=[]
    for condition in config['conditions']:
        mask,diag=one_proposal(image,spec,domain,condition,config);variants.append(mask);diagnostics.append({'condition':condition,**diag,'geometry':mask_geometry(mask)})
    votes=np.sum(variants,axis=0);consensus=votes>=len(variants)//2+1;stable=votes==len(variants);possible=votes>0;uncertain=possible&~stable
    union=int(possible.sum());inter=int(stable.sum());iou=inter/union if union else None
    pairs=[]
    for i in range(len(variants)):
        for j in range(i+1,len(variants)):
            u=int((variants[i]|variants[j]).sum());pairs.append(float((variants[i]&variants[j]).sum()/u) if u else None)
    record={'id':spec['id'],'label':spec['label'],'annotation_scope':spec['scope'],'source_spec':spec,'geometry':mask_geometry(consensus),
        'perturbations':diagnostics,'all_condition_intersection_over_union':iou,'pairwise_iou':pairs,
        'disagreement_fraction_of_possible':float(uncertain.sum()/union) if union else None,
        'quality':'requires_boundary_review','independent_boundary_labels':'not_obtained'}
    return record,{'consensus':consensus,'stable':stable,'possible':possible,'uncertain':uncertain,'variants':variants}

def region_overlay(image,masks,uncertainty=False):
    rgb=np.asarray(image).copy().astype(float);colors=[(210,62,67),(42,120,185),(211,161,34)]
    for index,(_,data) in enumerate(masks.items()):
        mask=data['uncertain'] if uncertainty else data['consensus'];color=np.array((222,45,145) if uncertainty else colors[index%len(colors)])
        rgb[mask]=.45*rgb[mask]+.55*color
        if not uncertainty:
            contours,_=cv2.findContours(data['consensus'].astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(rgb,contours,-1,colors[index%len(colors)],1)
    return Image.fromarray(np.clip(rgb,0,255).astype(np.uint8))
