import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { addPropertyControls, ControlType } from "framer";

// --- BEND BOX PROPS INTERFACE ---
interface BendBoxProps {
  mediaSource: string | File;
  flow: number;
  lens: number;
  pinch: number;
  scale: number;
}

// --- SHADERS AND ENGINE LOGIC (FROM BendBoxEngine.ts) ---

const vertexShader = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
  }

  uniform float uTime;
  uniform float uFlow;
  uniform float uLens;
  uniform float uPinch;
  uniform float uScale;
  varying vec2 vUv;

  mat2 rotate(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    vec2 centeredUv = uv - 0.5;
    pos.xy *= uScale;
    float dist = length(centeredUv);
    float lensEffect = uLens * pow(dist, 2.0);
    pos.xy *= 1.0 - lensEffect;
    float twistFactor = smoothstep(0.0, 0.7, dist);
    float angle = uPinch * twistFactor;
    pos.xy = rotate(angle) * pos.xy;
    float noiseFrequency = 3.0;
    float noiseSpeed = 0.2;
    float noise = snoise(vUv * noiseFrequency + uTime * noiseSpeed);
    pos.z += noise * uFlow;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uImageAspect;
  uniform float uPlaneAspect;
  varying vec2 vUv;

  void main() {
    vec2 ratio = vec2(
      min((uPlaneAspect / uImageAspect), 1.0),
      min((uImageAspect / uPlaneAspect), 1.0)
    );
    vec2 correctedUv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );
    gl_FragColor = texture2D(uTexture, correctedUv);
  }
