import { getClientApiPath } from "@/lib/api";
import type {
  GeneratePreviewResponse,
  ScreenResponse,
  ScreenStatus,
  ScreenStatusResponse,
} from "@/lib/screens/types";

export async function generateScreenPreview(payload: {
  datasetId: string;
  prompt: string;
  theme?: "dark" | "light";
}): Promise<GeneratePreviewResponse> {
  const response = await fetch(getClientApiPath("/screens/generate-preview"), {
    body: JSON.stringify({
      dataset_id: payload.datasetId,
      prompt: payload.prompt,
      theme: payload.theme ?? "light",
      size: { height: 1080, width: 1920 },
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  return response.json();
}

export async function createScreen(payload: {
  datasetId: string;
  name: string;
  prompt?: string;
  spec: NonNullable<GeneratePreviewResponse["screen"]>["spec"];
}): Promise<ScreenResponse> {
  const response = await fetch(getClientApiPath("/screens"), {
    body: JSON.stringify({
      dataset_id: payload.datasetId,
      name: payload.name,
      prompt: payload.prompt ?? payload.name,
      spec: payload.spec,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  return response.json();
}

export async function getScreen(id: string): Promise<ScreenResponse> {
  const response = await fetch(getClientApiPath(`/screens/${encodeURIComponent(id)}`), {
    cache: "no-store",
  });

  return response.json();
}

export async function updateScreen(payload: {
  id: string;
  name?: string;
  spec: NonNullable<GeneratePreviewResponse["screen"]>["spec"];
}): Promise<ScreenResponse> {
  const response = await fetch(getClientApiPath(`/screens/${encodeURIComponent(payload.id)}`), {
    body: JSON.stringify({
      name: payload.name,
      spec: payload.spec,
    }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  return response.json();
}

export async function updateScreenStatus(
  id: string,
  status: ScreenStatus,
): Promise<ScreenStatusResponse> {
  const response = await fetch(getClientApiPath(`/screens/${encodeURIComponent(id)}/status`), {
    body: JSON.stringify({ status }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  return response.json();
}
