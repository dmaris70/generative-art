"""Local adapter to Meta's official SAM 2 still-image implementation."""
from pathlib import Path
import hashlib
import numpy as np


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


class SamRegionProposer:
    def __init__(self, checkpoint, config, *, device='cpu', threads=4):
        import torch
        from sam2.build_sam import build_sam2
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
        if device not in ['cpu', 'mps', 'cuda']:
            raise ValueError('Unsupported inference device')
        self.torch = torch
        torch.set_num_threads(threads)
        torch.manual_seed(410)
        self.model = build_sam2(config['model_config'], str(checkpoint), device=device, apply_postprocessing=False)
        self.generator = SAM2AutomaticMaskGenerator(self.model, **config['automatic_masks'])
        self.binding = {'implementation': 'facebookresearch/sam2', 'checkpoint_sha256': sha256(checkpoint),
                        'model_config': config['model_config'], 'device': device, 'threads': threads,
                        'torch': torch.__version__, 'precision': 'float32', 'video_memory_used': False,
                        'postprocessing': 'CUDA hole/sprinkle cleanup disabled; automatic mask filtering and NMS remain enabled.'}

    def generate(self, image):
        """Return every mask emitted by Meta AMG; preserve prompt, crop and scores."""
        with self.torch.inference_mode():
            raw = self.generator.generate(np.asarray(image, dtype=np.uint8))
        # Stable area ordering makes the default comparison independent of rule outcomes.
        raw.sort(key=lambda r: (-int(r['area']), -float(r['predicted_iou']), r['bbox']))
        masks, records = {}, []
        for index, item in enumerate(raw, start=1):
            rid = 'S' + str(index)
            mask = np.asarray(item['segmentation'], dtype=bool)
            if mask.shape != (image.height, image.width):
                raise ValueError('SAM mask is not mapped to the original analysis image')
            masks[rid] = mask
            records.append({'id': rid, **{k: v for k, v in item.items() if k != 'segmentation'},
                            'scope': 'Unlabelled SAM proposal. Predicted IoU and logit stability are model diagnostics, not measured boundary accuracy or artistic importance.'})
        return records, masks
