# WebGL Image Distortion Component

[![View Demo](https://img.shields.io/badge/View%20Demo-Live%20App-blue?style=for-the-badge&logo=framer)](https://strategic-increase-814484.framer.app/)

An interactive WebGL component that applies real-time, animated distortion effects to images, videos, and GIFs. Built with React, Three.js, and GLSL shaders, and packaged as a Framer component.

---

### TL;DR (Too Long; Didn't Read)

This is an interactive WebGL effect that can make any image, video, or GIF look wavy, warped, or twisted. You control the effects with sliders, and the animations are super smooth.

### ELI5 (Explain Like I'm 5)

Imagine your picture is printed on a stretchy piece of rubber. This app gives you magic handles to:
*   **Flow:** Make the rubber sheet wavy, like a flag in the wind.
*   **Lens:** Bulge it out or suck it in, like you're looking through a magnifying glass.
*   **Pinch:** Twist it from the center, creating a cool vortex swirl.
*   **Scale:** Zoom the picture in or out on the rubber sheet.

You can use these "handles" (sliders) on photos, videos, and even GIFs you find online or upload from your computer!

---

## Key Features

-   **Real-time Distortion:** Manipulate media with a set of powerful shader-based effects.
-   **Multiple Effects:** Combine Flow (noise-based displacement), Lens (fisheye/barrel), and Pinch (vortex) distortions.
-   **Broad Media Support:** Works with images (`jpg`, `png`), GIFs, and videos (`mp4`, `webm`).
-   **Flexible Input:** Load media from a URL or by uploading a local file.
-   **Smooth Lerp Animation:** All effects are smoothly interpolated (lerped) for a fluid, physics-based feel. The animation speed is fully controllable.
-   **Framer Integration:** Packaged as a fully interactive Framer component with exposed property controls.
-   **Responsive & Performant:** The WebGL canvas is built to be responsive and performant, fitting any container size while maintaining aspect ratio.

---

## Context Map (How it Works)

The application is architected to separate the UI controls from the core WebGL rendering logic.

1.  **UI Layer (`App.tsx` / Framer Controls):**
    *   A user interacts with sliders and input fields.
    *   React manages the state of these controls (e.g., `flow`, `lens`, `pinch` values).
    *   These state values are passed down as props to the `BendBox` component.

2.  **React Wrapper (`components/BendBox.tsx`):**
    *   This component acts as a bridge between the React world and the Three.js world.
    *   Its primary job is to mount a `div` and manage the lifecycle of the `BendBoxEngine`.
    *   It instantiates the engine on mount, passes updated props to it, and calls the engine's `dispose` method on unmount to prevent memory leaks.

3.  **WebGL Engine (`components/BendBoxEngine.ts`):**
    *   This is the heart of the application. It's a self-contained class that handles all Three.js and WebGL operations.
    *   **Setup:** It creates a Three.js `Scene`, `Camera`, and `WebGLRenderer`.
    *   **Geometry:** It creates a `PlaneGeometry` (a flat rectangle) that will serve as the canvas for our media.
    *   **Material & Shaders:** It uses a `ShaderMaterial`, which allows us to provide custom GLSL (OpenGL Shading Language) code for the `vertexShader` and `fragmentShader`.
    *   **Media Loading:** It handles loading the image or video into a `Texture` and manages cleanup of old resources.
    *   **Animation Loop:** It runs a `requestAnimationFrame` loop to render the scene on every frame.
    *   **Prop Handling:** It receives props from the React wrapper. Instead of applying them instantly, it stores them as `targetProps` and smoothly interpolates the currently rendered values towards the target values using a `lerp` function. This creates the smooth motion.
    *   **Uniforms:** The interpolated values are passed as `uniforms` to the GLSL shaders, making them available for calculations on the GPU.

4.  **GLSL Shaders (Inside `BendBoxEngine.ts`):**
    *   These are small programs that run directly on the GPU, making them extremely fast.
    *   **`vertexShader`:** This program runs for every vertex (point) on our plane geometry. It manipulates the `x`, `y`, and `z` position of each vertex based on the `uniform` values (flow, lens, pinch), creating the 3D distortion shape.
    *   **`fragmentShader`:** This program runs for every pixel on the screen. It determines the color of each pixel. Its main job here is to correctly sample the media `Texture` and map it onto the distorted plane, ensuring the aspect ratio is preserved and colors are handled correctly (sRGB color space).

---

## Directory Tree Map

```
.
├── App.tsx                     # The main demo application component with UI controls.
├── components/
│   ├── BendBox.tsx             # The React wrapper component that manages the WebGL engine's lifecycle.
│   └── BendBoxEngine.ts        # The core Three.js/WebGL logic, encapsulated in a class.
├── flat.tsx                    # The Framer component version, which bundles the engine and React wrapper.
├── index.html                  # Main HTML entry point for the web application.
├── index.tsx                   # The React entry point that renders the App.
├── metadata.json               # Project metadata.
└── README.md                   # This file.
```
