import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type React from "react";
import { useFileHandling } from "#/hooks/chat/use-file-handling";

const makeChangeEvent = (
  files: File[],
): React.ChangeEvent<HTMLInputElement> => {
  // A real `<input type="file">` only allows its `.value` to be set to ""
  // via script (browsers, and jsdom, throw on any other assignment since
  // it's meant to reflect the OS file picker) — so a plain object standing
  // in for the target lets the test assert the post-processing reset
  // without fighting that restriction.
  const target = {
    files,
    value: "C:\\fakepath\\report.pdf",
  } as unknown as HTMLInputElement;

  return { target } as unknown as React.ChangeEvent<HTMLInputElement>;
};

describe("useFileHandling — handleFileInputChange", () => {
  it("forwards the selected files to onFilesPaste", () => {
    const onFilesPaste = vi.fn();
    const { result } = renderHook(() => useFileHandling(onFilesPaste));
    const file = new File(["content"], "report.pdf");

    act(() => {
      result.current.handleFileInputChange(makeChangeEvent([file]));
    });

    expect(onFilesPaste).toHaveBeenCalledWith([file], undefined);
  });

  it("clears the input value after processing so re-selecting the same file fires change again", () => {
    const onFilesPaste = vi.fn();
    const { result } = renderHook(() => useFileHandling(onFilesPaste));
    const file = new File(["content"], "report.pdf");
    const event = makeChangeEvent([file]);

    act(() => {
      result.current.handleFileInputChange(event);
    });

    expect(event.target.value).toBe("");
  });
});
