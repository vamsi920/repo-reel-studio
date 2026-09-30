import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import SearchIcon from "#/icons/search.svg?react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SearchInput({ value, onChange, className }: SearchInputProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 items-center",
        "h-9 rounded-lg border border-[var(--oh-border)] bg-base-secondary",
        "focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/20",
        "transition-colors",
        className,
      )}
    >
      <SearchIcon
        className="ml-3 size-4 shrink-0 text-tertiary-alt"
        aria-hidden
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(I18nKey.AUTOMATIONS$SEARCH_PLACEHOLDER)}
        aria-label={t(I18nKey.AUTOMATIONS$SEARCH_PLACEHOLDER)}
        className={cn(
          "min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-white outline-none placeholder:text-tertiary-alt",
          value && "pr-8",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t(I18nKey.COMMAND_MENU$CLEAR_SEARCH_LABEL)}
          data-testid="automations-search-clear"
          className="absolute right-0 mr-2.5 flex items-center text-tertiary-alt hover:text-white"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
