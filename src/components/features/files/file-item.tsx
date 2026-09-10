import { FaFile } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { RemoveButton } from "#/components/shared/buttons/remove-button";

interface FileItemProps {
  filename: string;
  onRemove?: () => void;
}

export function FileItem({ filename, onRemove }: FileItemProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="file-item"
      className="flex flex-row gap-x-1 items-center justify-start py-1"
    >
      <FaFile className="h-4 w-4" aria-hidden />
      <code className="text-sm flex-1 text-white truncate" title={filename}>
        {filename}
      </code>
      {onRemove && (
        <RemoveButton
          onClick={onRemove}
          aria-label={t(I18nKey.FILE_ITEM$REMOVE_FILE, { filename })}
        />
      )}
    </div>
  );
}
