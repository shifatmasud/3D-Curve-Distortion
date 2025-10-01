import * as THREE from 'three';
import type { BendBoxProps } from './BendBox';

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

  // Note: <colorspace_pars_fragment> is not needed here because Three.js
  // automatically includes it when renderer.outputColorSpace is set to SRGBColorSpace.
  // Including it manually would cause a redefinition error.

  void main() {
    float R = uPlaneAspect / uImageAspect;
    // This calculation ensures the image covers the plane, preserving aspect ratio.
    vec2 scale = R > 1. ? vec2(1.0/R, 1.0) : vec2(1.0, R);
    
    // Recalculate UVs to center and scale the texture.
    vec2 correctedUv = (vUv - 0.5) / scale + 0.5;
    
    // If the corrected UVs are outside the [0,1] range, it means we are
    // in the transparent area, so we discard the pixel.
    if (correctedUv.x < 0.0 || correctedUv.x > 1.0 || correctedUv.y < 0.0 || correctedUv.y > 1.0) {
      discard;
    }

    // Sample the texture. The color is automatically converted from sRGB to linear space
    // by the GPU thanks to the sRGB texture encoding setup by Three.js.
    vec4 texColor = texture2D(uTexture, correctedUv);
    
    // Assign the linear color to gl_FragColor.
    gl_FragColor = texColor;

    // The colorspace_fragment chunk correctly converts the linear color
    // to the renderer's output color space (sRGB), ensuring correct color display.
    #include <colorspace_fragment>
  }
`;

const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url);

export class BendBoxEngine {
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
  
  // Props for smooth animation
  private targetProps: { flow: number; lens: number; pinch: number; scale: number; motionSpeed: number; };
  private animatedProps: { flow: number; lens: number; pinch: number; scale: number; };

  constructor(container: HTMLDivElement) {
    this.container = container;
    
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.z = 1;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    
    this.targetProps = { flow: 0, lens: 0, pinch: 0, scale: 1.0, motionSpeed: 0.075 };
    this.animatedProps = { flow: 0, lens: 0, pinch: 0, scale: 1.0 };
    
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
    const lerpFactor = this.targetProps.motionSpeed;
    this.animatedProps.flow = THREE.MathUtils.lerp(this.animatedProps.flow, this.targetProps.flow, lerpFactor);
    this.animatedProps.lens = THREE.MathUtils.lerp(this.animatedProps.lens, this.targetProps.lens, lerpFactor);
    this.animatedProps.pinch = THREE.MathUtils.lerp(this.animatedProps.pinch, this.targetProps.pinch, lerpFactor);
    this.animatedProps.scale = THREE.MathUtils.lerp(this.animatedProps.scale, this.targetProps.scale, lerpFactor);
    
    this.material.uniforms.uTime.value = this.clock.getElapsedTime();
    this.material.uniforms.uFlow.value = this.animatedProps.flow;
    this.material.uniforms.uLens.value = this.animatedProps.lens;
    this.material.uniforms.uPinch.value = this.animatedProps.pinch;
    this.material.uniforms.uScale.value = this.animatedProps.scale;

    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  private onResize = () => {
    // By wrapping the resize logic in requestAnimationFrame, we decouple it
    // from the observer's callback execution, preventing a feedback loop
    // where resizing the canvas triggers the observer again in the same frame.
    requestAnimationFrame(() => {
      if (this.isDisposed) {
        return;
      }
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

  private loadMedia(mediaSource: string | File) {
    // Cleanup previous resources
    this.material.uniforms.uTexture.value?.dispose();
    if (this.videoElement) {
        this.videoElement.pause();
        this.videoElement.src = "";
        this.videoElement = undefined;
    }
    if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = undefined;
    }

    this.currentMediaSource = mediaSource;

    const sourceUrl = mediaSource instanceof File ? URL.createObjectURL(mediaSource) : mediaSource;
    if (mediaSource instanceof File) {
        this.currentObjectUrl = sourceUrl;
    }
    
    const isVideoSource = mediaSource instanceof File ? mediaSource.type.startsWith('video/') : isVideo(sourceUrl);
    
    if (isVideoSource) {
        this.videoElement = document.createElement('video');
        this.videoElement.crossOrigin = 'anonymous';
        this.videoElement.src = sourceUrl;
        this.videoElement.muted = true;
        this.videoElement.loop = true;
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.videoElement.play().then(() => {
            const videoTexture = new THREE.VideoTexture(this.videoElement!);
            videoTexture.colorSpace = THREE.SRGBColorSpace;
            this.material.uniforms.uTexture.value = videoTexture;
            this.material.uniforms.uImageAspect.value = this.videoElement!.videoWidth / this.videoElement!.videoHeight;
        }).catch(err => console.error("Video play failed:", err));
    } else {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');
        textureLoader.load(sourceUrl, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            this.material.uniforms.uTexture.value = texture;
            this.material.uniforms.uImageAspect.value = texture.image.width / texture.image.height;
        });
    }
  }
  
  public setProps(props: BendBoxProps) {
    if (this.currentMediaSource !== props.mediaSource) {
        this.loadMedia(props.mediaSource);
    }
    this.targetProps.flow = props.flow;
    this.targetProps.lens = props.lens;
    this.targetProps.pinch = props.pinch;
    this.targetProps.scale = props.scale;
    this.targetProps.motionSpeed = props.motionSpeed;
  }

  public dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.geometry.dispose();
    this.material.uniforms.uTexture.value?.dispose();
    this.material.dispose();
    
    if (this.videoElement) {
        this.videoElement.pause();
        this.videoElement.src = "";
    }
     if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl);
    }
  }
}