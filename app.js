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
    let images = [];
    let luts = [];
    let selectedImage = null;
    let selectedLutName = 'None';
    let deferredPrompt;

    // --- 1. INITIALIZATION ---
    function init() {
        if (localStorage.getItem('hasVisitedApp')) showApp(); else showLandingPage();
        initDB();
        setupEventListeners();
    }

    const showLandingPage = () => { landingPage.classList.remove('hidden'); appPage.classList.add('hidden'); };
    const showApp = () => { landingPage.classList.add('hidden'); appPage.classList.remove('hidden'); localStorage.setItem('hasVisitedApp', 'true'); };
    
    // --- 2. PWA & DB ---
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; installButton.style.display = 'flex'; });
    
    function initDB() {
        const request = indexedDB.open('PixelPerfectDB', 2);
        request.onupgradeneeded = e => { db = e.target.result; if (!db.objectStoreNames.contains('luts')) db.createObjectStore('luts', { keyPath: 'name' }); };
        request.onsuccess = e => { db = e.target.result; loadLutsFromDB(); };
        request.onerror = e => console.error('Database error:', e.target.errorCode);
    }
    
    // --- 3. EVENT LISTENERS ---
    function setupEventListeners() {
        installButton.addEventListener('click', () => { if (deferredPrompt) deferredPrompt.prompt(); });
        enterAppButton.addEventListener('click', showApp);
        imageUpload.addEventListener('change', handleImageUpload);
        lutUpload.addEventListener('change', handleLutUpload);
    }

    // --- 4. IMAGE HANDLING ---
    function handleImageUpload(e) {
        if (e.target.files.length > 0) { placeholder.style.display = 'none'; canvas.style.display = 'block'; }
        for (const file of e.target.files) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const imageData = { id: Date.now() + file.name, element: img };
                    images.push(imageData);
                    addThumbnailToGallery(imageData);
                    if (!selectedImage) selectImage(imageData.id);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
        e.target.value = ''; // Reset input
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
        canvas.height = selectedImage.element.naturalHeight;
        ctx.drawImage(selectedImage.element, 0, 0);
        applySelectedLut();
    }

    function addThumbnailToGallery(imageData) {
        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'thumbnail';
        thumbContainer.dataset.id = imageData.id;
        
        const thumbImg = new Image();
        thumbImg.src = imageData.element.src;
        
        thumbContainer.appendChild(thumbImg);
        thumbContainer.onclick = () => selectImage(imageData.id);
        photoGallery.appendChild(thumbContainer);
    }

    // --- 5. LUT HANDLING ---
    function handleLutUpload(e) {
        for (const file of e.target.files) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const lut = parseLut(event.target.result);
                if (lut && !luts.some(l => l.name === file.name)) {
                    const lutData = { name: file.name, ...lut };
                    luts.push(lutData);
                    saveLutToDB(lutData);
                    addLutToGallery(lutData);
                }
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    }

    function selectLut(name) {
        selectedLutName = name;
        document.querySelectorAll('.lut-chip').forEach(c => c.classList.remove('selected'));
        document.querySelector(`.lut-chip[data-lut-name='${CSS.escape(name)}']`).classList.add('selected');
        drawImageOnCanvas(); // Redraw image with new/removed LUT
    }

    function addLutToGallery(lut) {
        const chip = document.createElement('div');
        chip.className = 'lut-chip';
        chip.textContent = lut.name === 'None' ? 'None' : lut.name.replace(/\.cube$/i, '');
        chip.dataset.lutName = lut.name;
        chip.onclick = () => selectLut(lut.name);
        lutGallery.appendChild(chip);
    }

    function saveLutToDB(lutData) { if (db) db.transaction('luts', 'readwrite').objectStore('luts').put(lutData); }
    
    function loadLutsFromDB() {
        addLutToGallery({ name: 'None' }); // Add default 'None' option first
        selectLut('None');
        if (!db) return;
        const store = db.transaction('luts').objectStore('luts');
        store.getAll().onsuccess = e => { luts = e.target.result; luts.forEach(addLutToGallery); };
    }

    function parseLut(str) {
        const lines = str.split('\n').map(line => line.trim());
        let sizeLine = lines.find(line => line.startsWith('LUT_3D_SIZE'));
        if (!sizeLine) return null;
        const size = parseInt(sizeLine.split(' ')[1]);
        const data = lines.filter(line => line && !line.startsWith('#') && /^[0-9]/.test(line)).map(line => line.split(/\s+/).map(parseFloat));
        if (data.length !== size * size * size) return null;
        return { data, size };
    }

    // --- 6. SEAMLESS LUT APPLICATION (Trilinear Interpolation) ---
    function applySelectedLut() {
        const lut = luts.find(l => l.name === selectedLutName);
        if (!lut || !lut.data || !selectedImage) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const { data: lutData, size } = lut;

        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
            const newColor = trilinearInterpolate(r / 255, g / 255, b / 255, size, lutData);
            pixels[i] = newColor[0] * 255;
            pixels[i + 1] = newColor[1] * 255;
            pixels[i + 2] = newColor[2] * 255;
        }
        ctx.putImageData(imageData, 0, 0);
    }

    function trilinearInterpolate(r, g, b, size, lutData) {
        const p = [r * (size - 1), g * (size - 1), b * (size - 1)];
        const i = [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])];
        const f = [p[0] - i[0], p[1] - i[1], p[2] - i[2]];

        const c = (x, y, z) => lutData[Math.min(i[2] + z, size - 1) * size * size + Math.min(i[1] + y, size - 1) * size + Math.min(i[0] + x, size - 1)];

        const c00 = c(0,0,0).map((val, idx) => val * (1 - f[0]) + c(1,0,0)[idx] * f[0]);
        const c01 = c(0,0,1).map((val, idx) => val * (1 - f[0]) + c(1,0,1)[idx] * f[0]);
        const c10 = c(0,1,0).map((val, idx) => val * (1 - f[0]) + c(1,1,0)[idx] * f[0]);
        const c11 = c(0,1,1).map((val, idx) => val * (1 - f[0]) + c(1,1,1)[idx] * f[0]);

        const c0 = c00.map((val, idx) => val * (1 - f[1]) + c10[idx] * f[1]);
        const c1 = c01.map((val, idx) => val * (1 - f[1]) + c11[idx] * f[1]);

        return c0.map((val, idx) => val * (1 - f[2]) + c1[idx] * f[2]);
    }

    // --- GO! ---
    init();
});
