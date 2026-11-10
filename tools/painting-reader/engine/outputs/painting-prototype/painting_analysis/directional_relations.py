"""Image orientation fields: local coherence, axial dispersion and scale-dependent bending."""
import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter,binary_erosion
from .features import srgb_to_linear

def tensor_field(image,domain,blur_at_512,config):
    if min(image.size)<8 or domain.shape!=(image.height,image.width) or int(domain.sum())<20:raise ValueError('Insufficient image/domain for direction analysis')
    gray=srgb_to_linear(np.asarray(image,dtype=float)/255)@np.array([.2126,.7152,.0722]);long=max(image.size)
    sigma=max(.5,blur_at_512*long/512)
    gy=gaussian_filter(gray,sigma,order=(1,0),mode='reflect')*long/512
    gx=gaussian_filter(gray,sigma,order=(0,1),mode='reflect')*long/512
    integration=sigma*config['integration_sigma_ratio']
    xx=gaussian_filter(gx*gx,integration);xy=gaussian_filter(gx*gy,integration);yy=gaussian_filter(gy*gy,integration)
    energy=xx+yy;difference=np.sqrt((xx-yy)**2+4*xy**2)
    coherence=np.divide(difference,energy,out=np.zeros_like(energy),where=energy>1e-15)
    theta=(.5*np.arctan2(2*xy,xx-yy)+np.pi/2)%np.pi
    c,s=np.cos(2*theta),np.sin(2*theta);cy,cx=np.gradient(c);sy,sx=np.gradient(s)
    tx=.5*(c*sx-s*cx);ty=.5*(c*sy-s*cy)
    curvature=np.abs(np.cos(theta)*tx+np.sin(theta)*ty)
    cutoff=max(config['normalized_energy_floor'],float(np.quantile(energy[domain],config['energy_quantile'])))
    # The integrated tensor has support beyond the derivative blur; censor image/domain margins.
    valid=binary_erosion(domain,iterations=max(2,int(np.ceil(2*integration))),border_value=0)
    return {'theta':theta,'coherence':coherence,'energy':energy,'curvature':curvature,'valid':valid,'energy_cutoff':cutoff,'sigma_pixels':sigma,
        'turning':np.degrees(curvature*min(image.size)*config['turning_span_fraction'])}

def summarize_field(field,mask,image_size,config,coherence_cutoff=None):
    cutoff=config['coherence_cutoff'] if coherence_cutoff is None else coherence_cutoff
    # Keep an extra margin around manually proposed regions and exclusions.
    margin=max(2,int(np.ceil(2*field['sigma_pixels']*config['integration_sigma_ratio'])))
    region=binary_erosion(mask,iterations=margin,border_value=0)&field['valid']
    energetic=region&(field['energy']>=field['energy_cutoff']);selected=energetic&(field['coherence']>=cutoff)
    n=int(selected.sum());en=int(energetic.sum());enough=n>=config['minimum_samples'];theta=field['theta'][selected]
    weights=field['energy'][selected]*field['coherence'][selected];denom=float(weights.sum())
    concentration=float(abs(np.sum(weights*np.exp(2j*theta)))/denom) if enough and denom>0 else None
    mean_angle=float((np.angle(np.sum(weights*np.exp(2j*theta)))/2)%(np.pi)*180/np.pi) if enough and denom>0 and concentration>=.2 else None
    hist=np.histogram(theta,bins=np.linspace(0,np.pi,13),weights=weights)[0].astype(float)
    hist=(hist/hist.sum()).tolist() if enough and hist.sum()>0 else None
    k=field['curvature'][selected]*min(image_size)
    median_k=float(np.median(k)) if enough else None
    return {'status':'measured_direction_proxy' if enough else 'insufficient_samples','blur_pixels':field['sigma_pixels'],'region_margin_pixels':margin,'coherence_cutoff':cutoff,
        'analysis_region_pixels':int(region.sum()),'energetic_pixels':en,'eligible_direction_pixels':n,'energy_cutoff':field['energy_cutoff'],
        'locally_coherent_fraction_of_energetic':n/en if en>=config['minimum_samples'] else None,
        'global_axial_concentration':concentration,'mean_tangent_degrees_clockwise_from_right':mean_angle,
        'orientation_histogram_12':hist,'median_local_coherence':float(np.median(field['coherence'][selected])) if enough else None,
        'median_absolute_bend_per_short_side':median_k,
        'median_radius_fraction_of_short_side':float(np.median(1/k)) if enough and np.all(k>1e-12) else None,
        'curved_fraction_of_eligible':float((field['turning'][selected]>=config['curved_turning_degrees']).mean()) if enough else None,
        'scope':'Local image-tangent estimates, not authenticated brushstrokes. Local coherence is distinct from global orientation agreement; curvature is not contour closure or emotion.'}

def region_directions(image,domain,mask,config,fields=None):
    fields=fields or [tensor_field(image,domain,blur,config) for blur in config['blur_at_512']]
    return [{'primary':summarize_field(f,mask,image.size,config),
        'coherence_controls':[summarize_field(f,mask,image.size,config,c) for c in config['coherence_controls']]} for f in fields],fields

def direction_overlay(image,field,domain):
    out=np.asarray(image).copy();step=max(12,round(max(image.size)/24))
    for y in range(step//2,image.height,step):
        for x in range(step//2,image.width,step):
            if not domain[y,x] or not field['valid'][y,x] or field['energy'][y,x]<field['energy_cutoff'] or field['coherence'][y,x]<.55:continue
            angle=field['theta'][y,x];dx=int(np.cos(angle)*step*.35);dy=int(np.sin(angle)*step*.35)
            cv2.line(out,(x-dx,y-dy),(x+dx,y+dy),(205,38,134),1,cv2.LINE_AA)
    return Image.fromarray(out)
