"use client";

import { useEffect, useRef, useState } from "react";

export function useCameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPreparingCamera, setIsPreparingCamera] = useState(false);

  function clearCameraError() {
    setCameraError("");
  }

  function stopCameraStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function closeCamera() {
    stopCameraStream();
    setIsCameraOpen(false);
    setIsPreparingCamera(false);
  }

  async function openCamera() {
    if (isPreparingCamera) {
      return;
    }

    closeCamera();
    clearCameraError();

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "カメラは HTTPS か localhost で使えます。使えない場合は写真から読み込んでください。",
      );
      return;
    }

    setIsPreparingCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: {
            ideal: "environment",
          },
        },
      });

      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch (error) {
      setCameraError(
        error instanceof Error
          ? `カメラを開けませんでした。${error.message}`
          : "カメラを開けませんでした。写真から読み込んでください。",
      );
    } finally {
      setIsPreparingCamera(false);
    }
  }

  async function capturePhoto() {
    const videoElement = videoRef.current;

    if (
      !videoElement ||
      videoElement.videoWidth === 0 ||
      videoElement.videoHeight === 0
    ) {
      setCameraError(
        "カメラの準備がまだ終わっていません。少し待ってから撮影してください。",
      );
      return null;
    }

    const canvasElement = document.createElement("canvas");
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    const context = canvasElement.getContext("2d");

    if (!context) {
      setCameraError("画像を取り出せませんでした。もう一度試してください。");
      return null;
    }

    context.drawImage(
      videoElement,
      0,
      0,
      canvasElement.width,
      canvasElement.height,
    );

    const imageBlob = await new Promise<Blob | null>((resolve) => {
      canvasElement.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!imageBlob) {
      setCameraError("撮影画像を作れませんでした。もう一度試してください。");
      return null;
    }

    closeCamera();

    return new File([imageBlob], `bingo-camera-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
  }

  useEffect(() => {
    if (!isCameraOpen || !videoRef.current || !streamRef.current) {
      return;
    }

    const videoElement = videoRef.current;
    videoElement.srcObject = streamRef.current;
    void videoElement.play().catch(() => {
      stopCameraStream();
      setCameraError(
        "カメラを開始できませんでした。もう一度開くか、写真から読み込んでください。",
      );
      setIsCameraOpen(false);
      setIsPreparingCamera(false);
    });
  }, [isCameraOpen]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  return {
    cameraError,
    capturePhoto,
    clearCameraError,
    closeCamera,
    isCameraOpen,
    isPreparingCamera,
    openCamera,
    videoRef,
  };
}