`;

const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url);

class BendBoxEngine {
  private container: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private resizeObserver: ResizeObserver;
  private animationFrameId: number = 0;
  private isDisposed: boolean = false;
  
  private currentMediaSource?: string | File;
  private videoElement?: HTMLVideoElement;
  private currentObjectUrl?: string;
  private loadMediaRequestId = 0;

  constructor(container: HTMLDivElement) {
    this.container = container;
    
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.z = 1;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    
    this.geometry = new THREE.PlaneGeometry(2, 2, 64, 64);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTexture: { value: null },
        uImageAspect: { value: 1.0 },
        uPlaneAspect: { value: container.clientWidth / container.clientHeight },
        uFlow: { value: 0 },
        uLens: { value: 0 },
        uPinch: { value: 0 },
        uScale: { value: 1.0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    this.fitPlaneToView();

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.container);

    this.animate();
  }

  private animate = () => {
    if(this.isDisposed) return;
    this.material.uniforms.uTime.value = this.clock.getElapsedTime();
    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  private onResize = () => {
    requestAnimationFrame(() => {
      if (this.isDisposed) return;
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      this.fitPlaneToView();
    });
  }

  private fitPlaneToView = () => {
    const dist = this.camera.position.z;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(vFov / 2) * dist;
    const width = height * this.camera.aspect;
    this.mesh.scale.set(width / 2, height / 2, 1);
    this.material.uniforms.uPlaneAspect.value = width / height;
  };

  private async loadMedia(mediaSource: string | File) {
    this.loadMediaRequestId++;
    const currentRequestId = this.loadMediaRequestId;
    this.currentMediaSource = mediaSource;

    this._cleanupPreviousMedia();

    if (!mediaSource) {
        this.material.uniforms.uTexture.value = null;
        return;
    }

    const sourceUrl = mediaSource instanceof File ? URL.createObjectURL(mediaSource) : mediaSource;
    if (mediaSource instanceof File) {
        this.currentObjectUrl = sourceUrl;
    }
    
    const isVideoSource = mediaSource instanceof File ? mediaSource.type.startsWith('video/') : isVideo(sourceUrl);

    try {
        let result: { texture: THREE.Texture, resolution: THREE.Vector2 };

        if (isVideoSource) {
            result = await this._loadVideoTexture(sourceUrl);
        } else {
            result = await this._loadImageTexture(sourceUrl);
        }

        if (this.isDisposed || currentRequestId !== this.loadMediaRequestId) {
            result.texture.dispose();
            return;
        }

        const resizedResult = this._resizeTextureOnGPU(result.texture, result.resolution);
        
        if (this.isDisposed || currentRequestId !== this.loadMediaRequestId) {
            resizedResult.texture.dispose();
            return;
        }

        this.material.uniforms.uTexture.value = resizedResult.texture;
        this.material.uniforms.uImageAspect.value = resizedResult.resolution.x / resizedResult.resolution.y;

    } catch (error) {
        console.error("BendBoxEngine: Failed to load media", error);
        if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
            this.currentObjectUrl = undefined;
        }
    }
  }

  private _cleanupPreviousMedia() {
    this.material.uniforms.uTexture.value?.dispose();
    this.material.uniforms.uTexture.value = null;

    if (this.videoElement) {
        this.videoElement.pause();
        this.videoElement.removeAttribute('src');
        this.videoElement.load();
        this.videoElement = undefined;
    }
    if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = undefined;
    }
  }
  
  private _resizeTextureOnGPU(sourceTexture: THREE.Texture, sourceResolution: THREE.Vector2): { texture: THREE.Texture, resolution: THREE.Vector2 } {
    const canvasSize = new THREE.Vector2();
    this.renderer.getSize(canvasSize);
    const pixelRatio = this.renderer.getPixelRatio();
    
    if (canvasSize.x === 0) return { texture: sourceTexture, resolution: sourceResolution };
    
    const targetSize = canvasSize.multiplyScalar(pixelRatio);

    if (sourceResolution.x <= targetSize.x && sourceResolution.y <= targetSize.y) {
        return { texture: sourceTexture, resolution: sourceResolution };
    }

    const canvasAspect = targetSize.x / targetSize.y;
    const sourceAspect = sourceResolution.x / sourceResolution.y;

    let scale = (canvasAspect > sourceAspect) ? 
                (targetSize.x / sourceResolution.x) : 
                (targetSize.y / sourceResolution.y);
    scale = Math.min(scale, 1.0);

    if (scale >= 0.99) {
        return { texture: sourceTexture, resolution: sourceResolution };
    }

    const newWidth = Math.max(1, Math.round(sourceResolution.x * scale));
    const newHeight = Math.max(1, Math.round(sourceResolution.y * scale));

    const resizeTarget = new THREE.WebGLRenderTarget(newWidth, newHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: sourceTexture.type,
    });

    const tempScene = new THREE.Scene();
    const tempMaterial = new THREE.ShaderMaterial({
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D uTexture; varying vec2 vUv; void main() { gl_FragColor = texture2D(uTexture, vUv); }`,
        uniforms: { uTexture: { value: sourceTexture } }
    });
    tempScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tempMaterial));

    const oldRenderTarget = this.renderer.getRenderTarget();
    // FIX: In newer THREE.js versions, `outputEncoding` is replaced by `outputColorSpace`.
    const oldOutputColorSpace = this.renderer.outputColorSpace;

    this.renderer.setRenderTarget(resizeTarget);
    // FIX: In newer THREE.js versions, `texture.encoding` is replaced by `texture.colorSpace` and `THREE.sRGBEncoding` by `THREE.SRGBColorSpace`.
    if(sourceTexture.colorSpace === THREE.SRGBColorSpace){
        // FIX: In newer THREE.js versions, `outputEncoding` is replaced by `outputColorSpace` and `THREE.sRGBEncoding` by `THREE.SRGBColorSpace`.
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    
    this.renderer.render(tempScene, this.camera);

    this.renderer.setRenderTarget(oldRenderTarget);
    // FIX: In newer THREE.js versions, `outputEncoding` is replaced by `outputColorSpace`.
    this.renderer.outputColorSpace = oldOutputColorSpace;

    sourceTexture.dispose();
    tempMaterial.dispose();
    // FIX: Cast scene child to THREE.Mesh to access geometry property.
    (tempScene.children[0] as THREE.Mesh).geometry.dispose();

    const newTexture = resizeTarget.texture;
    // FIX: In newer THREE.js versions, `texture.encoding` is replaced by `texture.colorSpace`.
    newTexture.colorSpace = sourceTexture.colorSpace;
    
    return {
        texture: newTexture,
        resolution: new THREE.Vector2(newWidth, newHeight)
    };
  }

  private async _loadImageTexture(url: string): Promise<{ texture: THREE.Texture, resolution: THREE.Vector2 }> {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("Anonymous");
      const texture = await loader.loadAsync(url).catch(() => {
           throw new Error(`Failed to load image. Check CORS policy or URL: ${url}`);
      });
      if (this.isDisposed) {
          texture.dispose();
          throw new Error('Component unmounted during texture load');
      }
      const image = texture.image as HTMLImageElement;
      return { 
          texture, 
          resolution: new THREE.Vector2(image.width, image.height)
      };
  }

  private _loadVideoTexture(url: string): Promise<{ texture: THREE.VideoTexture, resolution: THREE.Vector2 }> {
      return new Promise((resolve, reject) => {
          const video = document.createElement('video');
          this.videoElement = video;

          const onCanPlay = () => {
              video.play().then(() => {
                  if (this.isDisposed) return reject(new Error('Component unmounted'));
                  cleanup();
                  resolve({ 
                      texture: new THREE.VideoTexture(video), 
                      resolution: new THREE.Vector2(video.videoWidth, video.videoHeight)
                  });
              }).catch(e => {
                  cleanup();
                  reject(e);
              });
          };
          const onError = () => {
              cleanup();
              reject(new Error(`Failed to load video. Check CORS policy or URL: ${url}`));
          };
          const cleanup = () => {
              video.removeEventListener('canplay', onCanPlay);
              video.removeEventListener('error', onError);
          };

          video.addEventListener('canplay', onCanPlay);
          video.addEventListener('error', onError);
          video.crossOrigin = "Anonymous";
          video.src = url;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.load();
      });
  }
  
  public setProps(props: BendBoxProps) {
    if (this.currentMediaSource !== props.mediaSource) {
        this.loadMedia(props.mediaSource);
    }
    this.material.uniforms.uFlow.value = props.flow;
    this.material.uniforms.uLens.value = props.lens;
    this.material.uniforms.uPinch.value = props.pinch;
    this.material.uniforms.uScale.value = props.scale;
  }

  public dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    
    this._cleanupPreviousMedia();
    
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

