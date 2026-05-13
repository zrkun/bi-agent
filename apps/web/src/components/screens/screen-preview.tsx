"use client";

import { ActionProvider, Renderer, StateProvider, VisibilityProvider } from "@json-render/react";

import { screenRegistry, setScreenRenderOptions } from "@/lib/screens/catalog";
import type { JsonRenderSpec, PreviewData } from "@/lib/screens/types";

export function ScreenPreview({
  align = "center",
  disableAutoScale = false,
  exposeElementIds = false,
  previewData,
  spec,
}: {
  align?: "center" | "start";
  disableAutoScale?: boolean;
  exposeElementIds?: boolean;
  previewData: PreviewData;
  spec: JsonRenderSpec;
}) {
  setScreenRenderOptions({ disableAutoScale });
  const renderSpec = exposeElementIds ? withEditorElementIds(spec) : spec;

  return (
    <div
      className={
        align === "start"
          ? "flex min-h-full w-full items-start justify-start"
          : "flex min-h-full w-full items-center justify-center"
      }
    >
      <div className="w-full">
        <StateProvider initialState={{ previewData }}>
          <ActionProvider handlers={{}}>
            <VisibilityProvider>
              <Renderer registry={screenRegistry} spec={renderSpec} />
            </VisibilityProvider>
          </ActionProvider>
        </StateProvider>
      </div>
    </div>
  );
}

function withEditorElementIds(spec: JsonRenderSpec): JsonRenderSpec {
  return {
    ...spec,
    elements: Object.fromEntries(
      Object.entries(spec.elements).map(([elementId, element]) => [
        elementId,
        elementId === spec.root
          ? element
          : {
              ...element,
              props: {
                ...element.props,
                editorElementId: elementId,
              },
            },
      ]),
    ),
  };
}
