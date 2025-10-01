import React, { useState } from 'react';
import BendBox from './components/BendBox';

type InputMode = 'url' | 'file';

const App: React.FC = () => {
  const [mediaSource, setMediaSource] = useState<string | File>('https://picsum.photos/seed/p1/1920/1080');
  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [urlInput, setUrlInput] = useState('https://picsum.photos/seed/p1/1920/1080');
  
  // Distortion parameters
  const [flow, setFlow] = useState<number>(0.05);
  const [lens, setLens] = useState<number>(0.1);
  const [pinch, setPinch] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [motionSpeed, setMotionSpeed] = useState<number>(0.075);


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

  return (
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
            <div style={styles.sliderContainer}>
                <label htmlFor="motionSpeed" style={styles.sliderLabel}>Motion Speed</label>
                <input id="motionSpeed" type="range" min="0.01" max="0.3" step="0.005" value={motionSpeed} onChange={(e) => setMotionSpeed(parseFloat(e.target.value))} style={styles.sliderInput} aria-label="Motion Speed"/>
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
            motionSpeed={motionSpeed}
          />
        </div>
      </div>
    </div>
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

export default App;