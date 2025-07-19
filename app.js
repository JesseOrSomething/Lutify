document.addEventListener('DOMContentLoaded', () => {
    // A helper for managing all the complex WebGL stuff
    const webGLHelper = {
        gl: null,
        program: null,
        imageTexture: null,
        lutTexture: null,
        identityLutTexture: null,
        
        // Shaders are small programs that run on the GPU
        vertexShaderSource: `
            attribute vec2 a_position;
            varying vec2 v_texCoord;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_position * 0.5 + 0.5;
            }`,
        fragmentShaderSource: `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            uniform sampler3D u_lut;
            uniform float u_lutSize;

            vec3 applyLut(vec3 color) {
                float blueColor = color.b * (u_lutSize - 1.0);
                vec2 quad1;
                quad1.y = floor(floor(blueColor) / u_lutSize);
                quad1.x = floor(blueColor) - (quad1.y * u_lutSize);
                vec2 quad2;
                quad2.y = floor(ceil(blueColor) / u_lutSize);
                quad2.x = ceil(blueColor) - (quad2.y * u_lutSize);
                
                vec2 texPos1;
                texPos1.x = (quad1.x * u_lutSize + color.r * (u_lutSize - 1.0) + 0.5) / (u_lutSize * u_lutSize);
                texPos1.y = (quad1.y * u_lutSize + color.g * (u_lutSize - 1.0) + 0.5) / u_lutSize;
                
                vec2 texPos2;
                texPos2.x = (quad2.x * u_lutSize + color.r * (u_lutSize - 1.0) + 0.5) / (u_lutSize * u_lutSize);
                texPos2.y = (quad2.y * u_lutSize + color.g * (u_lutSize - 1.0) + 0.5) / u_lutSize;
                
                vec3 newColor1 = texture2D(u_lut, texPos1).rgb;
                vec3 newColor2 = texture2D(u_lut, texPos2).rgb;
                
                return mix(newColor1, newColor2, fract(blueColor));
            }

            void main() {
                vec4 originalColor = texture2D(u_image, v_texCoord);
                vec3 lutColor = texture3D(u_lut, originalColor.rgb).rgb;
                gl_FragColor = vec4(lutColor, originalColor.a);
            }`,

        init(canvas) {
            this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            const gl = this.gl;

            const vertShader = this.createShader(gl.VERTEX_SHADER, this.vertexShaderSource);
            // The fragment shader has been updated to use 3D textures for simplicity and performance
            const fragShader = this.createShader(gl.FRAGMENT_SHADER, `
                precision highp float;
                varying vec2 v_texCoord;
                uniform sampler2D u_image;
                uniform sampler3D u_lut;
                void main() {
                    vec4 originalColor = texture2D(u_image, v_texCoord);
                    gl_FragColor = texture3D(u_lut, originalColor.rgb);
                }`
            );

            this.program = this.createProgram(vertShader, fragShader);
            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

            this.createIdentityLut();
            this.lutTexture = this.identityLutTexture; // Start with the identity LUT
        },

        createShader(type, source) {
            const shader = this.gl.createShader(type);
            this.gl.shaderSource(shader, source);
            this.gl.compileShader(shader);
            return shader;
        },

        createProgram(vertexShader, fragmentShader) {
            const program = this.gl.createProgram();
            this.gl.attachShader(program, vertexShader);
            this.gl.attachShader(program, fragmentShader);
            this.gl.linkProgram(program);
            return program;
        },

        createTexture(image) {
            const gl = this.gl;
            this.imageTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        },
        
        create3DLutTexture(data, size) {
            const gl = this.gl;
            if (!data) { // If no data (e.g., "None" LUT), use the identity texture
                this.lutTexture = this.identityLutTexture;
                return;
            }
            this.lutTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB, size, size, size, 0, gl.RGB, gl.FLOAT, new Float32Array(data.flat()));
        },
        
        createIdentityLut() {
            const size = 2; // A 2x2x2 identity LUT is tiny and efficient
            const data = [];
            for (let z = 0; z < size; z++) {
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        data.push(x / (size - 1), y / (size - 1), z / (size - 1));
                    }
                }
            }
            const gl = this.gl;
            this.identityLutTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_3D, this.identityLutTexture);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB, size, size, size, 0, gl.RGB, gl.FLOAT, new Float32Array(data));
        },

        draw() {
            const gl = this.gl;
            if (!this.imageTexture || !this.lutTexture) return;

            gl.useProgram(this.program);
            
            const positionLocation = gl.getAttribLocation(this.program, "a_position");
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

            // Bind the image texture to texture unit 0
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
            gl.uniform1i(gl.getUniformLocation(this.program, "u_image"), 0);

            // Bind the LUT texture to texture unit 1
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
            gl.uniform1i(gl.getUniformLocation(this.program, "u_lut"), 1);
            
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    };

    // --- Main App Logic ---
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

    let db;
    let images = [];
    let luts = [];
    let selectedImage = null;
    let deferredPrompt;

    function init() {
        if (localStorage.getItem('hasVisitedApp')) showApp(); else showLandingPage();
        webGLHelper.init(canvas); // Initialize the WebGL context
        initDB();
        setupEventListeners();
    }

    const showLandingPage = () => { landingPage.style.display = 'flex'; appPage.classList.add('hidden'); };
    const showApp = () => { landingPage.style.display = 'none'; appPage.classList.remove('hidden'); localStorage.setItem('hasVisitedApp', 'true'); };
    
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; installButton.style.display = 'flex'; });
    
    function initDB() {
        const request = indexedDB.open('PixelPerfectDB', 2);
        request.onupgradeneeded = e => { if (!e.target.result.objectStoreNames.contains('luts')) e.target.result.createObjectStore('luts', { keyPath: 'name' }); };
        request.onsuccess = e => { db = e.target.result; loadLutsFromDB(); };
        request.onerror = e => console.error('DB Error:', e.target.errorCode);
    }
    
    function setupEventListeners() {
        installButton.addEventListener('click', () => { if (deferredPrompt) deferredPrompt.prompt(); });
        enterAppButton.addEventListener('click', showApp);
        imageUpload.addEventListener('change', handleImageUpload);
        lutUpload.addEventListener('change', handleLutUpload);
        photoSelect.addEventListener('change', (e) => selectImage(e.target.value));
        lutSelect.addEventListener('change', (e) => selectLut(e.target.value));
    }

    function handleImageUpload(e) {
        if (e.target.files.length > 0) { placeholder.style.display = 'none'; canvas.style.display = 'block'; }
        for (const file of e.target.files) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const imageData = { id: Date.now() + file.name, name: file.name, element: img };
                    images.push(imageData);
                    addPhotoToSelect(imageData);
                    if (!selectedImage) selectImage(imageData.id);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    }

    function selectImage(id) {
        selectedImage = images.find(img => img.id == id);
        if (!selectedImage) return;

        canvas.width = selectedImage.element.naturalWidth;
        canvas.height = selectedImage.element.naturalHeight;
        webGLHelper.gl.viewport(0, 0, canvas.width, canvas.height);
        
        webGLHelper.createTexture(selectedImage.element);
        webGLHelper.draw();
        
        photoSelect.value = id;
    }

    function addPhotoToSelect(imageData) {
        const option = document.createElement('option');
        option.value = imageData.id;
        option.textContent = imageData.name;
        photoSelect.appendChild(option);
    }

    function handleLutUpload(e) {
        for (const file of e.target.files) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const lut = parseLut(event.target.result);
                if (lut && !luts.some(l => l.name === file.name)) {
                    const lutData = { name: file.name, ...lut };
                    luts.push(lutData);
                    saveLutToDB(lutData);
                    addLutToSelect(lutData);
                }
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    }

    function selectLut(name) {
        const lut = luts.find(l => l.name === name) || {name: 'None', data: null, size: 0};
        webGLHelper.create3DLutTexture(lut.data, lut.size);
        webGLHelper.draw();
        lutSelect.value = name;
    }

    function addLutToSelect(lut) {
        const option = document.createElement('option');
        option.value = lut.name;
        option.textContent = lut.name === 'None' ? 'None' : lut.name.replace(/\.cube$/i, '');
        lutSelect.appendChild(option);
    }

    function saveLutToDB(lutData) { if (db) db.transaction('luts', 'readwrite').objectStore('luts').put(lutData); }
    
    function loadLutsFromDB() {
        addLutToSelect({ name: 'None' });
        if (!db) return;
        const store = db.transaction('luts', 'readwrite').objectStore('luts');
        store.getAll().onsuccess = e => { luts = e.target.result; luts.forEach(addLutToSelect); };
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

    init();
});
