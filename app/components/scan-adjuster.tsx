"use client";

import Image from "next/image";
import { PointerEvent, useRef } from "react";
import {
  CropRect,
  getCropZoom,
  moveCropRect,
  setCropZoom,
} from "@/app/lib/bingo";

const MIN_ZOOM = 1;
const MAX_ZOOM = 2.6;
const ZOOM_STEP = 0.05;

type ScanAdjusterProps = {
  cropRect: CropRect;
  disabled?: boolean;
  imageHeight: number;
  imageUrl: string;
  imageWidth: number;
  onChangeCrop: (nextCropRect: CropRect) => void;
  onResetCrop: () => void;
};

type DragState = {
  cropRect: CropRect;
  pointerId: number;
  startX: number;
  startY: number;
};

export default function ScanAdjuster({
  cropRect,
  disabled = false,
  imageHeight,
  imageUrl,
  imageWidth,
  onChangeCrop,
  onResetCrop,
}: ScanAdjusterProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const zoom = getCropZoom(cropRect, imageWidth, imageHeight);
  const scaledWidth = (imageWidth / cropRect.size) * 100;
  const scaledHeight = (imageHeight / cropRect.size) * 100;
  const offsetLeft = (cropRect.left / cropRect.size) * 100;
  const offsetTop = (cropRect.top / cropRect.size) * 100;

  function updateZoom(nextZoom: number) {
    onChangeCrop(setCropZoom(cropRect, imageWidth, imageHeight, nextZoom));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    dragStateRef.current = {
      cropRect,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    const viewportRect = viewportRef.current?.getBoundingClientRect();

    if (
      !dragState ||
      dragState.pointerId !== event.pointerId ||
      !viewportRect ||
      disabled
    ) {
      return;
    }

    const deltaX =
      ((event.clientX - dragState.startX) / viewportRect.width) *
      dragState.cropRect.size;
    const deltaY =
      ((event.clientY - dragState.startY) / viewportRect.height) *
      dragState.cropRect.size;

    onChangeCrop(
      moveCropRect(
        dragState.cropRect,
        -deltaX,
        -deltaY,
        imageWidth,
        imageHeight,
      ),
    );
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
  }

  return (
    <div className="rounded-[1.8rem] border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            枠調整
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            カードの外枠がぴったり入るように、画像をドラッグして調整してください。
          </p>
        </div>
        <button
          className="inline-flex h-10 shrink-0 touch-manipulation items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition active:scale-[0.99] hover:border-stone-400 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={onResetCrop}
          disabled={disabled}
        >
          中央に戻す
        </button>
      </div>

      <div
        ref={viewportRef}
        className="relative mt-4 aspect-square overflow-hidden rounded-[1.5rem] bg-stone-950 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
      >
        <Image
          alt="スキャン用プレビュー"
          className="pointer-events-none absolute select-none object-cover"
          draggable={false}
          height={imageHeight}
          src={imageUrl}
          unoptimized
          width={imageWidth}
          style={{
            height: `${scaledHeight}%`,
            left: `-${offsetLeft}%`,
            maxWidth: "none",
            top: `-${offsetTop}%`,
            width: `${scaledWidth}%`,
          }}
        />
        <div className="pointer-events-none absolute inset-0 rounded-[1.5rem] border border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
        <div className="pointer-events-none absolute inset-0 grid grid-cols-5 grid-rows-5">
          {Array.from({ length: 25 }, (_, index) => (
            <div key={index} className="border border-white/12" />
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-[1.35rem] bg-white p-3 ring-1 ring-inset ring-stone-200">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-stone-700">ズーム</p>
          <div className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-stone-700">
            {zoom.toFixed(2)}x
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            className="inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-stone-300 bg-white text-lg font-semibold text-stone-700 transition active:scale-[0.99] hover:border-stone-400 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={() => updateZoom(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}
            disabled={disabled || zoom <= MIN_ZOOM}
          >
            -
          </button>
          <input
            aria-label="スキャン範囲のズーム"
            className="h-11 w-full accent-stone-900"
            disabled={disabled}
            max={MAX_ZOOM}
            min={MIN_ZOOM}
            step="0.01"
            type="range"
            value={zoom}
            onChange={(event) => updateZoom(Number(event.target.value))}
          />
          <button
            className="inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-stone-300 bg-white text-lg font-semibold text-stone-700 transition active:scale-[0.99] hover:border-stone-400 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={() => updateZoom(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}
            disabled={disabled || zoom >= MAX_ZOOM}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
