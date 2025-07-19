document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const landingPage = document.getElementById('landing-page');
    const appPage = document.getElementById('app');
    const enterAppButton = document.getElementById('enter-app-button');
    const installButton = document.getElementById('install-button-main');
    const imageUpload = document.getElementById('image-upload');
    const lutUpload = document.getElementById('lut-upload');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const placeholder = document.getElementById('placeholder');
    const photoGallery = document.getElementById('photo-gallery');
    const lutGallery = document.getElementById('lut-gallery');

    // App State
    let db;
    let images = []; // Stores { id, name, element }
    let luts = [];   // Stores { name, data, size }
    let selectedImage = null;
    let selectedLutName = 'None';
    let deferredPrompt;

    function init() {
        if (localStorage.getItem('hasVisitedApp')) {
            showApp();
        } else {
            showLandingPage();
        }
        initDB();
        setupEventListeners();
    }

    function showLandingPage() {
        landingPage.classList.remove('hidden');
        appPage.classList.add('hidden');
    }

    function showApp() {
        landingPage.classList.add('hidden');
        appPage.classList.remove('hidden');
        localStorage.setItem('hasVisitedApp', 'true');
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installButton.style.display = 'flex';
    });

    function initDB() {
        const request = indexedDB.open('PixelPerfectDB', 2); // Version 2 for new data structure
        request.onupgradeneeded = e => {
            db = e.target.result;
            if (!db.objectStoreNames.contains('luts')) {
                db.createObjectStore('luts', { keyPath: 'name' });
            }
        };
        request.onsuccess = e => { db = e.target.result; loadLutsFromDB(); };
        request.onerror = e => console.error('Database error:', e.target.errorCode);
    }

    function setupEventListeners() {
        installButton.addEventListener('click', () => {
            if(deferredPrompt) deferredPrompt.prompt();
        });
        enterAppButton.addEventListener('click', showApp);
        imageUpload.addEventListener('change', handleImageUpload);
        lutUpload.addEventListener('change', handleLutUpload);
    }

    function handleImageUpload(e) {
        if (e.target.files.length > 0) {
            placeholder.style.display = 'none';
            canvas.style.display = 'block';
        }
        for (const file of e.target.files) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const imageData = { id: Date.now() + file.name, name: file.name, element: img };
                    images.push(imageData);
                    addThumbnailToGallery(imageData);
                    if (!selectedImage) selectImage(imageData.id);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    }

    function selectImage(id) {
        selectedImage = images.find(img => img.id === id);
        if (!selectedImage) return;
        document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('selected'));
        document.querySelector(`.thumbnail[data-id='${id}']`).classList.add('selected');
        drawImageOnCanvas();
    }

    function drawImageOnCanvas() {
        if (!selectedImage) return;
        canvas.width = selectedImage.element.naturalWidth;
        canvas.height = selectedE/model
Of course. Here is the code for the advanced version of the photo editing web app. This iteration incorporates a Material You-inspired design, preserves the original aspect ratio of images, allows for multiple photo and LUT management, and saves your imported LUTs so you don't have to reload them every session.

It also features a landing page for first-time users with instructions on how to add the app to their home screen for a more native-app experience, which includes hiding the browser's address bar.

### **index.html**

This file now includes a landing page section and a more structured app layout with a gallery for multiple photos and a container for saved LUTs.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="#EADDFF">
    <title>PixelPerfect</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    <link rel="stylesheet" href="style.css">
    <link rel="manifest" href="manifest.json">
</head>
<body>

    <!-- Landing Page for First Time Users -->
    <div id="landing-page">
        <div class="landing-content">
            <span class="material-symbols-outlined landing-icon">auto_awesome</span>
            <h1>Welcome to PixelPerfect</h1>
            <p>For the best experience, add this web app to your Home Screen to use it like a regular app.</p>
            <div class="install-instructions">
                <p><strong>To Install:</strong></p>
                <ol>
                    <li>Tap the <span class="material-symbols-outlined inline-icon">more_vert</span> or <span class="material-symbols-outlined inline-icon">ios_share</span> button in your browser.</li>
                    <li>Select 'Add to Home Screen' or 'Install App'.</li>
                </ol>
            </div>
            <button id="enter-app-button" class="fab extended">
                <span class="material-symbols-outlined">arrow_forward</span>
                Continue to App
            </button>
        </div>
    </div>

    <!-- Main App Interface -->
    <div id="app" class="hidden">
        <header class="app-bar">
            <h1 class="app-title">PixelPerfect</h1>
            <button id="install-button-main" class="icon-button" title="Install App">
                <span class="material-symbols-outlined">download_for_offline</span>
            </button>
        </header>

        <main class="main-content">
            <div id="image-workspace">
                <canvas id="canvas"></canvas>
                <div id="placeholder">
                    <span class="material-symbols-outlined placeholder-icon">image</span>
                    <p>Add a photo to get started</p>
                </div>
            </div>

            <div class="gallery-container">
                <div class="gallery-actions">
                    <label for="image-upload" class="fab">
                        <span class="material-symbols-outlined">add_photo_alternate</span>
                    </label>
                    <span>Photos</span>
                </div>
                <div id="photo-gallery" class="gallery">
                    <!-- Thumbnails will be added here -->
                </div>
            </div>

            <div class="gallery-container">
                 <div class="gallery-actions">
                    <label for="lut-upload" class="fab">
                        <span class="material-symbols-outlined">style</span>
                    </label>
                    <span>LUTs</span>
                </div>
                <div id="lut-gallery" class="gallery">
                    <!-- LUTs will be loaded here -->
                </div>
            </div>
        </main>

        <input type="file" id="image-upload" accept="image/*" multiple style="display: none;">
        <input type="file" id="lut-upload" accept=".cube" multiple style="display: none;">
    </div>

    <script src="app.js"></script>
</body>
</html>
