import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../../i18n";
import { useToast } from "../Toast";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl === "string") {
        resolve(dataUrl);
      } else {
        reject(new Error("Image file did not produce a data URL."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

export function getImageFilesFromClipboard(e: React.ClipboardEvent<HTMLDivElement>): File[] {
  return Array.from(e.clipboardData.items)
    .filter((item) => item.type.startsWith("image/"))
    .flatMap((item) => {
      const file = item.getAsFile();
      return file ? [file] : [];
    });
}

export function getImageFilesFromDrag(e: React.DragEvent<HTMLDivElement>): File[] {
  return Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
}

export function hasDraggedImage(e: React.DragEvent<HTMLDivElement>): boolean {
  return Array.from(e.dataTransfer.items).some((item) => item.type.startsWith("image/"));
}

export function useRuntimeImageAttachments({
  taskId,
  projectPath,
  isActive,
  onInput,
}: {
  taskId: string;
  projectPath: string;
  isActive: boolean;
  onInput: (data: string) => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [attachingImages, setAttachingImages] = useState(false);

  async function attachImageFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!isActive || images.length === 0 || attachingImages) return;

    setAttachingImages(true);
    try {
      const results = await Promise.allSettled(images.map(fileToDataUrl));
      const dataUrls = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (dataUrls.length === 0) return;

      const imagePaths = await invoke<string[]>("attach_task_images", {
        taskId,
        projectPath,
        images: dataUrls,
      });
      if (imagePaths.length === 0) return;

      const message =
        imagePaths.length === 1
          ? `\n\n[Attached image]\n${imagePaths[0]}\n\n`
          : `\n\n[Attached images]\n${imagePaths.join("\n")}\n\n`;
      onInput(message);
    } catch (e) {
      showToast(t("toast.attachImagesFailed", { error: String(e) }), "error");
    } finally {
      setAttachingImages(false);
    }
  }

  return { attachingImages, attachImageFiles };
}
