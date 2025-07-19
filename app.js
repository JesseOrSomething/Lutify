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
    let images = []; // Stores { id, name, element, thumbnail }
    let luts = [];   // Stores { name, data }
    let selectedImage = null;
    let selectedLutName = 'None';
    let deferredPrompt;

    // --- 1. INITIALIZATION ---
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

    // --- 2. PWA INSTALLATION LOGIC ---
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installButton.style.display = 'flex'; // Show the install button in the app header
    });

    installButton.addEventListener('click', () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => {
                deferredPrompt = null;
                installButton.style.display = 'none';
            });
        }
    });

    // --- 3. DATABASE (INDEXEDDB FOR LUTS) ---
    function initDB() {
        const request = indexedDB.open('PixelPerfectDB', 1);
        request.onupgradeneeded = e => db = e.target.result.createObjectStore('luts', { keyPath: 'name' });
        request.onsuccess = e => {
            db = e.target.result;
            loadLutsFromDB();
        };
        request.onerror = e => console.error('Database error:', e.target.errorCode);
    }

    // --- 4. EVENT LISTENERS ---
    function setupEventListeners() {
        enterAppButton.addEventListener('click', showApp);
        imageUpload.addEventListener('change', handleImageUpload);
        lutUpload.addEventListener('change', handleLutUpload);
    }

    // --- 5. IMAGE HANDLING ---
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
                    const imageData = { id: Date.now() + file.name, name: file.name, element: img, thumbnail: createThumbnail(img) };
                    images.push(imageData);
                    addThumbnailToGallery(imageData);
                    if (!selectedImage) selectImage(imageData.id);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
        e.target.value = ''; // Reset input to allow re-uploading the same file
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
        const thumb = imageData.thumbnail;
        thumb.dataset.id = imageData.id;
        thumb.classList.add('thumbnail');
        thumb.onclick = () => selectImage(imageData.id);
        photoGallery.appendChild(thumb);
    }

    function createThumbnail(img) {
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 80;
        thumbCanvas.height = 80;
        thumbCanvas.getContext('2d').drawImage(img, 0, 0, 80, 80);
        const thumbImg = new Image();
        thumbImg.src = thumbCanvas.toDataURL();
        return thumbImg;
    }

    // --- 6. LUT HANDLING ---
    function handleLutUpload(e) {
        for (const file of e.target.files) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const lutData = { name: file.name, data: parseLut(event.target.result) };
                if (!luts.some(l => l.name === lutData.name)) {
                    luts.push(lutData);
                    saveLutToDB(lutData);
                    addLutToGallery(lutData);
                }
            };
            reader.readAsText(file);
        }
        e.target.value = ''; // Reset input
    }

    function selectLut(name) {
        selectedLutName = name;
        document.querySelectorAll('.lut-chip').forEach(c => c.classList.remove('selected'));
        document.querySelector(`.lut-chip[data-lut-name='${CSS.escape(name)}']`).classList.add('selected');
        drawImageOnCanvas(); // Redraw image with new LUT
    }

    function addLutToGallery(lut) {
        const chip = document.createElement('div');
        chip.classList.add('lut-chip');
        chip.textContent = lut.name === 'None' ? 'None' : lut.name.replace(/\.cube$/i, '');
        chip.dataset.lutName = lut.name;
        chip.onclick = () => selectLut(lut.name);
        lutGallery.appendChild(chip);
    }

    function saveLutToDB(lutData) {
        if (!db) return;
        db.transaction('luts', 'readwrite').objectStore('luts').put(lutData);
    }

    function loadLutsFromDB() {
        addLutToGallery({ name: 'None', data: null }); // Add default 'None' option
        selectLut('None');

        if (!db) return;
        const store = db.transaction('luts').objectStore('luts');
        store.getAll().onsuccess = e => {
            luts = e.target.result;
            luts.forEach(addLutToGallery);
        };
    }

    // --- 7. LUT APPLICATION LOGIC ---
    function applySelectedLut() {
        const lut = luts.find(l => l.name === selectedLutName) || { name: 'None', data: null };
        if (!lut.data || !selectedImage) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const lutTable = lut.data;
        const lutSize = Math.round(Math.cbrt(lutTable.length));
        if (lutSize * lutSize * lutSize !== lutTable.length) return; // Invalid LUT

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
            const r_i = Math.floor(r * (lutSize - 1));
            const g_i = Math.floor(g * (lutSize - 1));
            const b_i = Math.floor(b * (lutSize - 1));
            const lutIndex = b_i * lutSize * lutSize + g_i * lutSize + r_i;
            const newColor = lutTable[lutIndex];
            if (newColor) {
                data[i] = newColor[0] * 255;
                data[i + 1] = newColor[1] * 255;
                data[i + 2] = newColor[2] * 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    function parseLut(str) {
        return str.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#') && !/LUT_3D_SIZE|TITLE/.test(line)).map(line => line.split(/\s+/).map(parseFloat));
    }

    // --- GO! ---
    init();
});
