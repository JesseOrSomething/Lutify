document.addEventListener('DOMContentLoaded', () => {
    // A helper for managing all the complex WebGL stuff
    const webGLHelper = {
        gl: null, program: null, imageTexture: null, lutTexture: null, identityLutTexture: null,
        init(canvas) {
            this.gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
            const gl = this.gl;
            const vertShader = this.createShader(gl.VERTEX_SHADER, `attribute vec2 a_position; varying vec2 v_texCoord; void main() { gl_Position = vec4(a_position, 0.0, 1.0); v_texCoord = a_position * 0.5 + 0.5; }`);
            const fragShader = this.createShader(gl.FRAGMENT_SHADER, `precision highp float; varying vec2 v_texCoord; uniform sampler2D u_image; uniform sampler3D u_lut; void main() { gl_FragColor = texture3D(u_lut, texture2D(u_image, v_texCoord).rgb);}`);
            this.program = this.createProgram(vertShader, fragShader);
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            this.createIdentityLut();
            this.lutTexture = this.identityLutTexture;
        },
        createShader(type, source) { const s = this.gl.createShader(type); this.gl.shaderSource(s, source); this.gl.compileShader(s); return s; },
        createProgram(v, f) { const p = this.gl.createProgram(); this.gl.attachShader(p, v); this.gl.attachShader(p, f); this.gl.linkProgram(p); return p; },
        createTexture(image) {
            const gl = this.gl; if (this.imageTexture) gl.deleteTexture(this.imageTexture);
            this.imageTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        },
        create3DLutTexture(data, size) {
            const gl = this.gl;
            if (this.lutTexture && this.lutTexture !== this.identityLutTexture) gl.deleteTexture(this.lutTexture);
            if (!data) { this.lutTexture = this.identityLutTexture; return; }
            this.lutTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB, size, size, size, 0, gl.RGB, gl.FLOAT, new Float32Array(data.flat()));
        },
        createIdentityLut() {
            const size = 2, data = []; for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.push(x / (size - 1), y / (size - 1), z / (size - 1));
            const gl = this.gl; this.identityLutTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_3D, this.identityLutTexture); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB, size, size, size, 0, gl.RGB, gl.FLOAT, new Float32Array(data));
        },
        draw() {
            const gl = this.gl; if (!this.imageTexture || !this.lutTexture) return;
            gl.useProgram(this.program);
            const posLoc = gl.getAttribLocation(this.program, "a_position");
            gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.imageTexture); gl.uniform1i(gl.getUniformLocation(this.program, "u_image"), 0);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.lutTexture); gl.uniform1i(gl.getUniformLocation(this.program, "u_lut"), 1);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    };

    const landingPage = document.getElementById('landing-page');
    const appPage = document.getElementById('app');
    const enterAppButton = document.getElementById('enter-app-button');
    const installButton = document.getElementById('install-button-main');
    const imageUpload = document.getElementById('image-upload');
    const lutUpload = document.getElementById('lut-upload');
    const canvas = document.getElementById('canvas');
    const placeholder = document.getElementById('placeholder');
    const photoSelect = document.getElementById('photo-select');
    const lutSelect = document.getElementById('lut-select');
    const appTitleText = document.getElementById('app-title-text');

    let db, deferredPrompt, images = [], luts = [];

    function init() {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            appTitleText.textContent = "PixelPerfect (Fullscreen)";
        } else {
            appTitleText.textContent = "PixelPerfect (In Browser)";
        }

        if (localStorage.getItem('hasVisitedApp_v3')) showApp(); else showLandingPage();
        webGLHelper.init(canvas);
        initDB();
        setupEventListeners();
    }

    const showLandingPage = () => { landingPage.classList.add('active'); appPage.classList.remove('active'); };
    const showApp = () => { landingPage.classList.remove('active'); appPage.classList.add('active'); localStorage.setItem('hasVisitedApp_v3', 'true'); };
    
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; installButton.style.display = 'flex'; });
    function initDB() { const req = indexedDB.open('PixelPerfectDB_v4', 1); req.onupgradeneeded = e => e.target.result.createObjectStore('luts', { keyPath: 'name' }); req.onsuccess = e => { db = e.target.result; loadLutsFromDB(); }; }
    
    function setupEventListeners() {
        installButton.addEventListener('click', () => deferredPrompt?.prompt());
        enterAppButton.addEventListener('click', showApp);
        imageUpload.addEventListener('change', handleImageUpload);
        lutUpload.addEventListener('change', handleLutUpload);
        photoSelect.addEventListener('change', () => drawCurrentState());
        lutSelect.addEventListener('change', () => drawCurrentState());
    }

    async function handleImageUpload(e) {
        if (e.target.files.length > 0) { placeholder.style.display = 'none'; canvas.style.display = 'block'; }
        
        for (const file of e.target.files) {
            const imageId = Date.now() + file.name;
            const img = new Image();
            img.src = URL.createObjectURL(file);
            await img.decode();
            
            const imageData = { id: imageId, name: file.name, element: img };
            images.push(imageData);
            addOptionToSelect(photoSelect, file.name, imageId);
        }
        
        photoSelect.value = images[images.length - 1].id; // Select the last image added
        drawCurrentState();
        e.target.value = '';
    }
    
    async function handleLutUpload(e) {
        for (const file of e.target.files) {
            if (luts.some(lut => lut.name === file.name)) continue;
            
            const text = await file.text();
            const lut = parseLut(text);
            
            if (lut) {
                const lutData = { name: file.name, ...lut };
                luts.push(lutData);
                saveLutToDB(lutData);
                addOptionToSelect(lutSelect, file.name.replace(/\.cube$/i, ''), file.name);
            }
        }

        lutSelect.value = luts[luts.length - 1].name; // Select the last LUT added
        drawCurrentState();
        e.target.value = '';
    }

    function drawCurrentState() {
        const selectedImageId = photoSelect.value;
        const selectedLutName = lutSelect.value;
        
        const image = images.find(img => img.id == selectedImageId);
        const lut = luts.find(l => l.name === selectedLutName) || { data: null, size: 0 };
        
        if (!image) return;

        canvas.width = image.element.naturalWidth;
        canvas.height = image.element.naturalHeight;
        webGLHelper.gl.viewport(0, 0, canvas.width, canvas.height);
        
        webGLHelper.createTexture(image.element);
        webGLHelper.create3DLutTexture(lut.data, lut.size);
        webGLHelper.draw();
    }
    
    function addOptionToSelect(selectElement, text, value) {
        const opt = document.createElement('option');
        opt.textContent = text;
        opt.value = value;
        selectElement.appendChild(opt);
    }

    function saveLutToDB(lutData) { if (db) db.transaction('luts', 'readwrite').objectStore('luts').put(lutData); }
    
    function loadLutsFromDB() {
        addOptionToSelect(lutSelect, 'None', 'None');
        luts.push({name: 'None', data: null, size: 0}); // Add default LUT
        if (!db) return;
        const store = db.transaction('luts').objectStore('luts');
        store.getAll().onsuccess = e => {
            e.target.result.forEach(lut => {
                if (!luts.some(l => l.name === lut.name)) {
                    luts.push(lut);
                    addOptionToSelect(lutSelect, lut.name.replace(/\.cube$/i, ''), lut.name);
                }
            });
        };
    }

    function parseLut(str) {
        const lines = str.split('\n').map(l => l.trim());
        let sizeLine = lines.find(l => l.startsWith('LUT_3D_SIZE'));
        if (!sizeLine) return null;
        const size = parseInt(sizeLine.split(' ')[1]);
        const data = lines.filter(l => l && !l.startsWith('#') && /^[0-9]/.test(l)).map(l => l.split(/\s+/).map(parseFloat));
        if (data.length !== size * size * size) return null;
        return { data, size };
    }

    init();
});
