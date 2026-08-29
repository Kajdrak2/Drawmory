'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

type Point = { x: number; y: number };
type Stroke = {
  color: string;
  width: number;
  eraser: boolean;
  points: Point[];
};

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
const COLORS = ['#1d1830', '#ff6b55', '#f5b800', '#3a9d66', '#276ad6', '#7656d6', '#ed4d9a', '#8a5a3b'];
const WIDTHS = [6, 13, 24];

function paintStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length === 0) return;
  context.save();
  context.strokeStyle = stroke.eraser ? '#fffdf8' : stroke.color;
  context.fillStyle = stroke.eraser ? '#fffdf8' : stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (stroke.points.length === 1) {
    const [point] = stroke.points;
    context.beginPath();
    context.arc(point.x, point.y, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }
  context.restore();
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ onDrawingChange, disabled = false, compact = false }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activeStroke = useRef<Stroke | null>(null);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [redoStack, setRedoStack] = useState<Stroke[]>([]);
    const [color, setColor] = useState(COLORS[0]);
    const [width, setWidth] = useState(WIDTHS[1]);
    const [eraser, setEraser] = useState(false);

    const redraw = useCallback((nextStrokes = strokes) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.fillStyle = '#fffdf8';
      context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      for (const stroke of nextStrokes) paintStroke(context, stroke);
    }, [strokes]);

    useEffect(() => {
      redraw();
      onDrawingChange?.(strokes.some((stroke) => !stroke.eraser && stroke.points.length > 0));
    }, [onDrawingChange, redraw, strokes]);

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
      event.currentTarget.setPointerCapture(event.pointerId);
      const stroke: Stroke = { color, width, eraser, points: [pointFromEvent(event)] };
      activeStroke.current = stroke;
      const context = event.currentTarget.getContext('2d');
      if (context) paintStroke(context, stroke);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const stroke = activeStroke.current;
      if (!stroke || disabled) return;
      event.preventDefault();
      const point = pointFromEvent(event);
      const previous = stroke.points.at(-1);
      stroke.points.push(point);
      const context = event.currentTarget.getContext('2d');
      if (context && previous) paintStroke(context, { ...stroke, points: [previous, point] });
    };

    const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const stroke = activeStroke.current;
      if (!stroke) return;
      event.preventDefault();
      activeStroke.current = null;
      setStrokes((current) => [...current, stroke]);
      setRedoStack([]);
    };

    const clear = () => {
      setStrokes([]);
      setRedoStack([]);
    };

    useImperativeHandle(ref, () => ({
      exportImage: () => {
        if (!strokes.some((stroke) => !stroke.eraser && stroke.points.length > 0)) return null;
        redraw(strokes);
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const webp = canvas.toDataURL('image/webp', 0.82);
        return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
      },
      clear,
      isEmpty: () => !strokes.some((stroke) => !stroke.eraser && stroke.points.length > 0),
    }));

    return (
      <section className={`drawing-studio${compact ? ' drawing-studio-compact' : ''}`}>
        <div className="canvas-frame">
          <canvas
            ref={canvasRef}
            className="drawing-surface"
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            aria-label="Drawing canvas"
            data-testid="drawing-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
          />
          <span className="canvas-corner canvas-corner-one" aria-hidden="true" />
          <span className="canvas-corner canvas-corner-two" aria-hidden="true" />
        </div>

        <div className="drawing-tools" aria-label="Drawing tools">
          <div className="tool-group color-tools" aria-label="Colors">
            {COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`color-swatch${color === swatch && !eraser ? ' active' : ''}`}
                style={{ backgroundColor: swatch }}
                aria-label={`Use color ${swatch}`}
                aria-pressed={color === swatch && !eraser}
                onClick={() => {
                  setColor(swatch);
                  setEraser(false);
                }}
                disabled={disabled}
              />
            ))}
          </div>

          <div className="tool-row">
            <div className="tool-group width-tools" aria-label="Stroke width">
              {WIDTHS.map((strokeWidth, index) => (
                <button
                  key={strokeWidth}
                  type="button"
                  className={`tool-button width-button${width === strokeWidth ? ' active' : ''}`}
                  aria-label={`Stroke width ${index + 1}`}
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
                className={`tool-button${eraser ? ' active' : ''}`}
                type="button"
                aria-label="Eraser"
                aria-pressed={eraser}
                onClick={() => setEraser((current) => !current)}
                disabled={disabled}
              >
                Erase
              </button>
              <button
                className="tool-button icon-button"
                type="button"
                aria-label="Undo"
                onClick={() => {
                  setStrokes((current) => {
                    const removed = current.at(-1);
                    if (removed) setRedoStack((redo) => [...redo, removed]);
                    return current.slice(0, -1);
                  });
                }}
                disabled={disabled || strokes.length === 0}
              >
                ↶
              </button>
              <button
                className="tool-button icon-button"
                type="button"
                aria-label="Redo"
                onClick={() => {
                  setRedoStack((current) => {
                    const restored = current.at(-1);
                    if (restored) setStrokes((drawn) => [...drawn, restored]);
                    return current.slice(0, -1);
                  });
                }}
                disabled={disabled || redoStack.length === 0}
              >
                ↷
              </button>
              <button
                className="tool-button"
                type="button"
                onClick={clear}
                disabled={disabled || strokes.length === 0}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  },
);
