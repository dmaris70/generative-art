"""Source-bound selection retention; never a claim about complete depicted objects."""
import re,hashlib,json
import numpy as np
def selection_digest(mask):
    # Same shape-bound packed-bit format as proposal masks, also allowing an
    # empty candidate after a complete omission.
    header=json.dumps(list(mask.shape),separators=(',',':')).encode()
    return hashlib.sha256(header+b'\0'+np.packbits(mask.ravel()).tobytes()).hexdigest()

def compare_selections(reference, candidate, *, image_sha256):
    if not re.fullmatch(r'[0-9a-f]{64}',image_sha256):raise ValueError('Expected image SHA256')
    if any(m.dtype!=np.bool_ or m.ndim!=2 for m in [reference,candidate]):raise ValueError('Expected boolean masks')
    if reference.shape!=candidate.shape:raise ValueError('Selections must share a coordinate frame')
    n=int(reference.sum())
    if not n:raise ValueError('Reference selection is empty')
    retained=int((reference&candidate).sum());removed=n-retained;added=int((candidate&~reference).sum())
    h,w=reference.shape
    return {'version':'selection-comparison-0.1','kind':'pixel_selection_comparison',
        'image_sha256':image_sha256,'size':[w,h],'reference_mask_sha256':selection_digest(reference),
        'candidate_mask_sha256':selection_digest(candidate),'reference_selected_pixels':n,
        'candidate_selected_pixels':int(candidate.sum()),'retained_reference_pixels':retained,
        'omitted_reference_pixels':removed,'added_pixels_outside_reference':added,
        'fraction_of_reference_retained':retained/n,
        'statement':f'The changed selection retains {retained:,} of {n:,} reference-selected pixels ({100*retained/n:.1f}%), omits {removed:,}, and adds {added:,} pixels outside the reference selection.',
        'coverage_scope':'reference_pixel_selection_only','semantic_subject_coverage':None,
        'semantic_approval':False,'independent_validation':False}

def diagnostic_model_judgment(classification, *, challenge_evidence_sha256):
    if not re.fullmatch(r'[0-9a-f]{64}',challenge_evidence_sha256):raise ValueError('Expected challenge evidence hash')
    return {'role':'diagnostic_only','may_support_subject_completeness':False,
        'exclusion_proposal':classification.get('payload',{}).get('exclusion_assessment'),
        'classification_status':classification['status'],
        'reason':'The fixed subject-exclusion method returned no visible exclusion on every recorded left/right omission challenge. Preserve the response for inspection, not as support for subject completeness.',
        'challenge_evidence_sha256':challenge_evidence_sha256,
        'scope':'This tested model, prompt, schema and view package; not a universal claim about vision models.'}
