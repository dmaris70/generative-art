"""Validated point/box prompts for the official local SAM2 image predictor."""
import math
import numpy as np


def validate_prompt(payload, allowed_works):
    if not isinstance(payload, dict) or payload.get('work_id') not in allowed_works:
        raise ValueError('Choose a known comparison painting')
    points = payload.get('points', [])
    box = payload.get('box')
    if not isinstance(points, list) or len(points) > 16:
        raise ValueError('Use at most 16 point prompts')
    def coordinate(value):
        return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1
    for point in points:
        if not isinstance(point, dict) or set(point) != {'x', 'y', 'label'}:
            raise ValueError('Each point requires x, y and label')
        if not coordinate(point['x']) or not coordinate(point['y']) or type(point['label']) is not int or point['label'] not in [0, 1]:
            raise ValueError('Points need finite normalized coordinates and labels 0 or 1')
    if box is not None:
        if not isinstance(box, list) or len(box) != 4 or not all(coordinate(v) for v in box) or not (box[0] < box[2] and box[1] < box[3]):
            raise ValueError('Box needs ordered normalized bounds')
    if box is None and not any(p['label'] == 1 for p in points):
        raise ValueError('Add a positive point or a box first')
    return {'work_id': payload['work_id'], 'points': points, 'box': box}


class SamPointSession:
    def __init__(self, checkpoint, model_config, device='cpu'):
        import torch
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        self.torch = torch
        torch.set_num_threads(4)
        torch.manual_seed(410)
        self.model = build_sam2(model_config, str(checkpoint), device=device, apply_postprocessing=False)
        self.predictor = SAM2ImagePredictor(self.model, max_hole_area=0, max_sprinkle_area=0)
        self.current_image_key = None

    def predict(self, image, prompt, image_key):
        points = prompt['points']
        coords = np.array([[p['x'] * (image.width-1), p['y'] * (image.height-1)] for p in points], dtype=np.float32) if points else None
        labels = np.array([p['label'] for p in points], dtype=np.int32) if points else None
        box = np.array(prompt['box'], dtype=np.float32) * np.array([image.width-1, image.height-1] * 2) if prompt['box'] is not None else None
        with self.torch.inference_mode():
            if self.current_image_key != image_key:
                self.predictor.set_image(np.array(image, dtype=np.uint8, copy=True))
                self.current_image_key = image_key
            masks, scores, _ = self.predictor.predict(point_coords=coords, point_labels=labels, box=box, multimask_output=True)
        return np.asarray(masks, dtype=bool), np.asarray(scores, dtype=float)
