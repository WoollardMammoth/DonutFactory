// --- CONSTANTS ---
const SVG_PATHS = [
    "M-15,0 L15,0",                      // Straight
    "M-15,0 Q0,-6 15,0",                 // Gentle Bend
    "M-14,0 Q0,-12 14,0",                // Banana
    "M-16,0 Q-8,-5 0,0 T16,0",           // Subtle Wave
    "M-10,0 L10,0"                       // Stubby
];

const RAINBOW_SPRINKLES = ["#FF6B6B", "#4ECDC4", "#FFE66D", "#FF9F1C", "#F7FFF7", "#FF006E", "#8338EC", "#3A86FF"];
const MINT_CHIP_SPRINKLES = ["#5D4037", "#301e1b", "#8D6E63", "#FFFFFF", "#F0F0F0"];

const PRESETS = {
    "Pink Frosted Donut": { bg: "#CCA995", f1: "#FC86D1", f2: "#F4499C", sprinkles: RAINBOW_SPRINKLES },
    "White Frosted Donut": { bg: "#CCA995", f1: "#FFFFFF", f2: "#F0F0F0", sprinkles: RAINBOW_SPRINKLES },
    "Chocolate Frosted Donut": { bg: "#CCA995", f1: "#795548", f2: "#4E342E", sprinkles: RAINBOW_SPRINKLES },
    "Mint Frosted Chocolate Donut": { bg: "#3E2723", f1: "#76D0AC", f2: "#4DB6AC", sprinkles: MINT_CHIP_SPRINKLES }
};

// --- STATE MANAGEMENT ---
// This object holds the current state of the application
const state = {
    width: 800,
    height: 600,
    density: 20,
    layers: 5,
    heightPercent: 80,
    overlap: 0.5,
    allowOverlap: false,
    complexity: 8,
    colors: {
        bg: "#CCA995",
        f1: "#FC86D1",
        f2: "#F4499C",
        sprinkles: [...RAINBOW_SPRINKLES] // Copy of the array
    }
};

// This will hold the height (Y) of the frosting at every single pixel (X)
// This will be used to check that sprinkle placement is accurately on frosting.
let surfaceMap = [];

// --- DOM ELEMENTS ---
const canvas = document.getElementById("donut-canvas");
const paletteContainer = document.getElementById("sprinkle-palette-container");
const btnAddColor = document.getElementById("btn-add-color");
const btnDownloadPng = document.getElementById("btn-download-png");
const sidebar = document.getElementById("my-sidebar");
const toggleBtn = document.getElementById("toggle-sidebar");

const inputs = {
    width: document.getElementById("canvas-width"),
    height: document.getElementById("canvas-height"),
    density: document.getElementById("density"),
    layers: document.getElementById("layers"),
    dripHeight: document.getElementById("height"),
    overlap: document.getElementById("overlap"),
    allowOverlap: document.getElementById("allow-overlap"),
    complexity: document.getElementById("complexity"),
    bg: document.getElementById("bg-color"),
    f1: document.getElementById("f1-color"),
    f2: document.getElementById("f2-color"),
    preset: document.getElementById("preset-selector"),
    btnRescatter: document.getElementById("btn-refresh"),
    btnDownload: document.getElementById("btn-download")
};

// --- MATH & UTILITY HELPERS ---

