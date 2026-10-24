import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, HueSaturationEffect, BrightnessContrastEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
// COLOR GRADING lives here: tweak these numbers to change the whole look.
export const GRADE = { saturation: 0.28, hue: 0.0, contrast: 0.12, brightness: 0.02, bloom: 0.55, vignette: 0.45, exposure: 1.0 };
export function makeComposer(r: THREE.WebGLRenderer, s: THREE.Scene, c: THREE.Camera, mobile: boolean) {
  const comp = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, multisampling: mobile ? 0 : 4 });
  comp.addPass(new RenderPass(s, c));
  comp.addPass(new EffectPass(c,
    new BloomEffect({ intensity: GRADE.bloom, luminanceThreshold: 0.85, mipmapBlur: true }),
    new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
    new HueSaturationEffect({ hue: GRADE.hue, saturation: GRADE.saturation }),
    new BrightnessContrastEffect({ brightness: GRADE.brightness, contrast: GRADE.contrast }),
    new VignetteEffect({ darkness: GRADE.vignette, offset: 0.3 })));
  return comp;
}
