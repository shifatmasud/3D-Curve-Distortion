import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface BendBoxProps {
  mediaSource: string | File;
  flow: number;
  lens: number;
  pinch: number;
  scale: number;
}

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

    // 1. Scale
    pos.xy *= uScale;

    // 2. Lens Distortion (positive for bulge, negative for concave)
    float dist = length(centeredUv);
    float lensEffect = uLens * pow(dist, 2.0);
    pos.xy *= 1.0 - lensEffect;
    
    // 3. Pinch / Vortex
    float twistFactor = smoothstep(0.0, 0.7, dist);
    float angle = uPinch * twistFactor;
    pos.xy = rotate(angle) * pos.xy;
    
    // 4. Flow (noise on Z-axis)
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

const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url);

const BendBox: React.FC<BendBoxProps> = ({ mediaSource, flow, lens, pinch, scale }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const threeRef = useRef<any>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    
    const clock = new THREE.Clock();
    
    const geometry = new THREE.PlaneGeometry(2, 2, 64, 64);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTexture: { value: null },
        uImageAspect: { value: 1.0 },
        uPlaneAspect: { value: mount.clientWidth / mount.clientHeight },
        uFlow: { value: flow },
        uLens: { value: lens },
        uPinch: { value: pinch },
        uScale: { value: scale },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
    const fitPlaneToView = () => {
        const dist = camera.position.z;
        const vFov = (camera.fov * Math.PI) / 180;
        const height = 2 * Math.tan(vFov / 2) * dist;
        const width = height * camera.aspect;
        mesh.scale.set(width / 2, height / 2, 1);
        material.uniforms.uPlaneAspect.value = width / height;
    };
    fitPlaneToView();

    let resizeFrameId: number;
    const resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrameId);
        resizeFrameId = requestAnimationFrame(() => {
            if (!mount) return;
            camera.aspect = mount.clientWidth / mount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(mount.clientWidth, mount.clientHeight);
            fitPlaneToView();
        });
    });
    resizeObserver.observe(mount);
    
    threeRef.current = { renderer, camera, scene, geometry, material, resizeObserver, mesh };

    let animationId: number;
    const animate = () => {
      material.uniforms.uTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      cancelAnimationFrame(resizeFrameId);
      resizeObserver.disconnect();
      
      // Safer DOM and resource cleanup
      if (renderer.domElement) renderer.domElement.remove();
      renderer.dispose();
      geometry?.dispose();
      material?.uniforms?.uTexture?.value?.dispose();
      material?.dispose();
      
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!threeRef.current.material || !mediaSource) return;

    const material = threeRef.current.material;
    
    // Clean up previous texture and video elements
    if (material.uniforms.uTexture.value) {
      material.uniforms.uTexture.value.dispose();
    }
    if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current = null;
    }

    let objectUrl: string | null = null;
    const sourceUrl = mediaSource instanceof File ? URL.createObjectURL(mediaSource) : mediaSource;
    if (mediaSource instanceof File) {
        objectUrl = sourceUrl;
    }
    
    const isVideoSource = mediaSource instanceof File ? mediaSource.type.startsWith('video/') : isVideo(sourceUrl);
    
    if (isVideoSource) {
        const video = document.createElement('video');
        videoRef.current = video;
        video.crossOrigin = 'anonymous';
        video.src = sourceUrl;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.play().then(() => {
            const videoTexture = new THREE.VideoTexture(video);
            material.uniforms.uTexture.value = videoTexture;
            material.uniforms.uImageAspect.value = video.videoWidth / video.videoHeight;
        }).catch(err => console.error("Video play failed:", err));
    } else {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');
        textureLoader.load(sourceUrl, (texture: any) => {
            material.uniforms.uTexture.value = texture;
            material.uniforms.uImageAspect.value = texture.image.width / texture.image.height;
        });
    }

    // Effect cleanup: revoke object URL to prevent memory leaks
    return () => {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    };
  }, [mediaSource]);
  
  // Effects hooks
  useEffect(() => { if (threeRef.current.material) threeRef.current.material.uniforms.uFlow.value = flow; }, [flow]);
  useEffect(() => { if (threeRef.current.material) threeRef.current.material.uniforms.uLens.value = lens; }, [lens]);
  useEffect(() => { if (threeRef.current.material) threeRef.current.material.uniforms.uPinch.value = pinch; }, [pinch]);
  useEffect(() => { if (threeRef.current.material) threeRef.current.material.uniforms.uScale.value = scale; }, [scale]);


  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

export default BendBox;