function dist_sq(p1, p2) {
    //Calculates squared Euclidean distance between two points
    return (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2
}

// MATH HELPER: Squared distance between two line segments
function getSegDistSq(p1, p2, p3, p4) {
    let x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
    let x3 = p3[0], y3 = p3[1], x4 = p4[0], y4 = p4[1];
    let dx21 = x2 - x1, dy21 = y2 - y1;
    let dx43 = x4 - x3, dy43 = y4 - y3;
    let dx13 = x1 - x3, dy13 = y1 - y3;

    let d21 = dx21 * dx21 + dy21 * dy21;
    let d43 = dx43 * dx43 + dy43 * dy43;
    let epsilon = 1e-6;

    if (d21 < epsilon) d21 = epsilon;
    if (d43 < epsilon) d43 = epsilon;

    let r = dx21 * dx43 + dy21 * dy43;
    let s = dx21 * dx13 + dy21 * dy13;
    let t = dx43 * dx13 + dy43 * dy13;

    let denom = d21 * d43 - r * r;
    if (denom < epsilon) denom = epsilon;

    let u1 = (r * t - s * d43) / denom;
    let u2 = (d21 * t - s * r) / denom;

    u1 = Math.max(0, Math.min(1, u1));
    u2 = Math.max(0, Math.min(1, u2));

    let u2_check = (t + u1 * r) / d43;
    u2_check = Math.max(0, Math.min(1, u2_check));

    let xx1 = x1 + u1 * dx21, yy1 = y1 + u1 * dy21;
    let xx2 = x3 + u2_check * dx43, yy2 = y3 + u2_check * dy43;

    return (xx1 - xx2) * (xx1 - xx2) + (yy1 - yy2) * (yy1 - yy2);
}

function hex_to_rgb(hex_color) {
    hex_color = hex_color.replace("#", ""); // strip the '#' out of the hex code.

    //Split the hex value in groups of 2, and parse the base 16 string to decimal
    let r = parseInt(hex_color.substring(0, 2), 16);
    let g = parseInt(hex_color.substring(2, 4), 16);
    let b = parseInt(hex_color.substring(4, 6), 16);

    return [r, g, b]
}

function rgb_to_hex(r, g, b) {
    //round values to remove any decimals
    r = Math.round(r);
    g = Math.round(g);
    b = Math.round(b);

    //convert to base 16 strings (and pad with leading 0 if necessary)
    const rHex = r.toString(16).padStart(2, "0");
    const gHex = g.toString(16).padStart(2, "0");
    const bHex = b.toString(16).padStart(2, "0");

    return "#" + rHex + gHex + bHex;
}

function interpolateColor(c1_hex, c2_hex, t) {
    let c1 = hex_to_rgb(c1_hex)
    let c2 = hex_to_rgb(c2_hex)

    // Linear interpolation formula: start + (end - start) * t
    let r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    let g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    let b = Math.round(c1[2] + (c2[2] - c1[2]) * t);

    return rgb_to_hex(r, g, b);
}

function cubic_bezier(t, p0, p1, p2, p3) {
    /*
    Calculates the (x, y) coordinate at time 't' along a cubic Bezier curve.
    p0: Start point
    p1: Control point 1
    p2: Control point 2
    p3: End point
    Used to smooth out the frosting waves and to map the surface height.
    */
    let mt = 1 - t;
    let mt2 = mt * mt;
    let mt3 = mt2 * mt;
    let t2 = t * t;
    let t3 = t2 * t;

    // Standard Bezier formula
    let x = mt3 * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t3 * p3[0];
    let y = mt3 * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t3 * p3[1];

    return [x, y];
}

function getSprinkleEndpoints(sprinkle) {
    const baseLength = 30;
    const totalLength = baseLength * sprinkle.scale * sprinkle.stretch;
    const rad = sprinkle.rotation * (Math.PI / 180);

    const dx = (totalLength / 2) * Math.cos(rad);
    const dy = (totalLength / 2) * Math.sin(rad);

    const x1 = sprinkle.x - dx;
    const y1 = sprinkle.y - dy;
    const x2 = sprinkle.x + dx;
    const y2 = sprinkle.y + dy;

    return [[x1, y1], [x2, y2]]
}

function checkCollision(candidate, others) {

    const maxDistSq = (35 * candidate.scale * 2) ** 2;

    for (const otherSprinkle of others) {
        const dSq = dist_sq([candidate.x, candidate.y], [otherSprinkle.x, otherSprinkle.y]);

        // If the distance is GREATER than our safe zone, they are too far apart to touch.
        // So we CONTINUE (skip) to the next sprinkle.
        if (dSq > maxDistSq) {
            continue;
        }

        //If we are here, the sprinkles are close (as deterimend by the fast check). Move to a more precise check.
        const otherEndpoints = getSprinkleEndpoints(otherSprinkle);
        const candidateEndpoints = getSprinkleEndpoints(candidate);

        const segDistSq = getSegDistSq(otherEndpoints[0], otherEndpoints[1], candidateEndpoints[0], candidateEndpoints[1]);

        if (segDistSq < ((8 * candidate.scale) + 2) ** 2) {
            return true; // These sprinkles overlap.
        }
    }
    return false;
}

// --- SVG HELPERS ---
// Helper to create SVG elements easily
function createSVGElement(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value);
    }
    return el;
}

