'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useLanguage } from './language-provider';
import { useClientReady } from '@/lib/client/hydration';

type Point = { x: number; y: number };
type DrawingTool = 'brush' | 'marker' | 'fill' | 'line' | 'rectangle' | 'ellipse' | 'eraser';
type StrokeAction = {
  kind: 'stroke';
  color: string;
  width: number;
  opacity: number;
  eraser: boolean;
  marker: boolean;
  points: Point[];
};
type ShapeAction = {
  kind: 'line' | 'rectangle' | 'ellipse';
  color: string;
  width: number;
  opacity: number;
  filled: boolean;
  start: Point;
  end: Point;
};
type FillAction = {
  kind: 'fill';
  color: string;
  opacity: number;
  point: Point;
};
type DrawingAction = StrokeAction | ShapeAction | FillAction;

export type DrawingCanvasHandle = {
  exportImage: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
};

type DrawingCanvasProps = {
  onDrawingChange?: (hasDrawing: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
};

const CANVAS_SIZE = 768;
const COLORS = [
  '#1d1830', '#ffffff', '#9b9b9b', '#ff6b55', '#ff9f43', '#ffd54a', '#7bc96f', '#2aa876',
  '#31c8c8', '#276ad6', '#54a0ff', '#7656d6', '#b46ee0', '#ed4d9a', '#8a5a3b', '#5b3924',
];
const WIDTHS = [3, 6, 13, 24, 40];

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
}

