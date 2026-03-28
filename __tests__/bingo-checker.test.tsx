import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BingoChecker from "@/app/components/bingo-checker";

const mockHooks = vi.hoisted(() => ({
  camera: null as ReturnType<typeof createCameraState> | null,
  scanner: null as ReturnType<typeof createScannerState> | null,
}));

vi.mock("@/app/hooks/use-camera-capture", () => ({
  useCameraCapture: () => mockHooks.camera,
}));

vi.mock("@/app/hooks/use-bingo-scanner", () => ({
  useBingoScanner: () => mockHooks.scanner,
}));

function createCameraState(overrides = {}) {
  return {
    cameraError: "",
    capturePhoto: vi.fn(),
    clearCameraError: vi.fn(),
    closeCamera: vi.fn(),
    isCameraOpen: false,
    isPreparingCamera: false,
    openCamera: vi.fn(),
    videoRef: { current: null },
    ...overrides,
  };
}

function createScannerState(overrides = {}) {
  return {
    clearScanFeedback: vi.fn(),
    clearScanSession: vi.fn(),
    isScanning: false,
    prepareScan: vi.fn(),
    recognizeCurrentCrop: vi.fn(),
    resetCropRect: vi.fn(),
    returnToAdjusting: vi.fn(),
    scanDraft: null,
    scanError: "",
    scanReview: null,
    scanStage: "idle",
    scanStatus: "",
    updateCropRect: vi.fn(),
    ...overrides,
  };
}

describe("BingoChecker", () => {
  beforeEach(() => {
    mockHooks.camera = createCameraState();
    mockHooks.scanner = createScannerState();
  });

  it("fills the card from sequential input and starts the game", () => {
    render(<BingoChecker />);

    const startButton = screen.getByRole("button", {
      name: "このカードで開始する",
    });
    expect((startButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(
      screen.getByPlaceholderText("例: 5 12 31 44 67 8 16 39 ..."),
      {
        target: {
          value: Array.from({ length: 24 }, (_, index) => index + 1).join(" "),
        },
      },
    );

    expect(screen.getByText("24/24")).toBeDefined();
    expect(
      (screen.getByLabelText("1行 B列") as HTMLInputElement).value,
    ).toBe("1");
    expect(
      (screen.getByLabelText("3行 G列") as HTMLInputElement).value,
    ).toBe("13");
    expect((startButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(startButton);

    expect(screen.getByLabelText("抽選番号")).toBeDefined();
    expect(screen.getByText("入力した番号")).toBeDefined();
  });

  it("renders the crop adjustment step and starts OCR only after confirmation", () => {
    const recognizeCurrentCrop = vi.fn();

    mockHooks.scanner = createScannerState({
      recognizeCurrentCrop,
      scanDraft: {
        cropRect: {
          left: 100,
          size: 900,
          top: 120,
        },
        diagnostics: [],
        imageHeight: 1600,
        imageUrl:
          "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
        imageWidth: 1200,
      },
      scanStage: "adjusting",
    });

    render(<BingoChecker />);

    expect(screen.getByText("枠調整")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "この範囲で読み取る" }));

    expect(recognizeCurrentCrop).toHaveBeenCalledTimes(1);
  });

  it("renders the review step and lets the user retry the crop", () => {
    const returnToAdjusting = vi.fn();

    mockHooks.scanner = createScannerState({
      returnToAdjusting,
      scanReview: {
        averageConfidence: 63,
        diagnostics: ["カードの端が切れている可能性があります。"],
        draftValues: [
          ["1", "2", "3", "4", "5"],
          ["6", "7", "8", "9", "10"],
          ["11", "12", "", "13", "14"],
          ["15", "16", "17", "18", "19"],
          ["20", "21", "22", "23", "24"],
        ],
        filledCount: 22,
        missingCount: 2,
        previewUrl:
          "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
        recognizedCells: [],
      },
      scanStage: "reviewing",
    });

    render(<BingoChecker />);

    expect(screen.getByText("読み取り結果")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "調整し直す" }));

    expect(returnToAdjusting).toHaveBeenCalledTimes(1);
  });
});