// --- CORE LOGIC & GENERATION ---

function generateFrosting() {
    const w = state.width;
    const h = state.height;

    // Initialize Surface Map to 0 (top of canvas)
    surfaceMap = new Array(w).fill(0);

    // Calculate Max Height in pixels
    const hMax = h * (state.heightPercent / 100);

    // Configuration
    const layers = state.layers;
    const complexity = state.complexity;
    const overlapFactor = state.overlap;

    // Bleed ensures the wave covers the corners
    const bleedX = 100;
    const bleedY = 500;

    const minDrip = hMax * 0.1;
    const verticalSpread = hMax - minDrip;

    // Calculate step size between layers
    // (In JS, we use ternary operators ? : for simple if/else)
    const rawStep = (layers > 1) ? (verticalSpread / (layers - 1)) : 0;
    const stepSize = rawStep * (1.0 - (overlapFactor * 0.8));

    // Loop through layers
    for (let i = 0; i < layers; i++) {
        // Reverse order so we draw bottom layer first
        const layerIdx = (layers - 1) - i;

        // Color Interpolation
        const t = (layers > 1) ? (layerIdx / (layers - 1)) : 0;
        const col = interpolateColor(state.colors.f1, state.colors.f2, t);

        const stepsFromBottom = (layers - 1) - layerIdx;
        const currentBaseY = hMax - (stepSize * stepsFromBottom);


        // --- Generate Random Anchor Points (Knots) ---
        let knots = [];
        knots.push([-bleedX, currentBaseY]); // Start off-screen left

        const totalWidth = w + (bleedX * 2);
        const segmentW = totalWidth / complexity;
        const amplitude = (hMax / 25) + (complexity * 4);

        for (let c = 0; c < complexity; c++) {
            let targetX = -bleedX + ((c + 1) * segmentW);

            // Snap last point to exactly the right edge
            if (c === complexity - 1) targetX = w + bleedX;

            const yVar = -amplitude + Math.random() * (amplitude * 2); // Random -amp to +amp
            knots.push([targetX, currentBaseY + yVar]);
        }

        // --- Convert Knots to Smooth SVG Path ---
        // We start the path at top-left offscreen
        let d = `M ${-bleedX},${-bleedY} L ${knots[0][0]},${knots[0][1]}`;

        // Bezier Smoothing Logic
        if (knots.length > 1) {
            for (let k = 0; k < knots.length - 1; k++) {
                // Get neighboring points
                const p0 = (k > 0) ? knots[k - 1] : knots[k];
                const p1 = knots[k];
                const p2 = knots[k + 1];
                const p3 = (k < knots.length - 2) ? knots[k + 2] : knots[k + 1];

                // Calculate Control Points 
                // This logic smooths the line between p1 and p2 using p0 and p3 as guides
                const cp1x = p1[0] + (p2[0] - p0[0]) / 6.0;
                const cp1y = p1[1] + (p2[1] - p0[1]) / 6.0;
                const cp2x = p2[0] - (p3[0] - p1[0]) / 6.0;
                const cp2y = p2[1] - (p3[1] - p1[1]) / 6.0;

                // Add curve to SVG path
                // .toFixed(1) keeps the string short (e.g. "10.5" instead of "10.54321")
                d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;

                // --- Update Surface Map ---
                // Sample the curve to record the height for the sprinkles later
                const steps = 20;
                for (let st = 0; st <= steps; st++) {
                    const tVal = st / steps;
                    const pos = cubic_bezier(tVal, p1, [cp1x, cp1y], [cp2x, cp2y], p2);
                    const idx = Math.floor(pos[0]);

                    // If this pixel is on screen...
                    if (idx >= 0 && idx < w) {
                        // If this wave is lower (higher Y value) than what we have recorded, save it.
                        if (pos[1] > surfaceMap[idx]) {
                            surfaceMap[idx] = pos[1];
                        }
                    }
                }
            }
        }

        // Close the shape
        d += ` L ${w + bleedX},${-bleedY} Z`;

        // Create the SVG Element
        const path = createSVGElement("path", {
            d: d,
            fill: col,
            stroke: "none"
        });
        canvas.appendChild(path);
    }

    // Fill gaps in surface map (simple nearest neighbor)
    for (let x = 1; x < w; x++) {
        if (surfaceMap[x] === 0 && surfaceMap[x - 1] > 0) {
            surfaceMap[x] = surfaceMap[x - 1];
        }
    }
}

