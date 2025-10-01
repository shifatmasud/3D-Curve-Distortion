import React, { useRef, useEffect } from 'react';
import { BendBoxEngine } from './BendBoxEngine';

export interface BendBoxProps {
  mediaSource: string | File;
  flow: number;
  lens: number;
  pinch: number;
  scale: number;
}

const BendBox: React.FC<BendBoxProps> = (props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BendBoxEngine | null>(null);

  // Initialize and dispose of the BendBoxEngine
  useEffect(() => {
    if (mountRef.current) {
      engineRef.current = new BendBoxEngine(mountRef.current);
      engineRef.current.setProps(props);
    }

    return () => {
      engineRef.current?.dispose();
    };
  }, []); // Empty dependency array ensures this runs only once on mount/unmount

  // Pass updated props to the engine whenever they change
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setProps(props);
    }
  }, [props.mediaSource, props.flow, props.lens, props.pinch, props.scale]);


  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

export default BendBox;
