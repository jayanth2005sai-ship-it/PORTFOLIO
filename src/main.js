import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let scene, camera, renderer, ball;
let isMobile = false;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let velocity = { x: 0, y: 0 };
const DAMPING = 0.94;
const BASE_SPEED = 0.001;
let autoVel = {
  x: (Math.random() - 0.5) * 0.001,
  y: BASE_SPEED + Math.random() * 0.001,
};
let currentSection = 'new-hero';
let baseScale = 1;
let ballLoaded = false;

const BALL_SCALE = 0.85;
const FOOTER_SCALE = 0.4;
const LAPTOP_CONFIG = {
  // The dimensions of the laptop screen in 3D units when scale is 1.
  screenWidth: 2.15,
  screenHeight: 1.25,
  // The vertical offset of the laptop screen center from the laptop's origin
  screenCenterY: 0.65 
};

// TUNE THESE VALUES TO PERFECTLY MATCH YOUR MOBILE.GLB MODEL
const MOBILE_CONFIG = {
  // The dimensions of the mobile screen in 3D units when scale is 1.
  screenWidth: 2.1,
  screenHeight: 4.5,
  // The vertical offset of the mobile screen center from the model's origin
  screenCenterY: 0.0 
};

const SECTIONS = {
  hidden: { x: 0,   y: -1.5, z: 0,    scaleX: 0.1, scaleY: 0.1, scaleZ: 0.1 },
  frame:  { x: 0,   y: 0,    z: 0,    scaleX: 1.0, scaleY: 1.0, scaleZ: 1.0 }, // Overwritten by resize
  hero:   { x: 0.0, y: -0.45,z: 0,    scaleX: BALL_SCALE, scaleY: BALL_SCALE, scaleZ: BALL_SCALE },
  stats:  { x: 2.2, y: 0.0,  z: 0,    scaleX: BALL_SCALE, scaleY: BALL_SCALE, scaleZ: BALL_SCALE },
  how:    { x:-2.2, y: 0.0,  z: 0,    scaleX: BALL_SCALE, scaleY: BALL_SCALE, scaleZ: BALL_SCALE },
  footer: { x: 2.5, y: -1.3, z: -2.0, scaleX: FOOTER_SCALE, scaleY: FOOTER_SCALE, scaleZ: FOOTER_SCALE },
};

function init() {
  const canvas = document.getElementById('hero-canvas');
  
  // Renderer setup
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.64;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 5.5);

  // Environment (reflections)
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  // Lighting
  scene.add(new THREE.AmbientLight(0xfff0dd, 0.55));
  
  const keyLight = new THREE.DirectionalLight(0xffeedd, 1.6);
  keyLight.position.set(-2, 4, 5);
  scene.add(keyLight);
  
  const fillLight = new THREE.DirectionalLight(0xf5e8d0, 0.35);
  fillLight.position.set(4, 1, -2);
  scene.add(fillLight);
  
  const hemiLight = new THREE.HemisphereLight(0xfff0dd, 0xcfc0ae, 0.4);
  scene.add(hemiLight);

  // Loading GLB
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  // Check if we are on a mobile device to determine which model to load
  isMobile = window.innerWidth <= 768;
  const modelPath = isMobile ? '/models/mobile.glb' : '/models/laptop.glb';


  // Use a simple geometry as fallback if model isn't there, or just load nothing and wait for user
  loader.load(modelPath, (gltf) => {
    ball = gltf.scene;
    // Center the model
    const box = new THREE.Box3().setFromObject(ball);
    ball.position.sub(box.getCenter(new THREE.Vector3()));
    
    // Normalize scale so ball's longest axis = 2.4 units
    const size = box.getSize(new THREE.Vector3());
    baseScale = 2.4 / Math.max(size.x, size.y, size.z);
    
    ball.scale.set(baseScale * SECTIONS.hidden.scaleX, baseScale * SECTIONS.hidden.scaleY, baseScale * SECTIONS.hidden.scaleZ); 
    ball.position.set(SECTIONS.hidden.x, SECTIONS.hidden.y, SECTIONS.hidden.z); 
    if (isMobile) ball.rotation.y = Math.PI;
    
    // Material overrides
    ball.traverse((child) => {
      if (child.isMesh && child.material) {
        const m = child.material;
        m.envMapIntensity = 0.15;
        if (m.roughness !== undefined) m.roughness = Math.min(1.0, Math.max(0.82, (m.roughness ?? 0.5) * 1.55));
        if (m.metalness !== undefined) m.metalness = 0;
        if (m.color) m.color.multiplyScalar(0.68);
        m.needsUpdate = true;
      }
    });
    scene.add(ball);
    ballLoaded = true;
  }, undefined, (error) => {
    console.warn("User needs to provide laptop.glb. Proceeding with dummy cube for now.");
    // Fallback if no glb is present just so it doesn't break
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8, metalness: 0 });
    ball = new THREE.Mesh(geometry, material);
    baseScale = 2.4;
    ball.scale.set(baseScale * SECTIONS.hidden.scaleX, baseScale * SECTIONS.hidden.scaleY, baseScale * SECTIONS.hidden.scaleZ);
    ball.position.set(SECTIONS.hidden.x, SECTIONS.hidden.y, SECTIONS.hidden.z);
    scene.add(ball);
    ballLoaded = true;
  });

  setupInteractions(canvas);
  setupGSAP();
  setupScrollBall();

  // Run resize once to initialize dynamic SECTIONS.frame
  onWindowResize();

  window.addEventListener('resize', onWindowResize);
}



