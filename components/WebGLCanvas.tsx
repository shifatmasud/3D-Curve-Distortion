import React, { useRef, useEffect } from 'react';
import { Preset } from '../App';

// Since we are loading Three.js from a CDN, we need to declare it to TypeScript
declare const THREE: any;

interface WebGLCanvasProps {
  imageUrl: string;
  preset: Preset;
  intensity: number;
  scale: number;
}

const PRESET_MAP: { [key in Preset]: number } = {
  classic: 0,
  flow: 1,
  bulge: 2,
  pinch: 3,
  inverted: 4,
};

const vertexShader = `
  // 2D Simplex Noise
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

  uniform float uScroll;
  uniform float uTime;
  uniform int uPreset;
  uniform float uIntensity;
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
    
    pos.xy *= uScale;
    
    float scrollFactor = uScroll / 300.0;
    scrollFactor = clamp(scrollFactor, -1.0, 1.0);
    
    float effectIntensity = uIntensity * 0.8;
    vec2 centeredUv = uv - 0.5;

    if (uPreset == 0) { // Classic
        float dist = length(centeredUv);
        float distortion = -scrollFactor * effectIntensity * 0.5;
        pos.xy *= 1.0 + pow(dist, 1.5) * distortion;
    } else if (uPreset == 1) { // Flow
        // 1. Apply Classic preset as a base
        float dist = length(centeredUv);
        float classicDistortion = -scrollFactor * effectIntensity * 0.5;
        pos.xy *= 1.0 + pow(dist, 1.5) * classicDistortion;

        // 2. Add animated 3D noise distortion on top
        float noiseFrequency = 4.0;
        float noiseSpeed = 0.3;
        float noise = snoise(vUv * noiseFrequency + uTime * noiseSpeed);
        
        // Amplitude is based on scroll position and overall intensity
        float noiseAmplitude = abs(scrollFactor) * uIntensity * 0.15;
        pos.z += noise * noiseAmplitude;
    } else if (uPreset == 2) { // Bulge
        float dist = length(centeredUv);
        // Create a smooth falloff for the bulge, concentrated in the center
        float bulgeFactor = 1.0 - smoothstep(0.0, 0.75, dist);
        // Apply distortion primarily to the Z-axis for a 3D effect
        float bulgeDistortion = scrollFactor * effectIntensity * 0.7 * bulgeFactor;
        pos.z += bulgeDistortion;
        // Also apply a subtle lens distortion to XY for a more rounded feel
        pos.xy *= 1.0 - (bulgeDistortion * 0.3);
    } else if (uPreset == 3) { // Pinch (Vortex)
        float dist = length(centeredUv);
        float pinchIntensity = -scrollFactor * effectIntensity * 1.2;

        // 1. Rotational twist that is strongest mid-way from the center
        float twistFactor = pow(dist, 0.5) * (1.0 - dist) * 2.0;
        float angle = pinchIntensity * twistFactor;
        
        pos.xy = rotate(angle) * pos.xy;
        
        // 2. Radial pull towards the center
        pos.xy *= 1.0 + pow(dist, 1.5) * pinchIntensity * 0.5;
    } else if (uPreset == 4) { // Inverted Z
        float dist = length(centeredUv);
        float z_factor = 1.0 - smoothstep(0.0, 0.6, dist);
        float z_distortion = scrollFactor * effectIntensity * 0.3 * z_factor;
        pos.z += z_distortion;
    }
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uImageAspect;
  uniform float uPlaneAspect;
  varying vec2 vUv;

  void main() {
    // Aspect ratio correction to prevent stretching
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


const WebGLCanvas: React.FC<WebGLCanvasProps> = ({ imageUrl, preset, intensity, scale }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef({ current: 0, target: 0, ease: 0.05 });
  const threeRef = useRef<any>({});

  useEffect(() => {
    if (!mountRef.current || typeof THREE === 'undefined') return;
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    
    const clock = new THREE.Clock();

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous'); // Fix for CORS issue
    let material: any = null;
    const texture = textureLoader.load(imageUrl, (tex: any) => {
        if (material) material.uniforms.uImageAspect.value = tex.image.width / tex.image.height;
    });
    
    const geometry = new THREE.PlaneGeometry(2, 2, 64, 64);
    material = new THREE.ShaderMaterial({
      uniforms: {
        uScroll: { value: 0 },
        uTime: { value: 0 },
        uTexture: { value: texture },
        uImageAspect: { value: 1.0 },
        uPlaneAspect: { value: mount.clientWidth / mount.clientHeight },
        uPreset: { value: PRESET_MAP[preset] },
        uIntensity: { value: intensity },
        uScale: { value: scale },
      },
      vertexShader,
      fragmentShader,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
    const fitPlaneToView = () => {
        const dist = camera.position.z;
        const vFov = (camera.fov * Math.PI) / 180;
        const height = 2 * Math.tan(vFov / 2) * dist;
        const width = height * camera.aspect;
        mesh.scale.set(width / 2, height / 2, 1);
        if(material) material.uniforms.uPlaneAspect.value = width / height;
    };
    fitPlaneToView();

    const resizeObserver = new ResizeObserver(() => {
        if (!mount) return;
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        fitPlaneToView();
    });
    resizeObserver.observe(mount);
    
    threeRef.current = { renderer, camera, scene, geometry, material, texture, resizeObserver };

    let animationId: number;
    const animate = () => {
      const elapsedTime = clock.getElapsedTime();
      const rect = mount.getBoundingClientRect();
      const elementCenterY = rect.top + rect.height / 2;
      const viewportCenterY = window.innerHeight / 2;
      scrollRef.current.target = elementCenterY - viewportCenterY;
      scrollRef.current.current += (scrollRef.current.target - scrollRef.current.current) * scrollRef.current.ease;
      
      const scrollValue = scrollRef.current.current;
      if(material) {
        material.uniforms.uScroll.value = scrollValue;
        material.uniforms.uTime.value = elapsedTime;
      }

      renderer.render(scene, camera);

      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      threeRef.current.resizeObserver.disconnect();
      if (mount && threeRef.current.renderer) mount.removeChild(threeRef.current.renderer.domElement);
      threeRef.current.geometry?.dispose();
      threeRef.current.material?.dispose();
      threeRef.current.texture?.dispose();
    };
  }, [imageUrl]);

  useEffect(() => {
    if (threeRef.current.material) {
      threeRef.current.material.uniforms.uPreset.value = PRESET_MAP[preset];
    }
  }, [preset]);

  useEffect(() => {
    if (threeRef.current.material) {
      threeRef.current.material.uniforms.uIntensity.value = intensity;
    }

    // Adjust scroll animation speed based on intensity
    const minEase = 0.03;
    const maxEase = 0.2; // Increased for more responsiveness
    const maxIntensity = 1.5; // Corresponds to the slider's max value in App.tsx

    // Linearly interpolate the ease factor. A higher intensity results in a more responsive (less smooth) animation.
    const newEase = minEase + (intensity / maxIntensity) * (maxEase - minEase);
    
    if (scrollRef.current) {
        scrollRef.current.ease = newEase;
    }
  }, [intensity]);
  
  useEffect(() => {
    if (threeRef.current.material) {
      threeRef.current.material.uniforms.uScale.value = scale;
    }
  }, [scale]);

  return <div ref={mountRef} style={{ width: '100%', height: '75vh' }} />;
};

export default WebGLCanvas;