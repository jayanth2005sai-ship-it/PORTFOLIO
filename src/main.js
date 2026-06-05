import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let scene, camera, renderer, ball;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let velocity = { x: 0, y: 0 };
const DAMPING = 0.94;
const BASE_SPEED = 0.003;
let autoVel = {
  x: (Math.random() - 0.5) * 0.003,
  y: BASE_SPEED + Math.random() * 0.002,
};
let currentSection = 'hero';
let baseScale = 1;
let ballLoaded = false;
let isHeroSectionVisible = false;

const BALL_SCALE = 0.97;
const FOOTER_SCALE = 0.5;
const SECTIONS = {
  hero:   { x:  0.5,  y: -0.45, z:  0,    scale: BALL_SCALE   },
  stats:  { x:  2.2,  y:  0.0,  z:  0,    scale: BALL_SCALE   },
  how:    { x: -2.2,  y:  0.0,  z:  0,    scale: BALL_SCALE   },
  footer: { x:  2.5,  y: -1.3,  z: -2.0,  scale: FOOTER_SCALE },
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

  // Use a simple geometry as fallback if model isn't there, or just load nothing and wait for user
  loader.load('/models/laptop.glb', (gltf) => {
    ball = gltf.scene;
    // Center the model
    const box = new THREE.Box3().setFromObject(ball);
    ball.position.sub(box.getCenter(new THREE.Vector3()));
    
    // Normalize scale so ball's longest axis = 2.4 units
    const size = box.getSize(new THREE.Vector3());
    baseScale = 2.4 / Math.max(size.x, size.y, size.z);
    
    ball.scale.setScalar(baseScale * SECTIONS.hero.scale * 0.25); // Start small for animation
    ball.position.set(SECTIONS.hero.x, SECTIONS.hero.y - 0.8, SECTIONS.hero.z); // Start low
    
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
    if (isHeroSectionVisible && !ball.entrancePlayed) {
      ballEntrance();
      ball.entrancePlayed = true;
    }
  }, undefined, (error) => {
    console.warn("User needs to provide laptop.glb. Proceeding with dummy cube for now.");
    // Fallback if no glb is present just so it doesn't break
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8, metalness: 0 });
    ball = new THREE.Mesh(geometry, material);
    baseScale = 2.4;
    ball.scale.setScalar(baseScale * SECTIONS.hero.scale * 0.25);
    ball.position.set(SECTIONS.hero.x, SECTIONS.hero.y - 0.8, SECTIONS.hero.z);
    scene.add(ball);
    ballLoaded = true;
    if (isHeroSectionVisible && !ball.entrancePlayed) {
      ballEntrance();
      ball.entrancePlayed = true;
    }
  });

  setupInteractions(canvas);
  setupGSAP();
  setupScrollBall();

  window.addEventListener('resize', onWindowResize);
}

function ballEntrance() {
  gsap.to(ball.scale, {
    x: baseScale * SECTIONS.hero.scale,
    y: baseScale * SECTIONS.hero.scale,
    z: baseScale * SECTIONS.hero.scale,
    duration: 1.3,
    ease: 'expo.out',
    delay: 0.5
  });
  
  gsap.to(ball.position, {
    y: SECTIONS.hero.y,
    duration: 1.3,
    ease: 'expo.out',
    delay: 0.5,
    onComplete: () => {
      document.getElementById('hero-canvas').classList.add('drag-enabled');
    }
  });
}

function setupInteractions(canvas) {
  const onPointerDown = (e) => {
    if (currentSection !== 'hero' || !canvas.classList.contains('drag-enabled')) return;
    isDragging = true;
    previousMousePosition = { x: e.clientX ?? e.touches[0].clientX, y: e.clientY ?? e.touches[0].clientY };
    velocity = { x: 0, y: 0 };
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const clientX = e.clientX ?? e.touches[0].clientX;
    const clientY = e.clientY ?? e.touches[0].clientY;
    
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
  window.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
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
      onUpdate: (self) => {
        // Only show the paths once the user actually starts scrolling
        if (self.progress > 0.01) {
          gsap.set('.sig-draw', { opacity: 1 });
        } else {
          gsap.set('.sig-draw', { opacity: 0 });
        }
      }
    }
  });
  
  heroCardTl.to('.hero-card', {
    scale: 0.45,
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
      onEnter: () => {
        isHeroSectionVisible = true;
        if (ballLoaded && (!ball || !ball.entrancePlayed)) {
          ballEntrance();
          if (ball) ball.entrancePlayed = true;
        }
      }
    }
  });
  
  tl.to('#ph-badge', { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out' }, 0.4)
    .to('#event-card', { opacity: 1, x: 0, duration: 1.1, ease: 'expo.out' }, 0.55)
    .to('#hero-text', { opacity: 1, x: 0, duration: 1.1, ease: 'expo.out' }, 0.65)
    .to('#nav-arrow', { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.1)
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
    const scale = gsap.utils.interpolate(sectionA.scale, sectionB.scale, progress);
    
    ball.position.set(x, y, z);
    ball.scale.setScalar(baseScale * scale);
  };

  const canvas = document.getElementById('hero-canvas');
  
  const toggleDrag = (section) => {
    currentSection = section;
    if (section === 'hero') {
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
    onLeaveBack: () => toggleDrag('none')
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
  ScrollTrigger.create({
    trigger: '#site-footer',
    start: 'top bottom',
    end: 'top top',
    scrub: 2,
    onUpdate: (self) => updateBallPosition(self.progress, SECTIONS.how, SECTIONS.footer),
    onEnter: () => toggleDrag('footer'),
    onLeaveBack: () => toggleDrag('how')
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
    if (!isDragging) {
      // Momentum decay
      velocity.x *= DAMPING;
      velocity.y *= DAMPING;
      
      // If momentum is dead, apply auto velocity based on last direction
      if (Math.abs(velocity.x) < 0.0005 && Math.abs(velocity.y) < 0.0005) {
        if (Math.abs(velocity.x) > 0 || Math.abs(velocity.y) > 0) {
          autoVel.x = (velocity.x > 0 ? 1 : -1) * (Math.abs(velocity.x) + 0.001);
          autoVel.y = (velocity.y > 0 ? 1 : -1) * (Math.abs(velocity.y) + 0.001);
          
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
