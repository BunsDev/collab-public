const MINIMAP_W = 200;
const MINIMAP_H = 140;
const PADDING_RATIO = 0.1;
const MIN_TILE_W = 4;
const MIN_TILE_H = 3;
const MIN_EXTENT_FACTOR = 3;

const TILE_COLORS = {
	term: "#6366f1",
	note: "#34d399",
	code: "#fbbf24",
	image: "#f472b6",
	browser: "#38bdf8",
	graph: "#a855f7",
};

const TILE_OPACITY = 0.8;
const VP_BORDER_OPACITY = 0.55;
const VP_FILL_OPACITY = 0.04;

export function createMinimap({ viewportEl, wrapperEl, viewportState, getTiles, viewport }) {
	const canvasEl = viewportEl;
	const canvas = wrapperEl.querySelector("canvas");
	const ctx = canvas.getContext("2d");

	let dirty = true;
	let rafId = null;
	let bounds = null;
	let minimapScale = 1;
	let offsetX = 0;
	let offsetY = 0;

	function resizeCanvas() {
		const dpr = window.devicePixelRatio || 1;
		canvas.width = MINIMAP_W * dpr;
		canvas.height = MINIMAP_H * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function computeBounds() {
		const tiles = getTiles();
		if (tiles.length === 0) return null;

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const t of tiles) {
			if (t.x < minX) minX = t.x;
			if (t.y < minY) minY = t.y;
			if (t.x + t.width > maxX) maxX = t.x + t.width;
			if (t.y + t.height > maxY) maxY = t.y + t.height;
		}

		let bw = maxX - minX;
		let bh = maxY - minY;

		const vw = canvasEl.clientWidth;
		const vh = canvasEl.clientHeight;
		const zoom = viewportState.zoom;
		const minW = MIN_EXTENT_FACTOR * (vw / zoom);
		const minH = MIN_EXTENT_FACTOR * (vh / zoom);

		if (bw < minW) {
			const cx = (minX + maxX) / 2;
			minX = cx - minW / 2;
			maxX = cx + minW / 2;
			bw = minW;
		}
		if (bh < minH) {
			const cy = (minY + maxY) / 2;
			minY = cy - minH / 2;
			maxY = cy + minH / 2;
			bh = minH;
		}

		const padW = bw * PADDING_RATIO;
		const padH = bh * PADDING_RATIO;
		minX -= padW;
		minY -= padH;
		maxX += padW;
		maxY += padH;

		return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
	}

	function computeScale(b) {
		const sx = MINIMAP_W / b.width;
		const sy = MINIMAP_H / b.height;
		minimapScale = Math.min(sx, sy);

		const contentW = b.width * minimapScale;
		const contentH = b.height * minimapScale;
		offsetX = (MINIMAP_W - contentW) / 2;
		offsetY = (MINIMAP_H - contentH) / 2;
	}

	function worldToMinimap(wx, wy) {
		return {
			x: (wx - bounds.minX) * minimapScale + offsetX,
			y: (wy - bounds.minY) * minimapScale + offsetY,
		};
	}

	function drawRoundRect(x, y, w, h, r) {
		r = Math.min(r, w / 2, h / 2);
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.arcTo(x + w, y, x + w, y + r, r);
		ctx.lineTo(x + w, y + h - r);
		ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
		ctx.lineTo(x + r, y + h);
		ctx.arcTo(x, y + h, x, y + h - r, r);
		ctx.lineTo(x, y + r);
		ctx.arcTo(x, y, x + r, y, r);
		ctx.closePath();
	}

	function draw() {
		ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);

		const tiles = getTiles();
		if (tiles.length === 0) return;

		bounds = computeBounds();
		if (!bounds) return;
		computeScale(bounds);

		for (const tile of tiles) {
			const pos = worldToMinimap(tile.x, tile.y);
			let w = tile.width * minimapScale;
			let h = tile.height * minimapScale;
			w = Math.max(w, MIN_TILE_W);
			h = Math.max(h, MIN_TILE_H);

			const hex = TILE_COLORS[tile.type] || "#888888";
			ctx.globalAlpha = TILE_OPACITY;
			ctx.fillStyle = hex;
			drawRoundRect(pos.x, pos.y, w, h, 1.5);
			ctx.fill();
		}

		const zoom = viewportState.zoom;
		const vpWorldX = -viewportState.panX / zoom;
		const vpWorldY = -viewportState.panY / zoom;
		const vpWorldW = canvasEl.clientWidth / zoom;
		const vpWorldH = canvasEl.clientHeight / zoom;

		const vpPos = worldToMinimap(vpWorldX, vpWorldY);
		let vpW = vpWorldW * minimapScale;
		let vpH = vpWorldH * minimapScale;

		const vpX = Math.max(0, Math.min(vpPos.x, MINIMAP_W));
		const vpY = Math.max(0, Math.min(vpPos.y, MINIMAP_H));
		vpW = Math.min(vpW, MINIMAP_W - vpX);
		vpH = Math.min(vpH, MINIMAP_H - vpY);

		ctx.globalAlpha = VP_FILL_OPACITY;
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(vpX, vpY, vpW, vpH);

		ctx.globalAlpha = VP_BORDER_OPACITY;
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = 1.5;
		ctx.strokeRect(vpX, vpY, vpW, vpH);

		ctx.globalAlpha = 1;
	}

	function scheduleRedraw() {
		dirty = true;
		if (rafId) return;
		rafId = requestAnimationFrame(() => {
			rafId = null;
			if (!dirty) return;
			dirty = false;
			draw();
		});
	}

	function updateVisibility() {
		const tiles = getTiles();
		const shouldShow = tiles.length > 0;
		const isShown = wrapperEl.classList.contains("visible");

		if (shouldShow && !isShown) {
			wrapperEl.classList.add("visible");
			canvasEl.style.setProperty("--zoom-indicator-bottom", "164px");
		} else if (!shouldShow && isShown) {
			wrapperEl.classList.remove("visible");
			canvasEl.style.setProperty("--zoom-indicator-bottom", "12px");
		}
	}

	resizeCanvas();

	const minimap = {
		update() {
			updateVisibility();
			scheduleRedraw();
		},
		getViewportRect() {
			if (!bounds) return null;
			const zoom = viewportState.zoom;
			const vpWorldX = -viewportState.panX / zoom;
			const vpWorldY = -viewportState.panY / zoom;
			const vpWorldW = canvasEl.clientWidth / zoom;
			const vpWorldH = canvasEl.clientHeight / zoom;
			const vpPos = worldToMinimap(vpWorldX, vpWorldY);
			return {
				x: vpPos.x, y: vpPos.y,
				w: vpWorldW * minimapScale,
				h: vpWorldH * minimapScale,
			};
		},
		minimapToWorld(mx, my) {
			if (!bounds) return { x: 0, y: 0 };
			return {
				x: (mx - offsetX) / minimapScale + bounds.minX,
				y: (my - offsetY) / minimapScale + bounds.minY,
			};
		},
		getBounds() { return bounds; },
		getCanvas() { return canvas; },
	};

	// Interaction code will be added in Task 5

	return minimap;
}
