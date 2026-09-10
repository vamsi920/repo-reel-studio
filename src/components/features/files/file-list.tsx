import React from "react";
import { cn } from "#/utils/utils";
import { FileItem } from "./file-item";

interface FileListProps {
  files: string[];
  onRemove?: (index: number) => void;
}

export function FileList({ files, onRemove }: FileListProps) {
  return (
    <div
      data-testid="file-list"
      className={cn("flex flex-col gap-y-1.5 justify-start")}
    >
      {files.map((f, index) => (
        <FileItem
          // The same name can be attached twice, so the index has to stay in
          // the key; the name keeps a removal from re-using the wrong node.
          key={`${index}:${f}`}
          filename={f}
          onRemove={onRemove ? () => onRemove(index) : undefined}
        />
      ))}
    </div>
  );
}
