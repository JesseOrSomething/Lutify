document.addEventListener('DOMContentLoaded', () => {
    const installPrompt = document.getElementById('install-prompt');
    const installButton = document.getElementById('install-button');
    const closeInstallPrompt = document.getElementById('close-install-prompt');
    const imageUpload = document.getElementById('image-upload');
    const lutUpload = document.getElementById('lut-upload');
    const imagePreview = document.getElementById('image-preview');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let originalImageData = null;
    let lutData = null;
    let deferredPrompt;

    // Show the install prompt if the app is not installed
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (!localStorage.getItem('installed')) {
            installPrompt.style.display = 'block';
        }
    });

    installButton.addEventListener('click', () => {
        installPrompt.style.display = 'none';
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                localStorage.setItem('installed', 'true');
            }
            deferredPrompt = null;
        });
    });

    closeInstallPrompt.addEventListener('click', () => {
        installPrompt.style.display = 'none';
    });


    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                imagePreview.src = event.target.result;
                imagePreview.onload = () => {
                    canvas.width = imagePreview.naturalWidth;
                    canvas.height = imagePreview.naturalHeight;
                    ctx.drawImage(imagePreview, 0, 0);
                    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    if (lutData) {
                        applyLUT();
                    }
                };
            };
            reader.readAsDataURL(file);
        }
    });

    lutUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                lutData = parseLUT(event.target.result);
                if (originalImageData) {
                    applyLUT();
                }
            };
            reader.readAsText(file);
        }
    });

    function parseLUT(data) {
        const lines = data.split('\n');
        const lut = [];
        for (const line of lines) {
            if (line.trim() !== '' && !line.startsWith('#') && !line.startsWith('TITLE') && !line.startsWith('LUT_3D_SIZE')) {
                const [r, g, b] = line.split(' ').map(parseFloat);
                lut.push([r, g, b]);
            }
        }
        return lut;
    }

    function applyLUT() {
        if (!originalImageData || !lutData) return;

        const imageData = new ImageData(
            new Uint8ClampedArray(originalImageData.data),
            originalImageData.width,
            originalImageData.height
        );
        const data = imageData.data;
        const lutSize = Math.round(Math.cbrt(lutData.length));

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;

            const lutIndex = getLutIndex(r, g, b, lutSize);
            const newColor = lutData[lutIndex];

            if (newColor) {
                data[i] = newColor[0] * 255;
                data[i + 1] = newColor[1] * 255;
                data[i + 2] = newColor[2] * 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    function getLutIndex(r, g, b, size) {
        const r_i = Math.floor(r * (size - 1));
        const g_i = Math.floor(g * (size - 1));
        const b_i = Math.floor(b * (size - 1));
        return b_i * size * size + g_i * size + r_i;
    }
});