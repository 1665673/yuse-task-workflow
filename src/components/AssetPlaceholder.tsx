"use client";

import type { TaskModel } from "@/lib/types";

interface AssetPlaceholderProps {
  taskModel: TaskModel;
  imageAssetId?: string;
  audioAssetId?: string;
}

export function ImagePlaceholder({
  taskModel,
  imageAssetId,
}: {
  taskModel: TaskModel;
  imageAssetId?: string;
}) {
  const asset = imageAssetId ? taskModel.assets.images[imageAssetId] : null;
  const hasUrl = asset?.url ?? asset?.base64;

  if (!asset || !hasUrl) {
    return (
      <div className="flex min-h-[120px] w-full items-center justify-center rounded-lg border border-gray-200 bg-white">
        <span className="text-gray-500">Image</span>
      </div>
    );
  }

  return (
    <img
      src={asset.url ?? asset.base64}
      alt={asset.prompt ?? "Question image"}
      className="max-h-48 w-auto rounded-lg object-contain"
    />
  );
}

export function AudioPlaceholder({
  taskModel,
  audioAssetId,
}: {
  taskModel: TaskModel;
  audioAssetId?: string;
}) {
  const asset = audioAssetId ? taskModel.assets.audios[audioAssetId] : null;
  const hasUrl = asset?.url ?? asset?.base64;

  const handleClick = () => {
    if (!asset || !hasUrl) {
      alert("audio does not exists");
      return;
    }
    const audio = new Audio(asset.url ?? asset.base64);
    audio.play().catch(console.error);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 transition-colors hover:bg-gray-100"
      aria-label="Play audio"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-8 w-8 text-blue-600"
      >
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
      </svg>
      <span className="text-sm text-gray-700">Play audio</span>
    </button>
  );
}