// --- BEND BOX REACT COMPONENT (THE WRAPPER) ---

const BendBox: React.FC<BendBoxProps> = (props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BendBoxEngine | null>(null);

  useEffect(() => {
    if (mountRef.current) {
      engineRef.current = new BendBoxEngine(mountRef.current);
      engineRef.current.setProps(props);
    }

    return () => {
      engineRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setProps(props);
    }
  }, [props.mediaSource, props.flow, props.lens, props.pinch, props.scale]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};


// --- FRAMER CODE COMPONENT ---

export default function Bend(props) {
  const { sourceType, mediaUrl, mediaFile, flow, lens, pinch, scale } = props;
  
  const mediaSource = sourceType === 'file' && mediaFile ? mediaFile : mediaUrl;

  return (
    <div style={{ width: '100%', height: '100%', background: 'radial-gradient(circle, #E8E8E8 0%, #D8D8D8 100%)' }}>
        <BendBox 
            mediaSource={mediaSource} 
            flow={flow} 
            lens={lens} 
            pinch={pinch} 
            scale={scale} 
        />
    </div>
  );
}

Bend.defaultProps = {
    width: 600,
    height: 450,
    sourceType: 'url',
    mediaUrl: 'https://picsum.photos/seed/framer/1200/900',
    flow: 0.05,
    lens: 0.1,
    pinch: 0,
    scale: 1.0,
};

addPropertyControls(Bend, {
    sourceType: {
        type: ControlType.SegmentedEnum,
        title: "Source",
        options: ["url", "file"],
        optionTitles: ["URL", "File"],
    },
    mediaUrl: {
        type: ControlType.String,
        title: "Media URL",
        placeholder: "https://...",
        hidden: (props) => props.sourceType === 'file',
    },
    mediaFile: {
        type: ControlType.File,
        title: "Upload",
        allowedFileTypes: ["jpg", "jpeg", "png", "gif", "mp4", "webm"],
        hidden: (props) => props.sourceType === 'url',
    },
    flow: {
        type: ControlType.Number,
        title: "Flow",
        min: 0,
        max: 0.5,
        step: 0.01,
        displayStepper: true,
    },
    lens: {
        type: ControlType.Number,
        title: "Lens",
        min: -1,
        max: 1,
        step: 0.01,
        displayStepper: true,
    },
    pinch: {
        type: ControlType.Number,
        title: "Pinch",
        min: -1.5,
        max: 1.5,
        step: 0.01,
        displayStepper: true,
    },
    scale: {
        type: ControlType.Number,
        title: "Scale",
        min: 0.5,
        max: 1.5,
        step: 0.01,
        displayStepper: true,
    },
});