import React from 'react';
import WebGLCanvas from './components/WebGLCanvas';

export type Preset = 'classic' | 'flow' | 'bulge' | 'pinch' | 'inverted';

const App: React.FC = () => {
  const [preset, setPreset] = React.useState<Preset>('classic');
  const [intensity, setIntensity] = React.useState<number>(0.5);
  const [scale, setScale] = React.useState<number>(0.8);

  const presets: { id: Preset; name: string }[] = [
    { id: 'classic', name: 'Classic' },
    { id: 'flow', name: 'Flow' },
    { id: 'bulge', name: 'Bulge' },
    { id: 'pinch', name: 'Pinch' },
    { id: 'inverted', name: 'Inverted Z' },
  ];

  return (
    <div style={styles.appContainer}>
      <div style={styles.contentWrapper}>
        <section style={styles.headerSection}>
          <div style={styles.controlsContainer}>
            <div style={styles.buttonGroup}>
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  style={{
                    ...styles.button,
                    ...(preset === p.id ? styles.activeButton : styles.inactiveButton)
                  }}
                  aria-pressed={preset === p.id}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div style={styles.slidersWrapper}>
              <div style={styles.sliderContainer}>
                <label htmlFor="intensity" style={styles.sliderLabel}>
                  Intensity
                </label>
                <input
                  id="intensity"
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.01"
                  value={intensity}
                  onChange={(e) => setIntensity(parseFloat(e.target.value))}
                  style={styles.sliderInput}
                  aria-label="Distortion Intensity"
                />
              </div>
              <div style={styles.sliderContainer}>
                <label htmlFor="scale" style={styles.sliderLabel}>
                  Image Scale
                </label>
                <input
                  id="scale"
                  type="range"
                  min="0.4"
                  max="1.0"
                  step="0.01"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  style={styles.sliderInput}
                  aria-label="Image Scale"
                />
              </div>
            </div>
          </div>
        </section>
        
        <section style={styles.imageSection}>
          <WebGLCanvas imageUrl="https://picsum.photos/id/10/1920/1080" preset={preset} intensity={intensity} scale={scale} />
        </section>

        <section style={styles.imageSection}>
          <WebGLCanvas imageUrl="https://picsum.photos/id/20/1920/1080" preset={preset} intensity={intensity} scale={scale} />
        </section>
        
        <section style={styles.imageSection}>
          <WebGLCanvas imageUrl="https://picsum.photos/id/30/1920/1080" preset={preset} intensity={intensity} scale={scale} />
        </section>

        <section style={{ height: '50vh' }} />
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  appContainer: {
    backgroundColor: '#F4F4F4',
    color: '#1a1a1a',
  },
  contentWrapper: {
    maxWidth: '56rem',
    margin: '0 auto',
    padding: '0 2rem',
  },
  headerSection: {
    padding: '4rem 0',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    position: 'sticky',
    top: 0,
    backgroundColor: 'rgba(244, 244, 244, 0.8)',
    backdropFilter: 'blur(8px)',
    zIndex: 10,
  },
  controlsContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    width: '100%',
  },
  slidersWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    width: '100%',
    maxWidth: '16rem',
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  button: {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    fontSize: '0.875rem',
    fontWeight: 500,
    transition: 'all 0.2s ease-in-out',
    border: '1px solid transparent',
    cursor: 'pointer',
    outline: 'none',
  },
  activeButton: {
    backgroundColor: '#1a1a1a',
    color: '#FFFFFF',
    boxShadow: '0 4px 14px 0 rgba(0, 0, 0, 0.1)',
  },
  inactiveButton: {
    backgroundColor: 'transparent',
    color: '#666666',
    border: '1px solid #DDDDDD',
  },
  sliderContainer: {
    width: '100%',
  },
  sliderLabel: {
    display: 'block',
    textAlign: 'center',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#666666',
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
  imageSection: {
    padding: '6rem 0',
  },
};

export default App;