function generateSprinkles() {
    const layer = document.getElementById("sprinkle-layer");
    if (!layer) return;
    layer.innerHTML = "";

    const area = state.width * state.height;

    let targetCount = Math.floor((area / 350) * (state.density / 100));

    if(state.allowOverlap){
        targetCount = Math.floor((area / 3000) * (state.density / 100));
    }

    const sprinkles = [];

    for (i = 0; i < targetCount; i++) {
        let loops = 0;
        while (loops < 50) {
            let sx = Math.random() * state.width;
            let sy = Math.random() * state.height;
            if (sy >= surfaceMap[Math.floor(sx)]) {
                loops++;
                continue;
            }

            const candidate = {
                // Random integer 0-4 for the SVG path type
                typeIndex: Math.floor(Math.random() * 5),
                // Pick a random color from the state
                color: state.colors.sprinkles[Math.floor(Math.random() * state.colors.sprinkles.length)],
                x: sx,
                y: sy,
                rotation: Math.random() * 360,
                scale: 0.8 + Math.random() * 0.4, //Sprinlke size range
                stretch: 0.85 + Math.random() * 0.45
            };

            if (!state.allowOverlap) {
                const collisionDetected = checkCollision(candidate, sprinkles);
                if (!collisionDetected) {
                    // SUCCESS! 
                    sprinkles.push(candidate);
                    break; // Stop trying for this sprinkle, move to the next 'i'
                }
            }
            else {
                sprinkles.push(candidate);
            }
            loops++;
        }
    }
    // Now sprinkles is full of valid objects. Draw them!
    sprinkles.forEach(s => {
        const sprinkleType = SVG_PATHS[s.typeIndex];
        const transformString = `translate(${s.x}, ${s.y}) rotate(${s.rotation}) scale(${s.scale * s.stretch}, ${s.scale})`

        const sprinkle = createSVGElement("path", {
            'd': sprinkleType,
            'fill': "none",
            'stroke': s.color,
            'stroke-width': 8,
            'stroke-linecap': "round",
            'transform': transformString
        });
        layer.appendChild(sprinkle);

    });

}

function generateDonut() {
    //clear and resize the canvas
    canvas.innerHTML = "";
    canvas.setAttribute("viewBox", `0 0 ${state.width} ${state.height}`);
    canvas.setAttribute("width", state.width);
    canvas.setAttribute("height", state.height);

    //set the background to the "pastry" color.
    const rect = createSVGElement("rect", {
        x: 0,
        y: 0,
        width: state.width,
        height: state.height,
        fill: state.colors.bg
    });
    canvas.appendChild(rect); // This actually adds it to the page

    generateFrosting();

    const sprinkleLayer = createSVGElement("g", { id: "sprinkle-layer" });
    canvas.appendChild(sprinkleLayer);

    generateSprinkles();
}

// --- UI UPDATERS & RENDERERS ---

// Helper to update state and regenerate
function updateAndDraw() {
    state.width = parseInt(inputs.width.value);
    state.height = parseInt(inputs.height.value);
    state.density = parseInt(inputs.density.value);
    state.layers = parseInt(inputs.layers.value);
    state.heightPercent = parseInt(inputs.dripHeight.value);
    state.overlap = parseFloat(inputs.overlap.value);
    state.allowOverlap = inputs.allowOverlap.checked;
    state.complexity = parseInt(inputs.complexity.value);
    state.colors.bg = inputs.bg.value;
    state.colors.f1 = inputs.f1.value;
    state.colors.f2 = inputs.f2.value;

    // Update SVG ViewBox to match new dimensions
    canvas.setAttribute("viewBox", `0 0 ${state.width} ${state.height}`);

    // Call the main generation function
    generateDonut();
}