function setupInteractions(canvas) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const onPointerDown = (e) => {
    if (!canvas.classList.contains('drag-enabled')) return;
    
    const clientX = e.clientX ?? e.touches[0].clientX;
    const clientY = e.clientY ?? e.touches[0].clientY;

    if (ball) {
      mouse.x = (clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(ball, true);
      if (intersects.length === 0) return; // Only allow interaction if clicking the model
    }

    isDragging = true;
    previousMousePosition = { x: clientX, y: clientY };
    velocity = { x: 0, y: 0 };
  };

  const onPointerMove = (e) => {
    const clientX = e.clientX ?? e.touches[0].clientX;
    const clientY = e.clientY ?? e.touches[0].clientY;

    if (canvas.classList.contains('drag-enabled')) {
      if (ball) {
        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(ball, true);
        if (intersects.length > 0 || isDragging) {
          canvas.classList.add('is-hovering');
        } else {
          canvas.classList.remove('is-hovering');
        }
      }
    } else {
      canvas.classList.remove('is-hovering');
    }

    if (!isDragging) return;
    
    // Prevent page scroll when interacting with the 3D model on mobile
    if (isMobile && e.cancelable) {
      e.preventDefault();
    }
    
    velocity.x = (clientY - previousMousePosition.y) * 0.006;
    velocity.y = (clientX - previousMousePosition.x) * 0.006;
    
    if (ball) {
      ball.rotation.x += velocity.x;
      ball.rotation.y += velocity.y;
    }
    
    previousMousePosition = { x: clientX, y: clientY };
  };

  const onPointerUp = () => {
    isDragging = false;
  };

  window.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
}

let scrollVelocity = 0;
let scrollDirection = 1;