function floodFill(context: CanvasRenderingContext2D, point: Point, color: string, opacity: number) {
  const { width, height } = context.canvas;
  const x = Math.max(0, Math.min(width - 1, Math.floor(point.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(point.y)));
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const startPixel = y * width + x;
  const startOffset = startPixel * 4;
  const target = [
    data[startOffset],
    data[startOffset + 1],
    data[startOffset + 2],
    data[startOffset + 3],
  ];
  const replacement = hexToRgb(color);
  if (
    opacity === 1 &&
    target[0] === replacement[0] &&
    target[1] === replacement[1] &&
    target[2] === replacement[2]
  ) return;

  const tolerance = 10;
  const matchesTarget = (pixel: number) => {
    const offset = pixel * 4;
    return (
      Math.abs(data[offset] - target[0]) <= tolerance &&
      Math.abs(data[offset + 1] - target[1]) <= tolerance &&
      Math.abs(data[offset + 2] - target[2]) <= tolerance &&
      Math.abs(data[offset + 3] - target[3]) <= tolerance
    );
  };
  const replacePixel = (pixel: number) => {
    const offset = pixel * 4;
    data[offset] = Math.round(replacement[0] * opacity + data[offset] * (1 - opacity));
    data[offset + 1] = Math.round(replacement[1] * opacity + data[offset + 1] * (1 - opacity));
    data[offset + 2] = Math.round(replacement[2] * opacity + data[offset + 2] * (1 - opacity));
    data[offset + 3] = 255;
  };

  const queue = new Int32Array(width * height);
  const visited = new Uint8Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = startPixel;
  visited[startPixel] = 1;
  replacePixel(startPixel);

  while (head < tail) {
    const pixel = queue[head++];
    const pixelX = pixel % width;
    const candidates = [
      pixelX > 0 ? pixel - 1 : -1,
      pixelX < width - 1 ? pixel + 1 : -1,
      pixel >= width ? pixel - width : -1,
      pixel < width * (height - 1) ? pixel + width : -1,
    ];
    for (const candidate of candidates) {
      if (candidate >= 0 && !visited[candidate] && matchesTarget(candidate)) {
        visited[candidate] = 1;
        replacePixel(candidate);
        queue[tail++] = candidate;
      }
    }
  }

  context.putImageData(image, 0, 0);
}

function paintAction(context: CanvasRenderingContext2D, action: DrawingAction) {
  if (action.kind === 'fill') {
    floodFill(context, action.point, action.color, action.opacity);
    return;
  }

  context.save();
  context.strokeStyle = action.kind === 'stroke' && action.eraser ? '#fffdf8' : action.color;
  context.fillStyle = action.kind === 'stroke' && action.eraser ? '#fffdf8' : action.color;
  context.globalAlpha = action.kind === 'stroke' && action.eraser
    ? 1
    : action.kind === 'stroke' && action.marker
      ? Math.min(action.opacity, 0.45)
      : action.opacity;
  context.lineWidth = action.width;
  context.lineCap = action.kind === 'stroke' && action.marker ? 'square' : 'round';
  context.lineJoin = 'round';

  if (action.kind === 'stroke') {
    if (action.points.length === 0) {
      context.restore();
      return;
    }
    if (action.points.length === 1) {
      const [point] = action.points;
      context.beginPath();
      context.arc(point.x, point.y, action.width / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(action.points[0].x, action.points[0].y);
      for (const point of action.points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.restore();
    return;
  }

  const left = Math.min(action.start.x, action.end.x);
  const top = Math.min(action.start.y, action.end.y);
  const shapeWidth = Math.abs(action.end.x - action.start.x);
  const shapeHeight = Math.abs(action.end.y - action.start.y);
  context.beginPath();
  if (action.kind === 'line') {
    context.moveTo(action.start.x, action.start.y);
    context.lineTo(action.end.x, action.end.y);
  } else if (action.kind === 'rectangle') {
    context.rect(left, top, shapeWidth, shapeHeight);
  } else {
    context.ellipse(
      left + shapeWidth / 2,
      top + shapeHeight / 2,
      Math.max(shapeWidth / 2, 0.5),
      Math.max(shapeHeight / 2, 0.5),
      0,
      0,
      Math.PI * 2,
    );
  }
  if (action.kind !== 'line' && action.filled) context.fill();
  context.stroke();
  context.restore();
}

function canvasHasVisibleInk(canvas: HTMLCanvasElement | null) {
  const context = canvas?.getContext('2d', { willReadFrequently: true });
  if (!canvas || !context) return false;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (
      Math.abs(data[offset] - 255) > 8 ||
      Math.abs(data[offset + 1] - 253) > 8 ||
      Math.abs(data[offset + 2] - 248) > 8
    ) return true;
  }
  return false;
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ onDrawingChange, disabled = false, compact = false }, ref) {
    const { t } = useLanguage();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activeAction = useRef<StrokeAction | ShapeAction | null>(null);
    const [actions, setActions] = useState<DrawingAction[]>([]);
    const [redoStack, setRedoStack] = useState<DrawingAction[]>([]);
    const [color, setColor] = useState(COLORS[0]);
    const [width, setWidth] = useState(WIDTHS[1]);
    const [opacity, setOpacity] = useState(1);
    const [filledShapes, setFilledShapes] = useState(false);
    const [tool, setTool] = useState<DrawingTool>('brush');
    const ready = useClientReady();

    const renderActions = useCallback((nextActions: DrawingAction[]) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d', { willReadFrequently: true });
      if (!canvas || !context) return;
      context.fillStyle = '#fffdf8';
      context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      for (const action of nextActions) paintAction(context, action);
    }, []);

    useEffect(() => {
      renderActions(actions);
      onDrawingChange?.(canvasHasVisibleInk(canvasRef.current));
    }, [actions, onDrawingChange, renderActions]);

    const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
      const rectangle = event.currentTarget.getBoundingClientRect();
      return {
        x: ((event.clientX - rectangle.left) / rectangle.width) * CANVAS_SIZE,
        y: ((event.clientY - rectangle.top) / rectangle.height) * CANVAS_SIZE,
      };
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      event.preventDefault();
      const point = pointFromEvent(event);
      if (tool === 'fill') {
        const action: FillAction = { kind: 'fill', color, opacity, point };
        const nextActions = [...actions, action];
        setActions(nextActions);
        setRedoStack([]);
        renderActions(nextActions);
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      const action: StrokeAction | ShapeAction =
        tool === 'brush' || tool === 'marker' || tool === 'eraser'
          ? {
              kind: 'stroke',
              color,
              width: tool === 'marker' ? width * 1.8 : width,
              opacity,
              eraser: tool === 'eraser',
              marker: tool === 'marker',
              points: [point],
            }
          : { kind: tool, color, width, opacity, filled: filledShapes, start: point, end: point };
      activeAction.current = action;
      const context = event.currentTarget.getContext('2d', { willReadFrequently: true });
      if (context) paintAction(context, action);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const action = activeAction.current;
      if (!action || disabled) return;
      event.preventDefault();
      const point = pointFromEvent(event);
      const context = event.currentTarget.getContext('2d', { willReadFrequently: true });
      if (!context) return;

      if (action.kind === 'stroke') {
        const previous = action.points.at(-1);
        action.points.push(point);
        if (previous) paintAction(context, { ...action, points: [previous, point] });
      } else {
        action.end = point;
        renderActions(actions);
        paintAction(context, action);
      }
    };

    const finishAction = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const action = activeAction.current;
      if (!action) return;
      event.preventDefault();
      activeAction.current = null;
      const nextActions = [...actions, action];
      setActions(nextActions);
      setRedoStack([]);
      renderActions(nextActions);
    };

    const clear = () => {
      setActions([]);
      setRedoStack([]);
    };

    useImperativeHandle(ref, () => ({
      exportImage: () => {
        renderActions(actions);
        const canvas = canvasRef.current;
        if (!canvas || !canvasHasVisibleInk(canvas)) return null;
        const webp = canvas.toDataURL('image/webp', 0.82);
        return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
      },
      clear,
      isEmpty: () => {
        renderActions(actions);
        return !canvasHasVisibleInk(canvasRef.current);
      },
    }));

    const tools: Array<{ id: DrawingTool; symbol: string; label: string }> = [
      { id: 'brush', symbol: '✎', label: t('brushTool') },
      { id: 'marker', symbol: '▰', label: t('markerTool') },
      { id: 'fill', symbol: '▣', label: t('fillTool') },
      { id: 'line', symbol: '╱', label: t('lineTool') },
      { id: 'rectangle', symbol: '□', label: t('rectangleTool') },
      { id: 'ellipse', symbol: '○', label: t('ellipseTool') },
      { id: 'eraser', symbol: '⌫', label: t('eraserTool') },
    ];

    return (
      <section className={`drawing-studio${compact ? ' drawing-studio-compact' : ''}`}>
        <div className="canvas-frame">
          <canvas
            ref={canvasRef}
            className={`drawing-surface tool-${tool}`}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            aria-label={t('drawingCanvas')}
            data-testid="drawing-canvas"
            data-ready={ready ? 'true' : 'false'}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishAction}
            onPointerCancel={finishAction}
          />
          <span className="canvas-corner canvas-corner-one" aria-hidden="true" />
          <span className="canvas-corner canvas-corner-two" aria-hidden="true" />
        </div>

        <div className="drawing-tools" aria-label={t('drawingTools')}>
          <div className="tool-group mode-tools" aria-label={t('toolMode')}>
            {tools.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`tool-button mode-button${tool === item.id ? ' active' : ''}`}
                aria-label={item.label}
                aria-pressed={tool === item.id}
                onClick={() => setTool(item.id)}
                disabled={disabled}
              >
                <span aria-hidden="true">{item.symbol}</span>
                <small>{item.label}</small>
              </button>
            ))}
          </div>

          <div className="tool-group color-tools" aria-label={t('colorsTool')}>
            {COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`color-swatch${color === swatch && tool !== 'eraser' ? ' active' : ''}`}
                style={{ backgroundColor: swatch }}
                aria-label={`${t('useColor')} ${swatch}`}
                aria-pressed={color === swatch && tool !== 'eraser'}
                onClick={() => {
                  setColor(swatch);
                  setTool((current) => (current === 'eraser' ? 'brush' : current));
                }}
                disabled={disabled}
              />
            ))}
            <label className="custom-color-control" title={t('customColor')}>
              <input
                type="color"
                value={color}
                aria-label={t('customColor')}
                onChange={(event) => {
                  setColor(event.target.value);
                  setTool((current) => (current === 'eraser' ? 'brush' : current));
                }}
                disabled={disabled}
              />
              <span aria-hidden="true">+</span>
            </label>
          </div>

          <label className="range-control">
            <span>{t('opacityTool')} <strong>{Math.round(opacity * 100)}%</strong></span>
            <input
              type="range"
              min="20"
              max="100"
              step="10"
              value={Math.round(opacity * 100)}
              onChange={(event) => setOpacity(Number(event.target.value) / 100)}
              disabled={disabled}
            />
          </label>

          <button
            className={`tool-button filled-shape-button${filledShapes ? ' active' : ''}`}
            type="button"
            aria-pressed={filledShapes}
            onClick={() => setFilledShapes((current) => !current)}
            disabled={disabled}
          >
            <span aria-hidden="true">▣</span> {t('filledShapes')}
          </button>

          <div className="tool-row">
            <div className="tool-group width-tools" aria-label={t('strokeWidthTool')}>
              {WIDTHS.map((strokeWidth, index) => (
                <button
                  key={strokeWidth}
                  type="button"
                  className={`tool-button width-button${width === strokeWidth ? ' active' : ''}`}
                  aria-label={`${t('strokeWidthTool')} ${index + 1}`}
                  aria-pressed={width === strokeWidth}
                  onClick={() => setWidth(strokeWidth)}
                  disabled={disabled}
                >
                  <span style={{ width: strokeWidth / 1.7, height: strokeWidth / 1.7 }} />
                </button>
              ))}
            </div>

            <div className="tool-group history-tools">
              <button
                className="tool-button icon-button"
                type="button"
                aria-label={t('undoTool')}
                title={t('undoTool')}
                onClick={() => {
                  setActions((current) => {
                    const removed = current.at(-1);
                    if (removed) setRedoStack((redo) => [...redo, removed]);
                    return current.slice(0, -1);
                  });
                }}
                disabled={disabled || actions.length === 0}
              >
                ↶
              </button>
              <button
                className="tool-button icon-button"
                type="button"
                aria-label={t('redoTool')}
                title={t('redoTool')}
                onClick={() => {
                  setRedoStack((current) => {
                    const restored = current.at(-1);
                    if (restored) setActions((drawn) => [...drawn, restored]);
                    return current.slice(0, -1);
                  });
                }}
                disabled={disabled || redoStack.length === 0}
              >
                ↷
              </button>
              <button
                className="tool-button clear-tool"
                type="button"
                onClick={clear}
                disabled={disabled || actions.length === 0}
              >
                {t('clearTool')}
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  },
);