function renderPalette() {
    paletteContainer.innerHTML = ""; // Clear existing

    state.colors.sprinkles.forEach((color, index) => {
        // Create Wrapper
        const wrapper = document.createElement("div");
        wrapper.className = "palette-item";

        // Create Color Input
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = color;

        // Event: Update state when color changes
        colorInput.addEventListener("input", (e) => {
            state.colors.sprinkles[index] = e.target.value;
            // No need to regenerate geometry, just redraw colors? 
            // Actually, simplest is just to regenerate sprinkles.
            generateSprinkles();
        });

        // Create Delete Button
        const delBtn = document.createElement("button");
        delBtn.innerHTML = "&times;";
        delBtn.className = "btn-delete";
        delBtn.title = "Remove Color";

        // Event: Remove from array
        delBtn.addEventListener("click", () => {
            // Don't let them delete the last color (optional safety)
            if (state.colors.sprinkles.length > 1) {
                state.colors.sprinkles.splice(index, 1);
                renderPalette(); // Re-render the list
                generateSprinkles(); // Redraw canvas
            }
        });

        wrapper.appendChild(colorInput);
        wrapper.appendChild(delBtn);
        paletteContainer.appendChild(wrapper);
    });
}

// --- EVENT LISTENERS ---

// 1. Core Inputs
Object.values(inputs).forEach(input => {
    if (input) input.addEventListener("input", updateAndDraw);
});

// 2. Preset Logic
inputs.preset.addEventListener("change", (e) => {
    const p = PRESETS[e.target.value];
    if (p) {
        inputs.bg.value = p.bg;
        inputs.f1.value = p.f1;
        inputs.f2.value = p.f2;
        state.colors.sprinkles = [...p.sprinkles]; // Copy array

        updateAndDraw(); // Updates standard inputs
        renderPalette(); // NEW: Updates the dynamic list!
    }
});

// 3. Palette Add Button
btnAddColor.addEventListener("click", () => {
    // Add white as default, or random
    state.colors.sprinkles.push("#FFFFFF");
    renderPalette();
    generateSprinkles();
});

// 4. Rescatter Button
inputs.btnRescatter.addEventListener("click", generateDonut);

// 5. Sidebar Toggle
toggleBtn.addEventListener("click", () => {
    // This adds/removes the "open" class defined in CSS
    sidebar.classList.toggle("open");

    // Optional: Update button text
    if (sidebar.classList.contains("open")) {
        toggleBtn.innerText = "✖ Close";
    } else {
        toggleBtn.innerText = "⚙️ Settings";
    }
});

if (sidebar.classList.contains("open")) {
    toggleBtn.innerText = "✖ Close";
}

// 6. SVG Download Logic
inputs.btnDownload.addEventListener("click", () => {
    // Get the SVG content as a string
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(canvas);

    // Add namespace (required for external SVG viewers)
    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // Add XML declaration
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

    // Create a Blob (a file-like object of immutable raw data)
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Create a temporary link to trigger the download
    const link = document.createElement("a");
    link.href = url;
    link.download = "donut_sprinkles.svg"; // The filename
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
});

// 7. PNG Download Logic
btnDownloadPng.addEventListener("click", () => {
    // Serialize SVG to string
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(canvas);

    // Wrap it in a Blob url
    const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    // Create an Image to hold the SVG
    const img = new Image();
    img.onload = function () {
        // Create a hidden canvas to draw the image
        const canvasEl = document.createElement("canvas");
        canvasEl.width = state.width;
        canvasEl.height = state.height;
        const ctx = canvasEl.getContext("2d");

        // Draw the SVG image onto the canvas
        ctx.drawImage(img, 0, 0);

        // Convert canvas to PNG data URL
        const pngUrl = canvasEl.toDataURL("image/png");

        // Trigger Download
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = "donut_sprinkles.png";
        document.body.appendChild(link);
        link.click();

        // Cleanup
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Load the image (this triggers the onload above)
    img.src = url;
});

// --- INITIALIZATION ---
renderPalette();
updateAndDraw();