function setupGSAP() {
  // Track scroll velocity for marquees
  ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      scrollVelocity = self.getVelocity();
    }
  });

  // Signature path setup
  const sigPaths = document.querySelectorAll('.sig-draw');
  sigPaths.forEach(path => {
    // Add a buffer to the length to push the round stroke cap completely off the path
    const length = path.getTotalLength() + 20;
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    path.style.opacity = 0; // Hide completely initially to prevent any dots
  });

  // Hero Card Shrink Animation
  const heroCardTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#new-hero-section',
      start: 'top top',
      end: '+=150%',
      scrub: true,
      pin: true,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        if (self.progress > 0.01) {
          gsap.set('.sig-draw', { opacity: 1 });
        } else {
          gsap.set('.sig-draw', { opacity: 0 });
        }

        if (ballLoaded && ball) {
           let p = Math.min(self.progress / 0.8, 1);
           p = gsap.parseEase('power2.inOut')(p);
           
           ball.position.x = gsap.utils.interpolate(SECTIONS.hidden.x, SECTIONS.frame.x, p);
           ball.position.y = gsap.utils.interpolate(SECTIONS.hidden.y, SECTIONS.frame.y, p);
           ball.position.z = gsap.utils.interpolate(SECTIONS.hidden.z, SECTIONS.frame.z, p);
           ball.scale.set(
             baseScale * gsap.utils.interpolate(SECTIONS.hidden.scaleX, SECTIONS.frame.scaleX, p),
             baseScale * gsap.utils.interpolate(SECTIONS.hidden.scaleY, SECTIONS.frame.scaleY, p),
             baseScale * gsap.utils.interpolate(SECTIONS.hidden.scaleZ, SECTIONS.frame.scaleZ, p)
           );
           
           const targetX = gsap.utils.interpolate(0.3, 0.05, p);
           gsap.to(ball.rotation, {
             x: targetX,
             y: isMobile ? Math.PI : 0,
             z: 0,
             duration: 0.8,
             ease: 'power3.out',
             overwrite: 'auto'
           });
        }
      }
    }
  });
  
  heroCardTl.to('.hero-card', {
    scale: 0.45,
    y: () => '-8.4dvh',
    borderRadius: '100px',
    ease: 'none',
    duration: 0.8 // Finishes at 80% of the total pinned scroll
  }, 0)
  .to('.sig-draw', {
    strokeDashoffset: 0,
    ease: 'power2.out',
    duration: 0.8,
    stagger: 0.1
  }, 0)
  .to({}, { duration: 0.2 }); // Hold the fully shrunk state for the last 20%

  const navTl = gsap.timeline({ delay: 0.15 });
  navTl.to('.nav-logo', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.1)
       .to('.nav-links', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.15)
       .to('.profile-btn', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.2);

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#hero-section',
      start: 'top 65%',
    }
  });
  
  tl.to('#ph-badge', { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out' }, 0.4)
    .to('#event-card', { opacity: 1, x: 0, duration: 1.1, ease: 'expo.out' }, 0.55)
    .to('#hero-text', { opacity: 1, x: 0, duration: 1.1, ease: 'expo.out' }, 0.65)
    .to('#sig-wrap', { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 1.2)
    .to('.sp1', { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut' }, 1.2)
    .to('.sp2', { strokeDashoffset: 0, duration: 1.0, ease: 'power2.inOut' }, 1.8)
    .to('.sp3', { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' }, 2.0);

  ScrollTrigger.create({
    trigger: '#stats-section',
    start: 'top 75%',
    onEnter: () => gsap.to('.stat-card', { opacity: 1, y: 0, stagger: 0.1, duration: 0.8, ease: 'expo.out', delay: 0.1 })
  });

  ScrollTrigger.create({
    trigger: '#how-section',
    start: 'top 70%',
    onEnter: () => gsap.to('.step-item', { opacity: 1, x: 0, stagger: 0.15, duration: 0.9, ease: 'expo.out', delay: 0.1 })
  });

  // Event card hover
  const eventCardEl = document.getElementById('event-card');
  if (eventCardEl) {
    eventCardEl.addEventListener('mouseenter', () => gsap.to(eventCardEl, { scale: 1.035, y: -6, duration: 0.55, ease: 'power3.out', overwrite: 'auto' }));
    eventCardEl.addEventListener('mouseleave', () => gsap.to(eventCardEl, { scale: 1.0, y: 0, duration: 0.55, ease: 'power3.out', overwrite: 'auto' }));
  }

  // Navbar scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > 80) {
      document.querySelector('.navbar').classList.add('scrolled');
    } else {
      document.querySelector('.navbar').classList.remove('scrolled');
    }
  });
}

function setupScrollBall() {
  const depthOffset = (y) => (y < 0 ? y * 0.5 : 0);
  
  const updateBallPosition = (progress, sectionA, sectionB) => {
    if (!ballLoaded) return;
    
    // Kill any active entrance tweens so scroll triggers take priority
    gsap.killTweensOf(ball.position);
    gsap.killTweensOf(ball.scale);

    // Interpolate x, y, z, scale
    const x = gsap.utils.interpolate(sectionA.x, sectionB.x, progress);
    const y = gsap.utils.interpolate(sectionA.y, sectionB.y, gsap.parseEase('power2.inOut')(progress));
    const z = gsap.utils.interpolate(sectionA.z, sectionB.z, progress) + depthOffset(y);
    const scaleX = gsap.utils.interpolate(sectionA.scaleX, sectionB.scaleX, progress);
    const scaleY = gsap.utils.interpolate(sectionA.scaleY, sectionB.scaleY, progress);
    const scaleZ = gsap.utils.interpolate(sectionA.scaleZ, sectionB.scaleZ, progress);
    
    ball.position.set(x, y, z);
    ball.scale.set(baseScale * scaleX, baseScale * scaleY, baseScale * scaleZ);
  };

  const canvas = document.getElementById('hero-canvas');
  
  const toggleDrag = (section) => {
    currentSection = section;
    if (section !== 'new-hero') {
      canvas.classList.add('drag-enabled');
    } else {
      canvas.classList.remove('drag-enabled');
    }
  };

  // Drag Interactivity bounds
  ScrollTrigger.create({
    trigger: '#hero-section',
    start: 'top 50%',
    end: 'bottom 50%',
    onEnter: () => toggleDrag('hero'),
    onEnterBack: () => toggleDrag('hero'),
    onLeave: () => toggleDrag('stats'),
    onLeaveBack: () => {
      toggleDrag('new-hero');
      if (ball) {
        const targetY = isMobile ? Math.PI : 0;

        ball.rotation.x %= 2 * Math.PI;
        ball.rotation.y %= 2 * Math.PI;
        ball.rotation.z %= 2 * Math.PI;
        
        if (ball.rotation.x > Math.PI) ball.rotation.x -= 2 * Math.PI;
        else if (ball.rotation.x < -Math.PI) ball.rotation.x += 2 * Math.PI;
        
        while (ball.rotation.y > targetY + Math.PI) ball.rotation.y -= 2 * Math.PI;
        while (ball.rotation.y < targetY - Math.PI) ball.rotation.y += 2 * Math.PI;
        
        if (ball.rotation.z > Math.PI) ball.rotation.z -= 2 * Math.PI;
        else if (ball.rotation.z < -Math.PI) ball.rotation.z += 2 * Math.PI;
        
        gsap.to(ball.rotation, { x: 0.05, y: targetY, z: 0, duration: 1.5, ease: 'power3.out', overwrite: 'auto' });
      }
    }
  });

  // Frame to Hero
  ScrollTrigger.create({
    trigger: '#hero-section',
    start: 'top bottom',
    end: 'top top',
    scrub: true,
    onUpdate: (self) => updateBallPosition(self.progress, SECTIONS.frame, SECTIONS.hero)
  });

  // Hero to Stats
  ScrollTrigger.create({
    trigger: '#stats-section',
    start: 'top bottom',
    end: 'top top',
    scrub: 2,
    onUpdate: (self) => updateBallPosition(self.progress, SECTIONS.hero, SECTIONS.stats)
  });

  // Stats to How
  ScrollTrigger.create({
    trigger: '#how-section',
    start: 'top bottom',
    end: 'top top',
    scrub: 2,
    onUpdate: (self) => updateBallPosition(self.progress, SECTIONS.stats, SECTIONS.how),
    onEnter: () => toggleDrag('how'),
    onLeaveBack: () => toggleDrag('stats')
  });

  // How to Footer
  const footerVelocityAnim = gsap.fromTo('.velocity-content',
    { scale: 1, x: '0vw', y: '0dvh' },
    { 
      scale: () => window.innerWidth <= 768 ? 1 : 0.4, 
      x: () => window.innerWidth <= 768 ? '0vw' : '25vw', 
      y: () => window.innerWidth <= 768 ? '0dvh' : '25dvh', 
      ease: 'none' 
    }
  );

  ScrollTrigger.create({
    trigger: '#site-footer',
    start: 'top center',
    end: 'top top',
    scrub: 2,
    animation: footerVelocityAnim,
    invalidateOnRefresh: true,
    onUpdate: (self) => updateBallPosition(self.progress, SECTIONS.how, SECTIONS.footer),
    onEnter: () => toggleDrag('footer'),
    onLeaveBack: () => toggleDrag('how')
  });

  // Mobile Footer Content Scroll (Push up the fixed elements)
  ScrollTrigger.create({
    trigger: '#site-footer',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    animation: gsap.to(['.velocity-container', '.canvas-track'], {
      y: () => {
        if (window.innerWidth <= 768) {
          const footer = document.getElementById('site-footer');
          return -(footer.offsetHeight - window.innerHeight);
        }
        return 0;
      },
      ease: 'none'
    }),
    invalidateOnRefresh: true
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // Dynamically calculate the laptop scale to fit the 0.45 scaled hero card
  // 3D frustum height at z=0 is approx 3.154 units (fov=32, dist=5.5). Card takes 45%.
  const aspect = window.innerWidth / window.innerHeight;
  const cardRequiredW = 1.4194 * aspect;
  const cardRequiredH = 1.4194;
  
  // Scale the model so its screen perfectly contains the shrunk card
  const config = isMobile ? MOBILE_CONFIG : LAPTOP_CONFIG;
  const scaleW = cardRequiredW / config.screenWidth;
  const scaleH = cardRequiredH / config.screenHeight;
  
  if (isMobile) {
    // Non-uniform scaling to match the card's edges on mobile, with a small padding
    const PADDING_FACTOR = 1.3; // Increased significantly
    const WIDER_FACTOR = 1.65; // Even wider as requested (aggressively wide)
    const TALLER_FACTOR = 1.55; // Increased scale to make it even taller
    
    const baseScaleY = scaleH * PADDING_FACTOR;
    SECTIONS.frame.scaleX = scaleW * PADDING_FACTOR * WIDER_FACTOR;
    SECTIONS.frame.scaleY = baseScaleY * TALLER_FACTOR;
    SECTIONS.frame.scaleZ = ((scaleW + scaleH) / 2) * PADDING_FACTOR;
    
    // Default Y position
    const oldY = -(baseScaleY * config.screenCenterY);
    // Shift down (reduced multiplier to move it very slightly up)
    const shiftDown = (TALLER_FACTOR - 1) * 0.95; 
    SECTIONS.frame.y = oldY - shiftDown;
    
    // Dynamically scale and position the hero center to prevent overlapping text
    const heroCenter = document.querySelector('.hero-center');
    if (heroCenter) {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const availH = vh - 320; // Text and stats take ~320px
      const availW = vw - 40;
      let newScale = Math.min(availH / 650, availW / 650, 0.65);
      newScale = Math.max(newScale, 0.35);
      const topPct = ((100 + (availH / 2)) / vh) * 100;
      
      heroCenter.style.transform = `translate(-50%, -50%) scale(${newScale})`;
      heroCenter.style.top = `${topPct}%`;
    }
    
    // Decrease the size and bring down the mobile 3d model in the summary/hero page
    const mobileModelScale = 0.65;
    SECTIONS.hero.scaleX = mobileModelScale;
    SECTIONS.hero.scaleY = mobileModelScale;
    SECTIONS.hero.scaleZ = mobileModelScale;
    SECTIONS.hero.y = -1.15; // Center vertically in the space under EXPERIENCES
    SECTIONS.stats.scaleX = mobileModelScale;
    SECTIONS.stats.scaleY = mobileModelScale;
    SECTIONS.stats.scaleZ = mobileModelScale;
    SECTIONS.how.scaleX = mobileModelScale;
    SECTIONS.how.scaleY = mobileModelScale;
    SECTIONS.how.scaleZ = mobileModelScale;
    SECTIONS.footer.scaleX = mobileModelScale;
    SECTIONS.footer.scaleY = mobileModelScale;
    SECTIONS.footer.scaleZ = mobileModelScale;
    SECTIONS.footer.x = 0;
    SECTIONS.footer.y = -1.0;
    SECTIONS.footer.z = 0;
  } else {
    // Non-uniform scaling for laptop to perfectly match the shrink card
    // Decrease the width slightly to shrink the left side
    const widthReduction = 0.06;
    SECTIONS.frame.scaleX = scaleW - widthReduction;
    SECTIONS.frame.scaleY = scaleH;
    SECTIONS.frame.scaleZ = (scaleW + scaleH) / 2; // Keep Z roughly proportional
    
    // The hero card is offset by -8.4dvh (moves UP in DOM, so +y in 3D)
    // 8.4vh of 3.154 3D units = 0.2649
    SECTIONS.frame.y = -scaleH * config.screenCenterY + (3.154 * 0.084) - 0.2; // Shift down slightly
    // Shift right by half the width reduction to keep the right edge in place
    SECTIONS.frame.x = 0.45 + (widthReduction / 2);
    
    const heroCenter = document.querySelector('.hero-center');
    if (heroCenter) {
      heroCenter.style.transform = '';
      heroCenter.style.top = '';
    }

    // Keep the original scale and position for the laptop model
    SECTIONS.hero.scaleX = BALL_SCALE;
    SECTIONS.hero.scaleY = BALL_SCALE;
    SECTIONS.hero.scaleZ = BALL_SCALE;
    SECTIONS.hero.y = -0.45; // Default desktop position
    SECTIONS.stats.scaleX = BALL_SCALE;
    SECTIONS.stats.scaleY = BALL_SCALE;
    SECTIONS.stats.scaleZ = BALL_SCALE;
    SECTIONS.how.scaleX = BALL_SCALE;
    SECTIONS.how.scaleY = BALL_SCALE;
    SECTIONS.how.scaleZ = BALL_SCALE;
    SECTIONS.footer.scaleX = FOOTER_SCALE;
    SECTIONS.footer.scaleY = FOOTER_SCALE;
    SECTIONS.footer.scaleZ = FOOTER_SCALE;
    SECTIONS.footer.x = 2.5;
    SECTIONS.footer.y = -1.3;
    SECTIONS.footer.z = -2.0;
  }

  ScrollTrigger.refresh();
}

let lastTime = 0;
function animate(time) {
  requestAnimationFrame(animate);
  
  const delta = time - lastTime;
  lastTime = time;

  // Marquee scroll velocity logic
  const scrollers = document.querySelectorAll('.scroller');
  scrollers.forEach((scroller) => {
    let baseSpeed = parseFloat(scroller.dataset.speed || 1);
    let dir = parseInt(scroller.dataset.direction || 1);
    
    // Adjust direction based on scroll velocity direction
    if (scrollVelocity < -20) scrollDirection = -1;
    else if (scrollVelocity > 20) scrollDirection = 1;

    let velocityFactor = Math.abs(scrollVelocity) / 1000;
    velocityFactor = Math.min(velocityFactor, 1) * 5; // map to 0-5

    // moveBy incorporates base speed and scroll velocity boost
    let moveBy = dir * baseSpeed * scrollDirection * (1 + velocityFactor) * (delta / 16);
    
    let currentX = parseFloat(scroller.dataset.x || 0);
    currentX += moveBy;
    
    const firstSpan = scroller.firstElementChild;
    if (firstSpan) {
      const spanWidth = firstSpan.offsetWidth;
      // Wrap logic
      if (currentX <= -spanWidth) currentX += spanWidth;
      if (currentX >= 0) currentX -= spanWidth;
    }

    scroller.dataset.x = currentX;
    scroller.style.transform = `translateX(${currentX}px)`;
  });

  // Decay scroll velocity smoothly
  scrollVelocity *= 0.9;
  
  if (ball) {
    if (currentSection === 'new-hero') {
      // Do not apply auto velocity while pinned
    } else if (!isDragging) {
      // Momentum decay
      velocity.x *= DAMPING;
      velocity.y *= DAMPING;
      
      // If momentum is dead, apply auto velocity based on last direction
      if (Math.abs(velocity.x) < 0.0005 && Math.abs(velocity.y) < 0.0005) {
        if (Math.abs(velocity.x) > 0 || Math.abs(velocity.y) > 0) {
          autoVel.x = (velocity.x > 0 ? 1 : -1) * (Math.abs(velocity.x) + 0.0005);
          autoVel.y = (velocity.y > 0 ? 1 : -1) * (Math.abs(velocity.y) + 0.0005);
          
          // Cap speeds
          autoVel.x = Math.max(Math.min(autoVel.x, 0.01), -0.01);
          autoVel.y = Math.max(Math.min(autoVel.y, 0.01), -0.01);
        }
        
        ball.rotation.x += autoVel.x;
        ball.rotation.y += autoVel.y;
      } else {
        ball.rotation.x += velocity.x;
        ball.rotation.y += velocity.y;
      }
    }
  }
  
  renderer.render(scene, camera);
}

window.addEventListener('load', () => {
  init();
  requestAnimationFrame(animate);
  ScrollTrigger.refresh();
});

// --- ClickSpark Logic ---
const initClickSpark = () => {
  const canvas = document.getElementById('click-spark-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  let sparks = [];
  
  const sparkColor = '#ffffff'; 
  const sparkSize = 15;
  const sparkRadius = 25;
  const sparkCount = 8;
  const duration = 500;
  const extraScale = 1.0;
  
  const easeFunc = t => t * (2 - t);

  const resizeCanvas = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  const draw = timestamp => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    sparks = sparks.filter(spark => {
      const elapsed = timestamp - spark.startTime;
      if (elapsed >= duration) return false;

      const progress = elapsed / duration;
      const eased = easeFunc(progress);

      const distance = eased * sparkRadius * extraScale;
      const lineLength = sparkSize * (1 - eased);

      const x1 = spark.x + distance * Math.cos(spark.angle);
      const y1 = spark.y + distance * Math.sin(spark.angle);
      const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
      const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

      ctx.strokeStyle = sparkColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      return true;
    });

    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  document.addEventListener('click', e => {
    const now = performance.now();
    for (let i = 0; i < sparkCount; i++) {
      sparks.push({
        x: e.clientX,
        y: e.clientY,
        angle: (2 * Math.PI * i) / sparkCount,
        startTime: now
      });
    }
  });
};

initClickSpark();

// --- Card Swap Logic ---
const initCardSwap = () => {
  const container = document.querySelector('.card-swap-container');
  if (!container) return;
  const cards = Array.from(container.querySelectorAll('.card'));
  
  const cardDistance = 60;
  const verticalDistance = -70;
  const delay = 5000;
  const skewAmount = 6;
  
  const config = {
    ease: 'elastic.out(0.6,0.9)',
    durDrop: 2,
    durMove: 2,
    durReturn: 2,
    promoteOverlap: 0.9,
    returnDelay: 0.05
  };
  
  const makeSlot = (i, distX, distY, total) => {
    // Center the stack by offsetting by half the total distance
    const offsetX = ((total - 1) * distX) / 2;
    const offsetY = ((total - 1) * distY) / 2;
    return {
      x: i * distX - offsetX,
      y: i * distY - offsetY,
      z: -i * distX * 1.5,
      zIndex: total - i
    };
  };
  
  const placeNow = (el, slot, skew) =>
    gsap.set(el, {
      x: slot.x,
      y: slot.y,
      z: slot.z,
      xPercent: -50,
      yPercent: -50,
      skewY: skew,
      transformOrigin: 'center center',
      zIndex: slot.zIndex,
      force3D: true
    });
    
  const total = cards.length;
  let order = cards.map((_, i) => i);
  
  cards.forEach((card, i) => placeNow(card, makeSlot(i, cardDistance, verticalDistance, total), skewAmount));
  
  let tl;
  let interval;
  
  const projectData = [
    {
      eyebrow: "FEATURED WORK",
      title: "NEXT-GEN<br>DATA PLATFORM",
      desc: "A high-performance analytics engine processing millions of events in real-time. Built with a modern stack for lightning-fast data visualizations and deep insights."
    },
    {
      eyebrow: "INFRASTRUCTURE",
      title: "GLOBAL<br>CLOUD NETWORK",
      desc: "Distributed server architecture ensuring 99.99% uptime. Scalable containerized microservices ready to handle traffic spikes globally."
    },
    {
      eyebrow: "DATA INSIGHTS",
      title: "PREDICTIVE<br>ANALYTICS",
      desc: "Advanced machine learning models turning raw data into actionable intelligence. Custom dashboards tailored for executive decision-making."
    },
    {
      eyebrow: "USER EXPERIENCE",
      title: "SEAMLESS<br>INTERFACE",
      desc: "Award-winning UI/UX design focusing on accessibility and speed. Creating intuitive workflows that users love to engage with daily."
    }
  ];

  const updateText = (newFront) => {
    const data = projectData[newFront % projectData.length];
    
    gsap.to(['.how-content .eyebrow', '.how-content h2', '.how-content p'], {
      opacity: 0,
      y: -10,
      duration: 0.3,
      stagger: 0.05,
      onComplete: () => {
        const eyebrowEl = document.querySelector('.how-content .eyebrow');
        const h2El = document.querySelector('.how-content h2');
        const pEl = document.querySelector('.how-content p');
        
        if (eyebrowEl) eyebrowEl.innerHTML = data.eyebrow;
        if (h2El) h2El.innerHTML = data.title;
        if (pEl) pEl.innerHTML = data.desc;
        
        gsap.to(['.how-content .eyebrow', '.how-content h2', '.how-content p'], {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.05
        });
      }
    });
  };

  const swap = (count = 1) => {
    if (order.length < 2) return;
    
    if (tl && tl.isActive()) {
      tl.progress(1);
      tl.kill();
    }
    
    const dropped = order.slice(0, count);
    const rest = order.slice(count);
    
    tl = gsap.timeline();
    
    dropped.forEach((idx, i) => {
      const el = cards[idx];
      tl.to(el, {
        y: '+=500',
        duration: config.durDrop,
        ease: config.ease
      }, i * 0.05);
    });
    
    tl.addLabel('promote', `-=${config.durDrop * config.promoteOverlap}`);
    rest.forEach((idx, i) => {
      const el = cards[idx];
      const slot = makeSlot(i, cardDistance, verticalDistance, total);
      tl.set(el, { zIndex: slot.zIndex }, 'promote');
      tl.to(
        el,
        {
          x: slot.x,
          y: slot.y,
          z: slot.z,
          duration: config.durMove,
          ease: config.ease
        },
        `promote+=${i * 0.1}`
      );
    });
    
    tl.addLabel('return', `promote+=${config.durMove * config.returnDelay}`);
    dropped.forEach((idx, i) => {
      const el = cards[idx];
      const newPos = rest.length + i;
      const backSlot = makeSlot(newPos, cardDistance, verticalDistance, total);
      tl.call(() => gsap.set(el, { zIndex: backSlot.zIndex }), undefined, 'return');
      tl.to(
        el,
        {
          x: backSlot.x,
          y: backSlot.y,
          z: backSlot.z,
          duration: config.durReturn,
          ease: config.ease
        },
        `return+=${i * 0.05}`
      );
    });
    
    order = [...rest, ...dropped];
    updateText(order[0]);
  };
  
  // Start after a slight delay or initially
  updateText(order[0]);
  interval = setInterval(() => swap(1), delay);
  
  container.addEventListener('mouseenter', () => {
    tl?.pause();
    clearInterval(interval);
  });
  container.addEventListener('mouseleave', () => {
    tl?.play();
    interval = setInterval(() => swap(1), delay);
  });

  cards.forEach((card, originalIdx) => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      const currentPos = order.indexOf(originalIdx);
      if (currentPos > 0) {
        swap(currentPos);
      }
    });
  });
};

function initCircularText() {
  const container = document.getElementById('circular-text-container');
  if (!container) return;
  const text = "FULL STACK DEVELOPER • UI/UX DESIGNER • ";
  const letters = text.split('');
  const radius = 300; 
  
  letters.forEach((letter, i) => {
    const span = document.createElement('span');
    span.innerText = letter;
    const rotationDeg = (360 / letters.length) * i;
    span.style.transform = `translate(-50%, -50%) rotateZ(${rotationDeg}deg) translateY(-${radius}px)`;
    container.appendChild(span);
  });
}

window.addEventListener('load', () => {
  initCardSwap();
  initCircularText();
});

// Close event card on mobile when scrolling
window.addEventListener('scroll', () => {
  if (window.innerWidth <= 900) {
    const eventCard = document.getElementById('event-card');
    if (eventCard && eventCard.classList.contains('show-mobile')) {
      eventCard.classList.remove('show-mobile');
    }
  }
}, { passive: true });

// Flowing Mobile Menu Logic
document.addEventListener('DOMContentLoaded', () => {
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('flowing-mobile-menu');
  const closeMenuBtn = document.getElementById('close-mobile-menu');
  const menuBackdrop = document.getElementById('mobile-menu-backdrop');
  
  if (mobileBtn && mobileMenu) {
    const closeMenu = () => {
      mobileMenu.classList.remove('active');
      if (menuBackdrop) menuBackdrop.classList.remove('active');
      document.body.style.overflow = '';
    };

    mobileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      mobileMenu.classList.add('active');
      if (menuBackdrop) menuBackdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
    
    closeMenuBtn?.addEventListener('click', closeMenu);
    menuBackdrop?.addEventListener('click', closeMenu);
  }

  const items = document.querySelectorAll('.menu__item');
  const speed = 15;
  const animationDefaults = { duration: 0.6, ease: 'expo.out' };
  
  const distMetric = (x, y, x2, y2) => {
    const xDiff = x - x2;
    const yDiff = y - y2;
    return xDiff * xDiff + yDiff * yDiff;
  };
  
  const findClosestEdge = (mouseX, mouseY, width, height) => {
    const topEdgeDist = distMetric(mouseX, mouseY, width / 2, 0);
    const bottomEdgeDist = distMetric(mouseX, mouseY, width / 2, height);
    return topEdgeDist < bottomEdgeDist ? 'top' : 'bottom';
  };

  items.forEach(item => {
    const text = item.getAttribute('data-text');
    const image = item.getAttribute('data-image');
    const link = item.getAttribute('data-link');
    
    item.innerHTML = `
      <a class="menu__item-link" href="${link}">${text}</a>
      <div class="marquee">
        <div class="marquee__inner-wrap">
          <div class="marquee__inner" aria-hidden="true"></div>
        </div>
      </div>
    `;
    
    const marqueeInner = item.querySelector('.marquee__inner');
    const marquee = item.querySelector('.marquee');
    
    const updateRepetitions = () => {
      if (!marqueeInner) return;
      marqueeInner.innerHTML = `
        <div class="marquee__part">
          <span>${text}</span>
          <div class="marquee__img" style="background-image: url(${image})"></div>
        </div>
      `;
      const part = marqueeInner.querySelector('.marquee__part');
      if (!part) return;
      
      const partWidth = part.offsetWidth;
      if (partWidth === 0) return;
      
      const needed = Math.ceil(window.innerWidth / partWidth) + 2;
      const reps = Math.max(4, needed);
      
      let html = '';
      for (let i = 0; i < reps; i++) {
        html += `
          <div class="marquee__part">
            <span>${text}</span>
            <div class="marquee__img" style="background-image: url(${image})"></div>
          </div>
        `;
      }
      marqueeInner.innerHTML = html;
      
      gsap.killTweensOf(marqueeInner);
      gsap.to(marqueeInner, {
        x: -partWidth,
        duration: speed,
        ease: 'none',
        repeat: -1
      });
    };

    setTimeout(updateRepetitions, 100);
    window.addEventListener('resize', updateRepetitions);

    const handleEnter = (e) => {
      const rect = item.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const edge = findClosestEdge(x, y, rect.width, rect.height);

      item.classList.add('active-hover');
      gsap.timeline({ defaults: animationDefaults })
        .set(marquee, { y: edge === 'top' ? '-101%' : '101%' }, 0)
        .set(marqueeInner, { y: edge === 'top' ? '101%' : '-101%' }, 0)
        .to([marquee, marqueeInner], { y: '0%' }, 0);
    };

    const handleLeave = (e) => {
      const rect = item.getBoundingClientRect();
      const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX) || 0;
      const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY) || 0;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const edge = findClosestEdge(x, y, rect.width, rect.height);

      item.classList.remove('active-hover');
      gsap.timeline({ defaults: animationDefaults })
        .to(marquee, { y: edge === 'top' ? '-101%' : '101%' }, 0)
        .to(marqueeInner, { y: edge === 'top' ? '101%' : '-101%' }, 0);
    };

    item.addEventListener('mouseenter', handleEnter);
    item.addEventListener('mouseleave', handleLeave);
    
    item.addEventListener('touchstart', handleEnter, { passive: true });
    item.addEventListener('touchend', (e) => {
      setTimeout(() => handleLeave(e), 200);
    });

    const linkEl = item.querySelector('.menu__item-link');
    if (linkEl) {
      linkEl.addEventListener('click', () => {
        mobileMenu.classList.remove('active');
        if (menuBackdrop) menuBackdrop.classList.remove('active');
        document.body.style.overflow = '';
      });
    }
  });
});
