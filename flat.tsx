import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';

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

  private loadMedia(mediaSource: string | File) {
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
            this.material.uniforms.uTexture.value = videoTexture;
            this.material.uniforms.uImageAspect.value = this.videoElement!.videoWidth / this.videoElement!.videoHeight;
        }).catch(err => console.error("Video play failed:", err));
    } else {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');
        textureLoader.load(sourceUrl, (texture) => {
            this.material.uniforms.uTexture.value = texture;
            this.material.uniforms.uImageAspect.value = texture.image.width / texture.image.height;
        });
    }
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

// --- BEND BOX REACT COMPONENT (FROM BendBox.tsx) ---

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


// --- MAIN CLARITY COMPONENT (MERGED App.tsx and index.html) ---

type InputMode = 'url' | 'file';

export default function Bend() {
  const [mediaSource, setMediaSource] = useState<string | File>('https://picsum.photos/seed/p1/1920/1080');
  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [urlInput, setUrlInput] = useState('https://picsum.photos/seed/p1/1920/1080');
  
  const [flow, setFlow] = useState<number>(0.05);
  const [lens, setLens] = useState<number>(0.1);
  const [pinch, setPinch] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput) {
      setMediaSource(urlInput);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setMediaSource(e.target.files[0]);
    }
  };

  const css = `
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: 'Inter', sans-serif;
        background-color: #F4F4F4;
        color: #1a1a1a;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        background: #1a1a1a;
        border-radius: 50%;
        cursor: pointer;
        margin-top: -6px;
        transition: transform 0.2s ease;
      }
      input[type=range]::-webkit-slider-thumb:hover {
        transform: scale(1.2);
      }
      input[type=range]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #1a1a1a;
        border-radius: 50%;
        cursor: pointer;
      }
  `;

  const importMap = {
    imports: {
      "react/": "https://aistudiocdn.com/react@^19.1.1/",
      "react": "https://aistudiocdn.com/react@^19.1.1",
      "react-dom/": "https://aistudiocdn.com/react-dom@^19.1.1/",
      "three": "https://unpkg.com/three@0.128.0/build/three.module.js"
    }
  };

  // Note: Rendering an entire <html> document from a React component is unconventional
  // and can lead to issues when mounting into a standard HTML file's <body>.
  // This implementation strictly follows the request to merge index.html into the component.
  return (
    <>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>WebGL Media Distortion</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {/* The importmap is included here for context but is loaded by the host index.html */}
      </head>
      <div style={styles.appContainer}>
        <div style={styles.mainLayout}>
          <div style={styles.controlsPanel}>
            <h1 style={styles.title}>Bend Box</h1>
            <p style={styles.description}>
              An interactive media distortion component. Upload an image, video, or GIF, and manipulate it in real-time.
            </p>

            <div style={styles.mediaInputSection}>
              <div style={styles.inputModeToggle}>
                <button
                  onClick={() => setInputMode('url')}
                  style={inputMode === 'url' ? styles.activeToggle : styles.inactiveToggle}
                  aria-pressed={inputMode === 'url'}
                >
                  URL
                </button>
                <button
                  onClick={() => setInputMode('file')}
                  style={inputMode === 'file' ? styles.activeToggle : styles.inactiveToggle}
                  aria-pressed={inputMode === 'file'}
                >
                  Upload File
                </button>
              </div>
              {inputMode === 'url' ? (
                <form onSubmit={handleUrlSubmit} style={styles.urlForm}>
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="Enter image/video/gif URL"
                    style={styles.urlInput}
                    aria-label="Media URL"
                  />
                  <button type="submit" style={styles.button}>Load</button>
                </form>
              ) : (
                <div style={styles.fileInputContainer}>
                  <input
                    type="file"
                    id="file-upload"
                    onChange={handleFileChange}
                    accept="image/*,video/*,.gif"
                    style={styles.fileInput}
                  />
                   <label htmlFor="file-upload" style={styles.fileInputLabel}>
                      Choose File
                  </label>
                </div>
              )}
            </div>
            
            <div style={styles.slidersWrapper}>
              <div style={styles.sliderContainer}>
                <label htmlFor="flow" style={styles.sliderLabel}>Flow Distortion</label>
                <input id="flow" type="range" min="0" max="0.5" step="0.01" value={flow} onChange={(e) => setFlow(parseFloat(e.target.value))} style={styles.sliderInput} aria-label="Flow Distortion"/>
              </div>
              <div style={styles.sliderContainer}>
                <label htmlFor="lens" style={styles.sliderLabel}>Lens Distortion</label>
                <input id="lens" type="range" min="-1" max="1" step="0.01" value={lens} onChange={(e) => setLens(parseFloat(e.target.value))} style={styles.sliderInput} aria-label="Lens Distortion"/>
              </div>
              <div style={styles.sliderContainer}>
                <label htmlFor="pinch" style={styles.sliderLabel}>Pinch / Vortex</label>
                <input id="pinch" type="range" min="-1.5" max="1.5" step="0.01" value={pinch} onChange={(e) => setPinch(parseFloat(e.target.value))} style={styles.sliderInput} aria-label="Pinch Vortex"/>
              </div>
              <div style={styles.sliderContainer}>
                <label htmlFor="scale" style={styles.sliderLabel}>Media Scale</label>
                <input id="scale" type="range" min="0.5" max="1.5" step="0.01" value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} style={styles.sliderInput} aria-label="Media Scale"/>
              </div>
            </div>

          </div>
          <div style={styles.canvasContainer}>
            <BendBox 
              mediaSource={mediaSource} 
              flow={flow} 
              lens={lens} 
              pinch={pinch} 
              scale={scale} 
            />
          </div>
        </div>
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  appContainer: {
    minHeight: '100vh',
    backgroundColor: '#F4F4F4',
    color: '#1a1a1a',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '2rem',
  },
  mainLayout: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    gap: '2rem',
    width: '100%',
    maxWidth: '1200px',
    minHeight: '70vh',
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
  },
  controlsPanel: {
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
    borderRight: '1px solid #EAEAEA',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 700,
  },
  description: {
    fontSize: '0.9rem',
    color: '#666666',
    lineHeight: 1.5,
  },
  mediaInputSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  inputModeToggle: {
    display: 'flex',
    width: '100%',
    backgroundColor: '#EEEEEE',
    borderRadius: '8px',
    padding: '4px',
  },
  activeToggle: {
    flex: 1,
    padding: '0.5rem',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#FFFFFF',
    color: '#1a1a1a',
    fontWeight: 500,
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    transition: 'all 0.2s ease',
  },
  inactiveToggle: {
    flex: 1,
    padding: '0.5rem',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#666666',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  urlForm: {
    display: 'flex',
    gap: '0.5rem',
  },
  urlInput: {
    flex: 1,
    padding: '0.5rem 0.75rem',
    border: '1px solid #DDDDDD',
    borderRadius: '6px',
    fontSize: '0.875rem',
    outline: 'none',
  },
  fileInputContainer: {
    position: 'relative',
  },
  fileInput: {
    display: 'none',
  },
  fileInputLabel: {
    display: 'block',
    padding: '0.5rem 1rem',
    backgroundColor: '#1a1a1a',
    color: '#FFFFFF',
    borderRadius: '6px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  button: {
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#1a1a1a',
    color: '#FFFFFF',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  slidersWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  sliderContainer: {
    width: '100%',
  },
  sliderLabel: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#333333',
    marginBottom: '0.75rem',
  },
  sliderInput: {
    width: '100%',
    height: '4px',
    backgroundColor: '#DDDDDD',
    borderRadius: '9999px',
    appearance: 'none',
    cursor: 'pointer',
    outline: 'none',
  },
  canvasContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    minHeight: '400px',
    background: 'radial-gradient(circle, #E8E8E8 0%, #D8D8D8 100%)'
  },
};
