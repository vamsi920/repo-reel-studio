import { useTranslation } from "react-i18next";
import CloseIcon from "#/icons/u-close.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { cn, isMobileDevice } from "#/utils/utils";

interface RemoveFileButtonProps {
  onClick: () => void;
  /** Attachment name, interpolated into the accessible label. */
  fileName: string;
}

export function RemoveFileButton({ onClick, fileName }: RemoveFileButtonProps) {
  const { t } = useTranslation("openhands");
  const isMobile = isMobileDevice();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(I18nKey.FILE_ITEM$REMOVE_FILE, { filename: fileName })}
      className={cn(
        "z-10 flex w-4 h-4 rounded-full items-center justify-center bg-[var(--oh-surface)] hover:bg-[var(--oh-muted)] cursor-pointer absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
        isMobile && "opacity-100",
      )}
    >
      <CloseIcon width={10} height={10} color="#ffffff" aria-hidden />
    </button>
  );
}
